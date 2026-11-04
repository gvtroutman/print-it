import { amazonListingUrl } from "../../src/lib/amazon-listing";

/** Follow only Amazon's own short links; retain the exact product ASIN they name. */
export async function resolveAmazonListing(value: unknown, request: typeof fetch = fetch): Promise<string | null> {
  const direct = amazonListingUrl(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;
  try {
    let url = new URL(value);
    for (let hop = 0; hop < 4; hop++) {
      if (url.protocol !== "https:" || url.username || url.password || url.port
        || !["amzn.to", "a.co", "amzn.eu", "amzn.asia"].includes(url.hostname)) return null;
      const response = await request(url.href, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel().catch(() => {});
      if (response.status < 300 || response.status >= 400) return null;
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
      const listing = amazonListingUrl(url.href);
      if (listing) return listing;
    }
  } catch {
    // A broken/expired short link is not a product listing.
  }
  return null;
}
