import "server-only";
import { z } from "zod";

import {
  SOURCE_LABEL,
  enabledSources,
  identifySource,
  type ImportSource,
} from "@/lib/import-source";
import { extensionOf } from "@/lib/models";
import { sourceUrl as appSourceUrl } from "@/lib/runtime";
import { StoryProblem } from "@/lib/stories";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";

/**
 * Fetching a model from the site it is published on.
 *
 * This is the only place the app makes a request to somebody else's server
 * because a *requester* asked it to — the breach check and outgoing mail call
 * out too, but to addresses the operator configured. It is off unless a
 * deployment names a source in `IMPORT_SOURCES`, and everything here is
 * arranged around one question — *whose choice is the address being
 * requested?* — and the answer is never "the person who pasted the link":
 *
 *   1. The pasted link is parsed for a model id and thrown away
 *      (`import-source.ts`). All that survives is digits.
 *   2. The listing is asked of one fixed endpoint, with that id as a GraphQL
 *      variable. It is not interpolated into a URL or a query.
 *   3. The download link comes back from that same endpoint, and is fetched
 *      only if it is on the one origin files are served from. A link pointing
 *      anywhere else is refused before a connection is opened.
 *   4. Redirects are an error, not something to follow. A redirect is the
 *      remote end choosing a new address, which is the thing being prevented.
 *
 * So a requester decides *which model*; the code decides *which host*. The
 * file that arrives is then treated exactly as an upload is — `intake.ts`
 * inspects the bytes and does not care what the site said they were.
 *
 * **The API is not a published one.** Printables has no documented public API;
 * this speaks the GraphQL endpoint its own website uses, and it can change
 * without notice. When it does, every failure below says so in words and
 * points at the upload that always works. Nothing here falls back to guessing.
 */

const problem = (status: number, message: string) => new StoryProblem(status, message);

/** What to do instead, appended to every failure that is not the requester's. */
const UPLOAD_INSTEAD = "Download the file and upload it here instead.";

const API_TIMEOUT_MS = 15_000;
/** Generous: 250 MB from a CDN over a home line is minutes, not seconds. */
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
/** A listing is a few kilobytes. This is only so a wrong answer cannot be huge. */
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_LISTED_FILES = 200;

/**
 * Where Printables is.
 *
 * Two fixed addresses, and they are the whole allowlist: the API, and the one
 * origin a download link may point at.
 *
 * `IMPORT_PRINTABLES_BASE` replaces both with a single origin. It exists for
 * `verify:import`, which runs against the built image and cannot have that
 * image calling the real Printables on every CI run — the suite points it at
 * `scripts/stubs/printables-stub.mjs` instead. It is the operator's
 * environment, not anything a request can reach, and it narrows as much as it
 * moves: with it set, the stand-in is the *only* host the importer will talk
 * to. Do not set it in a deployment.
 */
function printables(): { api: string; fileOrigin: string; mediaOrigin: string } {
  const override = process.env.IMPORT_PRINTABLES_BASE;
  if (override) {
    const base = new URL(override);
    return {
      api: new URL("/graphql/", base).toString(),
      fileOrigin: base.origin,
      mediaOrigin: base.origin,
    };
  }
  return {
    api: "https://api.printables.com/graphql/",
    fileOrigin: "https://files.printables.com",
    // Where the pictures in search results live. Only ever asked for a
    // thumbnail, on a path rebuilt here from parts that were checked.
    mediaOrigin: "https://media.printables.com",
  };
}

/** Says who is calling, and where the source is. Not a browser, and not pretending. */
const userAgent = () => `PrettyPleasePrint (+${appSourceUrl()})`;

/** The sources switched on, or a refusal that says importing is off. */
export function importSourcesOrRefuse(): ImportSource[] {
  const enabled = enabledSources();
  if (enabled.length === 0) {
    throw problem(501, "Importing from a link is not switched on for this instance.");
  }
  return enabled;
}

// ---------------------------------------------------------------------------
// Talking to Printables
// ---------------------------------------------------------------------------

/** Read a body, giving up rather than buffering more than `limit` bytes. */
async function readCapped(response: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return new Uint8Array(0);

  // One buffer of the size allowed, filled in place. Collecting chunks and
  // joining them afterwards would hold the model twice at the moment it is
  // largest, and the slot gate is sized for holding it once.
  const out = new Uint8Array(limit);
  let length = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.byteLength > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    out.set(value, length);
    length += value.byteLength;
  }
  return out.subarray(0, length);
}

const unavailable = (what: string) =>
  problem(502, `Printables ${what}. ${UPLOAD_INSTEAD}`);

async function graphql(query: string, variables: Record<string, string | number>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(printables().api, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": userAgent(),
      },
      body: JSON.stringify({ query, variables }),
      redirect: "error",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[import] printables api unreachable", error);
    throw unavailable("could not be reached from here");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    console.error(`[import] printables api answered ${response.status}`);
    throw unavailable(`answered ${response.status}`);
  }

  const raw = await readCapped(response, MAX_API_BYTES).catch(() => null);
  if (!raw) throw unavailable("sent an answer this app could not read");
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw unavailable("sent an answer this app could not read");
  }
}

/**
 * What the listing has to look like to be believed.
 *
 * Parsed rather than trusted, because the shape is somebody else's and
 * undocumented: the day it changes, this fails by name instead of letting an
 * `undefined` wander into a ticket.
 */
const ListingSchema = z.object({
  data: z.object({
    print: z
      .object({
        id: z.string().regex(/^\d{1,12}$/),
        name: z.string().max(500),
        slug: z.string().max(300).nullish(),
        user: z.object({ publicUsername: z.string().max(200).nullish() }).nullish(),
        license: z.object({ name: z.string().max(300).nullish() }).nullish(),
        stls: z
          .array(
            z.object({
              id: z.string().regex(/^\d{1,12}$/),
              name: z.string().min(1).max(500),
              fileSize: z.number().int().nonnegative(),
            }),
          )
          .max(5000),
      })
      .nullable(),
  }),
});

const LISTING_QUERY =
  "query PppModel($id: ID!) { print(id: $id) { id name slug user { publicUsername } " +
  "license { name } stls { id name fileSize } } }";

const LinkSchema = z.object({
  data: z.object({
    getDownloadLink: z
      .object({
        ok: z.boolean(),
        output: z.object({ link: z.string().max(4000) }).nullish(),
      })
      .nullable(),
  }),
});

const LINK_MUTATION =
  "mutation PppDownload($id: ID!, $printId: ID!, $fileType: DownloadFileTypeEnum!, " +
  "$source: DownloadSourceEnum!) { getDownloadLink(id: $id, printId: $printId, " +
  "fileType: $fileType, source: $source) { ok output { link } } }";

export type ImportableFile = { id: string; name: string; size: number; tooLarge: boolean };

export type ImportListing = {
  source: ImportSource;
  model: {
    id: string;
    name: string;
    /** The model's page, built here from the API's own id and slug. */
    url: string;
    author: string | null;
    license: string | null;
  };
  /** The `.stl` and `.3mf` files, in the site's order. */
  files: ImportableFile[];
  /** How many other files the model carries that cannot be printed here. */
  otherFiles: number;
};

const isPrintable = (name: string) =>
  (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/**
 * A model's page, built from the API's own id and slug. The slug is
 * decoration on a link people will click; kept only if it looks like one, as
 * the id alone still finds the model.
 */
function modelPage(id: string, slug: string | null | undefined): string {
  const tail = slug && /^[a-z0-9-]{1,200}$/.test(slug) ? `-${slug}` : "";
  return `https://www.printables.com/model/${id}${tail}`;
}

async function listPrintables(modelId: string): Promise<ImportListing> {
  const parsed = ListingSchema.safeParse(await graphql(LISTING_QUERY, { id: modelId }));
  if (!parsed.success) {
    console.error("[import] printables listing has an unexpected shape", parsed.error.issues[0]);
    throw unavailable("answered in a shape this app does not recognise — its API may have changed");
  }
  const print = parsed.data.data.print;
  if (!print) throw problem(404, "Printables has no model at that link.");
  // The id that comes back is the one stored and shown. If it is not the one
  // asked for, something is answering that is not what this code expects.
  if (print.id !== modelId) throw unavailable("answered about a different model");

  const printable = print.stls.filter((file) => isPrintable(file.name));

  return {
    source: "printables",
    model: {
      id: print.id,
      name: print.name,
      url: modelPage(print.id, print.slug),
      author: print.user?.publicUsername ?? null,
      license: print.license?.name ?? null,
    },
    files: printable.slice(0, MAX_LISTED_FILES).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.fileSize,
      tooLarge: file.fileSize > MAX_UPLOAD_BYTES,
    })),
    otherFiles: print.stls.length - printable.length,
  };
}

// ---------------------------------------------------------------------------
// The two operations
// ---------------------------------------------------------------------------

const NOT_A_LINK = (enabled: readonly ImportSource[]) =>
  `That is not a link to a model on ${enabled.map((s) => SOURCE_LABEL[s]).join(" or ")}.`;

/**
 * What a link offers: the model, and the files in it that could be printed.
 *
 * A model usually carries several files and a ticket holds one, so the
 * requester has to choose — this is what they choose from.
 */
export async function listImportable(rawUrl: unknown): Promise<ImportListing> {
  const enabled = importSourcesOrRefuse();
  const found = typeof rawUrl === "string" ? identifySource(rawUrl, enabled) : null;
  if (!found) throw problem(422, NOT_A_LINK(enabled));
  return listPrintables(found.modelId);
}

/**
 * One file's bytes, and where they came from.
 *
 * The listing is asked for again here rather than taken from the request. The
 * caller says which model and which file by id, and everything else — the
 * name, the size, whether that file belongs to that model at all — is read
 * from the site at the moment of fetching. A client cannot name a file from a
 * different model, or claim a small size for a large one.
 */
export async function fetchImportable(
  rawUrl: unknown,
  rawFileId: unknown,
): Promise<{ name: string; bytes: Uint8Array; listing: ImportListing }> {
  const listing = await listImportable(rawUrl);

  const fileId = typeof rawFileId === "string" || typeof rawFileId === "number" ? String(rawFileId) : "";
  if (!/^\d{1,12}$/.test(fileId)) throw problem(400, "Say which file to import.");
  const file = listing.files.find((candidate) => candidate.id === fileId);
  if (!file) throw problem(404, "That file is not one of that model's printable files.");
  if (file.tooLarge) {
    throw problem(
      413,
      `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const minted = LinkSchema.safeParse(
    await graphql(LINK_MUTATION, {
      id: file.id,
      printId: listing.model.id,
      // The site files 3MFs under the same type as STLs. Verified against it.
      fileType: "stl",
      source: "model_detail",
    }),
  );
  const link = minted.success ? minted.data.data.getDownloadLink?.output?.link : null;
  if (!minted.success || !minted.data.data.getDownloadLink?.ok || !link) {
    throw unavailable("would not hand over that file");
  }

  // The one address in all of this that the remote end chose. It is fetched
  // only if it is where Printables serves files from, compared as an origin
  // after parsing — never as a prefix of the string.
  let target: URL;
  try {
    target = new URL(link);
  } catch {
    throw unavailable("gave a download link that is not a URL");
  }
  if (target.origin !== printables().fileOrigin || target.username || target.password) {
    console.error(`[import] refused a download link on ${target.origin}`);
    throw unavailable("pointed at an address this app does not fetch from");
  }

  let response: Response;
  try {
    response = await fetch(target, {
      headers: { "user-agent": userAgent() },
      redirect: "error",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[import] download failed", error);
    throw unavailable("did not deliver the file");
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw unavailable(`answered ${response.status} for the file`);
  }

  // Held to the size the listing gave, which was already held to the cap. A
  // file that turns out larger than it was listed is refused as it arrives,
  // rather than after a quarter of a gigabyte has been buffered to find out.
  let bytes: Uint8Array | null;
  try {
    bytes = await readCapped(response, file.size);
  } catch (error) {
    console.error("[import] download was cut short", error);
    throw unavailable("did not deliver the whole file");
  }
  if (!bytes) throw unavailable("sent more than the file it listed");

  return { name: file.name, bytes, listing };
}

// ---------------------------------------------------------------------------
// Finding a model to import
// ---------------------------------------------------------------------------

/** A page of results: enough to scan at a glance, small enough to answer fast. */
export const SEARCH_PAGE_SIZE = 12;
/** Twenty pages in. Past that, a better search beats more scrolling. */
const MAX_SEARCH_OFFSET = 240;
const MAX_QUERY_LENGTH = 100;
const THUMB_TIMEOUT_MS = 10_000;
/** A 320×240 WebP is under 20 kB. This is only so a wrong answer cannot be huge. */
const MAX_THUMB_BYTES = 512 * 1024;

const SearchSchema = z.object({
  data: z.object({
    searchPrints2: z
      .object({
        totalCount: z.number().int().nonnegative(),
        items: z
          .array(
            z.object({
              id: z.string().regex(/^\d{1,12}$/),
              name: z.string().max(500),
              slug: z.string().max(300).nullish(),
              image: z.object({ filePath: z.string().max(1000).nullish() }).nullish(),
              user: z.object({ publicUsername: z.string().max(200).nullish() }).nullish(),
              likesCount: z.number().int().nonnegative().nullish(),
              downloadCount: z.number().int().nonnegative().nullish(),
            }),
          )
          .max(100),
      })
      .nullable(),
  }),
});

const SEARCH_QUERY =
  "query PppSearch($query: String!, $limit: Int, $offset: Int) { searchPrints2(query: $query, " +
  "limit: $limit, offset: $offset) { totalCount items { id name slug image { filePath } " +
  "user { publicUsername } likesCount downloadCount } } }";

/**
 * Where a model's picture is, as the site names it:
 * `media/prints/<model>/images/<folder>/<file>.<ext>`.
 *
 * The parts are what is kept, not the string. A thumbnail is asked for on a
 * path rebuilt from them, so nothing the site or a browser sent ends up in
 * the address as it was sent. A picture whose name does not fit simply has no
 * thumbnail.
 */
const IMAGE_PATH =
  /^media\/prints\/(\d{1,12})\/images\/([A-Za-z0-9_-]{1,200})\/([A-Za-z0-9_.-]{1,200})\.(jpe?g|png|webp|gif)$/i;

export type SearchHit = {
  id: string;
  name: string;
  /** The model's page — what the link step is then handed. */
  url: string;
  author: string | null;
  /** This app's own address for the picture, or null if it has none. */
  thumb: string | null;
  likes: number | null;
  downloads: number | null;
};

export type SearchResults = {
  source: ImportSource;
  query: string;
  total: number;
  offset: number;
  hits: SearchHit[];
};

/**
 * Models matching some words, for someone who knows what they want printed
 * but has no link to it yet.
 *
 * Finding is all this does. What a result holds, and the file itself, still go
 * through `listImportable` and `fetchImportable` by the model's link, so a
 * search result is never trusted for anything but the id in it.
 */
export async function searchImportable(rawQuery: unknown, rawOffset: unknown): Promise<SearchResults> {
  importSourcesOrRefuse();
  const query = typeof rawQuery === "string" ? rawQuery.replace(/\s+/g, " ").trim() : "";
  if (query.length < 2) throw problem(422, "Type at least two letters to search for.");
  if (query.length > MAX_QUERY_LENGTH) {
    throw problem(422, `That search is too long — ${MAX_QUERY_LENGTH} characters at most.`);
  }
  const offset = rawOffset === undefined || rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_SEARCH_OFFSET) {
    throw problem(400, "That is not a page of results this can show.");
  }

  const parsed = SearchSchema.safeParse(
    await graphql(SEARCH_QUERY, { query, limit: SEARCH_PAGE_SIZE, offset }),
  );
  if (!parsed.success || !parsed.data.data.searchPrints2) {
    if (!parsed.success) {
      console.error("[import] printables search has an unexpected shape", parsed.error.issues[0]);
    }
    throw problem(
      502,
      "Printables search answered in a shape this app does not recognise — its API may have changed. " +
        "Paste a link to the model instead.",
    );
  }
  const found = parsed.data.data.searchPrints2;

  return {
    source: "printables",
    query,
    total: found.totalCount,
    offset,
    hits: found.items.slice(0, SEARCH_PAGE_SIZE).map((item) => {
      const path = item.image?.filePath ?? "";
      return {
        id: item.id,
        name: item.name,
        url: modelPage(item.id, item.slug),
        author: item.user?.publicUsername ?? null,
        thumb: IMAGE_PATH.test(path) ? `/api/import/thumb?path=${encodeURIComponent(path)}` : null,
        likes: item.likesCount ?? null,
        downloads: item.downloadCount ?? null,
      };
    }),
  };
}

/**
 * A search result's picture, small, fetched by this server so the browser
 * never calls Printables itself and `img-src` stays at 'self'.
 *
 * Null when the path is not a picture this app named, or the site will not
 * hand one over: a missing thumbnail is a blank tile, not an error.
 */
export async function fetchThumbnail(rawPath: unknown): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (enabledSources().length === 0) return null;
  const match = typeof rawPath === "string" ? IMAGE_PATH.exec(rawPath) : null;
  if (!match) return null;
  const [, model, folder, name, ext] = match;
  // The site keeps a 320×240 WebP beside each picture, filed under the
  // original's extension. A tenth of the size of the full photo, or less.
  const target = new URL(
    `/media/prints/${model}/images/${folder}/thumbs/inside/320x240/${ext!.toLowerCase()}/${name}.webp`,
    printables().mediaOrigin,
  );

  let response: Response;
  try {
    response = await fetch(target, {
      headers: { "user-agent": userAgent() },
      redirect: "error",
      signal: AbortSignal.timeout(THUMB_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (response.status !== 200 || !["image/webp", "image/jpeg", "image/png"].includes(type)) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = await readCapped(response, MAX_THUMB_BYTES).catch(() => null);
  return bytes && bytes.length > 0 ? { bytes, type } : null;
}
