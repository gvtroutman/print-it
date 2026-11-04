export type FilamentCrop = { left: number; top: number; width: number; height: number };

type Pixels = { data: ArrayLike<number>; width: number; height: number };
const hue = (r: number, g: number, b: number) => {
  const high = Math.max(r, g, b), delta = high - Math.min(r, g, b);
  return delta === 0 ? 0 : ((high === r ? (g - b) / delta : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
};

/** Require a matching interior with fine, repeated, parallel strands, not just the right shade. */
export function filamentPhotoCrop({ data, width, height }: Pixels, hexes: readonly string[]): FilamentCrop | null {
  if (width < 32 || height < 24 || data.length !== width * height * 4) return null;
  const targets = hexes.filter(hex => /^#[\da-f]{6}$/i.test(hex)).map(hex => {
    const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    return { r, g, b, hue: hue(r, g, b), high, saturation: high ? (high - low) / high : 0 };
  });
  if (!targets.length) return null;
  const luma = new Float32Array(width * height);
  const matches = new Uint8Array(luma.length);
  for (let p = 0; p < luma.length; p++) {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    luma[p] = .2126 * r + .7152 * g + .0722 * b;
    if (data[i + 3] < 240) continue;
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    const saturation = high ? (high - low) / high : 0;
    const h = hue(r, g, b);
    matches[p] = Number(targets.some(target => {
      if (target.saturation < .15) {
        // A white background or a black spool hole must still pass the strand checks below.
        return saturation < .22 && (target.high < 80 ? high < 145 : target.high > 210 ? low > 160 : high > 45 && low < 225);
      }
      const distance = Math.abs(target.hue - h);
      return saturation > Math.max(.18, target.saturation * .45) && high > 35 && Math.min(distance, 360 - distance) < 28;
    }));
  }

  // Integral images keep the multi-size interior and texture checks inexpensive.
  const stride = width + 1, size = stride * (height + 1);
  const fields = Array.from({ length: 6 }, () => new Float64Array(size));
  const [coverage, xx, yy, xy, edges, contrast] = fields;
  for (let y = 0; y < height; y++) {
    const row = new Float64Array(fields.length);
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const gx = x > 0 && x < width - 1 ? (luma[p + 1] - luma[p - 1]) / 2 : 0;
      const gy = y > 0 && y < height - 1 ? (luma[p + width] - luma[p - width]) / 2 : 0;
      const energy = gx * gx + gy * gy;
      const values = [matches[p], gx * gx, gy * gy, gx * gy, Number(energy > 9), Math.sqrt(energy)];
      for (let j = 0; j < fields.length; j++) {
        row[j] += values[j];
        fields[j][(y + 1) * stride + x + 1] = row[j] + fields[j][y * stride + x + 1];
      }
    }
  }
  const average = (field: Float64Array, x: number, y: number, w: number, h: number) =>
    (field[(y + h) * stride + x + w] - field[y * stride + x + w] - field[(y + h) * stride + x] + field[y * stride + x]) / (w * h);

  let best: FilamentCrop | null = null, bestScore = 0;
  for (const fraction of [.07, .10, .14]) {
    const w = Math.max(24, Math.round(Math.min(width, height) * fraction));
    const h = Math.round(w * 3 / 5);
    // Test a margin around the displayed patch as well, keeping spool rims and labels out.
    const margin = Math.max(3, Math.round(w * .15));
    for (let y = margin + 1; y + h + margin < height - 1; y += 3) {
      for (let x = margin + 1; x + w + margin < width - 1; x += 3) {
        if (average(coverage, x - margin, y - margin, w + 2 * margin, h + 2 * margin) < .9) continue;
        const a = average(xx, x, y, w, h), b = average(yy, x, y, w, h), c = average(xy, x, y, w, h);
        const energy = a + b;
        const coherence = Math.hypot(a - b, 2 * c) / (energy || 1);
        if (coherence < .8 || average(edges, x, y, w, h) < .3) continue;

        // Cross the strand direction on several lines. Text, isolated edges and broad
        // decorative vase ribs do not provide repeated fine ridges across the patch.
        const angle = .5 * Math.atan2(2 * c, a - b);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const length = Math.min(w / (Math.abs(dx) || 1e-6), h / (Math.abs(dy) || 1e-6)) * .8;
        let repeated = 0;
        for (const offset of [-.22, 0, .22]) {
          const cx = x + w / 2 - dy * h * offset, cy = y + h / 2 + dx * h * offset;
          let previous = 0, direction = 0, turns = 0, lastTurn = 0, longest = 0;
          for (let step = 0; step < length; step++) {
            const px = Math.round(cx + dx * (step - length / 2)), py = Math.round(cy + dy * (step - length / 2));
            const value = luma[py * width + px];
            const delta = value - previous;
            const next = Math.abs(delta) > 2 ? Math.sign(delta) : direction;
            if (step > 0 && next && direction && next !== direction) {
              turns++;
              longest = Math.max(longest, step - lastTurn);
              lastTurn = step;
            }
            previous = value; direction = next;
          }
          if (turns >= 7 && longest <= 5 && turns / length > .4) repeated++;
        }
        if (repeated < 3) continue;
        const score = coherence * Math.min(20, average(contrast, x, y, w, h)) * Math.sqrt(w);
        if (score > bestScore) {
          bestScore = score;
          best = { left: x / width, top: y / height, width: w / width, height: h / height };
        }
      }
    }
  }
  return best;
}
