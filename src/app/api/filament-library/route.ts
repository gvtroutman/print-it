import { fail, ok, withActor } from "@/lib/api";
import { SWATCH_SHADES, type SwatchShade } from "@/lib/catalog";
import { LibraryUnavailable, searchLibrary } from "@/lib/filament-library";

/**
 * Spools the owner does not have but can buy, for one material: the
 * filamentcolors.xyz library, searched on the server because the browser may
 * not talk to that site (`connect-src 'self'`).
 *
 * `material` is a catalogue material's name and decides which kind of
 * filament is listed; `q` narrows by words in the name, maker or type, and
 * `shade` by the library's colour family (`RED`, `BLU`, …). At most
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

  try {
    const { total, swatches } = await searchLibrary(material, { query, shade: shade as SwatchShade | null });
    return ok({
      total,
      // Every field named — see `storyResource` in src/lib/api.ts.
      swatches: swatches.map((s) => ({
        id: s.id,
        name: s.name,
        maker: s.maker,
        type: s.type,
        hex: s.hex,
        shade: s.shade,
        buyUrl: s.buyUrl,
        pageUrl: s.pageUrl,
      })),
    });
  } catch (error) {
    if (error instanceof LibraryUnavailable) {
      return fail(503, "The filamentcolors.xyz library cannot be reached right now. Try again in a minute.");
    }
    throw error;
  }
});
