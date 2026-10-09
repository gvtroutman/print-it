import { z } from "zod";

import type { OwnerRatings } from "@/lib/filament-traits";

export const COLOR_MODES = ["solid", "gradient", "whatever", "funfetti"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

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
  colorName: z.string().trim().min(1, "Pick a color.").max(40),
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
