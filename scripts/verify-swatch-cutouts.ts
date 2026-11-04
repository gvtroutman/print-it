import assert from "node:assert/strict";
import { swatchCutout } from "../src/lib/swatch-cutout";

// A photographed sample with a hanging hole, pale table and inset texture.
// White highlights and clear-looking panels must remain opaque inside the
// silhouette; the table and the hanging hole must become transparent.
const width = 400, height = 300;
for (const rgb of [[30, 50, 220], [30, 30, 30], [255, 255, 255], [247, 248, 231]]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= 30 && x <= 380 && y >= 94 && y <= 188;
    const hole = Math.hypot(x - 52, y - 141) < 11.5;
    const channels = inside && !hole ? rgb : [242, 244, 243];
    data.set([...channels, 255], (y * width + x) * 4);
  }
  const original = data.slice();
  const result = swatchCutout({ data, width, height });
  assert.ok(result, "Colored, black, white and clear samples need an outline");
  const alpha = (x: number, y: number) => result.alpha[y * width + x];
  assert.equal(alpha(200, 140), 255, "Preserve the filament surface even when it is white");
  assert.equal(alpha(45, 110), 255, "Keep the solid material around the hanging hole");
  assert.equal(alpha(52, 141), 0, "Remove the table visible through the hanging hole");
  assert.equal(alpha(30, 94), 0, "Remove the table outside the rounded corners");
  assert.equal(alpha(200, 70), 0, "Remove table above the complete sample");
  assert.equal(alpha(200, 210), 0, "Remove table below the complete sample");
  assert.deepEqual(data, original, "Finding the outline must never tint the photographed RGB values");
  assert.ok(result.width > 340 && result.height > 90, "Keep the whole sample without a wide center crop");
}
assert.equal(swatchCutout({ data: new Uint8Array(4), width, height }), null);
assert.equal(swatchCutout({ data: new Uint8Array(40 * 30 * 4), width: 40, height: 30 }), null);
assert.equal(swatchCutout({ data: new Uint8Array(width * height * 4).fill(255), width, height }), null,
  "A blank image must not invent a sample");
console.info("Swatch cutouts passed: complete silhouettes, transparent table/corners/hole, white and clear surfaces, original colors, invalid and blank images.");
