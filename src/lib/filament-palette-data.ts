import { builtInTraits, ownKind } from "@/lib/filament-traits";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { filamentColorType, type FilamentColorType } from "@/lib/filament-color-types";
import { filamentPurchaseOptions, type FilamentPurchaseOption } from "@/lib/filament-purchases";

export type FilamentColor = {
  id: string;
  name: string;
  hex: string;
  maker: string;
  type: string;
  product: string;
  family: string | null;
  source: "filamentcolors" | "openfilamentdatabase" | "scan" | "admin";
  translucent: boolean;
  colorType?: FilamentColorType;
  colors?: string[];
  pageUrl: string;
  /** A direct Amazon product listing supplied by the source, when available. */
  amazonUrl?: string;
  purchaseOptions?: FilamentPurchaseOption[];
};

/** Whether a filament's material is allowed in the requester's market color choices. */
export function isMarketFilament(color: { family?: string | null; type: string }): boolean {
  return !/\b(?:ASA|ABS|PC|polycarbonate)\b/i.test(`${color.family ?? ""} ${color.type}`);
}

/** Reject catalog entries whose one hex would hide several physical colors. */
export function singleColorVariant(name: string, product: string, traits: Record<string, boolean> = {}): boolean {
  if (traits.gradual_color_change || traits.coextruded
    || /rainbow|multi[ -]?colou?r|dual[ -]colou?r|tri(?:ple)?[ -]colou?r|gradient|ombre/i.test(`${product} ${name}`)) return false;
  const colors = name.match(/\b(red|gold|green|black|yellow|blue|purple|pink|orange|white|silver|grey|gray|brown|bronze|copper)\b/gi) ?? [];
  return !(/[+/&]/.test(name) && colors.length > 1);
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
const makerKey = (s: string) => {
  const key = words(s).replace(/ /g, "");
  return key === "prusa" ? "prusament" : key;
};
const finishKey = (s: string) => ["matte", "silk", "glitter", "marble", "wood", "metallic"]
  .filter((finish) => new RegExp(`\\b${finish}\\b`, "i").test(s)).join("+");

/** Material compatibility follows the existing spool search, including fibre and CoPE. */
export function filamentColorFits(material: string, swatch: FilamentColor): boolean {
  const family = builtInTraits(material)?.family;
  if (family) return swatch.family === family && ownKind(swatch.type) === ownKind(material);
  const wanted = ` ${words(material)} `;
  return wanted.trim() !== "" && ` ${words(swatch.type)} `.includes(wanted);
}

function matchKey(s: FilamentColor): string {
  return [makerKey(s.maker), s.family ?? words(s.type), ownKind(s.type) ?? "", words(s.name),
    finishKey(`${s.product} ${s.type} ${s.name}`), s.translucent, filamentColorType(s)].join("|");
}

/** Replace an unambiguous matching catalog color with its measured swatch. */
export function combineFilamentColors(measured: FilamentColor[], listed: FilamentColor[]) {
  const enriched = measured.map((swatch) => ({ ...swatch }));
  const measurements = new Map<string, FilamentColor[]>();
  const products = new Map<string, Set<string>>();
  for (const swatch of enriched) {
    const key = matchKey(swatch);
    measurements.set(key, [...(measurements.get(key) ?? []), swatch]);
  }
  for (const swatch of listed) {
    const key = matchKey(swatch);
    if (!products.has(key)) products.set(key, new Set());
    products.get(key)!.add(words(swatch.product));
  }
  let overlaps = 0;
  const remaining = listed.filter((swatch) => {
    const key = matchKey(swatch);
    let matches = measurements.get(key) ?? [];
    // When several product lines use the same color name, only an exact
    // line/type match is enough evidence to replace a catalog value.
    if ((products.get(key)?.size ?? 0) > 1) {
      matches = matches.filter((m) => words(m.type) === words(swatch.type)
        || words(m.type) === words(swatch.product));
    }
    if (matches.length === 0 || new Set(matches.map((m) => m.hex)).size !== 1) return true;
    const amazonUrl = amazonListingUrl(swatch.amazonUrl);
    if (amazonUrl) {
      for (const match of matches) if (!match.amazonUrl) match.amazonUrl = amazonUrl;
    }
    if (swatch.purchaseOptions?.length) for (const match of matches) {
      match.purchaseOptions = filamentPurchaseOptions(match.amazonUrl, [...(match.purchaseOptions ?? []), ...swatch.purchaseOptions]);
    }
    overlaps++;
    return false;
  });
  return { swatches: [...enriched, ...remaining], overlaps };
}
