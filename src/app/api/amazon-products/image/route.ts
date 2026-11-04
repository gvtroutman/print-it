import { withActor, fail } from "@/lib/api";
import { allowedAmazonListings } from "@/lib/amazon-product-access";
import { amazonProducts, amazonResponseBytes } from "@/lib/amazon-products";

export const runtime = "nodejs";
export const GET = withActor(async (request, actor) => {
  const listing = new URL(request.url).searchParams.get("listing") ?? "";
  if (!await allowedAmazonListings([listing], actor.role === "admin")) return fail(404, "That listing is not available.");
  const [product] = await amazonProducts([listing]);
  if (!product?.imageUrl) return fail(404, "Amazon has no product image available.");
  try {
    const image = await fetch(product.imageUrl, { redirect: "error", signal: AbortSignal.timeout(6_000), cache: "no-store" });
    const type = image.headers.get("content-type")?.split(";")[0];
    if (!image.ok || !["image/jpeg", "image/png", "image/webp"].includes(type ?? "")) return fail(502, "Amazon's image could not be loaded.");
    const bytes = await amazonResponseBytes(image, 2 * 1024 * 1024);
    return new Response(Buffer.from(bytes), { headers: { "content-type": type!, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  } catch { return fail(502, "Amazon's image could not be loaded."); }
});
