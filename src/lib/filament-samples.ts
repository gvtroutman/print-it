import { swatchImagePath } from "@/lib/catalog";
import { printedSwatchId } from "@/lib/filament-ids";
import { scannedFilamentImage } from "@/lib/filament-scanned-swatches";

type SampleColor = { name: string; type: string; maker?: string; product?: string; pageUrl?: string | null };

/** Locally scanned samples and source samples both have a verified product identity. */
export function filamentSampleImage(color: SampleColor): string | null {
  const scanned = scannedFilamentImage(color);
  if (scanned) return scanned;
  const id = printedSwatchId(color.pageUrl);
  return id === null ? null : swatchImagePath(id);
}

export const hasPrintedFilamentSample = (color: SampleColor) => filamentSampleImage(color) !== null;
