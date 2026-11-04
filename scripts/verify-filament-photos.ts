import assert from "node:assert/strict";
import { filamentPhotoCrop } from "../src/lib/filament-photo-crop";

const width = 512, height = 384;
type RGB = [number, number, number];
function photo(pixel: (x: number, y: number) => RGB) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  return { data, width, height };
}
const white: RGB = [255, 255, 255];
const red: RGB = [205, 45, 55];
const strands = (x: number, y: number, base: RGB, angle = 0): RGB => {
  const light = Math.sin((x * Math.cos(angle) + y * Math.sin(angle)) * Math.PI / 2) * 22;
  return base.map(channel => Math.max(0, Math.min(255, channel + light))) as RGB;
};
const inside = (x: number, y: number) => x >= 300 && x < 460 && y >= 90 && y < 300;

// A large matching label and a ribbed decorative object compete with a smaller spool.
for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
  const image = photo((x, y) => inside(x, y) ? strands(x, y, red, angle)
    : x < 240 && y > 60 && y < 320 ? red : white);
  const crop = filamentPhotoCrop(image, ["#cd2d37"]);
  assert.ok(crop, "Wound filament should beat a larger flat label of the same color");
  assert.ok(crop.left * width >= 300 && (crop.left + crop.width) * width <= 460);
  assert.ok(crop.top * height >= 90 && (crop.top + crop.height) * height <= 300);
}

for (const hex of ["#ffffff", "#151515", "#cd2d37"]) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  assert.equal(filamentPhotoCrop(photo(() => rgb), [hex]), null, "Flat backgrounds, labels and spool holes are not filament");
}
const broadRibs = photo((x, y) => {
  const light = Math.sin(x * Math.PI / 22) * 22;
  return y > 40 && y < 340 ? red.map(channel => channel + light) as RGB : white;
});
assert.equal(filamentPhotoCrop(broadRibs, ["#cd2d37"]), null, "Broad decorative ribs must not substitute for wound strands");
const lettering = photo((x, y) => x % 30 < 5 && y % 35 < 20 ? [20, 20, 20] : white);
assert.equal(filamentPhotoCrop(lettering, ["#151515"]), null, "Label text must not become a black-filament crop");
const blue = photo((x, y) => inside(x, y) ? strands(x, y, [30, 90, 210]) : white);
assert.equal(filamentPhotoCrop(blue, ["#cd2d37"]), null, "A different product color must use a swatch fallback");
assert.ok(filamentPhotoCrop(blue, ["#cd2d37", "#1e5ad2"]), "A multicolor spool can show a local strand color without chasing a multicolor label");
for (const rgb of [[28, 28, 28], [216, 216, 216]] as RGB[]) {
  assert.ok(filamentPhotoCrop(photo((x, y) => inside(x, y) ? strands(x, y, rgb) : white),
    [rgb[0] < 100 ? "#151515" : "#ffffff"]), "Neutral filament needs strand texture too");
}
assert.equal(filamentPhotoCrop({ data: new Uint8Array(4), width: 512, height: 384 }, ["#ffffff"]), null);
assert.equal(filamentPhotoCrop(blue, ["invalid"]), null);
console.info("Filament photo crops passed: matching strands at three angles, flat labels/backgrounds/holes, decorative ribs, text, wrong colors, multicolor and neutral filament.");
