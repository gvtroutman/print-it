import { withActor, fail, ok } from "@/lib/api";
import { z } from "zod";
import { amazonProducts } from "@/lib/amazon-products";
import { allowedAmazonListings } from "@/lib/amazon-product-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withActor(async (request, actor) => {
  const raw = await request.text();
  if (raw.length > 3_000) return fail(413, "Look up at most four listings at a time.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail(400, "Send listing URLs as JSON."); }
  const parsed = z.object({ urls: z.array(z.string().max(512)).min(1).max(4) }).safeParse(body);
  if (!parsed.success) return fail(400, "Send between one and four exact listing URLs.");
  if (!await allowedAmazonListings(parsed.data.urls, actor.role === "admin")) return fail(404, "That listing is not available in the buying catalog.");
  const products = await amazonProducts(parsed.data.urls);
  const response = ok({ products: products.map(({ url, status, checkedAt, price, image }) => ({ url, status, checkedAt, price, image })) });
  response.headers.set("cache-control", "private, no-store");
  return response;
});
