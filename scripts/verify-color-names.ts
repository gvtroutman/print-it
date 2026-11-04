import assert from "node:assert/strict";
import { configuredFilamentRecords, PRINTED_FILAMENT_COLORS, SOURCE_FILAMENT_COLORS } from "../src/lib/filament-settings-data";
import { createHash } from "node:crypto";
import { AUTO_MATERIAL, hslHex, WishSchema } from "../src/lib/catalog";
import { colorNameOf, filamentAlpha, FILAMENT_COLORS, filamentPaletteFor, nearestFilamentColor, translucentFilament } from "../src/lib/color-names";
import { combineFilamentColors, filamentColorFits, singleColorVariant, type FilamentColor } from "../src/lib/filament-palette-data";
import { buyableFilamentBrand, FILAMENT_BRANDS, type FilamentSettings } from "../src/lib/filament-brands";
import { amazonListingUrl } from "../src/lib/amazon-listing";
import { recordedAmazonListingFor } from "../src/lib/amazon-product-links";
import { resolveAmazonListing } from "./lib/resolve-amazon-listing";
import recorded from "../src/lib/filament-palette.json";
import { pickOf, targetHex } from "../src/lib/shade-field";
import { FILAMENT_COLOR_TYPES, colorDisplayName, filamentColorName, filamentColorStyle, filamentColorType } from "../src/lib/filament-color-types";
import { PaletteColorSchema } from "../src/lib/palette-types";
import { recordedSwatchId, isBundledSwatch, printedSwatchId } from "../src/lib/filament-ids";
import { DEFAULT_FILAMENT_SETTINGS } from "../src/lib/filament-brands";

assert.equal(amazonListingUrl("https://www.amazon.com/Product/dp/B012345678?tag=example&th=1"), "https://www.amazon.com/dp/B012345678");
assert.equal(amazonListingUrl("http://amazon.co.uk/gp/product/b012345678"), "https://www.amazon.co.uk/dp/B012345678");
for (const url of ["https://www.amazon.com/s?k=filament", "https://www.amazon.com/stores/Filament", "https://amazon.com.evil.example/dp/B012345678",
  "https://evil.example/amazon.com/dp/B012345678", "https://www.amazon.com/dp/B0123456789", "https://example.com/product", "javascript:alert(1)"])
  assert.equal(amazonListingUrl(url), null, url);
let redirectRequests = 0;
assert.equal(await resolveAmazonListing("https://amzn.to/test", async () => {
  redirectRequests++;
  return new Response(null, { status: 302, headers: { location: "https://www.amazon.com/Product/dp/B012345678?tag=example" } });
}), "https://www.amazon.com/dp/B012345678");
assert.equal(redirectRequests, 1);
assert.equal(await resolveAmazonListing("https://a.co/test", async () => new Response(null, {
  status: 302, headers: { location: "http://127.0.0.1/dp/B012345678" },
})), null, "Short links must not follow redirects outside Amazon's own services");

const records = recorded.swatches as FilamentColor[];
const opaque = SOURCE_FILAMENT_COLORS.filter(s => !s.translucent && buyableFilamentBrand(s.maker) && amazonListingUrl(s.amazonUrl));
const pickerRecords = opaque.filter(s => printedSwatchId(s.pageUrl) !== null && !/\b(?:ASA|ABS|PC|polycarbonate)\b/i.test(`${s.family ?? ""} ${s.type}`));
for (const brand of FILAMENT_BRANDS) {
  assert.ok(buyableFilamentBrand(` ${brand.name.toUpperCase()} `));
  for (const alias of brand.aliases) assert.ok(buyableFilamentBrand(alias));
}
// Approved brands may have no records yet; never borrow another maker's
// swatches to make an uncovered brand appear to have colors.
const uncoveredBrands = FILAMENT_BRANDS.filter(brand => !opaque.some(s =>
  [brand.name, ...brand.aliases].some(name => name.toLowerCase().replace(/[^a-z0-9]/g, "") === s.maker.toLowerCase().replace(/[^a-z0-9]/g, ""))));
for (const maker of ["Voxel PLA", "Unknown", "", "SUNLU reseller", "Not Polymaker", "HATCHBOX reseller", "Not Prusament"])
  assert.equal(buyableFilamentBrand(maker), false, maker);
assert.ok(buyableFilamentBrand("eSun-3D"));
for (const name of ["Blue+Silver", "Red+Gold+Green", "Rose Red & Light Blue", "blue/grey", "Rainbow"])
  assert.equal(singleColorVariant(name, "PLA"), false, name);
assert.equal(singleColorVariant("OBSIDIAN GF+ Metallic Silver", "PA6 GF"), true);
assert.equal(singleColorVariant("Plus (+) Skin", "PLA"), true);
assert.equal(singleColorVariant("Blue", "PLA", { coextruded: true }), false);
assert.equal(singleColorVariant("Red", "Triple-Color Silk PLA"), false);
assert.ok(records.some(s => s.source === "openfilamentdatabase" && filamentColorType(s) === "Gradient"));
assert.ok(records.some(s => s.source === "openfilamentdatabase" && filamentColorType(s) === "Multi Color"));
const bundledIds = records.filter(s => s.source === "openfilamentdatabase").map(s => recordedSwatchId(s.id));
assert.equal(new Set(bundledIds).size, bundledIds.length, "Bundled ids must never collide");
assert.ok(bundledIds.every(id => isBundledSwatch(id) && id <= 2_147_483_647));
assert.equal(createHash("sha256").update(JSON.stringify(records)).digest("hex"), recorded.sha256);
assert.equal(recorded.sources.length, 2);
assert.equal(records.length, recorded.sources.reduce((sum, source) => sum + source.count, 0) - recorded.overlaps);
assert.ok(records.filter(s => s.source === "filamentcolors").length > 2000);
assert.ok(records.filter(s => s.source === "openfilamentdatabase").length > 10000);
assert.ok(recorded.overlaps > 0, "No measured/catalog overlap was resolved");
assert.equal(new Set(records.map(s => s.id)).size, records.length);
assert.equal(FILAMENT_COLORS.length, new Set(pickerRecords.map(s => s.hex)).size);
assert.ok(FILAMENT_COLORS.every(s => !s.translucent), "Transparent filaments must not appear in the picker");
assert.ok(FILAMENT_COLORS.every(s => !/\b(?:ASA|ABS|PC|polycarbonate)\b/i.test(`${s.family ?? ""} ${s.type}`)), "ASA, ABS and PC variants must not appear in the picker");
assert.ok(FILAMENT_COLORS.every(s => buyableFilamentBrand(s.maker)), "Excluded brands must not appear in the picker");
assert.ok(FILAMENT_COLORS.every(s => amazonListingUrl(s.amazonUrl) === s.amazonUrl && s.amazonUrl), "Every picker shade must have a direct Amazon listing");
assert.ok(FILAMENT_COLORS.every(s => printedSwatchId(s.pageUrl) !== null), "Every market shade must have a printed swatch");

const byHex = new Map(FILAMENT_COLORS.map(s => [s.hex, s]));
for (const swatch of records) {
  assert.match(swatch.hex, /^#[0-9a-f]{6}$/);
  assert.equal(targetHex(pickOf(swatch.hex)), swatch.hex, "Opening the picker must preserve saved shades, including very dark colors");
  assert.ok(swatch.maker && swatch.product && swatch.type, "Source/product identity missing");
  assert.match(swatch.pageUrl, /^https?:\/\//);
  if (swatch.amazonUrl) {
    assert.equal(amazonListingUrl(swatch.amazonUrl), swatch.amazonUrl);
    if (swatch.id.startsWith("fcx:")) {
      assert.equal(recordedAmazonListingFor({ ...swatch, id: Number(swatch.id.slice(4)) }), swatch.amazonUrl);
      assert.equal(recordedAmazonListingFor({ ...swatch, id: Number(swatch.id.slice(4)), name: "Unrelated nonexistent color" }), null);
    }
  }
  if (swatch.translucent) {
    assert.equal(nearestFilamentColor(swatch.hex).translucent, false, "A transparent target must snap to an opaque record");
    continue;
  }
  if (!buyableFilamentBrand(swatch.maker) || !swatch.amazonUrl || printedSwatchId(swatch.pageUrl) === null || /\b(?:ASA|ABS|PC|polycarbonate)\b/i.test(`${swatch.family ?? ""} ${swatch.type}`)) {
    assert.ok(nearestFilamentColor(swatch.hex).amazonUrl, "An excluded target must snap to an Amazon-listed record");
    continue;
  }
  const canonical = byHex.get(swatch.hex)!;
  assert.deepEqual(nearestFilamentColor(swatch.hex.toUpperCase()), canonical);
  if (swatch.source === "filamentcolors") assert.equal(canonical.source, "filamentcolors", "Measurements must win equal-hex ties");
  assert.equal(colorNameOf(swatch.hex, filamentAlpha(canonical)), colorDisplayName(canonical.name));
  assert.ok(WishSchema.safeParse({ material: AUTO_MATERIAL, colorName: canonical.name, colorHex: canonical.hex, quantity: 1 }).success, canonical.name);
}

const fanSamples = records.filter(color => /\((?:w\s*\/\s*o?|no)\s*fan\)/i.test(color.name));
assert.ok(fanSamples.length > 0, "Source print-sample cooling notes must remain available");
for (const color of fanSamples) {
  assert.ok(!/\bfan\b/i.test(colorDisplayName(color.name)), color.name);
  assert.ok(!/\bfan\b/i.test(filamentColorName(color)), color.name);
  assert.equal(PaletteColorSchema.parse({ name: color.name, hex: color.hex, alpha: filamentAlpha(color) }).name, colorDisplayName(color.name));
}
const magentaWithFan = records.find(color => color.id === "fcx:121")!;
const magentaWithoutFan = records.find(color => color.id === "fcx:122")!;
assert.equal(filamentColorName(magentaWithFan), "Magenta");
assert.equal(filamentColorName(magentaWithoutFan), "Magenta");
assert.notEqual(magentaWithFan.hex, magentaWithoutFan.hex, "Clean labels must retain the samples' distinct measured colors");
assert.equal(colorDisplayName("Blue (No Fan) (Silk)"), "Blue (Silk)");
assert.equal(colorDisplayName("Fancy Gray (Matte)"), "Fancy Gray (Matte)");
assert.equal(filamentColorType({ name: "Red Orange Gradient (w/ Fan)", type: "PLA" }), "Gradient");
assert.equal(PaletteColorSchema.safeParse({ name: "(w/ Fan)", hex: "#2787c9" }).success, false);

// Small, controlled examples prove precedence and guard against incorrect joins.
const measured: FilamentColor = { id: "fcx:1", name: "Red", hex: "#d62828", maker: "Example", type: "PLA", product: "PLA", family: "PLA", source: "filamentcolors", translucent: false, pageUrl: "https://filamentcolors.xyz/swatch/1/" };
const listed: FilamentColor = { ...measured, id: "ofd:1", hex: "#ff0000", source: "openfilamentdatabase" };
assert.deepEqual(combineFilamentColors([measured], [listed]), { swatches: [measured], overlaps: 1 });
const linked = { ...listed, amazonUrl: "https://www.amazon.com/dp/B012345678" };
assert.deepEqual(combineFilamentColors([measured], [linked]), { swatches: [{ ...measured, amazonUrl: linked.amazonUrl }], overlaps: 1 });
assert.equal(measured.amazonUrl, undefined, "Adding a purchase link must not mutate the input measurement");
for (const other of [
  { ...listed, maker: "Different brand" }, { ...listed, name: "Dark Red" },
  { ...listed, type: "PETG", product: "PETG", family: "PETG" },
  { ...listed, type: "Matte PLA", product: "Matte PLA" }, { ...listed, translucent: true },
  { ...listed, colorType: "Multi Color" as const }, { ...listed, colorType: "Gradient" as const },
]) assert.equal(combineFilamentColors([measured], [other]).overlaps, 0);
const uncertain = combineFilamentColors([measured, { ...measured, id: "fcx:2", hex: "#a02020" }], [listed]);
assert.equal(uncertain.overlaps, 0, "Conflicting measurements must not replace a catalog value");
const multipleLines = [ { ...listed, type: "PLA Basic", product: "Basic" }, { ...listed, id: "ofd:2", type: "PLA Pro", product: "Pro" } ];
assert.equal(combineFilamentColors([measured], multipleLines).overlaps, 0, "Ambiguous product lines must remain separate");

let samples = 0;
for (const material of [null, "PLA", "PETG", "ASA", "ABS", "PC", "Polycarbonate", "PC-CF", "TPU", "PLA-CF", "CoPE"]) {
  const palette = filamentPaletteFor(material);
  assert.ok(palette.colors.every(s => !material || filamentColorFits(material, s)), `${material}: mixed materials`);
  assert.ok(palette.colors.every(s => !s.translucent), `${material}: transparent filament included`);
  assert.equal(palette.colors.length, new Set(pickerRecords.filter(s => !material || filamentColorFits(material, s)).map(s => s.hex)).size, `${material}: missing eligible shades`);
  if (palette.colors.length === 0) {
    assert.equal(palette.nearest("#ff0000"), null, `${material}: an unlisted material must have no fallback shade`);
    continue;
  }
  const exact = new Map(palette.colors.map(s => [s.hex, s]));
  for (const s of palette.colors) assert.equal(palette.nearest(s.hex.toUpperCase()), s);
  for (let h = 0; h <= 360; h += 30) for (let saturation = 0; saturation <= 100; saturation += 25) for (let lightness = 0; lightness <= 100; lightness += 25) {
    const s = palette.nearest(hslHex(h, saturation, lightness))!;
    assert.equal(exact.get(s.hex), s);
    samples++;
  }
}
assert.ok(filamentPaletteFor("PETG").colors.every(s => s.family === "PETG"));
assert.ok(filamentPaletteFor("PLA-CF").colors.every(s => s.family === "PLA with fibre"));
assert.ok(filamentPaletteFor("CoPE").colors.every(s => /cope/i.test(s.type)));
assert.equal(filamentPaletteFor("Unknown material").colors.length, 0);
assert.equal(filamentPaletteFor("Unknown material").nearest("#ff0000"), null);
assert.equal(filamentPaletteFor(null), filamentPaletteFor());

for (const type of FILAMENT_COLOR_TYPES) {
  const palette = filamentPaletteFor("PLA", DEFAULT_FILAMENT_SETTINGS, type);
  if (!palette.colors.length) assert.equal(palette.nearest("#ff0000"), null, `${type}: an empty type must not borrow another finish`);
  assert.ok(palette.colors.every(s => filamentColorType(s) === type && filamentColorFits("PLA", s)), type);
  assert.ok(palette.colors.every(s => buyableFilamentBrand(s.maker) && amazonListingUrl(s.amazonUrl)), type);
  assert.ok(palette.colors.every(s => printedSwatchId(s.pageUrl) !== null), `${type}: unswatched filament included`);
  assert.equal(filamentPaletteFor("Unknown material", DEFAULT_FILAMENT_SETTINGS, type).nearest("#ff0000"), null);
  for (const swatch of palette.colors) {
    assert.equal(filamentColorType(palette.nearest(swatch.hex)!), type);
    assert.ok(filamentColorName(swatch).length <= 80);
    assert.ok(filamentColorStyle(swatch));
  }
  console.log(`${type}: ${palette.colors.length} PLA choices`);
}
const fixtureSource = SOURCE_FILAMENT_COLORS.find(color => color.id.startsWith("fcx:")
  && color.family === "PLA" && !color.translucent && filamentColorType(color) === "Solid")!;
const sameHexSettings: FilamentSettings = {
  brands: [{ id: "fixture", name: "Fixture", aliases: [] }],
  listings: FILAMENT_COLOR_TYPES.map((type, id) => ({ id, brandId: "fixture", sourceId: fixtureSource.id,
    name: `${type} Blue`, type: "PLA", product: `${type} PLA`, hex: "#112233",
    amazonUrl: "https://www.amazon.com/dp/B012345678", active: true })),
};
for (const type of FILAMENT_COLOR_TYPES) {
  assert.equal(filamentPaletteFor("PLA", sameHexSettings, type).nearest("#112233")?.name, `${type} Blue`,
    "Type filtering must happen before identical-hex deduplication");
}

// An excluded admin listing must not hide another material sharing its hex,
// or reappear through an explicit material palette or nearest-color naming.
const excludedTypes = ["ABS", "ABS+", "ABS-GF", "ASA", "asa-cf", "PC-ABS", "PC", "PolyMax PC", "PC-CF", "PC-GF", "Polycarbonate"];
const settings: FilamentSettings = {
  brands: [{ id: "fixture", name: "Fixture Filament", aliases: [] }],
  listings: [...excludedTypes, "PLA"].map((type, id) => ({
    id, brandId: "fixture", sourceId: fixtureSource.id, name: `${type} fixture`, type, product: type,
    hex: "#112233", amazonUrl: "https://www.amazon.com/dp/B012345678", active: true,
  })),
};
assert.deepEqual(filamentPaletteFor(null, settings).colors.map(s => s.type), ["PLA"]);
assert.equal(filamentPaletteFor(null, settings).nearest("#112233")?.type, "PLA");
assert.equal(colorNameOf("#112233", 1, settings), "PLA fixture");
const unswatchedSettings: FilamentSettings = { ...settings, listings: settings.listings.map(link => ({ ...link, sourceId: null })) };
for (const config of [DEFAULT_FILAMENT_SETTINGS, settings, unswatchedSettings]) {
  const photographed = (color: FilamentColor) => printedSwatchId(color.pageUrl) !== null;
  assert.deepEqual(configuredFilamentRecords(config, PRINTED_FILAMENT_COLORS).filter(photographed),
    configuredFilamentRecords(config).filter(photographed),
    "The smaller picker lookup must preserve every photographed identity and listing override");
}
assert.deepEqual(filamentPaletteFor(null, unswatchedSettings).colors, [], "Product links alone must not create market swatches");
assert.equal(filamentPaletteFor(null, unswatchedSettings).nearest("#112233"), null);
assert.equal(colorNameOf("#112233", 1, unswatchedSettings), "#112233");
for (const type of excludedTypes) {
  assert.equal(filamentPaletteFor(type, settings).colors.length, 0, type);
  assert.equal(filamentPaletteFor(type, settings).nearest("#112233"), null, type);
  for (const finish of FILAMENT_COLOR_TYPES)
    assert.equal(filamentPaletteFor(type, settings, finish).colors.length, 0, `${type}: excluded from ${finish}`);
}
// The bottom edge must offer real dark shades rather than a hue-independent
// black row. Black stays available at the neutral corner for every hue.
for (const material of [null, "PLA", "PETG", "TPU", "PLA-CF", "CoPE"]) {
  const palette = filamentPaletteFor(material);
  // Very small Amazon-listed palettes cannot supply a dark shade for every hue.
  if (palette.colors.length < 64) continue;
  const richEnd = new Set<string>();
  for (let h = 0; h < 360; h += 30) {
    const bottom = Array.from({ length: 28 }, (_, column) => palette.nearest(targetHex({ h, s: column / 27, v: 0 }))!.hex);
    assert.equal(bottom[0], palette.nearest("#000000")!.hex, `${material}: black corner missing`);
    assert.ok(new Set(bottom).size > 1, `${material}, hue ${h}: bottom row collapsed to one shade`);
    richEnd.add(bottom.at(-1)!);
  }
  assert.ok(richEnd.size > 1, `${material}: changing hue must change dark rich shades`);
}
for (let channel = 0; channel <= 255; channel++) assert.ok(byHex.has(nearestFilamentColor(`#${channel.toString(16).padStart(2, "0").repeat(3)}`).hex));
assert.equal(filamentAlpha(records.find(translucentFilament)!), 0.5);
assert.equal(filamentAlpha(FILAMENT_COLORS.find(s => !translucentFilament(s))!), 1);
console.log(`Combined colors verified: ${records.length} source records, ${FILAMENT_COLORS.length} opaque shades from ${FILAMENT_BRANDS.length} approved brands, ${recorded.overlaps} measured overrides, brand aliases/exclusions, ASA/ABS/PC exclusion, precedence/ambiguity rules, material palettes and ${samples} picker targets.`);
if (uncoveredBrands.length) console.log(`Approved brands without bundled opaque Amazon listings: ${uncoveredBrands.map(brand => brand.name).join(", ")}.`);
