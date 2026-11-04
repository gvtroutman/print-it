type Pixels = { data: Uint8Array; width: number; height: number };

/**
 * Filamentcolors front photos use the same horizontal, rounded sample with a
 * hanging hole. Find its outer edges in the standard photo framing, then mask
 * the table geometrically. Color-keying would erase white and clear filament.
 */
export function swatchCutout({ data, width, height }: Pixels) {
  if (width < 100 || height < 30 || data.length !== width * height * 4) return null;
  const pixel = (x: number, y: number, channel: number) => data[(y * width + x) * 4 + channel];
  const edge = (vertical: boolean, start: number, end: number, from: number, to: number) => {
    let best = -1, score = 0;
    for (let position = start; position <= end; position++) {
      let total = 0;
      for (let along = from; along < to; along++) {
        for (let channel = 0; channel < 3; channel++) {
          total += Math.abs(vertical
            ? pixel(position + 1, along, channel) - pixel(position - 1, along, channel)
            : pixel(along, position + 1, channel) - pixel(along, position - 1, channel));
        }
      }
      if (total > score) { score = total; best = position; }
    }
    return best;
  };
  const round = Math.round;
  // Full front photos have table above and below; thumbnails are already tight.
  const tight = width / height > 2.5;
  const left = edge(true, 1, round(width * .18), round(height * (tight ? .3 : .37)), round(height * (tight ? .7 : .56)));
  const right = edge(true, round(width * .84), width - 2, round(height * (tight ? .3 : .37)), round(height * (tight ? .7 : .56)));
  // The solid left panel avoids mistaking a step in the thickness test for
  // the outside edge, especially on very pale samples.
  const top = edge(false, tight ? 1 : round(height * .24), round(height * (tight ? .2 : .39)), round(width * .22), round(width * .38));
  const bottom = edge(false, round(height * (tight ? .8 : .56)), tight ? height - 2 : round(height * .7), round(width * .22), round(width * .38));
  const sampleWidth = right - left, sampleHeight = bottom - top;
  if (left < 0 || top < 0 || sampleWidth / sampleHeight < 3 || sampleWidth / sampleHeight > 4.5) return null;

  const radius = sampleHeight * .18;
  const holeX = left + sampleHeight * .235, holeY = (top + bottom) / 2;
  const holeRadius = sampleHeight * .123;
  const alpha = new Uint8Array(width * height);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const dx = Math.max(left + radius - x, 0, x - (right - radius));
    const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
    const outline = Math.min(x - left, right - x, y - top, bottom - y,
      radius - Math.hypot(dx, dy));
    const hole = Math.hypot(x - holeX, y - holeY) - holeRadius;
    // A one-pixel transition avoids a hard, jagged silhouette at thumbnail size.
    alpha[y * width + x] = round(255 * Math.max(0, Math.min(1, Math.min(outline, hole))));
  }
  return { alpha, left, top, width: sampleWidth + 1, height: sampleHeight + 1 };
}
