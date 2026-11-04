import { z } from "zod";
import { withActor, fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { amazonProducts } from "@/lib/amazon-products";
import { importFilamentDetails } from "@/lib/filament-import";
import { SOURCE_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { resolveAmazonListing } from "../../../../../../scripts/lib/resolve-amazon-listing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withActor(async request => {
  const raw = await request.text();
  if (raw.length > 4096) return fail(413, "That listing link is too long.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail(400, "Send an Amazon listing link."); }
  const parsed = z.object({ brandId: z.string().min(1).max(80), amazonUrl: z.string().trim().min(1).max(2048) }).safeParse(body);
  if (!parsed.success) return fail(400, "Choose a brand and an exact Amazon listing link.");
  const brand = await db.filamentBrand.findUnique({ where: { id: parsed.data.brandId } });
  if (!brand) return fail(404, "That brand is no longer available.");
  const url = await resolveAmazonListing(parsed.data.amazonUrl);
  if (!url) return fail(400, "Use an exact Amazon product listing, not a search page or brand storefront.");
  const [product] = await amazonProducts([url]);
  const response = ok(await importFilamentDetails(product, brand, SOURCE_FILAMENT_COLORS));
  response.headers.set("cache-control", "private, no-store");
  return response;
}, { admin: true });
