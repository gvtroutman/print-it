import { z } from "zod";
import { amazonListingUrl } from "@/lib/amazon-listing";
import type { AmazonProduct } from "@/lib/amazon-product";

/** A full purchasable package, including any required bundle of small rolls. */
export type FilamentPurchaseOption = { url: string; label: string };
export const PurchaseOptionsSchema = z.array(z.object({
  url: z.string().max(512).refine(value => amazonListingUrl(value) === value, "Use an exact Amazon listing."),
  label: z.string().trim().min(1).max(80),
})).max(8);

export function savedPurchaseOptions(value: unknown): FilamentPurchaseOption[] {
  const parsed = PurchaseOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Keep comparisons within the original marketplace; never compare different currencies. */
export function filamentPurchaseOptions(url: string | null | undefined, options: readonly FilamentPurchaseOption[] = []): FilamentPurchaseOption[] {
  const original = amazonListingUrl(url);
  if (!original) return [];
  const host = new URL(original).hostname;
  const unique = new Map<string, FilamentPurchaseOption>();
  unique.set(original, { url: original, label: "Standard listing" });
  for (const option of options) {
    const normalized = amazonListingUrl(option.url);
    if (normalized && new URL(normalized).hostname === host && option.label.trim())
      unique.set(normalized, { url: normalized, label: option.label.trim().slice(0, 80) });
    if (unique.size >= 8) break;
  }
  return [...unique.values()];
}

/** Compare total listing prices, never unit prices or the price of one roll in a bundle. */
export function lowestFilamentPurchase(options: readonly FilamentPurchaseOption[], products: readonly AmazonProduct[]) {
  const priced = options.flatMap(option => {
    const product = products.find(product => product.url === option.url);
    return product?.status === "ready" && product.price && Number.isFinite(product.price.amount) && product.price.amount > 0
      ? [{ option, product }] : [];
  });
  const currencies = new Set(priced.map(entry => entry.product.price!.currency));
  const comparable = currencies.size === 1 ? priced : [];
  comparable.sort((a, b) => a.product.price!.amount - b.product.price!.amount);
  const option = comparable[0]?.option ?? options[0];
  return { option, product: products.find(product => product.url === option?.url) ?? null,
    complete: options.length > 0 && comparable.length === options.length,
    compared: comparable.length };
}
