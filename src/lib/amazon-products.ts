import "server-only";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { readAmazonPage } from "@/lib/amazon-page";
import type { AmazonProductPage } from "@/lib/amazon-product";

const TTL = 15 * 60_000;
const FAILURE_TTL = 5 * 60_000;
const cache = new Map<string, { until: number; value: AmazonProductPage }>();
const pending = new Map<string, Promise<AmazonProductPage>>();
const cooldown = new Map<string, number>();
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (active < 2) active++;
  else await new Promise<void>(resolve => waiting.push(resolve));
  try { return await task(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

/** Bound decoded response bodies too; Content-Length may describe compressed bytes. */
export async function amazonResponseBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Amazon returned an empty response.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error("Amazon response is too large.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
const empty = (url: string, status: "unavailable" | "blocked" = "unavailable"): AmazonProductPage =>
  ({ url, status, checkedAt: null, price: null, image: null, imageUrl: null, filament: null });

async function fetchPage(url: string): Promise<AmazonProductPage> {
  const host = new URL(url).hostname;
  if ((cooldown.get(host) ?? 0) > Date.now()) return empty(url, "blocked");
  const signal = AbortSignal.timeout(8_000);
  let target = `${url}?th=1&psc=1`;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(target, { cache: "no-store", redirect: "manual", signal, headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9",
    } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return empty(url);
      const next = new URL(location, target);
      // Do not follow sign-in, other products, other countries, or off-site redirects.
      if (next.protocol !== "https:" || amazonListingUrl(next.href) !== url) return empty(url);
      target = next.href; continue;
    }
    if ([403, 429, 503].includes(response.status)) {
      await response.body?.cancel(); cooldown.set(host, Date.now() + FAILURE_TTL); return empty(url, "blocked");
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) { await response.body?.cancel(); return empty(url); }
    const bytes = await amazonResponseBytes(response, 8 * 1024 * 1024);
    const product = readAmazonPage(new TextDecoder().decode(bytes), url, new Date().toISOString());
    if (product.status === "blocked") cooldown.set(host, Date.now() + FAILURE_TTL);
    return product;
  }
  return empty(url);
}

async function lookup(url: string): Promise<AmazonProductPage> {
  const saved = cache.get(url);
  if (saved && saved.until > Date.now()) return saved.value;
  const current = pending.get(url);
  if (current) return current;
  const task = slot(async () => {
    let value: AmazonProductPage;
    try { value = await fetchPage(url); } catch { value = empty(url); }
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(url, { value, until: Date.now() + (value.status === "ready" ? TTL : FAILURE_TTL) });
    return value;
  });
  pending.set(url, task);
  try { return await task; } finally { pending.delete(url); }
}

/** Read only canonical Amazon product pages. No external API or account credentials. */
export async function amazonProducts(values: readonly string[]): Promise<AmazonProductPage[]> {
  const urls = [...new Set(values.map(amazonListingUrl).filter((value): value is string => !!value))];
  return Promise.all(urls.map(lookup));
}
