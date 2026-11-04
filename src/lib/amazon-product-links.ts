import { amazonListingUrl } from "@/lib/amazon-listing";
import type { FilamentColor } from "@/lib/filament-palette-data";
import recorded from "./filament-palette.json";
import { withSmallFilamentPackages } from "@/lib/filament-small-packages";
import { filamentPurchaseOptions, type FilamentPurchaseOption } from "@/lib/filament-purchases";

const keyOf = (spool: { maker: string; type: string; name: string }) =>
  [spool.maker, spool.type, spool.name].map(value => value.toLowerCase().replace(/\s+/g, " ").trim()).join("|");
const byId = new Map<number, FilamentColor>();
const byProduct = new Map<string, Set<string>>();
const packagesByProduct = new Map<string, FilamentPurchaseOption[]>();
for (const swatch of (recorded.swatches as FilamentColor[]).map(withSmallFilamentPackages)) {
  const url = amazonListingUrl(swatch.amazonUrl);
  if (!url) continue;
  if (swatch.id.startsWith("fcx:")) byId.set(Number(swatch.id.slice(4)), swatch);
  const key = keyOf(swatch);
  if (!byProduct.has(key)) byProduct.set(key, new Set());
  byProduct.get(key)!.add(url);
  packagesByProduct.set(key, [...(packagesByProduct.get(key) ?? []), ...(swatch.purchaseOptions ?? [])]);
}

export function recordedAmazonPackagesFor(spool: { id?: number; maker: string; type: string; name: string }): FilamentPurchaseOption[] {
  const held = spool.id === undefined ? undefined : byId.get(spool.id);
  if (held && keyOf(held) === keyOf(spool)) return filamentPurchaseOptions(held.amazonUrl, held.purchaseOptions);
  const url = recordedAmazonListingFor(spool);
  return url ? filamentPurchaseOptions(url, packagesByProduct.get(keyOf(spool))) : [];
}

/** Resolved source links may be reused only for the same exact product identity. */
export function recordedAmazonListingFor(spool: { id?: number; maker: string; type: string; name: string }): string | null {
  const held = spool.id === undefined ? undefined : byId.get(spool.id);
  if (held && keyOf(held) === keyOf(spool)) return amazonListingUrl(held.amazonUrl);
  const listings = byProduct.get(keyOf(spool));
  return listings?.size === 1 ? [...listings][0]! : null;
}
