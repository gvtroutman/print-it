/** A direct Amazon product listing; searches, storefronts and other sites are excluded. */
export function amazonListingUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^amazon\.(com|ca|co\.uk|de|fr|it|es|nl|se|pl|com\.be|ie|com\.au|co\.jp|in|com\.br|com\.mx|sg|ae|sa|com\.tr)$/.test(host)) return null;
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([a-z0-9]{10})(?:\/|$)/i.exec(url.pathname)?.[1];
    return asin ? `https://www.${host}/dp/${asin.toUpperCase()}` : null;
  } catch {
    return null;
  }
}
