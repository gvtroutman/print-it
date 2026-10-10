"use client";

import type { CatalogMaterialChoice } from "@/lib/catalog";
import { TOP_MARK, TRAITS, type TraitKey, traitsFor } from "@/lib/filament-traits";

/**
 * One material, told on its own: what it suits, the owner's words about it,
 * and a pill for each of its five traits. With `auto`, what leaving it to the owner
 * means instead; with neither, a line saying where this fills in from.
 */
export function MaterialFacts({
  item,
  auto,
  owner,
}: {
  item: CatalogMaterialChoice | null;
  auto: boolean;
  owner: string;
}) {
  if (auto) {
    return (
      <div aria-live="polite">
        <p className="m-0 font-display text-[18px] font-bold text-ink">Auto</p>
        <p className="m-0 mt-[6px] max-w-[520px] text-[14px] leading-[1.5] text-ink-2">
          {owner} picks the filament that best suits what you are asking for — strong enough, bendy enough,
          heat-proof enough, with the finish it deserves — from what is on the shelf. If what it is for is not
          obvious from the files, say so in the note on the last card.
        </p>
      </div>
    );
  }
  if (!item) {
    return (
      <p className="m-0 text-[14px] leading-[1.5] text-ink-3">
        Pick a filament, or Auto, and what it is good at shows up here.
      </p>
    );
  }
  const traits = traitsFor(item.name, item.ratings);
  return (
    <div aria-live="polite">
      <p className="m-0 font-display text-[18px] font-bold text-ink">{item.name}</p>
      {traits?.goodFor && <p className="m-0 mt-[2px] text-[14px] leading-[1.45] text-ink-2">{traits.goodFor}</p>}
      {item.description && <p className="m-0 mt-[6px] max-w-[520px] text-[14px] leading-[1.45] text-ink-2">{item.description}</p>}
      <ul className="m-0 mt-[12px] flex max-w-[520px] list-none flex-wrap gap-[8px] p-0">
        {TRAITS.map((trait) => (
          <li key={trait.key}>
            <TraitPill trait={trait.key} label={trait.label} blurb={trait.blurb} mark={traits?.ratings[trait.key] ?? null} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A mark as a word, so a pill reads at a glance; index 0 is unused. */
const LEVEL = ["", "Low", "Fair", "Good", "Great", "Top"] as const;

/** A strong trait is filled in and a weak one fades back, so what it is good at stands out. */
const PILL_SKIN = ["", "bg-cream-3 text-ink-2", "bg-cream-3 text-ink-2", "bg-porcelain text-ink", "bg-aqua text-ink", "bg-mint text-ink"];

/** One trait as a chip: its sticker, its name and how good the filament is at it. */
function TraitPill({ trait, label, blurb, mark }: { trait: TraitKey; label: string; blurb: string; mark: number | null }) {
  return (
    <span
      title={blurb}
      className={`inline-flex items-center gap-[6px] rounded-chip border-2 py-[3px] pr-[11px] pl-[6px] font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] ${
        mark === null ? "border-dashed border-ink/40 text-ink-3" : `border-ink ${PILL_SKIN[mark]}`
      }`}
    >
      <TraitSticker trait={trait} className={`h-[18px] w-[18px] ${mark === null ? "opacity-40" : ""}`} />
      {label}
      <span aria-hidden className="opacity-40">
        ·
      </span>
      {mark === null ? "Not rated" : LEVEL[mark]}
      {mark !== null && (
        <span className="sr-only">
          , {mark} of {TOP_MARK}
        </span>
      )}
    </span>
  );
}

/**
 * One sticker per trait, in the menu stickers' style: a flat magnet colour
 * inside an ink line, on a 20 x 20 grid. `parts` are the filled shapes,
 * `lines` the open ink strokes drawn over them, and `ribbons` coloured open
 * strokes with their own ink edge, for a shape too thin to fill.
 */
const STICKER: Record<TraitKey, { parts?: Array<[d: string, fill: string]>; lines?: string; ribbons?: Array<[d: string, color: string]> }> = {
  // A dumbbell.
  strength: {
    parts: [
      ["M2 5.5h4v9H2z", "var(--color-cherry)"],
      ["M14 5.5h4v9h-4z", "var(--color-cherry)"],
    ],
    lines: "M6 10h8",
  },
  // A wave: it bends.
  flex: {
    ribbons: [["M2 12.5c2.5-7 5-7 7.5 0s5 7 8.5 0", "#2f62d8"]],
  },
  // A flame.
  heat: {
    parts: [["M10 2c.5 3 5 5.5 5 9.5a5 5 0 0 1-10 0c0-2.3 1.3-3.8 2.2-4.8.3 1.4 1 2 1.8 2.2C8.4 6.6 9 4.3 10 2Z", "#f08a3e"]],
  },
  // A sparkle: a smooth, shiny surface.
  finish: {
    parts: [["M10 1.5 12.3 7.7 18.5 10l-6.2 2.3L10 18.5l-2.3-6.2L1.5 10l6.2-2.3Z", "#f4c531"]],
  },
  // A sun.
  outdoors: {
    parts: [["M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "#f4c531"]],
    lines: "M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4",
  },
};

/** One trait's sticker, decorative; each trait pill wears one. */
function TraitSticker({ trait, className = "h-[22px] w-[22px]" }: { trait: TraitKey; className?: string }) {
  const { parts = [], lines, ribbons = [] } = STICKER[trait];
  return (
    <svg
      aria-hidden
      viewBox="-1 -1 22 22"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {parts.map(([d, fill], j) => (
        <path key={j} d={d} fill={fill} />
      ))}
      {lines && <path d={lines} />}
      {ribbons.map(([d, color], j) => (
        <g key={j}>
          <path d={d} strokeWidth={6} />
          <path d={d} stroke={color} strokeWidth={2.5} />
        </g>
      ))}
    </svg>
  );
}
