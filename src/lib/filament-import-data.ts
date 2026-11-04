import { amazonListingUrl } from "@/lib/amazon-listing";
import { matchingFilamentBrand, type FilamentBrandChoice } from "@/lib/filament-brands";
import { filamentColorFits, type FilamentColor } from "@/lib/filament-palette-data";
import type { AmazonProductPage } from "@/lib/amazon-product";
import { filamentTypeFromText } from "@/lib/amazon-filament-details";

const colorKey = (value: string) => value.toLowerCase().replace(/gray/g, "grey").replace(/[^a-z0-9]/g, "");

/** A shared parent link or ambiguous measurement cannot select a color's hex. */
export function catalogHexForProduct(product: AmazonProductPage, brand: FilamentBrandChoice, colors: readonly FilamentColor[]): string | null {
  const { colorName, type } = product.filament ?? {};
  if (!colorName || !type) return null;
  const candidates = colors.filter(color => !color.translucent && amazonListingUrl(color.amazonUrl) === product.url
    && matchingFilamentBrand(color.maker, [{ ...brand, active: true }]) && filamentColorFits(type, color)
    && filamentTypeFromText(color.type, color.product) === filamentTypeFromText(type)
    && colorKey(color.name) === colorKey(colorName));
  const values = [...new Set(candidates.map(color => color.hex.toLowerCase()))];
  return values.length === 1 ? values[0] : null;
}
