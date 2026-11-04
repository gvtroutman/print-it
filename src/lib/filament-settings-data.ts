import { amazonListingUrl } from "@/lib/amazon-listing";
import { matchingFilamentBrand, type FilamentSettings } from "@/lib/filament-brands";
import { builtInTraits } from "@/lib/filament-traits";
import type { FilamentColor } from "@/lib/filament-palette-data";
import type { LibrarySwatch } from "@/lib/catalog";
import { filamentColorType } from "@/lib/filament-color-types";
import recorded from "./filament-palette.json";
import { hasPrintedFilamentSample } from "@/lib/filament-samples";
import { recordedSwatchChoice } from "@/lib/filament-choice";
import { SCANNED_FILAMENT_COLORS, scannedFilamentImage, scannedFilamentSwatch } from "@/lib/filament-scanned-swatches";
import { filamentPurchaseOptions } from "@/lib/filament-purchases";
import { withSmallFilamentPackages } from "@/lib/filament-small-packages";

export { ADMIN_SWATCH_BASE, adminSwatchId, isAdminSwatch } from "@/lib/filament-ids";
export { recordedSwatchChoice } from "@/lib/filament-choice";
export const SOURCE_FILAMENT_COLORS = [...SCANNED_FILAMENT_COLORS, ...(recorded.swatches as FilamentColor[]).map(withSmallFilamentPackages)];
/** The picker can only display records with an identified printed sample. */
export const PRINTED_FILAMENT_COLORS = SOURCE_FILAMENT_COLORS.filter(hasPrintedFilamentSample);
const sourceById = new Map(SOURCE_FILAMENT_COLORS.map(color => [color.id, color]));

export function configuredFilamentRecords(settings: FilamentSettings, sourceRecords: readonly FilamentColor[] = SOURCE_FILAMENT_COLORS): FilamentColor[] {
  const overrides = new Map(settings.listings.filter(link => link.sourceId).map(link => [link.sourceId, link]));
  const source = sourceRecords.flatMap(swatch => {
    const brand = matchingFilamentBrand(swatch.maker, settings.brands);
    if (!brand) return [];
    const override = overrides.get(swatch.id);
    if (override && (override.brandId !== brand.id || !override.active)) return [];
    const amazonUrl = amazonListingUrl(override?.amazonUrl ?? swatch.amazonUrl);
    return amazonUrl ? [{ ...swatch, amazonUrl, purchaseOptions: filamentPurchaseOptions(amazonUrl, override ? override.purchaseOptions : swatch.purchaseOptions) }] : [];
  });
  const additions: FilamentColor[] = settings.listings.flatMap(link => {
    const brand = settings.brands.find(brand => brand.id === link.brandId && brand.active !== false);
    const amazonUrl = amazonListingUrl(link.amazonUrl);
    if (!brand || !link.active || !amazonUrl) return [];
    // Linked source records keep their measured color and material identity.
    const held = link.sourceId ? sourceById.get(link.sourceId) : scannedFilamentSwatch({ ...link, maker: brand.name });
    return [{ ...(held ?? {}), id: `admin:${link.id}`, name: link.name, hex: link.hex,
      maker: brand.name, type: link.type, product: link.product,
      family: held?.family ?? builtInTraits(link.type)?.family ?? null,
      source: "admin" as const, translucent: held?.translucent ?? filamentColorType({ name: link.name, type: link.type, product: link.product }) === "Translucent", pageUrl: held?.pageUrl ?? amazonUrl, amazonUrl,
      purchaseOptions: filamentPurchaseOptions(amazonUrl, link.purchaseOptions) }];
  });
  return [...additions, ...source];
}

export function managedLibrarySwatches(settings: FilamentSettings): LibrarySwatch[] {
  return configuredFilamentRecords(settings).filter(color => color.source === "admin").map(color => ({
    ...recordedSwatchChoice(color), family: color.family, imageUrl: null, photoUrl: null, sampleImage: scannedFilamentImage(color),
  }));
}

export function bundledLibrarySwatches(settings: FilamentSettings): LibrarySwatch[] {
  return configuredFilamentRecords(settings).filter(color => color.source === "openfilamentdatabase" || color.source === "scan").map(color => ({
    ...recordedSwatchChoice(color), family: color.family, imageUrl: null, photoUrl: null, sampleImage: scannedFilamentImage(color),
  }));
}

/** Apply settings to copies, so changing a brand/link never poisons the library cache. */
export function configuredLibrarySwatches(swatches: LibrarySwatch[], settings: FilamentSettings): LibrarySwatch[] {
  const overrides = new Map(settings.listings.filter(link => link.sourceId).map(link => [link.sourceId, link]));
  return swatches.flatMap(swatch => {
    const brand = matchingFilamentBrand(swatch.maker, settings.brands);
    if (!brand) return [];
    const override = overrides.get(`fcx:${swatch.id}`);
    if (override && (override.brandId !== brand.id || !override.active)) return [];
    const buyUrl = amazonListingUrl(override?.amazonUrl ?? swatch.buyUrl);
    const held = sourceById.get(`fcx:${swatch.id}`);
    return buyUrl ? [{ ...swatch, buyUrl, purchaseOptions: filamentPurchaseOptions(buyUrl, override ? override.purchaseOptions : held?.purchaseOptions ?? swatch.purchaseOptions) }] : [];
  });
}
