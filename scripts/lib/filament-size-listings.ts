import { amazonListingUrl } from "../../src/lib/amazon-listing";
import type { FilamentPurchaseOption } from "../../src/lib/filament-purchases";

export type FilamentSize = {
  id: string; variant_id: string; discontinued?: boolean; filament_weight?: number;
  diameter?: number; spool_refill?: boolean;
};
export type FilamentSizeListing = { size_id: string; url: string; spool_refill?: boolean };

/** Preserve every compatible size of the exact color variant, including small rolls/refills. */
export function filamentSizeListings(sizes: readonly FilamentSize[], listings: readonly FilamentSizeListing[], resolved: ReadonlyMap<string, string>) {
  const bySize = new Map(sizes.filter(size => !size.discontinued && size.diameter === 1.75).map(size => [size.id, size]));
  const byVariant = new Map<string, { weight: number; option: FilamentPurchaseOption }[]>();
  for (const listing of listings) {
    const size = bySize.get(listing.size_id);
    const url = amazonListingUrl(resolved.get(listing.url));
    if (!size || !url) continue;
    const weight = typeof size.filament_weight === "number" && size.filament_weight > 0 ? size.filament_weight : null;
    const quantity = weight ? weight >= 1000 ? `${weight / 1000} kg` : `${weight} g` : "Unspecified size";
    const label = `${quantity} ${listing.spool_refill || size.spool_refill ? "refill" : "spool"}`;
    const held = byVariant.get(size.variant_id) ?? [];
    held.push({ weight: weight ?? Infinity, option: { url, label } });
    byVariant.set(size.variant_id, held);
  }
  return new Map([...byVariant].map(([variant, entries]) => {
    entries.sort((a, b) => Number(new URL(b.option.url).hostname === "www.amazon.com") - Number(new URL(a.option.url).hostname === "www.amazon.com") || a.weight - b.weight || a.option.url.localeCompare(b.option.url));
    const options = [...new Map(entries.map(entry => [entry.option.url, entry.option])).values()];
    return [variant, options] as const;
  }));
}
