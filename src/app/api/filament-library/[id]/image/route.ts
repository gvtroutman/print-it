import { fail, withActor } from "@/lib/api";
import { LibraryUnavailable, swatchPhoto } from "@/lib/filament-library";

/**
 * A library swatch's photo — the printed card filamentcolors.xyz shot of it —
 * served from this origin so `img-src` stays at 'self', and so a requester's
 * browser never calls the library itself.
 *
 * Only swatches in the server's copy of the library have one, fetched from
 * that library's media path and nowhere else. A day in the browser's cache:
 * a swatch's photo does not change under the same id.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withActor<{ id: string }>(async (_request, _actor, params) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(404, "No such swatch.");
  try {
    const photo = await swatchPhoto(id);
    if (!photo) return fail(404, "That swatch has no photo.");
    return new Response(photo.bytes, {
      headers: {
        "content-type": photo.type,
        "content-length": String(photo.bytes.length),
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof LibraryUnavailable) return fail(503, "The library cannot be reached right now.");
    throw error;
  }
});
