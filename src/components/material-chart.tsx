"use client";

import type { CatalogMaterialChoice } from "@/lib/catalog";
import { TOP_MARK, TRAITS, type TraitKey, traitsFor } from "@/lib/filament-traits";

/**
 * The material step before anything is picked: every filament on the shelf
 * side by side, rated out of five on the things a requester cares about —
 * strength, bendiness, heat, finish, outdoors. Each mark is a sticker, one
 * per point, so three flames is hotter than one; picking a row is picking
 * the material, and the spools take the chart's place once one is chosen.
 * The marks come from the filament table unless the owner has set their
 * own on the catalogue entry, which wins trait by trait.
 *
 * A real table, so a screen reader gets rows and column headers; each cell
 * also says its mark in words, because a row of stickers is not readable to
 * it. Click anywhere on a row to pick it; the name is the button a keyboard
 * lands on.
 *
 * Below the sm breakpoint the same table reflows: the header hides and every
 * row becomes a stacked card whose cells carry their column name as a prefix,
 * because five sticker columns do not fit a phone without a sideways scroll.
 */
export function MaterialChart({
  catalog,
  owner,
  onPick,
}: {
  catalog: CatalogMaterialChoice[];
  /** Who to ask about a material the table does not know. */
  owner: string;
  onPick: (name: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-panel border-[3px] border-ink bg-porcelain shadow-stamp">
      <table className="w-full border-collapse text-left max-sm:block sm:min-w-[600px]">
        <thead className="max-sm:hidden">
          <tr className="border-b-[3px] border-ink bg-cream-2">
            <th scope="col" className="px-[15px] py-[10px] font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-2">
              Filament
            </th>
            {TRAITS.map((trait) => (
              <th
                key={trait.key}
                scope="col"
                title={trait.blurb}
                className="px-[10px] py-[10px] font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-2"
              >
                {trait.label}
              </th>
            ))}
            <th scope="col" className="hidden px-[15px] py-[10px] font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-2 md:table-cell">
              Good for
            </th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {catalog.map((item) => {
            const traits = traitsFor(item.name, item.ratings);
            // The short built-in phrase keeps every row the same height; the owner's
            // own description already sits under the picker once this is chosen.
            const goodFor = traits?.goodFor ?? (item.description || `Ask ${owner} what it suits.`);
            return (
              <tr
                key={item.id}
                onClick={() => onPick(item.name)}
                className="group cursor-pointer border-t-2 border-ink/15 transition-colors hover:bg-sun-wash max-sm:block max-sm:px-[15px] max-sm:py-[12px]"
              >
                <th scope="row" className="px-[15px] py-[12px] align-middle max-sm:mb-[8px] max-sm:block max-sm:p-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      // The row already picks on click; stop it from picking twice.
                      e.stopPropagation();
                      onPick(item.name);
                    }}
                    className="cursor-pointer border-0 bg-transparent p-0 font-display text-[18px] font-bold text-ink underline decoration-transparent decoration-[3px] underline-offset-4 transition-colors group-hover:decoration-cherry focus-visible:decoration-cherry"
                  >
                    {item.name}
                  </button>
                  <span className="mt-[3px] block max-w-[260px] text-[13px] font-normal leading-[1.4] text-ink-2 md:hidden">{goodFor}</span>
                </th>
                {TRAITS.map((trait) => {
                  const mark = traits?.ratings[trait.key] ?? null;
                  return (
                    <td
                      key={trait.key}
                      data-label={trait.label}
                      title={mark === null ? `${trait.label}: not rated` : `${trait.label}: ${mark} of ${TOP_MARK}`}
                      className="px-[10px] py-[12px] align-middle max-sm:flex max-sm:items-center max-sm:justify-between max-sm:p-0 max-sm:py-[3px] max-sm:before:font-mono max-sm:before:text-[11px] max-sm:before:font-bold max-sm:before:uppercase max-sm:before:tracking-[0.1em] max-sm:before:text-ink-2 max-sm:before:content-[attr(data-label)]"
                    >
                      <Marks trait={trait.key} mark={mark} />
                      <span className="sr-only">
                        {mark === null ? "not rated" : `${mark} of ${TOP_MARK}`}
                      </span>
                    </td>
                  );
                })}
                <td className="hidden max-w-[260px] px-[15px] py-[12px] align-middle text-[14px] leading-[1.4] text-ink-2 md:table-cell">
                  {goodFor}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

/** Alternating tilts so a row of five reads as stuck on by hand, not typeset. */
const TILTS = [-7, 6, -4, 7, -5];

/**
 * A mark out of five as that many stickers, so count carries the value and
 * it reads the same to every eye. An unrated cell is a single dash rather
 * than nothing, which would look like a zero.
 */
function Marks({ trait, mark }: { trait: TraitKey; mark: number | null }) {
  if (mark === null) {
    return <span aria-hidden className="inline-block h-[3px] w-[14px] rounded-full bg-ink/25" />;
  }
  return (
    <span aria-hidden className="inline-flex items-center gap-[2px]">
      {Array.from({ length: mark }, (_, i) => (
        <TraitSticker key={i} trait={trait} tilt={TILTS[i % TILTS.length]} />
      ))}
    </span>
  );
}

/** One trait's sticker, decorative; the upload form's shelf buttons wear them too. */
export function TraitSticker({
  trait,
  tilt = 0,
  className = "h-[22px] w-[22px]",
}: {
  trait: TraitKey;
  tilt?: number;
  className?: string;
}) {
  const { parts = [], lines, ribbons = [] } = STICKER[trait];
  return (
    <svg
      aria-hidden
      viewBox="-1 -1 22 22"
      className={`shrink-0 ${className}`}
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
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
