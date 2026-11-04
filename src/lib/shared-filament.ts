import { amazonListingUrl } from "@/lib/amazon-listing";

export type FilamentShare = { url?: string; text?: string; title?: string };

/** Android usually sends the Amazon link inside text, along with the product title. */
export function sharedFilamentUrl(share: FilamentShare): string | null {
  for (const value of [share.url, share.text, share.title]) {
    if (!value || value.length > 8192) continue;
    for (const match of value.matchAll(/https?:\/\/[^\s<>"\u201c\u201d]+/gi)) {
      const candidate = match[0].replace(/[),.;!\]\}]+$/, "");
      if (candidate.length > 2048) continue;
      const direct = amazonListingUrl(candidate);
      if (direct) return direct;
      try {
        const url = new URL(candidate);
        if (url.protocol === "https:" && !url.username && !url.password && !url.port
          && ["a.co", "amzn.to", "amzn.eu", "amzn.asia"].includes(url.hostname)
          && url.pathname.length > 1) return url.href;
      } catch { /* Try another URL in the share. */ }
    }
  }
  return null;
}
