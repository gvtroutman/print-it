import "server-only";

import { builtInTraits } from "@/lib/filament-traits";
import { SWATCH_SHADES, swatchPageUrl, type LibrarySwatch, type SwatchShade } from "@/lib/catalog";
import { sourceUrl as appSourceUrl } from "@/lib/runtime";

/**
 * Filament the owner does not have but can buy: the swatch library at
 * filamentcolors.xyz, held in memory and searched from here.
 *
 * The browser never talks to that site — `connect-src 'self'` would refuse
 * it — and a requester's pick is never taken on trust: the form sends a
 * swatch id, and the ticket's name, maker and colour are read back from this
 * copy at submission time, the same way a shelf colour is read back from the
 * catalogue rather than from the form.
 *
 * The whole library is a couple of thousand swatches, served at most 100 to
 * a page, so it is fetched once in a sweep of pages and kept for a day. A
 * failed refresh keeps the old copy; with no copy at all, callers get
 * `LibraryUnavailable` and say the library cannot be reached right now.
 */

const API = "https://filamentcolors.xyz/api/swatch/";
const PAGE_SIZE = 100;
/** Pages fetched at once: quick enough to warm up, gentle on a hobby site. */
const PARALLEL = 4;
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
/** After a failed sweep with nothing cached, how long before trying again. */
const RETRY_AFTER_MS = 60 * 1000;
const TIMEOUT_MS = 15_000;
/** A sanity cap: the library is ~2,300 swatches today. */
const MAX_PAGES = 100;

export class LibraryUnavailable extends Error {}

type Library = { byId: Map<number, LibrarySwatch>; fetchedAt: number };

let library: Library | null = null;
let sweeping: Promise<Library> | null = null;
let failedAt = 0;

const userAgent = () => `PrettyPleasePrint (+${appSourceUrl()})`;

/**
 * The library's own grouping, used when a type name says nothing the
 * filament table knows ("Panchroma Starlight" is filed under PLA). ABS / ASA
 * and Exotics are left out: the name has to say which.
 */
const PARENT_FAMILY: Record<string, string> = { PLA: "PLA", PETG: "PETG", "TPU / TPE": "TPU" };

/**
 * The filament family a swatch belongs to, in the table's own words — "PLA",
 * "PETG with fibre" — so it can be compared with a catalogue material's.
 * The parent's name goes in front of the type's, so fibre is still noticed
 * on a type the table has never heard of.
 */
function familyOf(type: string, parent: string | null): string | null {
  const own = builtInTraits(type);
  if (own) return own.family;
  const fallback = parent ? PARENT_FAMILY[parent] : undefined;
  return fallback ? builtInTraits(`${fallback} ${type}`)?.family ?? null : null;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** One swatch from the API, or null when it is missing what a ticket needs. */
function toSwatch(raw: unknown): LibrarySwatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const id = r.id;
  const hex = str(r.hex_color);
  const name = str(r.color_name);
  const maker = str(r.manufacturer?.name);
  const type = str(r.filament_type?.name);
  if (!Number.isInteger(id) || id <= 0 || !/^[0-9a-f]{6}$/i.test(hex) || !name || !maker || !type) return null;
  if (r.published === false || r.is_available === false) return null;
  const shade = SWATCH_SHADES.some((s) => s.key === r.color_parent) ? (r.color_parent as SwatchShade) : null;
  return {
    id,
    name: name.slice(0, 80),
    maker: maker.slice(0, 80),
    type: type.slice(0, 80),
    hex: `#${hex.toLowerCase()}`,
    family: familyOf(type, str(r.filament_type?.parent_type?.name) || null),
    shade,
    buyUrl: httpUrl(r.mfr_purchase_link) ?? httpUrl(r.amazon_purchase_link),
    pageUrl: swatchPageUrl(id),
    imageUrl: libraryMedia(r.card_img),
  };
}

/**
 * A photo URL the library listed, kept only when it is on the library's own
 * media path. The server fetches it, so it must not be able to point anywhere
 * else.
 */
function libraryMedia(value: unknown): string | null {
  const href = httpUrl(value);
  if (!href) return null;
  const url = new URL(href);
  return url.protocol === "https:" && url.hostname === "filamentcolors.xyz" && url.pathname.startsWith("/media/")
    ? url.href
    : null;
}

async function fetchPage(page: number): Promise<{ count: number; results: unknown[] }> {
  const response = await fetch(`${API}?page_size=${PAGE_SIZE}&page=${page}`, {
    headers: { accept: "application/json", "user-agent": userAgent() },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`filamentcolors.xyz answered ${response.status} for page ${page}`);
  }
  const body = (await response.json()) as { count?: unknown; results?: unknown };
  if (typeof body.count !== "number" || !Array.isArray(body.results)) {
    throw new Error(`filamentcolors.xyz page ${page} is not a swatch listing`);
  }
  return { count: body.count, results: body.results };
}

async function sweep(): Promise<Library> {
  const first = await fetchPage(1);
  const pages = Math.min(MAX_PAGES, Math.ceil(first.count / PAGE_SIZE));
  const results = [...first.results];
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2);
  for (let i = 0; i < rest.length; i += PARALLEL) {
    const batch = await Promise.all(rest.slice(i, i + PARALLEL).map(fetchPage));
    for (const page of batch) results.push(...page.results);
  }
  const byId = new Map<number, LibrarySwatch>();
  for (const raw of results) {
    const swatch = toSwatch(raw);
    if (swatch) byId.set(swatch.id, swatch);
  }
  if (byId.size === 0) throw new Error("filamentcolors.xyz listed no usable swatches");
  return { byId, fetchedAt: Date.now() };
}

/** Start a sweep unless one is running; never more than one at a time. */
function refresh(): Promise<Library> {
  sweeping ??= sweep()
    .then((fresh) => {
      library = fresh;
      return fresh;
    })
    .catch((error) => {
      failedAt = Date.now();
      console.error("[filament-library] refresh failed", error);
      throw error;
    })
    .finally(() => {
      sweeping = null;
    });
  return sweeping;
}

/**
 * The library, fetching it first if there is none. A stale copy is served
 * at once while a fresh one is fetched behind it.
 */
async function load(): Promise<Library> {
  if (library) {
    if (Date.now() - library.fetchedAt > FRESH_FOR_MS && !sweeping) refresh().catch(() => {});
    return library;
  }
  if (!sweeping && Date.now() - failedAt < RETRY_AFTER_MS) throw new LibraryUnavailable();
  try {
    return await refresh();
  } catch {
    throw new LibraryUnavailable();
  }
}

/** Fetch the library in the background, so the first search finds it ready. */
export function warmLibrary() {
  load().catch(() => {});
}

/** One swatch, by the id the form sent; null when the library has no such swatch. */
export async function librarySwatch(id: number): Promise<LibrarySwatch | null> {
  return (await load()).byId.get(id) ?? null;
}

/**
 * Whether a swatch is the same kind of filament as a catalogue material. By
 * family where the table knows the material ("Silk PLA" takes any PLA, and
 * "PLA-CF" only fibre-filled PLA); otherwise the material's name has to
 * appear in the swatch's type, so a "Wood" material finds "Wood PLA".
 */
export function swatchFits(material: string, swatch: LibrarySwatch): boolean {
  const family = builtInTraits(material)?.family;
  if (family) return swatch.family === family;
  const wanted = ` ${words(material)} `;
  return wanted.trim() !== "" && ` ${words(swatch.type)} `.includes(wanted);
}

/** A swatch photo as fetched: a couple of kilobytes of JPEG. */
type Photo = { bytes: Uint8Array<ArrayBuffer>; type: string };

/** Photos held in memory, oldest dropped first. At ~2 KB each, about 2 MB. */
const PHOTO_CACHE = 1000;
/** Bigger than any thumbnail the library serves; anything larger is refused. */
const MAX_PHOTO_BYTES = 256 * 1024;
const photos = new Map<number, Photo>();

/**
 * A swatch's photo, fetched from the library on first ask and kept. Only a
 * swatch in the library has one, and only from the library's media path, so
 * this cannot be steered at another address. Null when there is no photo or
 * it could not be fetched; the picker then draws the colour instead.
 */
export async function swatchPhoto(id: number): Promise<Photo | null> {
  const held = photos.get(id);
  if (held) return held;
  const swatch = (await load()).byId.get(id);
  if (!swatch?.imageUrl) return null;

  let response: Response;
  try {
    response = await fetch(swatch.imageUrl, {
      headers: { accept: "image/*", "user-agent": userAgent() },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`[filament-library] photo ${id} unreachable`, error);
    return null;
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(type)) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;

  const photo = { bytes, type };
  photos.set(id, photo);
  if (photos.size > PHOTO_CACHE) photos.delete(photos.keys().next().value!);
  return photo;
}

/** The most swatches one search answers with. */
export const SEARCH_LIMIT = 60;

/**
 * Swatches that fit a material, narrowed by an optional shade and search
 * words (every word has to appear in the name, maker or type). Swatches whose
 * type is the material's own name come first, then by maker and name.
 */
export async function searchLibrary(
  material: string,
  { query = "", shade = null }: { query?: string; shade?: SwatchShade | null } = {},
): Promise<{ total: number; swatches: LibrarySwatch[] }> {
  const { byId } = await load();
  const terms = words(query).split(" ").filter(Boolean);
  const exact = words(material);
  const matches = [...byId.values()].filter((swatch) => {
    if (!swatchFits(material, swatch)) return false;
    if (shade && swatch.shade !== shade) return false;
    if (terms.length === 0) return true;
    const haystack = words(`${swatch.name} ${swatch.maker} ${swatch.type}`);
    return terms.every((term) => haystack.includes(term));
  });
  matches.sort(
    (a, b) =>
      Number(words(b.type) === exact) - Number(words(a.type) === exact) ||
      a.maker.localeCompare(b.maker) ||
      a.name.localeCompare(b.name),
  );
  return { total: matches.length, swatches: matches.slice(0, SEARCH_LIMIT) };
}
