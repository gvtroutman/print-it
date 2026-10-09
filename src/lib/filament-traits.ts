/**
 * What each kind of filament is like, for the person choosing one.
 *
 * The catalogue says which materials are on the shelf; it does not say that
 * PLA goes soft in a hot car or that TPU bends. That is general knowledge
 * about filament families, so it lives here as a fixed table rather than as
 * fields the owner has to fill in for every spool. A catalogue entry is
 * matched to a family by its name — "PLA", "Silk PLA", "PETG-CF" all land —
 * and an unknown name gets no ratings rather than made-up ones.
 *
 * The owner can still overrule the table one mark at a time: each catalogue
 * entry carries five optional marks of its own, and a mark that is set beats
 * the table's. That is how a brand's unusually stiff TPU, or a material the
 * table has never heard of, gets rated without the table growing a row.
 *
 * Shared with the client bundle: no database, no "server-only".
 */

/** The five things a requester weighs a material by, in column order. */
export const TRAITS = [
  { key: "strength", label: "Strength", blurb: "How much load it carries before it gives." },
  { key: "flex", label: "Bendy", blurb: "How far it bends before it snaps. TPU squishes." },
  { key: "heat", label: "Heat", blurb: "How hot it can get before it softens." },
  { key: "finish", label: "Finish", blurb: "How smooth and even the surface comes out." },
  { key: "outdoors", label: "Outdoors", blurb: "Sun and rain. Low means it yellows or goes brittle." },
] as const;

export type TraitKey = (typeof TRAITS)[number]["key"];

/** One mark on the chart: 1 (poor) to 5 (excellent). */
export type Mark = 1 | 2 | 3 | 4 | 5;

/** Each trait marked. */
export type Ratings = Record<TraitKey, Mark>;

/**
 * The owner's own marks for one catalogue entry, as the catalogue stores
 * them: null where the table's mark stands.
 */
export type OwnerRatings = Record<TraitKey, number | null>;

/** What the table itself knows about a family, before the owner has a say. */
export type BuiltInTraits = {
  /** The family the name matched, e.g. "PLA" for "Silk PLA". */
  family: string;
  ratings: Ratings;
  /** The jobs it suits, as a short phrase. */
  goodFor: string;
};

/**
 * What the chart shows for one catalogue entry: the table's marks with the
 * owner's laid over them. A null mark is an honest "not rated" — the name
 * matched no family and the owner has not marked that trait.
 */
export type FilamentTraits = {
  /** Null when the name matched nothing and only the owner's marks are known. */
  family: string | null;
  ratings: Record<TraitKey, Mark | null>;
  goodFor: string | null;
};

/** The best mark a trait can get; the chart draws this many pips. */
export const TOP_MARK = 5;

/** `n` as a mark, or null when it is not a whole number from 1 to `TOP_MARK`. */
export function asMark(n: unknown): Mark | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= TOP_MARK ? (n as Mark) : null;
}

type Family = BuiltInTraits & {
  /** Names that mean this family, matched as whole words, case-insensitive. */
  aliases: string[];
};

const FAMILIES: Family[] = [
  {
    family: "PLA",
    aliases: ["PLA", "PLA+", "Tough PLA"],
    ratings: { strength: 3, flex: 1, heat: 1, finish: 5, outdoors: 1 },
    goodFor: "Desk things, display pieces, anything that stays indoors.",
  },
  {
    family: "PETG",
    aliases: ["PETG", "PET", "PCTG"],
    ratings: { strength: 4, flex: 3, heat: 3, finish: 3, outdoors: 4 },
    goodFor: "Hooks, brackets, bottles, parts that get knocked about.",
  },
  {
    family: "ABS",
    aliases: ["ABS"],
    ratings: { strength: 4, flex: 3, heat: 4, finish: 3, outdoors: 2 },
    goodFor: "Enclosures, car interiors, parts near warm electronics.",
  },
  {
    family: "ASA",
    aliases: ["ASA"],
    ratings: { strength: 4, flex: 3, heat: 4, finish: 3, outdoors: 5 },
    goodFor: "Garden, bike and car exterior parts that live in the sun.",
  },
  {
    family: "TPU",
    aliases: ["TPU", "TPE", "Flex", "Flexible"],
    ratings: { strength: 2, flex: 5, heat: 2, finish: 2, outdoors: 4 },
    goodFor: "Phone cases, feet, gaskets, bumpers — anything that squishes.",
  },
  {
    family: "Nylon",
    aliases: ["Nylon", "PA", "PA6", "PA12", "PAHT"],
    ratings: { strength: 5, flex: 4, heat: 4, finish: 2, outdoors: 3 },
    goodFor: "Gears, hinges, clips and other parts that wear.",
  },
  {
    family: "PC",
    aliases: ["PC", "Polycarbonate"],
    ratings: { strength: 5, flex: 2, heat: 5, finish: 3, outdoors: 3 },
    goodFor: "Hot, hard-working parts: tool mounts, printer parts, lamp housings.",
  },
  {
    family: "Resin",
    aliases: ["Resin", "SLA", "MSLA"],
    ratings: { strength: 2, flex: 1, heat: 2, finish: 5, outdoors: 1 },
    goodFor: "Minis, jewellery and small models with the finest detail.",
  },
  {
    family: "HIPS",
    aliases: ["HIPS"],
    ratings: { strength: 3, flex: 3, heat: 3, finish: 3, outdoors: 2 },
    goodFor: "Light, cheap, paintable parts and dissolvable supports.",
  },
];

/** Carbon or glass fibre in the mix: stiffer and stronger, less bendy, matte. */
const FIBRE = /(^|[^a-z0-9])(cf|gf|carbon|glass)(?![a-z0-9])/i;

const clamp = (n: number) => Math.min(TOP_MARK, Math.max(1, n)) as Mark;

/**
 * Lower-cased and padded with spaces, every run of punctuation squashed to
 * one space, so a whole-word test is a substring test: " petg cf " contains
 * " petg " but " pa12 " does not contain " pa ".
 */
const spaced = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim()} `;

/**
 * The family a catalogue material belongs to, or null when the name says
 * nothing this table knows. Longer aliases win, so "Tough PLA" is PLA and
 * "PA12" is Nylon rather than a stray "PA" inside something else.
 */
export function builtInTraits(name: string): BuiltInTraits | null {
  let best: { family: Family; length: number } | null = null;
  for (const family of FAMILIES) {
    for (const alias of family.aliases) {
      if (!spaced(name).includes(spaced(alias))) continue;
      if (!best || alias.length > best.length) best = { family, length: alias.length };
    }
  }
  if (!best) return null;

  const { family, ratings, goodFor } = best.family;
  if (!FIBRE.test(name)) return { family, ratings, goodFor };
  return {
    family: `${family} with fibre`,
    ratings: {
      ...ratings,
      strength: clamp(ratings.strength + 1),
      flex: clamp(ratings.flex - 1),
      finish: clamp(ratings.finish - 1),
    },
    goodFor,
  };
}

/**
 * What the chart shows for a catalogue entry: the owner's marks where set,
 * the table's where not. Null when there is nothing to show at all — the
 * name matched no family and the owner has marked nothing — so the chart
 * can fall back to the description and a dash per column. A stored mark
 * outside 1–5 is ignored rather than drawn as six stickers or none.
 */
export function traitsFor(name: string, own?: Partial<OwnerRatings> | null): FilamentTraits | null {
  const builtIn = builtInTraits(name);
  const ratings = Object.fromEntries(
    TRAITS.map(({ key }) => [key, asMark(own?.[key]) ?? builtIn?.ratings[key] ?? null]),
  ) as FilamentTraits["ratings"];
  if (!builtIn && TRAITS.every(({ key }) => ratings[key] === null)) return null;
  return { family: builtIn?.family ?? null, ratings, goodFor: builtIn?.goodFor ?? null };
}

/**
 * The four shelves the upload form sorts filaments onto before anyone picks
 * one: the requester says what matters most, and only that shelf's
 * materials are offered. Each shelf is scored by its best trait, so heat
 * and outdoors share one; `sticker` is the chart sticker it wears.
 */
export const CATEGORIES = [
  { key: "finish", label: "Pretty finish", blurb: "Smooth, crisp, nice to look at.", traits: ["finish"], sticker: "finish" },
  { key: "strong", label: "Strong", blurb: "Carries a load without giving.", traits: ["strength"], sticker: "strength" },
  { key: "tough", label: "Heat & outdoors", blurb: "Hot cars, sun and rain.", traits: ["heat", "outdoors"], sticker: "heat" },
  { key: "bendy", label: "Bendy", blurb: "Squishes and bends back.", traits: ["flex"], sticker: "flex" },
] as const satisfies ReadonlyArray<{ key: string; label: string; blurb: string; traits: readonly TraitKey[]; sticker: TraitKey }>;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/**
 * The shelves a material sits on: the one where it scores its best mark, or
 * every one it ties on — PETG is as strong as it is weatherproof, and leaving
 * it off either shelf would hide it from someone who wants exactly that. A
 * material with no marks at all sits on every shelf, so nothing the owner
 * stocks becomes impossible to pick.
 */
export function categoriesOf(traits: FilamentTraits | null): CategoryKey[] {
  const score = (traitKeys: readonly TraitKey[]) =>
    Math.max(0, ...traitKeys.map((key) => traits?.ratings[key] ?? 0));
  const best = Math.max(...CATEGORIES.map((category) => score(category.traits)));
  if (best === 0) return CATEGORIES.map((category) => category.key);
  return CATEGORIES.filter((category) => score(category.traits) === best).map((category) => category.key);
}
