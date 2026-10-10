/**
 * The little stickers beside the menu items. Each is a flat fridge-magnet
 * colour with the ink outline and a white die-cut edge around the whole
 * thing, tilted a few degrees so the row reads as a sticker sheet rather
 * than a font. No icon library: nine glyphs is not worth a dependency, and
 * these can stay as wobbly as the rest of the counter.
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
  | "book"
  | "bell"
  | "pencil"
  | "info"
  | "turtle"
  | "rabbit";

/**
 * The wordmark's magnet letters, for the ones the theme has no token for.
 * The rest come from globals.css so they move with the theme.
 */
const MAGNET = {
  red: "var(--color-cherry)",
  sky: "var(--color-sun)",
  teal: "var(--color-aqua)",
  green: "var(--color-mint)",
  yellow: "#f4c531",
  orange: "#f08a3e",
  blue: "#2f62d8",
  purple: "#8a5bd6",
  paper: "var(--color-cream-2)",
};

type Sticker = {
  /** Closed shapes, drawn in order, each with its own fill. */
  parts: Array<[d: string, fill: string]>;
  /** Open strokes drawn on top in ink. */
  lines?: string;
  /** Degrees. Alternating signs keep the row from leaning one way. */
  tilt: number;
};

const STICKERS: Record<NavIconName, Sticker> = {
  // A green go-button: start something.
  plus: {
    parts: [["M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z", MAGNET.green]],
    lines: "M10 6.5v7M6.5 10h7",
    tilt: -6,
  },
  // A parcel: the orders pile.
  stack: {
    parts: [["M3.5 7.5h13V17h-13z", MAGNET.orange]],
    lines: "M5 7.5l1.5-3.5h7L15 7.5M8 11.5h4",
    tilt: 5,
  },
  // A light bulb: an idea someone had.
  bulb: {
    parts: [
      [
        "M10 2a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1.1 2.1h4.4c.1-.9.5-1.6 1.1-2.1A5.5 5.5 0 0 0 10 2Z",
        MAGNET.yellow,
      ],
    ],
    lines: "M7.8 16.5h4.4M8.5 18.5h3",
    tilt: -4,
  },
  // A collection box with a heart on the front: the usual "donate" mark.
  jar: {
    parts: [
      ["M3 7h14v10H3z", MAGNET.teal],
      ["M10 15.5c-2.4-1.7-4-3.1-4-4.8a2.1 2.1 0 0 1 4-1 2.1 2.1 0 0 1 4 1c0 1.7-1.6 3.1-4 4.8Z", MAGNET.red],
    ],
    lines: "M2 7h16",
    tilt: 6,
  },
  // A box with a tick: to do.
  check: {
    parts: [["M4 4h12v12H4z", MAGNET.sky]],
    lines: "M7 10.2l2.2 2.3L13.5 7.5",
    tilt: -5,
  },
  // One person.
  person: {
    parts: [
      ["M3.5 17.5c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5Z", MAGNET.purple],
      ["M10 2.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z", MAGNET.purple],
    ],
    tilt: 4,
  },
  // A spool of filament lying on its side: flanges left and right, the
  // winding between them.
  spool: {
    parts: [
      ["M7 6.5h6v7H7z", MAGNET.yellow],
      ["M4 3.5v13h3v-13z", MAGNET.red],
      ["M13 3.5v13h3v-13z", MAGNET.red],
    ],
    lines: "M9 8.5v3M11 8.5v3",
    tilt: -7,
  },
  // Two people.
  people: {
    parts: [
      ["M11.5 17c.3-2.4 1.4-4 3.1-4.5 1.8.3 3 2 3.4 4.5Z", MAGNET.orange],
      ["M14 5a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z", MAGNET.orange],
      ["M2 17c.5-3 2.8-5 5.5-5s5 2 5.5 5Z", MAGNET.blue],
      ["M7.5 3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z", MAGNET.blue],
    ],
    tilt: 5,
  },
  // A page of lines: the log.
  book: {
    parts: [["M5 2.5h7l3.5 3.5v11.5H5z", MAGNET.paper]],
    lines: "M12 2.5V6h3.5M7.5 10h5M7.5 13h5",
    tilt: -4,
  },
  // A bell, mid-ring: notifications.
  bell: {
    parts: [["M10 3c-3 0-5 2.3-5 5.2v3.3L3.5 14.5h13L15 11.5V8.2C15 5.3 13 3 10 3Z", MAGNET.yellow]],
    lines: "M10 1.5V3M8 16.5a2 2 0 0 0 4 0",
    tilt: -10,
  },
  // A pencil, point down to the left: edit this.
  pencil: {
    parts: [
      ["M4.7 10.7l6.5-6.5 4.5 4.5-6.5 6.5Z", MAGNET.yellow],
      ["M4.7 10.7l4.5 4.5L3 17Z", MAGNET.paper],
      ["M3.5 15.1l1.4 1.4L3 17Z", "currentColor"],
      ["M11.2 4.2l3-3 4.5 4.5-3 3Z", MAGNET.red],
    ],
    tilt: 4,
  },
  // A sky-blue "i": more about this.
  info: {
    parts: [["M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z", MAGNET.sky]],
    lines: "M10 9.2v4.8M10 6.3v.1",
    tilt: -5,
  },
  // A turtle plodding right: the bottom of the priority slider, whenever.
  turtle: {
    parts: [
      ["M3.4 12h4.6v5.6H3.4z", MAGNET.yellow],
      ["M10.6 12h4.6v5.6h-4.6z", MAGNET.yellow],
      ["M16.4 6.8a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z", MAGNET.yellow],
      ["M1.2 13.6a7.6 7.4 0 0 1 15.2 0Z", MAGNET.green],
    ],
    lines: "M6.6 6.6l1.3 7M11 6.6l-1.3 7M1.3 12.8L-.6 14M17.2 9.6h.01",
    tilt: -6,
  },
  // A rabbit mid-bound: the top of the priority slider, now.
  rabbit: {
    parts: [
      ["M13.4 7.2C10.8 5.9 9 2.6 10.1 1.2c1.2-1.4 4.2 1.2 5.4 4.8Z", MAGNET.paper],
      ["M15.6 6.2c-.8-2.8-.3-5.9 1.4-6.1 1.8-.2 2.6 3.1 1.5 6.4Z", MAGNET.paper],
      ["M1.8 12.6a6.8 4.8 0 1 0 13.6 0 6.8 4.8 0 1 0-13.6 0Z", MAGNET.paper],
      ["M2.1 8.4a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z", MAGNET.paper],
      ["M15.8 5.4a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z", MAGNET.paper],
    ],
    lines: "M17 8.6h.01M4.8 16.9l-2.6 1.7M12.6 17l2.6 1.5",
    tilt: 6,
  },
};

/** How far the white die-cut edge reaches past the ink line. */
const EDGE = 2.2;

export function NavIcon({
  name,
  className = "",
  fill,
  flip = false,
  edge = true,
}: {
  name: NavIconName;
  className?: string;
  /** Paint every part this colour instead of its own, e.g. a quiet bell. */
  fill?: string;
  /** Mirror it left to right, tilt and all: the bell swinging the other way. */
  flip?: boolean;
  /** Show the white die-cut edge. The bell keeps it for when it is open. */
  edge?: boolean;
}) {
  const { parts, lines, tilt } = STICKERS[name];
  return (
    <svg
      aria-hidden
      viewBox="-3.5 -3.5 27 27"
      // Bigger than the line it sits on; the negative margin keeps the chip
      // the height the text alone would give it, so the sticker overhangs
      // into the padding like one stuck on afterwards.
      className={`-my-[5px] h-[28px] w-[28px] shrink-0 ${className}`}
      style={{ transform: `${flip ? "scaleX(-1) " : ""}rotate(${tilt}deg)` }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The die-cut edge: everything again in white, fatter, underneath. */}
      <g
        stroke="var(--color-porcelain)"
        strokeWidth={2 + EDGE * 2}
        fill="var(--color-porcelain)"
        style={{ opacity: edge ? 1 : 0, transition: "opacity 160ms ease-out" }}
      >
        {parts.map(([d], i) => (
          <path key={i} d={d} />
        ))}
        {lines && <path d={lines} fill="none" />}
      </g>
      {parts.map(([d, own], i) => (
        <path key={i} d={d} fill={fill ?? own} />
      ))}
      {lines && <path d={lines} />}
    </svg>
  );
}
