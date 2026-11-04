/** Safe browser-facing details pulled from an exact Amazon product page. */
export type AmazonProduct = {
  url: string;
  status: "ready" | "blocked" | "unavailable";
  checkedAt: string | null;
  price: { amount: number; currency: string } | null;
  image: string | null;
};
export type AmazonFilamentDetails = { title: string | null; type: string | null; colorName: string | null; hex: string | null };
export type AmazonProductPage = AmazonProduct & { imageUrl: string | null; filament: AmazonFilamentDetails | null };
export type FilamentImport = AmazonFilamentDetails & { url: string; status: AmazonProduct["status"]; hexSource: "listing" | "catalog" | "image" | null };

export function amazonPriceText(product: AmazonProduct | null): string {
  if (!product) return "Checking price…";
  if (!product.price) return "Check price on Amazon";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: product.price.currency, currencyDisplay: "code" }).format(product.price.amount);
}

export const amazonImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["m.media-amazon.com", "images-na.ssl-images-amazon.com", "images-eu.ssl-images-amazon.com"].includes(url.hostname) && !url.port && !url.username && !url.password
      && /^\/images\/I\/[A-Za-z0-9+_%.,-]+\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
};
