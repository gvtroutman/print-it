import "server-only";
import { configuredFilamentRecords } from "@/lib/filament-settings-data";
import { filamentSettings } from "@/lib/filament-settings";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { filamentPurchaseOptions } from "@/lib/filament-purchases";
import { db } from "@/lib/db";

/** Signed-in users can look up saved links from the buying catalog or available shelf. */
export async function allowedAmazonListings(urls: readonly string[], admin: boolean): Promise<boolean> {
  if (!urls.every(url => amazonListingUrl(url) === url)) return false;
  if (!urls.length) return true;
  const [settings, shelf] = await Promise.all([
    filamentSettings(),
    db.catalogColor.findMany({
      where: { amazonUrl: { in: [...urls] }, ...(admin ? {} : { active: true, material: { active: true } }) },
      select: { amazonUrl: true },
    }),
  ]);
  const allowed = new Set(configuredFilamentRecords(settings).flatMap(color => filamentPurchaseOptions(color.amazonUrl, color.purchaseOptions).map(option => option.url)));
  shelf.forEach(color => { if (color.amazonUrl) allowed.add(color.amazonUrl); });
  if (admin) settings.listings.forEach(listing => filamentPurchaseOptions(listing.amazonUrl, listing.purchaseOptions).forEach(option => allowed.add(option.url)));
  return urls.every(url => allowed.has(url));
}
