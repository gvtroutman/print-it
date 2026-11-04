import { withActor, fail } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const GET = withActor<{ id: string }>(async (_request, _actor, { id }) => {
  const brand = await db.filamentBrand.findUnique({ where: { id }, select: { logoData: true } });
  if (!brand?.logoData?.startsWith("data:image/webp;base64,")) return fail(404, "No uploaded logo for this brand.");
  return new Response(Buffer.from(brand.logoData.slice(23), "base64"), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
  });
});
