import { labOf } from "@/lib/catalog";
import { DEFAULT_FILAMENT_SETTINGS, type FilamentSettings } from "@/lib/filament-brands";
import { configuredFilamentRecords, PRINTED_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { filamentColorFits, isMarketFilament, type FilamentColor } from "@/lib/filament-palette-data";
import { colorDisplayName, filamentMatchesColorFilter, type FilamentColorFilter } from "@/lib/filament-color-types";
import { hasPrintedFilamentSample } from "@/lib/filament-samples";

export type { FilamentColor } from "@/lib/filament-palette-data";
// Filter before hex deduplication so a linked, approved opaque record can
// represent a shade shared with an unlinked or excluded record.
const records = configuredFilamentRecords(DEFAULT_FILAMENT_SETTINGS, PRINTED_FILAMENT_COLORS);

export type FilamentPalette = {
  colors: FilamentColor[];
  nearest: (hex: string) => FilamentColor | null;
};

/** One representative per exact hex; measured records always come first. */
function makePalette(swatches: FilamentColor[], keepVariants = false): FilamentPalette {
  // Filter before deduplication so an excluded material or unswatched listing cannot hide an eligible sample.
  swatches = swatches.filter(swatch => hasPrintedFilamentSample(swatch) && isMarketFilament(swatch));
  const byHex = new Map<string, FilamentColor>();
  for (const swatch of swatches) {
    const held = byHex.get(swatch.hex);
    if (!held || (held.source !== "admin" && (swatch.source === "admin" || (held.source !== "filamentcolors" && swatch.source === "filamentcolors")))) byHex.set(swatch.hex, swatch);
  }
  const colors = keepVariants ? swatches : [...byHex.values()];
  const labs = colors.map((swatch) => ({ swatch, lab: labOf(swatch.hex) }));
  return {
    colors,
    nearest(hex) {
      const exact = byHex.get(hex.toLowerCase());
      if (exact) return exact;
      const target = labOf(hex);
      let closest: FilamentColor | null = null;
      let distance = Infinity;
      for (const entry of labs) {
        const d = (entry.lab[0] - target[0]) ** 2 + (entry.lab[1] - target[1]) ** 2 + (entry.lab[2] - target[2]) ** 2;
        if (d < distance) {
          closest = entry.swatch;
          distance = d;
        }
      }
      return closest;
    },
  };
}

const ALL = makePalette(records.filter(s => !s.translucent));
export const FILAMENT_COLORS = ALL.colors;
const groups = new WeakMap<FilamentSettings, { records: FilamentColor[]; palettes: Map<string, FilamentPalette> }>();
groups.set(DEFAULT_FILAMENT_SETTINGS, { records, palettes: new Map([["", ALL]]) });

/** An unknown material has an empty palette instead of borrowing another material's colors. */
export function filamentPaletteFor(material?: string | null, settings: FilamentSettings = DEFAULT_FILAMENT_SETTINGS, colorFilter?: FilamentColorFilter): FilamentPalette {
  let group = groups.get(settings);
  if (!group) {
    group = { records: configuredFilamentRecords(settings, PRINTED_FILAMENT_COLORS), palettes: new Map() };
    groups.set(settings, group);
  }
  const key = `${material?.toLowerCase().trim() ?? ""}${colorFilter ? `|${colorFilter}` : ""}`;
  let palette = group.palettes.get(key);
  if (!palette) {
    palette = makePalette(group.records.filter((swatch) => (!material || filamentColorFits(material, swatch))
      && (colorFilter ? filamentMatchesColorFilter(swatch, colorFilter) : !swatch.translucent)),
    colorFilter === "Gradient" || colorFilter === "Multi Color" || colorFilter === "Composite" || colorFilter === "Scented" || colorFilter === "Glow");
    group.palettes.set(key, palette);
  }
  return palette;
}

/** Exact recorded shade closest to the target; used for Auto material and older requests. */
export function nearestFilamentColor(hex: string): FilamentColor {
  return ALL.nearest(hex)!;
}

export const translucentFilament = (swatch: FilamentColor) => swatch.translucent;
/** A visual hint and library-search preference, not a measured opacity. */
export const filamentAlpha = (swatch: FilamentColor) => swatch.translucent ? 0.5 : 1;

/** The recorded color name without the source's sample cooling notes. */
export function colorNameOf(hex: string, alpha = 1, settings: FilamentSettings = DEFAULT_FILAMENT_SETTINGS): string {
  const swatch = filamentPaletteFor(null, settings).nearest(hex);
  if (!swatch) return hex.toLowerCase();
  return `${alpha < 1 && !swatch.translucent ? "see-through " : ""}${colorDisplayName(swatch.name)}`;
}
