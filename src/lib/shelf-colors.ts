import { labOf, type CatalogColorChoice } from "@/lib/catalog";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { colorDisplayName, filamentColorType, filamentMatchesColorFilter } from "@/lib/filament-color-types";
import { DEFAULT_FILAMENT_SETTINGS, type FilamentSettings } from "@/lib/filament-brands";
import { printedSwatchId } from "@/lib/filament-ids";
import { filamentColorFits, type FilamentColor } from "@/lib/filament-palette-data";
import { configuredFilamentRecords, PRINTED_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { builtInTraits } from "@/lib/filament-traits";
import { filamentSampleImage, hasPrintedFilamentSample } from "@/lib/filament-samples";
import { scannedShelfSwatch } from "@/lib/filament-scanned-swatches";

export type ShelfColorSample = {
  color: FilamentColor;
  exact: boolean;
  /** A single-color reference cannot demonstrate a gradient or another finish. */
  baseColorOnly: boolean;
};

type MaterialSamples = {
  compatible: FilamentColor[];
  candidates: FilamentColor[];
  finishes: Map<string, FilamentColor[]>;
};
type SampleIndex = {
  recorded: FilamentColor[];
  materials: Map<string, MaterialSamples>;
  matches: Map<string, ShelfColorSample | null>;
};
const samples = new WeakMap<FilamentSettings, SampleIndex>();
const labs = new Map<string, ReturnType<typeof labOf>>();
const lab = (hex: string) => {
  if (!labs.has(hex)) labs.set(hex, labOf(hex));
  return labs.get(hex)!;
};

/** Shelf photos are references only; they never change the requested shelf color. */
export function shelfColorSample(color: CatalogColorChoice, material = "", settings = DEFAULT_FILAMENT_SETTINGS): ShelfColorSample | null {
  if (color.mode === "whatever" || !/^#[0-9a-f]{6}$/i.test(color.hex)) return null;
  const shelfMaterial = color.materialName ?? material;
  const scanned = scannedShelfSwatch(color.name, shelfMaterial, color.mode);
  if (scanned) return { color: scanned, exact: true, baseColorOnly: false };
  let index = samples.get(settings);
  if (!index) {
    // A filament already on the shelf need not have an enabled Store brand or buy link.
    index = { recorded: [...configuredFilamentRecords(settings, PRINTED_FILAMENT_COLORS), ...PRINTED_FILAMENT_COLORS]
      .filter(hasPrintedFilamentSample), materials: new Map(), matches: new Map() };
    samples.set(settings, index);
  }
  const listing = amazonListingUrl(color.amazonUrl);
  // Parent form edits create new color objects. Cache by the fields that
  // determine a reference, and keep each settings object's results separate.
  const key = JSON.stringify([shelfMaterial, color.name, color.mode, color.hex.toLowerCase(), listing]);
  if (index.matches.has(key)) return index.matches.get(key)!;
  let materialSamples = index.materials.get(shelfMaterial);
  if (!materialSamples) {
    const family = builtInTraits(shelfMaterial)?.family;
    const baseFamily = family?.replace(/ with fibre$/, "");
    const types = new Map<string, boolean>();
    const compatible = index.recorded.filter(sample => {
      if (family && sample.family !== family) return false;
      if (!types.has(sample.type)) types.set(sample.type, filamentColorFits(shelfMaterial, sample));
      return types.get(sample.type);
    });
    materialSamples = { compatible, candidates: family
      ? index.recorded.filter(sample => sample.family === family || sample.family === baseFamily) : compatible,
    finishes: new Map() };
    index.materials.set(shelfMaterial, materialSamples);
  }
  const { compatible, candidates, finishes } = materialSamples;
  // This owner-supplied product is Bambu's PLA Basic Green 10501, sample 1970.
  const identified = listing === "https://www.amazon.com/dp/B0F68ZJ1F1"
    ? compatible.find(sample => printedSwatchId(sample.pageUrl) === 1970) : undefined;
  const linked = listing ? compatible.filter(sample => amazonListingUrl(sample.amazonUrl) === listing) : [];
  const linkedIds = new Set(linked.map(filamentSampleImage));
  if (identified || linkedIds.size === 1) {
    const result = { color: identified ?? linked[0], exact: true, baseColorOnly: false };
    index.matches.set(key, result);
    return result;
  }
  // For a labeled approximation, a plain PETG blue can be closer than an unrelated PETG-CF purple.
  const finish = color.mode === "gradient" ? "Gradient" : color.mode === "funfetti" ? "Glitter"
    : filamentColorType({ name: color.name, type: shelfMaterial });
  const glow = filamentMatchesColorFilter({ name: color.name, type: shelfMaterial }, "Glow");
  const forFinish = (name: string) => {
    const key = `${name}|${glow}`;
    if (!finishes.has(key)) finishes.set(key, candidates.filter(sample => filamentColorType(sample) === name
      && filamentMatchesColorFilter(sample, "Glow") === glow));
    return finishes.get(key)!;
  };
  const sameFinish = forFinish(finish);
  const references = sameFinish.length ? sameFinish : forFinish("Solid");
  const target = lab(color.hex.toLowerCase());
  let closest: FilamentColor | null = null;
  let distance = Infinity;
  for (const sample of references) {
    const measured = lab(sample.hex);
    const score = measured.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
    if (score < distance) {
      closest = sample;
      distance = score;
    }
  }
  const result = closest ? { color: closest, exact: false, baseColorOnly: filamentColorType(closest) !== finish } : null;
  index.matches.set(key, result);
  return result;
}

/** Keep different shelf shades even when their color names are the same. */
export function shelfColors(colors: readonly CatalogColorChoice[]): (CatalogColorChoice & { detail?: string })[] {
  const seen = new Set<string>();
  const names = new Map<string, number>();
  const nameKey = (color: CatalogColorChoice) => colorDisplayName(color.name).toLowerCase();
  const choices = colors.filter(color => {
    if (color.mode === "whatever" || !/^#[0-9a-f]{6}$/i.test(color.hex)) return false;
    const name = nameKey(color);
    const key = JSON.stringify([name, color.hex.toLowerCase(), color.mode, color.style]);
    if (seen.has(key)) return false;
    seen.add(key);
    names.set(name, (names.get(name) ?? 0) + 1);
    return true;
  });
  return choices.map(color => ({
    ...color,
    detail: names.get(nameKey(color))! > 1 ? color.materialName ?? color.hex : undefined,
  }));
}
