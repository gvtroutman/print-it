import { jsonBody, ok, withActor } from "@/lib/api";
import { listPalette, savePaletteColor } from "@/lib/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withActor(async (_request, actor) => {
  const response = ok({ colors: await listPalette(actor) });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

export const POST = withActor(async (request, actor) =>
  ok({ color: await savePaletteColor(actor, await jsonBody(request)) }),
);
