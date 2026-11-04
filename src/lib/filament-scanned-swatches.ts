import sources from "../../public/filament-swatches/sources.json";
import type { FilamentColor } from "@/lib/filament-palette-data";
import { colorDisplayName, filamentColorType } from "@/lib/filament-color-types";
import { filamentBrandKey } from "@/lib/filament-brands";
import { builtInTraits, ownKind } from "@/lib/filament-traits";
import type { ColorMode } from "@/lib/catalog";

export const SCANNED_FILAMENT_COLORS: (FilamentColor & { discontinued: boolean; shelfNames?: readonly string[]; nameAliases?: readonly string[] })[] = sources.swatches.map(swatch => ({
  ...swatch, id: `scan:${swatch.id}`, source: "scan", translucent: false,
  pageUrl: `/filament-swatches/${swatch.file}`,
}));

type SampleIdentity = { name: string; type: string; maker?: string; product?: string };
const nameKey = (name: string) => colorDisplayName(name).replace(/\s*\((?:gradient|solid|silk)\)\s*$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Owner scans belong to these exact products; a matching hex never borrows one. */
export function scannedFilamentSwatch(color: SampleIdentity) {
  const maker = filamentBrandKey(color.maker ?? "");
  const name = nameKey(color.name);
  const text = `${color.type} ${color.product ?? ""}`;
  return SCANNED_FILAMENT_COLORS.find(sample => {
    const makers = ["Polymaker", "Panchroma"].includes(sample.maker) ? ["polymaker", "panchroma"] : [filamentBrandKey(sample.maker)];
    const makerMatches = makers.includes(maker);
    if (!makerMatches || builtInTraits(color.type)?.family !== sample.family || ownKind(color.type) !== ownKind(sample.type)) return false;
    if (sample.name === "Blue Glacier") return ["glacier", "blueglacier"].includes(name)
      && filamentColorType(color) === "Gradient";
    if (![sample.name, ...(sample.nameAliases ?? [])].some(alias => name === nameKey(alias))
      || filamentColorType(color) !== filamentColorType(sample)) return false;
    if (/\bmatte\b/i.test(text) !== /\bmatte\b/i.test(`${sample.type} ${sample.product}`)) return false;
    if (sample.type === "CoPE") return /\bcope\b/i.test(text);
    if (/\bsatin\b/i.test(sample.product)) return /\bsatin\b/i.test(text);
    return true;
  });
}

export const scannedFilamentImage = (color: SampleIdentity): string | null => scannedFilamentSwatch(color)?.pageUrl ?? null;

/** Shelf bindings are explicitly identified by the owner, independently of the stored preview hex. */
export function scannedShelfSwatch(name: string, material: string, mode: ColorMode = "solid") {
  if (mode === "whatever") return undefined;
  const finish = mode === "gradient" ? "Gradient" : mode === "funfetti" ? "Glitter"
    : filamentColorType({ name, type: material });
  const kind = ownKind(material) ?? ownKind(name);
  return SCANNED_FILAMENT_COLORS.find(sample => sample.shelfNames?.some(alias => nameKey(alias) === nameKey(name))
    && builtInTraits(material)?.family === sample.family && kind === ownKind(sample.type)
    && finish === filamentColorType(sample));
}
