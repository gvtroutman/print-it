import "server-only";
import sharp from "sharp";

/** A photo-derived suggestion, never a manufacturer specification. Ignore the white background and spool edges. */
export async function estimateFilamentPhotoHex(bytes: Uint8Array, colorName: string): Promise<string | null> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 16_000_000 }).rotate().resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const neutral = /\b(?:black|white|gr[ae]y|silver|charcoal)\b/i.test(colorName);
  const hueRanges: [RegExp, number, number][] = [[/red|maroon|burgundy/i, 335, 25], [/orange|brown|bronze/i, 10, 55], [/yellow|gold/i, 35, 80],
    [/green|lime|mint|forest/i, 65, 175], [/cyan|teal/i, 155, 210], [/blue|navy/i, 175, 270], [/purple|violet/i, 250, 315], [/pink|magenta/i, 285, 355]];
  const range = neutral ? null : hueRanges.find(([pattern]) => pattern.test(colorName));
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let y = Math.ceil(info.height * .12); y < info.height * .88; y++) for (let x = Math.ceil(info.width * .12); x < info.width * .88; x++) {
    const i = (y * info.width + x) * 4; const [r, g, b, a] = data.subarray(i, i + 4);
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const saturation = max ? (max - min) / max : 0;
    if (a < 220 || min > 240) continue;
    if (neutral ? saturation > .18 : saturation < .25 || max < 65) continue;
    if (range) {
      const difference = max - min;
      let hue = max === r ? ((g - b) / difference) % 6 : max === g ? (b - r) / difference + 2 : (r - g) / difference + 4;
      hue = (hue * 60 + 360) % 360;
      if (range[1] <= range[2] ? hue < range[1] || hue > range[2] : hue < range[1] && hue > range[2]) continue;
    }
    if (/\bblack|charcoal\b/i.test(colorName) && max > 95) continue;
    if (/\bwhite\b/i.test(colorName) && min < 190) continue;
    if (/\bgr[ae]y|silver\b/i.test(colorName) && (max < 65 || min > 215)) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const held = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    held.count++; held.r += r; held.g += g; held.b += b; buckets.set(key, held);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner || winner.count < 24) return null;
  return "#" + [winner.r, winner.g, winner.b].map(value => Math.round(value / winner.count).toString(16).padStart(2, "0")).join("");
}
