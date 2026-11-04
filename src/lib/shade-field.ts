import { hslHex } from "@/lib/catalog";

/** Hue in degrees; saturation and the field's vertical position from 0 to 1. */
export type Pick = { h: number; s: number; v: number };

// Keep black at the neutral corner; the rich end bottoms out at a dark hue
// instead of making an entire row the same zero-brightness black.
const DARK_HUE_VALUE = 0.3;

export function targetHex(pick: Pick): string {
  const floor = DARK_HUE_VALUE * pick.s;
  const brightness = floor + pick.v * (1 - floor);
  const l = brightness * (1 - pick.s / 2);
  const s = l === 0 || l === 1 ? 0 : (brightness - l) / Math.min(l, 1 - l);
  return hslHex(pick.h % 360, s * 100, l * 100);
}

/** A saved colour back into the coordinates of the shade field. */
export function pickOf(hex: string): Pick {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, v: max };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d / max;
  const floor = DARK_HUE_VALUE * s;
  // Older saved shades may fall below the field; retain their exact target
  // until the user moves a control. The marker stays inside the field.
  return { h: h * 60, s, v: (max - floor) / (1 - floor) };
}
