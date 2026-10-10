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
    photoUrl: libraryMedia(r.image_front),
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

/**
 * A swatch photo ready to serve: around 10 KB of JPEG. `full` says whether it
 * is the full photo cut down, or the library's small thumbnail standing in.
 */
type Photo = { bytes: Uint8Array<ArrayBuffer>; type: string; full: boolean };

/** Photos held in memory, oldest dropped first. At ~10 KB each, about 10 MB. */
const PHOTO_CACHE = 1000;
/** The library's full photos run 100–400 KB; anything past this is refused. */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
/** The thumbnail fallback is served as it comes, so it has to be small. */
const MAX_THUMB_BYTES = 256 * 1024;
/**
 * The size a photo is cut to: the shape of a swatch card (as the library's own
 * thumbnail), wide enough to stay sharp on a high-density screen at the size
 * the picker draws it.
 */
const PHOTO_WIDTH = 480;
const PHOTO_HEIGHT = Math.round((PHOTO_WIDTH * 89) / 288);
/**
 * Full photos decoded at once. A 2740 x 2056 JPEG is ~17 MB once decoded,
 * even shrunk on load, and a page of results asks for 60 together; the
 * ZimaBoard has about 2 GB to spare.
 */
const PARALLEL_PHOTOS = 3;

const photos = new Map<number, Photo>();
const making = new Map<number, Promise<Photo | null>>();
let running = 0;
const queue: (() => void)[] = [];

/** Run `job` once fewer than `PARALLEL_PHOTOS` are running. */
async function inTurn<T>(job: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL_PHOTOS) await new Promise<void>((resolve) => queue.push(resolve));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

async function fetchImage(url: string, max: number): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string } | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "image/*", "user-agent": userAgent() },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`[filament-library] ${url} unreachable`, error);
    return null;
  }
  const type = response.headers.get("content-type") ?? "";
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(type) || declared > max) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length === 0 || bytes.length > max ? null : { bytes, type };
}

/**
 * The library's full photo of the swatch card, cut down to `PHOTO_WIDTH`:
 * the white table it was shot on trimmed off, then cropped to the card's
 * shape. Null when there is no full photo or sharp cannot read it.
 */
/**
 * sharp, loaded once. Null when it cannot load — its native libvips missing
 * from the bundle, say — and then no full photo is fetched for nothing.
 */
let sharpModule: Promise<(typeof import("sharp"))["default"] | null> | null = null;
const loadSharp = () =>
  (sharpModule ??= import("sharp")
    .then((m) => m.default)
    .catch((error) => {
      console.error("[filament-library] sharp will not load; serving thumbnails", error);
      return null;
    }));

async function sharpened(url: string): Promise<Photo | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  const source = await fetchImage(url, MAX_SOURCE_BYTES);
  if (!source) return null;
  try {
    // Two passes: sharp trims before it resizes, whatever the call order, and
    // trimming the full-size image would decode all of it. The first pass
    // shrinks on load.
    const smaller = await sharp(source.bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).toBuffer();
    const out = await sharp(smaller)
      .trim({ threshold: 40 })
      .resize({ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, fit: "cover" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { bytes: new Uint8Array(out), type: "image/jpeg", full: true };
  } catch (error) {
    console.error(`[filament-library] could not resize ${url}`, error);
    return null;
  }
}

/**
 * A swatch's photo, made on first ask and kept: the library's full photo cut
 * down to size, or its small thumbnail when that fails. Only a swatch in the
 * library has one, and only from the library's media path, so this cannot be
 * steered at another address. Null when there is nothing to show; the picker
 * then draws the colour instead.
 */
export async function swatchPhoto(id: number): Promise<Photo | null> {
  const held = photos.get(id);
  if (held) return held;
  const swatch = (await load()).byId.get(id);
  if (!swatch?.photoUrl && !swatch?.imageUrl) return null;

  // Sixty tiles asking at once for the same swatch make it once.
  let pending = making.get(id);
  if (!pending) {
    pending = inTurn(async () => {
      const thumb = async () => {
        const got = swatch.imageUrl ? await fetchImage(swatch.imageUrl, MAX_THUMB_BYTES) : null;
        return got && { ...got, full: false };
      };
      const photo = (swatch.photoUrl ? await sharpened(swatch.photoUrl) : null) ?? (await thumb());
      // A thumbnail is not kept: once the full photo can be made, it should be.
      if (photo?.full) {
        photos.set(id, photo);
        if (photos.size > PHOTO_CACHE) photos.delete(photos.keys().next().value!);
      }
      return photo;
    }).finally(() => making.delete(id));
    making.set(id, pending);
  }
  return pending;
}

/** The most swatches one search answers with. */
export const SEARCH_LIMIT = 60;

/** sRGB "#rrggbb" to CIE L*a*b* (D65), for judging how alike two colours look. */
function labOf(hex: string): [number, number, number] {
  const linear = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [r, g, b] = linear;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * How far a swatch is from the colour asked for, judged the way someone
 * hunting for "a blue like this" would: in L*C*h, with a different hue
 * counting most, and a swatch duller than the colour asked for forgiven half
 * of that dullness, because filament rarely comes as vivid as a screen.
 * Plain ΔE*76 put greys and the neighbouring hue ahead of a muted spool of
 * the right hue whenever the cell was vivid.
 */
function distance(target: [number, number, number], swatch: [number, number, number]) {
  const [l1, a1, b1] = target;
  const [l2, a2, b2] = swatch;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const dC = c1 - c2;
  let dh = Math.atan2(b1, a1) - Math.atan2(b2, a2);
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(dh / 2);
  return Math.hypot(0.8 * (l1 - l2), (dC > 0 ? 0.5 : 1) * dC, 1.6 * dH);
}

/** A swatch this far from the colour asked for still counts as near it. */
const NEAR_ENOUGH = 28;
/** When fewer than this are near enough, the closest this many are shown anyway. */
const AT_LEAST = 12;

const labs = new WeakMap<LibrarySwatch, [number, number, number]>();
const labFor = (swatch: LibrarySwatch) => {
  let lab = labs.get(swatch);
  if (!lab) labs.set(swatch, (lab = labOf(swatch.hex)));
  return lab;
};

/**
 * Swatches that fit a material, narrowed by search words (every word has to
 * appear in the name, maker or type) and an optional shade.
 *
 * With `near`, a colour picked from the grid, they come closest first, and
 * only those that look near it — or, where the material has few spools that
 * colour, the closest dozen, so a pick never comes back empty. Otherwise
 * swatches whose type is the material's own name come first, then by maker
 * and name.
 */
export async function searchLibrary(
  material: string,
  {
    query = "",
    shade = null,
    near = null,
  }: { query?: string; shade?: SwatchShade | null; near?: string | null } = {},
): Promise<{ total: number; swatches: LibrarySwatch[] }> {
  const { byId } = await load();
  const terms = words(query).split(" ").filter(Boolean);
  const exact = words(material);
  let matches = [...byId.values()].filter((swatch) => {
    if (!swatchFits(material, swatch)) return false;
    if (shade && swatch.shade !== shade) return false;
    if (terms.length === 0) return true;
    const haystack = words(`${swatch.name} ${swatch.maker} ${swatch.type}`);
    return terms.every((term) => haystack.includes(term));
  });

  if (near) {
    const target = labOf(near);
    const scored = matches
      .map((swatch) => ({ swatch, d: distance(labFor(swatch), target) }))
      .sort((a, b) => a.d - b.d);
    const close = scored.filter((s) => s.d <= NEAR_ENOUGH);
    matches = (close.length >= AT_LEAST ? close : scored.slice(0, AT_LEAST)).map((s) => s.swatch);
  } else {
    matches.sort(
      (a, b) =>
        Number(words(b.type) === exact) - Number(words(a.type) === exact) ||
        a.maker.localeCompare(b.maker) ||
        a.name.localeCompare(b.name),
    );
  }
  return { total: matches.length, swatches: matches.slice(0, SEARCH_LIMIT) };
}
