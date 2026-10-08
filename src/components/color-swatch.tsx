import type { ColorMode } from "@/lib/catalog";

/**
 * A filament colour, drawn from a ticket's or a catalogue row's snapshot.
 *
 * `stripe` is the full-width band along the top of a card rather than a dot.
 * It is a prop and not a class the caller passes because the display mode is
 * the one thing this component has to own: it used to hard-code `inline-flex`
 * and take `block` through `className`, the two fought, and the band on every
 * card collapsed to the width of its content — nothing, or a clipped "?".
 *
 * `mark` draws the question mark on a "whatever" swatch. Callers turn it off
 * where the swatch is too small for a glyph to read as anything but dirt: the
 * 8px band and the 9px dot in a chip. The rainbow says it on its own there.
 */
export function ColorSwatch({
  mode,
  style,
  className = "",
  stripe = false,
  mark = true,
}: {
  mode: ColorMode;
  style: string;
  className?: string;
  stripe?: boolean;
  mark?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`relative items-center justify-center overflow-hidden ${
        stripe ? "flex w-full" : "inline-flex"
      } ${className}`}
      style={{ background: style }}
    >
      {mode === "whatever" && mark && !stripe && (
        <span className="font-display text-[0.72em] leading-none text-cream [text-shadow:0_1px_2px_#1b2126,0_0_2px_#1b2126]">
          ?
        </span>
      )}
    </span>
  );
}

/** A touch of light on top of the winding and shade underneath, so it reads as a drum. */
const WINDING_SHADE =
  "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18))";

/**
 * A filament colour drawn as a spool seen three-quarters on: a dark back
 * flange, the wound filament in the colour, and a front flange with its hub
 * hole covering the right of the winding — the look of the AMS slots in Bambu
 * Studio. It is taller than wide (7:10); size it with a height and width on
 * `className`. Everything inside is in percentages so it scales.
 *
 * The layout, in a 70 x 100 box: back flange x 0-32, front flange x 38-70,
 * filament x 8-50 and y 7-93 (it runs under the front flange far enough to
 * stay hidden at its top and bottom corners), hub at the front flange's centre.
 *
 * The filament is a `ColorSwatch`, so a gradient or a "whatever" rainbow and
 * its "?" come along unchanged.
 */
export function FilamentSpool({
  mode,
  style,
  className = "",
  mark = true,
}: {
  mode: ColorMode;
  style: string;
  className?: string;
  mark?: boolean;
}) {
  return (
    <span aria-hidden className={`relative inline-block ${className}`}>
      <span className="absolute inset-y-0 left-0 w-[45.7%] rounded-[50%] bg-[#363636]" />
      {/* The left end is the near side of the winding, the back flange's curve
          a little smaller: about 14 units across of the band's 42, by its full height. */}
      <span
        className="absolute inset-y-[7%] left-[11.4%] w-[60%] overflow-hidden"
        style={{ borderRadius: "33% 0 0 33% / 50% 0 0 50%" }}
      >
        {/* The right padding centres the "?" on the part the front flange leaves showing. */}
        <ColorSwatch
          mode={mode}
          style={`${WINDING_SHADE}, ${style}`}
          mark={mark}
          className="h-full w-full pr-[28.6%] align-top"
        />
      </span>
      <span className="absolute inset-y-0 right-0 flex w-[45.7%] items-center justify-center rounded-[50%] bg-[#4a4a4a]">
        <span
          className="h-[24%] w-[28%] rounded-[50%]"
          style={{ background: "linear-gradient(to bottom, #1c1c1c 20%, #3e3e3e)" }}
        />
      </span>
    </span>
  );
}
