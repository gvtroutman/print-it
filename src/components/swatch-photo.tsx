import type { SwatchChoice } from "@/lib/catalog";
import { FilamentPhoto } from "./filament-photo";

/** Buying and saved swatches keep their photographed sample, with the linked product as fallback. */
export function SwatchPhoto({ swatch, className = "", bare = false, sampleOnly = false, retryKey, onUnavailable }: {
  swatch: Pick<SwatchChoice, "image" | "hex"> & Partial<SwatchChoice>;
  className?: string;
  bare?: boolean;
  sampleOnly?: boolean;
  onUnavailable?: () => void;
  retryKey?: number;
}) {
  return <FilamentPhoto color={{ name: "", type: "", ...swatch, amazonUrl: swatch.buyUrl ?? undefined }} image={swatch.image} className={className} bare={bare} sampleOnly={sampleOnly} retryKey={retryKey} onUnavailable={onUnavailable} />;
}
