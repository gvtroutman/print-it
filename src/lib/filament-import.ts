import "server-only";
import { amazonImageUrl, type AmazonProductPage, type FilamentImport } from "@/lib/amazon-product";
import { amazonResponseBytes } from "@/lib/amazon-products";
import { catalogHexForProduct } from "@/lib/filament-import-data";
import { estimateFilamentPhotoHex } from "@/lib/filament-photo-color";
import { singleColorVariant, type FilamentColor } from "@/lib/filament-palette-data";
import type { FilamentBrandChoice } from "@/lib/filament-brands";

const estimates = new Map<string, Promise<string | null>>();
async function photoHex(url: string, name: string) {
  const key = `${url}|${name}`;
  if (estimates.has(key)) return estimates.get(key)!;
  const task = (async () => {
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6_000) });
      if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(response.headers.get("content-type")?.split(";")[0] ?? "")) { await response.body?.cancel(); return null; }
      return await estimateFilamentPhotoHex(await amazonResponseBytes(response, 2 * 1024 * 1024), name);
    } catch { return null; }
  })();
  if (estimates.size >= 128) estimates.delete(estimates.keys().next().value!);
  estimates.set(key, task);
  // Failed image fetches can be retried on the next explicit import.
  if (await task === null) estimates.delete(key);
  return task;
}

export async function importFilamentDetails(product: AmazonProductPage, brand: FilamentBrandChoice, colors: readonly FilamentColor[]): Promise<FilamentImport> {
  const details = product.filament ?? { title: null, type: null, colorName: null, hex: null };
  let hex = details.hex; let hexSource: FilamentImport["hexSource"] = hex ? "listing" : null;
  if (!hex) { hex = catalogHexForProduct(product, brand, colors); if (hex) hexSource = "catalog"; }
  const image = amazonImageUrl(product.imageUrl);
  if (!hex && details.type && details.colorName && image && singleColorVariant(details.colorName, details.title ?? "")
    && !/transparent|translucent|clear\b/i.test(`${details.colorName ?? ""} ${details.title ?? ""}`)) {
    hex = await photoHex(image, details.colorName ?? ""); if (hex) hexSource = "image";
  }
  return { ...details, hex, hexSource, url: product.url, status: product.status };
}
