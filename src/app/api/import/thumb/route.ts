import { fail, withActor } from "@/lib/api";
import { fetchThumbnail } from "@/lib/import";

/**
 * A model search result's picture, served from this origin so `img-src` stays
 * at 'self' and a requester's browser never calls the model site itself.
 *
 * `path` is the picture's path as the search named it. Anything that is not
 * one is a 404, never a fetch — see `fetchThumbnail` in src/lib/import.ts.
 * A day in the browser's cache: a model's picture does not change under the
 * same name.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withActor(async (request) => {
  const thumb = await fetchThumbnail(new URL(request.url).searchParams.get("path"));
  if (!thumb) return fail(404, "No picture for that.");
  return new Response(Buffer.from(thumb.bytes), {
    headers: {
      "content-type": thumb.type,
      "content-length": String(thumb.bytes.length),
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
