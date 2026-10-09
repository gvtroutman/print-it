/**
 * The little pictures beside the menu items. Ink-outline strokes on a 20px
 * grid, round-capped, so they sit with the chips' 2px borders and read as
 * drawn rather than typeset. No icon library: nine glyphs is not worth a
 * dependency, and these can stay as wobbly as the rest of the counter.
 */
export type NavIconName =
  | "plus"
  | "stack"
  | "bulb"
  | "jar"
  | "check"
  | "person"
  | "spool"
  | "people"
  | "book";

const PATHS: Record<NavIconName, string> = {
  // A plus in a circle: start something.
  plus: "M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM10 6.5v7M6.5 10h7",
  // Three sheets, offset: the orders pile.
  stack: "M5 7.5h10v9H5zM3 4.5h10M4 2h10",
  // A light bulb: an idea someone had.
  bulb: "M7.5 15.5h5M8 18h4M10 2.5a5 5 0 0 0-3 9c.5.5 1 1.3 1 2h4c0-.7.5-1.5 1-2a5 5 0 0 0-3-9Z",
  // A collection box with a heart on the front: the usual "donate" mark. A
  // coin in a slot looked like the handle on a lunchbox at 16px. The heart
  // is solid (see FILLS) because an outlined one is a blob at that size.
  jar: "M3 6.5h14V17H3zM2 6.5h16",
  // A box with a tick: to do.
  check: "M4 4h12v12H4zM7 10.2l2.2 2.3L13.5 7.5",
  // One person.
  person: "M10 3a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 10 3ZM3.5 17.5c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5",
  // A spool of filament lying on its side: flanges left and right, the
  // winding between them.
  spool: "M4 4v12h3V4zM13 4v12h3V4zM7 6.5h6M7 13.5h6M9 8v4M11 8v4",
  // Two people.
  people: "M7.5 3.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM2 17c.5-3 2.8-5 5.5-5s5 2 5.5 5M13 4a2.6 2.6 0 0 1 0 5.2M14.5 12.2c2.1.4 3.4 2.2 3.8 4.8",
  // A page of lines: the log.
  book: "M5 2.5h7l3.5 3.5v11.5H5zM12 2.5V6h3.5M7.5 10h5M7.5 13h5",
};

/** Solid shapes drawn on top of the strokes, for the few that need one. */
const FILLS: Partial<Record<NavIconName, string>> = {
  jar: "M10 15.5c-2.4-1.7-4-3.1-4-4.8a2.1 2.1 0 0 1 4-1 2.1 2.1 0 0 1 4 1c0 1.7-1.6 3.1-4 4.8Z",
};

export function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-[16px] w-[16px] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
      {FILLS[name] && <path d={FILLS[name]} fill="currentColor" stroke="none" />}
    </svg>
  );
}
