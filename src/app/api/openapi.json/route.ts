import { ok, withActor } from "@/lib/api";
import { buildOpenApiDocument } from "@/lib/openapi";

/**
 * The OpenAPI document, for the console at `/docs` and for anything else that
 * wants to read the surface — a client generator, a Postman import, `jq`.
 *
 * Needs a name, like everything else here except the healthcheck.
 *
 * `/api/openapi.json` rather than `/openapi.json` so it inherits the one rule
 * that makes an API usable: middleware never redirects `/api/*`, so a caller
 * with no name is told 401 instead of being handed the name picker that a
 * JSON parser would choke on.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withActor(async () => ok(await buildOpenApiDocument()));
