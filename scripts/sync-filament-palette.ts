import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { builtInTraits } from "../src/lib/filament-traits";
import { combineFilamentColors, type FilamentColor } from "../src/lib/filament-palette-data";
import { filamentColorType } from "../src/lib/filament-color-types";
import { recordedSwatchId } from "../src/lib/filament-ids";
import { resolveAmazonListing } from "./lib/resolve-amazon-listing";
import { filamentSizeListings, type FilamentSize, type FilamentSizeListing } from "./lib/filament-size-listings";
import { filamentPurchaseOptions } from "../src/lib/filament-purchases";

const measuredSource = "https://filamentcolors.xyz/api/swatch/";
const listedSource = "https://api.openfilamentdatabase.org/json/all.json.gz";
const pageSize = 100;
const amazonLinksCache = new Map<string, Promise<string | null>>();
async function amazonUrls(values: (string | undefined)[]) {
  const urls = [...new Set(values.filter((value): value is string => !!value))];
  const found = new Map<string, string>();
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(urls.slice(i, i + 4).map(async (url) => {
      if (!amazonLinksCache.has(url)) amazonLinksCache.set(url, resolveAmazonListing(url));
      const listing = await amazonLinksCache.get(url)!;
      if (listing) found.set(url, listing);
    }));
  }
  return found;
}
type RawSwatch = {
  id: number; color_name: string; hex_color: string; color_parent: string;
  manufacturer: { name: string };
  filament_type: { name: string; parent_type?: { name: string } };
  published?: boolean; is_available?: boolean;
  amazon_purchase_link?: string; mfr_purchase_link?: string;
};
async function download(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json, application/gzip", "user-agent": "PrintItColorPalette/1.0" },
    signal: AbortSignal.timeout(60_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Palette download: HTTP ${response.status} for ${url}`);
  return response;
}
async function page(number: number): Promise<{ count: number; results: RawSwatch[] }> {
  const body = await (await download(`${measuredSource}?page_size=${pageSize}&page=${number}`)).json();
  if (!Number.isInteger(body.count) || !Array.isArray(body.results)) throw new Error("Invalid swatch listing");
  return body;
}
async function measuredColors(): Promise<FilamentColor[]> {
  const first = await page(1);
  const raw = [...first.results];
  const pages = Math.ceil(first.count / pageSize);
  if (pages > 100) throw new Error("Unexpectedly large swatch library");
  for (let number = 2; number <= pages; number += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, pages - number + 1) }, (_, i) => page(number + i)));
    for (const result of batch) {
      if (result.count !== first.count) throw new Error("The library changed during the download; retry the sync");
      raw.push(...result.results);
    }
  }
  if (raw.length !== first.count) throw new Error("Incomplete measured swatch listing");
  const amazonLinks = await amazonUrls(raw.flatMap(s => [s.amazon_purchase_link, s.mfr_purchase_link]));
  return raw.filter((s) => Number.isInteger(s.id) && s.id > 0 && typeof s.color_name === "string"
    && s.color_name.trim() && /^[0-9a-f]{6}$/i.test(s.hex_color) && s.published !== false
    && s.is_available !== false && s.manufacturer?.name && s.filament_type?.name)
    .sort((a, b) => a.id - b.id).map((s) => {
      const type = s.filament_type.name.trim();
      const parent = s.filament_type.parent_type?.name ?? "";
      const family = builtInTraits(type)?.family
        ?? (["PLA", "PETG", "TPU / TPE"].includes(parent) ? builtInTraits(`${parent} ${type}`)?.family : null) ?? null;
      const amazonUrl = amazonLinks.get(s.amazon_purchase_link ?? "") ?? amazonLinks.get(s.mfr_purchase_link ?? "");
      return {
        id: `fcx:${s.id}`, name: s.color_name.trim(), hex: `#${s.hex_color.toLowerCase()}`,
        maker: s.manufacturer.name.trim(), type, product: type, family, source: "filamentcolors" as const,
        translucent: s.color_parent === "TRN" || /translu|transparent|clear|glass|crystal|see.?through/i.test(`${s.color_name} ${type}`),
        pageUrl: `https://filamentcolors.xyz/swatch/${s.id}/`,
        ...(amazonUrl ? { amazonUrl } : {}),
      };
    });
}

type Brand = { id: string; name: string; website?: string };
type Material = { id: string; material: string; material_class: string };
type Product = { id: string; brand_id: string; material_id: string; name: string; discontinued?: boolean };
type Variant = { uuid: string; id: string; filament_id: string; name: string; color_hex: unknown;
  discontinued?: boolean; traits?: Record<string, boolean> };
type Size = FilamentSize;
type Listing = FilamentSizeListing;
type OpenDatabase = { version: string; generated_at: string; brands: Brand[]; materials: Material[];
  filaments: Product[]; variants: Variant[]; sizes: Size[]; purchase_links: Listing[] };
function httpUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}
async function listedColors() {
  const bytes = new Uint8Array(await (await download(listedSource)).arrayBuffer());
  const data: OpenDatabase = JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString());
  for (const key of ["brands", "materials", "filaments", "variants", "sizes", "purchase_links"] as const) {
    if (!Array.isArray(data[key])) throw new Error(`Open Filament Database is missing ${key}`);
  }
  if (data.variants.length < 10000) throw new Error("Incomplete Open Filament Database download");
  const brands = new Map(data.brands.map((b) => [b.id, b]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const products = new Map(data.filaments.map((f) => [f.id, f]));
  const variantsBySize = new Map(data.sizes.filter((s) => !s.discontinued).map((s) => [s.id, s.variant_id]));
  const links = new Map<string, string>();
  const resolvedListings = await amazonUrls(data.purchase_links.map(listing => listing.url));
  const packages = filamentSizeListings(data.sizes, data.purchase_links, resolvedListings);
  for (const listing of data.purchase_links) {
    const variant = variantsBySize.get(listing.size_id);
    const url = httpUrl(listing.url);
    if (variant && url && !links.has(variant)) links.set(variant, url);
  }
  const colors: FilamentColor[] = [];
  for (const v of [...data.variants].sort((a, b) => a.uuid.localeCompare(b.uuid))) {
    const product = products.get(v.filament_id);
    const material = product && materials.get(product.material_id);
    const brand = product && brands.get(product.brand_id);
    if (!product || !material || !brand || material.material_class !== "FFF" || product.discontinued || v.discontinued) continue;
    if (typeof v.color_hex !== "string" || !/^#[0-9a-f]{6}$/i.test(v.color_hex) || !v.name?.trim()) continue;
    const extras = [v.traits?.contains_carbon_fiber ? "CF" : "", v.traits?.contains_glass_fiber ? "GF" : "",
      ...["matte", "silk", "glitter"].filter((trait) => v.traits?.[trait])].filter(Boolean);
    const type = [...new Set([material.material, product.name, ...extras])].join(" ");
    const colorType = v.traits?.coextruded ? "Multi Color" : v.traits?.gradual_color_change ? "Gradient"
      : filamentColorType({ name: v.name, product: product.name, type, translucent: Boolean(v.traits?.translucent || v.traits?.transparent) });
    const options = packages.get(v.id);
    const amazonUrl = options?.[0]?.url;
    colors.push({
      id: `ofd:${v.uuid}`, name: v.name.trim(), hex: v.color_hex.toLowerCase(), maker: brand.name,
      type, product: product.name, family: builtInTraits(type.replace(/\+(?=[a-z0-9])/gi, " "))?.family ?? null,
      source: "openfilamentdatabase", translucent: Boolean(v.traits?.translucent || v.traits?.transparent)
        || /translu|transparent|clear|glass|crystal|see.?through/i.test(`${v.name} ${product.name}`),
      ...(colorType !== "Solid" ? { colorType } : {}),
      pageUrl: links.get(v.id) ?? httpUrl(brand.website) ?? "https://openfilamentdatabase.org/",
      ...(amazonUrl ? { amazonUrl, purchaseOptions: filamentPurchaseOptions(amazonUrl, options) } : {}),
    });
  }
  return { colors, version: data.version, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const [measured, listed] = await Promise.all([measuredColors(), listedColors()]);
if (measured.length < 1000 || listed.colors.length < 10000) throw new Error("Incomplete source; the existing palette was preserved");
const { swatches, overlaps } = combineFilamentColors(measured, listed.colors);
if (new Set(swatches.map((s) => s.id)).size !== swatches.length) throw new Error("Duplicate source identities");
const bundledIds = swatches.filter(s => s.source === "openfilamentdatabase").map(s => recordedSwatchId(s.id));
if (new Set(bundledIds).size !== bundledIds.length) throw new Error("Bundled swatch id collision; the existing palette was preserved");
if (swatches.some((s) => s.name.length > 80)) throw new Error("A source name exceeds the request schema limit");
const snapshot = {
  sources: [{ name: "filamentcolors.xyz", url: measuredSource, count: measured.length },
    { name: "Open Filament Database", url: listedSource, count: listed.colors.length, version: listed.version, sha256: listed.sha256 }],
  retrieved: new Date().toISOString().slice(0, 10), overlaps,
  sha256: createHash("sha256").update(JSON.stringify(swatches)).digest("hex"), swatches,
};
// One record per line keeps the generated snapshot readable without bloating diffs.
const { swatches: entries, ...meta } = snapshot;
const json = JSON.stringify(meta, null, 2).slice(0, -2) + ',\n  "swatches": [\n'
  + entries.map((s) => "    " + JSON.stringify(s)).join(',\n') + '\n  ]\n}\n';
await writeFile(new URL("../src/lib/filament-palette.json", import.meta.url), json);
console.log(`Combined ${measured.length} measured and ${listed.colors.length} catalog colors; ${overlaps} overlaps replaced, ${swatches.length} records, ${new Set(swatches.map((s) => s.hex)).size} unique shades.`);
