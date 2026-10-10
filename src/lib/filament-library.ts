import "server-only";

import { builtInTraits } from "@/lib/filament-traits";
import {
  NEAR_ENOUGH,
  SWATCH_SHADES,
  colourDistance,
  labOf,
  swatchPageUrl,
  type LibrarySwatch,
  type SwatchShade,
} from "@/lib/catalog";
import { sourceUrl as appSourceUrl } from "@/lib/runtime";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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
      measureColours(fresh);
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

// ---------------------------------------------------------------------------
// Colour, as the photos show it
//
// The library lists a hex per swatch, but it is darker and duller than the
// library's own photos, and off in hue for some blues ("Jessie Bold Blue" is
// listed #0851a6, a teal, and photographed a royal blue). People pick by the
// photos, so the grid sorts by the colour measured from each photo: the
// median of the card's thick section in the library's thumbnail. Measured
// once per swatch, in the background after a sweep, and kept in a file on
// the uploads volume so a redeploy does not fetch 2,000 thumbnails again.
// Until a swatch is measured its listed hex stands in.
// ---------------------------------------------------------------------------

const COLOURS_FILE = join(resolve(process.env.MODELS_ROOT ?? "/uploads"), "cache", "filament-colours.json");
/** Thumbnails measured at once: each is ~2 KB and quick to read. */
const PARALLEL_MEASURES = 4;
/** Written to disk after this many new measurements, and at the end. */
const SAVE_EVERY = 200;

const measured = new Map<number, string>();
let coloursRead: Promise<void> | null = null;
let measuring: Promise<void> | null = null;

/** Settles when no measuring is running — for scripts that need the colours in. */
export const coloursMeasured = async () => {
  await load();
  await measuring;
};

/** The colour to match and draw a swatch by: as photographed, else as listed. */
export function swatchColour(swatch: LibrarySwatch): string {
  return measured.get(swatch.id) ?? swatch.hex;
}

async function readColours() {
  try {
    const saved = JSON.parse(await readFile(COLOURS_FILE, "utf8")) as Record<string, unknown>;
    for (const [id, hex] of Object.entries(saved)) {
      if (Number(id) > 0 && typeof hex === "string" && /^#[0-9a-f]{6}$/.test(hex)) measured.set(Number(id), hex);
    }
  } catch {
    // None yet, or unreadable: they are measured again.
  }
}

async function saveColours() {
  try {
    await mkdir(dirname(COLOURS_FILE), { recursive: true });
    const temporary = `${COLOURS_FILE}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(Object.fromEntries(measured)));
    await rename(temporary, COLOURS_FILE);
  } catch (error) {
    console.error("[filament-library] could not save measured colours", error);
  }
}

/**
 * The colour a thumbnail shows: the per-channel median of the card's thick
 * section, left of the three thinner squares and right of the hanging hole,
 * kept clear of the edges. The median, so glare and print lines do not drag it.
 */
async function measureColour(swatch: LibrarySwatch): Promise<string | null> {
  const sharp = await loadSharp();
  if (!sharp || !swatch.imageUrl) return null;
  const thumb = await fetchImage(swatch.imageUrl, MAX_THUMB_BYTES);
  if (!thumb) return null;
  try {
    const image = sharp(thumb.bytes);
    const { width, height } = await image.metadata();
    if (!width || !height) return null;
    const { data, info } = await image
      .extract({
        left: Math.round(width * 0.2),
        top: Math.round(height * 0.3),
        width: Math.max(1, Math.round(width * 0.2)),
        height: Math.max(1, Math.round(height * 0.4)),
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    const channel = (c: number) => {
      const values = Array.from({ length: pixels }, (_, i) => data[i * 3 + c]!).sort((a, b) => a - b);
      return values[Math.floor(pixels / 2)]!.toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(1)}${channel(2)}`;
  } catch (error) {
    console.error(`[filament-library] could not measure swatch ${swatch.id}`, error);
    return null;
  }
}

/** Measure every swatch not yet measured, in the background, once at a time. */
function measureColours(lib: Library) {
  measuring ??= (async () => {
    await (coloursRead ??= readColours());
    const todo = [...lib.byId.values()].filter((s) => s.imageUrl && !measured.has(s.id));
    let unsaved = 0;
    for (let i = 0; i < todo.length; i += PARALLEL_MEASURES) {
      const batch = todo.slice(i, i + PARALLEL_MEASURES);
      const colours = await Promise.all(batch.map(measureColour));
      batch.forEach((swatch, j) => {
        const hex = colours[j];
        if (hex) {
          measured.set(swatch.id, hex);
          unsaved += 1;
        }
      });
      if (unsaved >= SAVE_EVERY) {
        await saveColours();
        unsaved = 0;
      }
    }
    if (unsaved > 0) await saveColours();
    if (todo.length > 0) console.log(`[filament-library] measured ${todo.length} swatch colours`);
  })()
    .catch((error) => console.error("[filament-library] measuring colours failed", error))
    .finally(() => {
      measuring = null;
    });
}

/** The most swatches one search answers with. */
export const SEARCH_LIMIT = 60;

/** When fewer than this are near enough, the closest this many are shown anyway. */
const AT_LEAST = 12;

const labs = new Map<string, [number, number, number]>();
const labFor = (swatch: LibrarySwatch) => {
  const hex = swatchColour(swatch);
  let lab = labs.get(hex);
  if (!lab) labs.set(hex, (lab = labOf(hex)));
  return lab;
};

/**
 * A spool light shows through: the library's own "clear" shade, or one named
 * as see-through, since a translucent red is filed under red.
 */
const seeThrough = (swatch: LibrarySwatch) =>
  swatch.shade === "TRN" || /translu|transparent|clear|glass|crystal|see.?through/i.test(`${swatch.name} ${swatch.type}`);

/**
 * Swatches that fit a material, narrowed by search words (every word has to
 * appear in the name, maker or type) and an optional shade.
 *
 * With `near`, a colour picked from the rainbow, they come closest first, and
 * only those that look near it — or, where the material has few spools that
 * colour, the closest dozen, so a pick never comes back empty. Otherwise
 * swatches whose type is the material's own name come first, then by maker
 * and name. With `clear`, see-through spools go ahead of the rest, each
 * group kept in that order.
 */
export async function searchLibrary(
  material: string,
  {
    query = "",
    shade = null,
    near = null,
    clear = false,
  }: { query?: string; shade?: SwatchShade | null; near?: string | null; clear?: boolean } = {},
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
      .map((swatch) => ({ swatch, d: colourDistance(labFor(swatch), target) }))
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
  if (clear) matches = [...matches.filter(seeThrough), ...matches.filter((swatch) => !seeThrough(swatch))];
  return { total: matches.length, swatches: matches.slice(0, SEARCH_LIMIT) };
}
