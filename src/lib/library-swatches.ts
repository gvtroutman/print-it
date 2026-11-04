import { SCANNED_FILAMENT_COLORS, scannedShelfSwatch } from "@/lib/filament-scanned-swatches";
import { filamentColorStyle, filamentColorType } from "@/lib/filament-color-types";
import type { ColorMode } from "@/lib/catalog";

/** Use a shelf name that keeps the exact scan under this material. */
export function libraryScannedSwatches(material: string) {
  return SCANNED_FILAMENT_COLORS.flatMap(scan => {
    const mode: ColorMode = filamentColorType(scan) === "Gradient" ? "gradient" : "solid";
    const name = scan.shelfNames?.find(name => scannedShelfSwatch(name, material, mode)?.id === scan.id);
    return name ? [{ id: scan.id, name, hex: scan.hex, style: filamentColorStyle(scan), mode,
      image: scan.pageUrl, maker: scan.maker, product: scan.product, discontinued: scan.discontinued }] : [];
  });
}
