import { fail, ok, withActor } from "@/lib/api";
import { SWATCH_SHADES, swatchImagePath, type SwatchChoice, type SwatchShade } from "@/lib/catalog";
import { LibraryUnavailable, searchLibrary, swatchColour } from "@/lib/filament-library";

/**
 * Spools the owner does not have but can buy, for one material: the
 * filamentcolors.xyz library, searched on the server because the browser may
 * not talk to that site (`connect-src 'self'`).
 *
 * `material` is a catalogue material's name and decides which kind of
 * filament is listed; `q` narrows by words in the name, maker or type, and
 * `shade` by the library's colour family (`RED`, `BLU`, …). `near`, a
 * `#rrggbb` from the picker's colour grid, lists the spools that look closest
 * to it first, leaving out the ones that look nothing like it. At most
 * `SEARCH_LIMIT` swatches come back, with `total` saying how many matched.
 *
 * Any signed-in person may search — it is what the request form shows them.
 * Picking one opens a request with `swatchId`, and the server reads the
 * swatch back from its own copy of the library then; nothing here is trusted
 * at that point.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withActor(async (request) => {
  const params = new URL(request.url).searchParams;
  const material = (params.get("material") ?? "").trim().slice(0, 40);
  if (!material) return fail(400, "Say which material to look for.");
  const query = (params.get("q") ?? "").slice(0, 80);
  const shadeParam = params.get("shade");
  const shade = SWATCH_SHADES.find((s) => s.key === shadeParam)?.key ?? null;
  if (shadeParam && !shade) return fail(400, "That is not a shade.");
  const nearParam = params.get("near");
  const near = nearParam && /^#?[0-9a-f]{6}$/i.test(nearParam) ? `#${nearParam.replace("#", "").toLowerCase()}` : null;
  if (nearParam && !near) return fail(400, "That is not a colour — send #rrggbb.");

  try {
    const { total, swatches } = await searchLibrary(material, { query, shade: shade as SwatchShade | null, near });
    return ok({
      total,
      // Every field named — see `storyResource` in src/lib/api.ts.
      swatches: swatches.map((s) => ({
        id: s.id,
        name: s.name,
        maker: s.maker,
        type: s.type,
        // As photographed, which is what the grid sorted by.
        hex: swatchColour(s),
        shade: s.shade,
        buyUrl: s.buyUrl,
        pageUrl: s.pageUrl,
        // This app's copy of the library's photo, not the library's own URL.
        image: s.photoUrl || s.imageUrl ? swatchImagePath(s.id) : null,
      })) satisfies SwatchChoice[],
    });
  } catch (error) {
    if (error instanceof LibraryUnavailable) {
      return fail(503, "The filamentcolors.xyz library cannot be reached right now. Try again in a minute.");
    }
    throw error;
  }
});
