import { z } from "zod";
import { limitedBody, RequestBodyTooLarge } from "@/lib/request-body";
import { crossOriginWrite } from "@/lib/request-origin";
import { SCREEN_PAGES, screenEnvironment } from "@/lib/screen-sizes";
import { recordScreenView } from "@/lib/screen-size-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const View = z.object({
  page: z.enum(SCREEN_PAGES),
  width: z.number().int().min(100).max(10000),
  height: z.number().int().min(100).max(10000),
  touch: z.boolean(),
}).strict();

// No identifiers are kept, even for rate limiting. Bound writes per worker.
let minute = 0;
let received = 0;

/** Public because sign-in/install page layouts matter too. There is no public read endpoint. */
export async function POST(request: Request): Promise<Response> {
  const answer = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("origin") || crossOriginWrite(request) ||
      request.headers.get("sec-fetch-site") === "cross-site") return answer(403);
  if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return answer();
  if (/bot|crawler|spider|headless|preview/i.test(request.headers.get("user-agent") ?? "")) return answer();
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") return answer(415);
  const currentMinute = Math.floor(Date.now() / 60_000);
  if (minute !== currentMinute) { minute = currentMinute; received = 0; }
  if (++received > 600) return answer(429);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await limitedBody(request, 1024)));
  } catch (error) {
    return answer(error instanceof RequestBodyTooLarge ? 413 : 400);
  }
  const parsed = View.safeParse(raw);
  if (!parsed.success) return answer(400);
  const { touch, ...view } = parsed.data;
  try {
    await recordScreenView({ ...view, ...screenEnvironment(request.headers.get("user-agent") ?? "", touch) });
    return answer();
  } catch {
    // Analytics never blocks navigation, and no submitted data is put in logs.
    console.error("[screen-sizes] Could not record a page view.");
    return answer(503);
  }
}
