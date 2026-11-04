import type { SwatchChoice } from "@/lib/catalog";
import type { FilamentColor } from "@/lib/filament-palette-data";
import { filamentColorType } from "@/lib/filament-color-types";
import { recordedSwatchId } from "@/lib/filament-ids";
import { filamentSampleImage } from "@/lib/filament-samples";
import { isScentedMaterial } from "@/lib/filament-traits";

/** Snapshot one selected filament without loading the complete source palette. */
export function recordedSwatchChoice(color: FilamentColor): SwatchChoice {
  // Tickets snapshot the type, so preserve a scent named only by the product.
  const type = isScentedMaterial(color.product) && !isScentedMaterial(color.type)
    ? `${color.type} (${color.product})` : color.type;
  return { id: recordedSwatchId(color.id), name: color.name, maker: color.maker, type,
    hex: color.hex, shade: color.translucent ? "TRN" : null, buyUrl: color.amazonUrl ?? null,
    pageUrl: color.pageUrl, image: filamentSampleImage(color), colorType: filamentColorType(color),
    translucent: color.translucent, ...(color.colors ? { colors: color.colors } : {}), purchaseOptions: color.purchaseOptions };
}
