import "server-only";

import { builtInTraits } from "@/lib/filament-traits";
import { labOf, spoolSearchUrl, type LibrarySwatch, type SwatchShade } from "@/lib/catalog";
import { sourceUrl as appSourceUrl } from "@/lib/runtime";

/**
 * The fallback spool library: SpoolmanDB (github.com/Donkie/SpoolmanDB, MIT),
 * the filament makers' own listings, about 70 brands and 4,700 colours. It
 * reaches brands and engineering materials filamentcolors.xyz has not
 * swatched, and stands in when that site cannot be reached.
 *
 * Its colours are the hex a maker lists, not a measured swatch, and it has no
 * photos or buy links, so filamentcolors.xyz is always asked first; see
 * `searchLibrary` in src/lib/filament-library.ts, which decides when this one
 * is consulted.
 *
 * The whole database is one ~5 MB JSON file, fetched by the server and kept
 * for a day. A failed refresh keeps the old copy; with no copy at all,
 * callers get `SpoolmanUnavailable`.
 */

const URL_ = "https://donkie.github.io/SpoolmanDB/filaments.json";
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch with nothing cached, how long before trying again. */
const RETRY_AFTER_MS = 60 * 1000;
const TIMEOUT_MS = 30_000;
/** A sanity cap: the file is ~5 MB today. */
const MAX_BYTES = 32 * 1024 * 1024;

export class SpoolmanUnavailable extends Error {}

type Library = { byId: Map<number, LibrarySwatch>; fetchedAt: number };

let library: Library | null = null;
let fetching: Promise<Library> | null = null;
let failedAt = 0;

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

/**
 * A spool's id: negative, so it can never be a filamentcolors.xyz swatch id,
 * and a ticket's `swatchId` alone says which library it came from. A hash of
 * the maker, material, finish and colour name, so the same spool keeps its id
 * across refreshes and a reprint finds it again. Tickets store these ids:
 * never change what goes into the key.
 */
function idOf(key: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return -((hash & 0x7fffffff) || 1);
}

/**
 * The shade family filamentcolors.xyz would file a colour under, worked out
 * from its hex, so the `shade` filter covers these spools too. Checked
 * against how filamentcolors.xyz files its own ~2,200 swatches: it agrees on
 * nine in ten, and the rest are borderline (teal, olive, near-black grey).
 */
function shadeOf(hex: string, translucent: boolean): SwatchShade {
  const [l, a, b] = labOf(hex);
  const c = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (c < 8) {
    if (translucent && l > 35) return "TRN";
    return l > 78 ? "WHT" : l < 35 ? "BLK" : "GRY";
  }
  if (l > 75 && c < 17) return translucent ? "TRN" : "WHT";
  // Tan and beige, then the darker oranges.
  if (h >= 29 && h < 102 && c < 32 && l < 74) return "BRN";
  if (h >= 48 && h < 67 && l < 50) return "BRN";
  if (h < 4 || h >= 340) return "PNK";
  if (h < 41) return l > 58 && c < 71 ? "PNK" : "RED";
  if (h < 67) return "RNG";
  if (h < 109) return "YLW";
  if (h < 181) return "GRN";
  if (h < 293) return "BLU";
  return "PPL";
}

const FINISHES: Record<string, string> = { matte: "Matte", glossy: "Glossy" };

/**
 * The type as the picker shows it: the material, with a finish, glow or
 * see-through the colour's name does not already say. "Translucent" in the
 * type is what puts it ahead when a see-through colour is picked.
 */
function typeOf(material: string, r: Record<string, unknown>, name: string): string {
  const said = ` ${words(`${material} ${name}`)} `;
  const extras = [
    FINISHES[str(r.finish)],
    r.glow === true ? "Glow" : undefined,
    r.translucent === true ? "Translucent" : undefined,
  ].filter((w): w is string => !!w && !said.includes(` ${words(w)} `));
  return [material, ...extras].join(" ");
}

/**
 * One spool, or null when it is missing what a ticket needs. Multi-colour
 * spools are left out: one hex would misdescribe them.
 */
function toSwatch(raw: unknown): { key: string; swatch: LibrarySwatch } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const maker = str(r.manufacturer);
  const name = str(r.name);
  const material = str(r.material);
  const hex = str(r.color_hex);
  if (!maker || !name || !material || !/^[0-9a-f]{6}$/i.test(hex) || Array.isArray(r.color_hexes)) return null;
  const type = typeOf(material, r, name).slice(0, 80);
  const key = [maker, material, str(r.finish), name].join("|").toLowerCase();
  const swatch: LibrarySwatch = {
    id: idOf(key),
    name: name.slice(0, 80),
    maker: maker.slice(0, 80),
    type,
    hex: `#${hex.toLowerCase()}`,
    // "ABS+GF20" is ABS with glass fibre to the filament table.
    family: builtInTraits(type.replace(/\+(?=[a-z0-9])/gi, " "))?.family ?? null,
    shade: shadeOf(`#${hex}`, r.translucent === true),
    buyUrl: null,
    pageUrl: spoolSearchUrl({ maker, type, name }),
    imageUrl: null,
    photoUrl: null,
  };
  return { key, swatch };
}

async function fetchLibrary(): Promise<Library> {
  const response = await fetch(URL_, {
    headers: { accept: "application/json", "user-agent": `PrettyPleasePrint (+${appSourceUrl()})` },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || declared > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`SpoolmanDB answered ${response.status} (${declared} bytes)`);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("SpoolmanDB's filament list is too big");
  const body = JSON.parse(text) as unknown;
  if (!Array.isArray(body)) throw new Error("SpoolmanDB's filament list is not a list");

  // Each colour comes once per spool size and diameter; the first stands for
  // all. Sorted by key first, so if two keys ever hash alike the same one
  // wins every time.
  const found = body.map(toSwatch).filter((s) => s !== null);
  found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const byId = new Map<number, LibrarySwatch>();
  const keys = new Map<number, string>();
  let clashes = 0;
  for (const { key, swatch } of found) {
    const held = keys.get(swatch.id);
    if (held === undefined) {
      keys.set(swatch.id, key);
      byId.set(swatch.id, swatch);
    } else if (held !== key) {
      clashes += 1;
    }
  }
  if (clashes > 0) console.warn(`[spoolman-library] ${clashes} spools left out: their ids clash`);
  if (byId.size === 0) throw new Error("SpoolmanDB listed no usable spools");
  return { byId, fetchedAt: Date.now() };
}

/** Start a fetch unless one is running; never more than one at a time. */
function refresh(): Promise<Library> {
  fetching ??= fetchLibrary()
    .then((fresh) => (library = fresh))
    .catch((error) => {
      failedAt = Date.now();
      console.error("[spoolman-library] refresh failed", error);
      throw error;
    })
    .finally(() => {
      fetching = null;
    });
  return fetching;
}

/**
 * Every usable spool, by id, fetching the database first if there is none.
 * A stale copy is served at once while a fresh one is fetched behind it.
 */
export async function spoolmanSwatches(): Promise<Map<number, LibrarySwatch>> {
  if (library) {
    if (Date.now() - library.fetchedAt > FRESH_FOR_MS && !fetching) refresh().catch(() => {});
    return library.byId;
  }
  if (!fetching && Date.now() - failedAt < RETRY_AFTER_MS) throw new SpoolmanUnavailable();
  try {
    return (await refresh()).byId;
  } catch {
    throw new SpoolmanUnavailable();
  }
}
