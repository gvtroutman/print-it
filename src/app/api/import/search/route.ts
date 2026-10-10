import { jsonBody, ok, withActor } from "@/lib/api";
import { searchImportable } from "@/lib/import";

/**
 * Find a model by name on a site this instance imports from, for someone who
 * has no link to paste yet.
 *
 * A result is only a way to a link: picking one hands its `url` to
 * `POST /api/import/files`, and the import goes on from there as if it had
 * been pasted.
 *
 * A POST although it changes nothing here, for the same reason as
 * `/api/import/files`: it makes this server call somebody else's, so it sits
 * behind the same Origin check as every write.
 *
 * `501` when the deployment has not switched importing on — see
 * `IMPORT_SOURCES` in `src/lib/import-source.ts`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withActor(async (request) => {
  const body = await jsonBody(request);
  const results = await searchImportable(body.query, body.offset);
  // Every field named, no spread — see `storyResource` in src/lib/api.ts.
  return ok({
    source: results.source,
    query: results.query,
    total: results.total,
    offset: results.offset,
    hits: results.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      url: hit.url,
      author: hit.author,
      thumb: hit.thumb,
      likes: hit.likes,
      downloads: hit.downloads,
    })),
  });
});
