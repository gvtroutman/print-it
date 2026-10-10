import { z } from "zod";

import type { OwnerRatings } from "@/lib/filament-traits";

export const COLOR_MODES = ["solid", "gradient", "whatever", "funfetti"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

/**
 * What a "whatever" colour stands for where a single colour is needed: the
 * 3D viewer and the audit tally. A neutral grey, because the colour is by
 * definition not known yet. The rainbow is the swatch, not the model.
 */
export const WHATEVER_HEX = "#b6bcc2";
export const WHATEVER_STYLE = "linear-gradient(135deg, #e4322f 0%, #f6c945 20%, #43aa8b 40%, #2787c9 60%, #7557c7 80%, #e4328c 100%)";

/**
 * The material a requester can leave to the owner: whichever filament best
 * suits what the order is for. Not a catalogue row, so its colour is not tied
 * to one material's shelf — any shelf colour by name, one of the requester's
 * own by `colorHex`, or `ANY_COLOR`.
 */
export const AUTO_MATERIAL = "Auto";

/** The colour name for "any colour will do". */
export const ANY_COLOR = "Any color";

/**
 * Sprinkles over a base colour, for clear filament with coloured flakes in it.
 * Each colour is one dot repeated on its own tile; the tile sizes don't share
 * factors, so the dots never line up into a visible grid. Fixed pixel sizes,
 * so a flake stays a flake on a small swatch and a big spool alike.
 */
const SPRINKLES: [color: string, x: number, y: number, w: number, h: number][] = [
  ["#ff4fa3", 6, 7, 31, 27],
  ["#2fb8e8", 21, 17, 41, 33],
  ["#3cc24a", 13, 24, 43, 37],
  ["#ffd23f", 28, 5, 37, 43],
  ["#2a5bd7", 9, 31, 53, 41],
  ["#c2185b", 35, 20, 47, 53],
  ["#ff9f1c", 16, 11, 59, 47],
  ["#ffffff", 3, 3, 29, 34],
];

/** What funfetti filament usually is: clear, which a swatch shows as a pale grey. */
export const FUNFETTI_CLEAR = "#cfd4d8";

export const funfettiStyle = (base: string) =>
  [
    ...SPRINKLES.map(
      ([color, x, y, w, h]) =>
        `radial-gradient(circle at ${x}px ${y}px, ${color} 2.4px, transparent 3px) 0 0 / ${w}px ${h}px`,
    ),
    base,
  ].join(", ");

export type CatalogColorChoice = {
  id: string;
  name: string;
  hex: string;
  style: string;
  mode: ColorMode;
};
export type CatalogMaterialChoice = {
  id: string;
  name: string;
  /** What the material is, for the person choosing; empty when not written. */
  description: string;
  /**
   * The owner's own 1–5 marks for the comparison chart, null where the
   * built-in filament table's mark stands. See `traitsFor`.
   */
  ratings: OwnerRatings;
  colors: CatalogColorChoice[];
};

/**
 * The shade families filamentcolors.xyz files every swatch under, by its own
 * codes, in the order the "can get" picker offers them.
 */
export const SWATCH_SHADES = [
  { key: "WHT", label: "White", dot: "#f4f4f0" },
  { key: "GRY", label: "Grey", dot: "#8c939a" },
  { key: "BLK", label: "Black", dot: "#1b1d1f" },
  { key: "RED", label: "Red", dot: "#d6312b" },
  { key: "RNG", label: "Orange", dot: "#f08a24" },
  { key: "YLW", label: "Yellow", dot: "#f5d033" },
  { key: "GRN", label: "Green", dot: "#3aa655" },
  { key: "BLU", label: "Blue", dot: "#2f6fd1" },
  { key: "PPL", label: "Purple", dot: "#7d4cc2" },
  { key: "PNK", label: "Pink", dot: "#f27ab0" },
  { key: "BRN", label: "Brown", dot: "#8a5a35" },
  { key: "TRN", label: "Clear", dot: "#dfe9ee" },
] as const;
export type SwatchShade = (typeof SWATCH_SHADES)[number]["key"];

/** HSL (degrees, percent, percent) as "#rrggbb". */
export function hslHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** sRGB "#rrggbb" to CIE L*a*b* (D65), for judging how alike two colours look. */
export function labOf(hex: string): [number, number, number] {
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
export function colourDistance(target: [number, number, number], swatch: [number, number, number]) {
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
export const NEAR_ENOUGH = 28;

/**
 * A spool the owner does not have but can buy, as the filamentcolors.xyz
 * library describes it. See src/lib/filament-library.ts.
 */
export type LibrarySwatch = {
  id: number;
  name: string;
  maker: string;
  /** The library's filament type, e.g. "Silk PLA" or "PETG". */
  type: string;
  /** "#rrggbb", lower case. */
  hex: string;
  /** The filament table's family for `type`, or null when it knows none. */
  family: string | null;
  shade: SwatchShade | null;
  /** Where to buy it: the maker's shop when listed, else the library's Amazon link. */
  buyUrl: string | null;
  /** The swatch's own page on filamentcolors.xyz. */
  pageUrl: string;
  /**
   * The library's photo of the printed swatch card. Fetched by the server
   * only — `img-src 'self'` — and shown through `swatchImagePath`.
   */
  imageUrl: string | null;
  /**
   * The library's full-size photo of the card, which the server cuts down to
   * tile size; `imageUrl` is the fallback. Server only, like `imageUrl`.
   */
  photoUrl: string | null;
};

/**
 * Where the app serves a library swatch's photo from. The version changes
 * whenever what is served there does, because browsers keep a photo a day:
 * v2 is the full photo cut down, which replaced the library's thumbnail.
 */
export const swatchImagePath = (id: number) => `/api/filament-library/${id}/image?v=2`;

/**
 * A library swatch as the browser sees it: what `GET /api/filament-library`
 * answers with, and what the request form and a ticket hold. `image` is this
 * app's path to the swatch photo, null when the library has none.
 */
export type SwatchChoice = Omit<LibrarySwatch, "family" | "imageUrl" | "photoUrl"> & { image: string | null };

/** A swatch's page on filamentcolors.xyz. */
export const swatchPageUrl = (id: number) => `https://filamentcolors.xyz/swatch/${id}/`;

/**
 * The spool a ticket asks the owner to buy, from the ticket's own snapshot,
 * or null for a shelf colour. The buy link was checked when the library was
 * read, and is checked again here because it ends up in an `href`.
 */
export function storySwatch(story: {
  swatchId: number | null;
  swatchMaker: string | null;
  swatchType: string | null;
  swatchBuyUrl: string | null;
  colorName: string;
  colorHex: string;
}): SwatchChoice | null {
  if (story.swatchId === null) return null;
  let buyUrl: string | null = null;
  try {
    const url = story.swatchBuyUrl ? new URL(story.swatchBuyUrl) : null;
    if (url && (url.protocol === "https:" || url.protocol === "http:")) buyUrl = url.href;
  } catch {
    /* not a link; leave it off */
  }
  return {
    id: story.swatchId,
    name: story.colorName,
    maker: story.swatchMaker ?? "",
    type: story.swatchType ?? "",
    hex: story.colorHex,
    shade: null,
    buyUrl,
    pageUrl: swatchPageUrl(story.swatchId),
    // Served while the library still lists the swatch; the colour stands in when not.
    image: swatchImagePath(story.swatchId),
  };
}

/** The longest material description the owner can save. */
export const MAX_MATERIAL_DESCRIPTION = 280;

export const STATUS_CHIP: Record<
  string,
  { bg: string; fg: string }
> = {
  Requested: { bg: "#eaecee", fg: "#4d565e" },
  Accepted: { bg: "#dde3ec", fg: "#2c3a4d" },
  Printing: { bg: "#f7ecd4", fg: "#79541a" },
  Done: { bg: "#d9ebe9", fg: "#0b4340" },
  Delivery: { bg: "#e2e6ea", fg: "#1b2126" },
  Declined: { bg: "#e2e6ea", fg: "#6b747c" },
};

/**
 * How much a print matters to the person asking. The same three steps a
 * feature request uses (`FEATURE_PRIORITIES`, below) and drawn with the same
 * `PRIORITY_CHIP`, but its own list: the two backlogs are parallel, not shared.
 */
export const STORY_PRIORITIES = ["low", "medium", "high"] as const;
export type StoryPriorityName = (typeof STORY_PRIORITIES)[number];
export const DEFAULT_STORY_PRIORITY: StoryPriorityName = "medium";

/** Loudest first: the order the owner's queue reads in. */
export const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export const QuantitySchema = z.coerce
  .number()
  .int("Whole prints only.")
  .min(1, "At least one.")
  // Validated server-side, so the message cannot name the admin (this module
  // is shared with the client bundle). The upload form says who to ask.
  .max(24, "More than 24 is a production run — ask the printer owner first.");

export const WishSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120, "Keep the title under 120 characters.")
    .optional()
    .default(""),
  // Availability and the material/colour relationship are checked against
  // the database in the upload route. These bounds keep hostile form values
  // small before that query runs.
  material: z.string().trim().min(1, "Pick a material.").max(40),
  // A shelf colour by name, or a spool to buy by its filamentcolors.xyz id;
  // see the refinement below. With a swatch the name is read from the
  // library, not from here, so this may be left empty.
  colorName: z.string().trim().max(40).optional().default(""),
  colorHex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "That is not a color.")
    .nullish()
    .describe(
      `Only with material "${AUTO_MATERIAL}": a color of the requester's own, named by colorName. ` +
        "Ignored when colorName is a shelf color.",
    ),
  swatchId: z.coerce
    .number("That is not a swatch.")
    .int("That is not a swatch.")
    .positive("That is not a swatch.")
    .nullish()
    .describe(
      "A spool to buy instead of a shelf color: an id from GET /api/filament-library. " +
        "Replaces colorName; the swatch has to be the kind of filament `material` is.",
    ),
  quantity: QuantitySchema,
  // Optional on the wire, so a client written before priority existed still
  // files a request — it comes out `medium`, which is what it would have meant.
  priority: z.enum(STORY_PRIORITIES, "That is not a priority.").optional().default(DEFAULT_STORY_PRIORITY),
  note: z.string().trim().max(2000, "That note is very long.").optional().default(""),
  // Optional free-text print settings (FRR-103 option A). Shown to the owner so
  // slicer specifics live on the ticket rather than in a chat thread.
  printSettings: z
    .string()
    .trim()
    .max(2000, "Those print settings are very long.")
    .optional()
    .default(""),
}).refine((wish) => wish.colorName !== "" || wish.swatchId != null, {
  message: "Pick a color.",
  path: ["colorName"],
});

export type Wish = z.infer<typeof WishSchema>;

/** "4 prints" / "1 print" */
export const quantityText = (n: number) => `${n} ${n === 1 ? "print" : "prints"}`;

/** Relative time, the way every card in the handoff shows it. */
export function relativeTime(date: Date): string {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86_400_000 * 365, "year"],
    [86_400_000 * 30, "month"],
    [86_400_000 * 7, "week"],
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [ms, unit] of units) {
    if (abs >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

// ---------------------------------------------------------------------------
// Feature requests — the 'frr' track
//
// The fixed choices a feature request is made from, exactly like the print
// catalogue above: the form renders from these and the server validates
// against them, so the two cannot drift.
// ---------------------------------------------------------------------------

export const FEATURE_PRIORITIES = ["low", "medium", "high"] as const;
export const DEFAULT_FEATURE_PRIORITY = "medium";

export const FEATURE_CATEGORIES = ["ui", "api", "bug", "other"] as const;
export const DEFAULT_FEATURE_CATEGORY = "other";

/** How each priority reads and colours, loudest first. */
export const PRIORITY_CHIP: Record<string, { bg: string; label: string }> = {
  high: { bg: "bg-cherry", label: "High" },
  medium: { bg: "bg-sun", label: "Medium" },
  low: { bg: "bg-chrome", label: "Low" },
};

/** Human labels for the category enum. */
export const CATEGORY_LABEL: Record<string, string> = {
  ui: "UI",
  api: "API",
  bug: "Bug",
  other: "Other",
};

const priorityValues = FEATURE_PRIORITIES as unknown as [string, ...string[]];
const categoryValues = FEATURE_CATEGORIES as unknown as [string, ...string[]];

export const FeatureWishSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give it a title — a few words is plenty.")
    .max(120, "Keep the title under 120 characters."),
  description: z
    .string()
    .trim()
    .min(1, "Say what you are hoping for.")
    .max(4000, "That description is very long."),
  priority: z.enum(priorityValues),
  category: z.enum(categoryValues),
});

export type FeatureWish = z.infer<typeof FeatureWishSchema>;
