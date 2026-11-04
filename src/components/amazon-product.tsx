"use client";

import { useEffect, useState } from "react";
import { amazonPriceText, type AmazonProduct } from "@/lib/amazon-product";
import { filamentPurchaseOptions, lowestFilamentPurchase, type FilamentPurchaseOption } from "@/lib/filament-purchases";

const held = new Map<string, { until: number; value: Promise<AmazonProduct> }>();
const pending = new Map<string, (product: AmazonProduct) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
const unavailable = (url: string): AmazonProduct => ({ url, status: "unavailable", checkedAt: null, price: null, image: null });
async function flush() {
  timer = null;
  const entries = [...pending]; pending.clear();
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    try {
      const response = await fetch("/api/amazon-products", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: batch.map(([url]) => url) }), signal: AbortSignal.timeout(25_000) });
      const body = response.ok ? await response.json() as { products: AmazonProduct[] } : { products: [] };
      batch.forEach(([url, resolve]) => resolve(body.products.find(product => product.url === url) ?? unavailable(url)));
    } catch { batch.forEach(([url, resolve]) => resolve(unavailable(url))); }
  }
}
function lookup(url: string): Promise<AmazonProduct> {
  const entry = held.get(url);
  if (entry && entry.until > Date.now()) return entry.value;
  const value = new Promise<AmazonProduct>(resolve => pending.set(url, resolve));
  if (held.size >= 512) held.delete(held.keys().next().value!);
  held.set(url, { value, until: Date.now() + 5 * 60_000 });
  timer ??= setTimeout(() => { void flush(); }, 25);
  return value;
}

export function useAmazonProduct(url: string | null) {
  const [result, setResult] = useState<AmazonProduct | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    // Wait for a shade to settle so dragging the color picker does not fetch a page for every intermediate color.
    const initial = url ? setTimeout(() => { void lookup(url).then(value => { if (active) setResult(value); }); }, 350) : null;
    // Refresh visible prices without a page reload; the server caches successful lookups for 15 minutes.
    const timer = url ? setInterval(() => { void lookup(url).then(value => { if (active) setResult(value); }); }, 5 * 60_000) : null;
    return () => { active = false; if (initial) clearTimeout(initial); if (timer) clearInterval(timer); };
  }, [url]);
  return result?.url === url ? result : null;
}

export function AmazonPrice({ url, className = "", details = false }: { url: string; className?: string; details?: boolean }) {
  const product = useAmazonProduct(url);
  return <ProductPrice product={product} className={className} details={details} />;
}
export function ProductPrice({ product, className = "", details = false }: { product: AmazonProduct | null; className?: string; details?: boolean }) {
  const checked = product?.checkedAt ? new Date(product.checkedAt).toLocaleString("en-US") : null;
  return <span data-amazon-price className={`inline-flex flex-col gap-[3px] ${className}`} title={checked ? `Amazon listing price, checked ${checked}. Price and availability may change.` : undefined}>
    <span className="font-bold">{amazonPriceText(product)}</span>
    {details && product?.price && <span className="text-[10px] font-normal text-ink-3">Listing price · checked {checked}</span>}
    {details && product?.status === "blocked" && <span className="text-[10px] font-normal text-ink-3">Amazon blocked this lookup. Try again later.</span>}
  </span>;
}

export function useFilamentPurchase(url: string | null, options?: readonly FilamentPurchaseOption[]) {
  const key = JSON.stringify(filamentPurchaseOptions(url, options));
  const [result, setResult] = useState<{ key: string; products: AmazonProduct[] } | null>(null);
  useEffect(() => {
    let active = true;
    const choices: FilamentPurchaseOption[] = JSON.parse(key);
    const refresh = async () => {
      const products = await Promise.all(choices.map(option => lookup(option.url)));
      if (active) setResult({ key, products });
    };
    const initial = choices.length ? setTimeout(() => { void refresh(); }, 350) : null;
    const interval = choices.length ? setInterval(() => { void refresh(); }, 5 * 60_000) : null;
    return () => { active = false; if (initial) clearTimeout(initial); if (interval) clearInterval(interval); };
  }, [key]);
  return { ...lowestFilamentPurchase(JSON.parse(key), result?.key === key ? result.products : []), loading: result?.key !== key };
}

/** Price, package and purchase link always refer to the same checked listing. */
export function FilamentPurchase({ url, options, className = "", details = false, link = true, viewOnly = false }: {
  url: string; options?: readonly FilamentPurchaseOption[]; className?: string; details?: boolean; link?: boolean; viewOnly?: boolean;
}) {
  const purchase = useFilamentPurchase(url, options);
  const multiple = filamentPurchaseOptions(url, options).length > 1;
  if (viewOnly) return purchase.option ? <a data-filament-purchase data-package-link href={purchase.option.url} target="_blank" rel="noreferrer noopener"
    aria-label="View filament on Amazon" className={`inline-block font-bold underline underline-offset-2 ${className}`}>View ↗</a> : null;
  return <span data-filament-purchase className={`inline-flex min-w-0 flex-col items-start gap-[4px] ${className}`}>
    {purchase.option?.label !== "Standard listing" && <span data-package-label>{purchase.option?.label}</span>}
    <ProductPrice product={purchase.loading ? null : purchase.product} details={details} />
    {multiple && <span className="text-[10px] leading-tight">{purchase.loading ? "Comparing package prices…" : purchase.compared ? purchase.complete ? "Lowest package price" : "Lowest checked price · some prices unavailable" : "Package prices unavailable"}</span>}
    {link && purchase.option && <a data-package-link href={purchase.option.url} target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2">View on Amazon ↗</a>}
  </span>;
}
export function AmazonProductImage({ product, name, hex }: { product: AmazonProduct | null; name: string; hex: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const path = product?.image;
  return <span className="flex h-[76px] w-[84px] items-center justify-center rounded-card border border-ink/15 bg-white p-[6px]">
    {path && failed !== path
      ? <img src={path} alt={`${name} on Amazon`} loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(path)} />
      : <span className="flex flex-col items-center gap-[5px] text-center text-[9px] leading-tight text-ink-3"><span aria-hidden className="h-[24px] w-[24px] rounded-[5px] border border-ink" style={{ background: hex }} />{product ? "Image unavailable" : "Loading image…"}</span>}
  </span>;
}
