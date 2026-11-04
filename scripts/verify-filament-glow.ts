import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import sources from "../public/filament-glow/sources.json";
import { filamentGlowPhoto } from "../src/lib/filament-glow-photos";
import { filamentPaletteFor } from "../src/lib/color-names";
import { filamentMatchesColorFilter } from "../src/lib/filament-color-types";
import { SOURCE_FILAMENT_COLORS } from "../src/lib/filament-settings-data";
import { shelfColorSample } from "../src/lib/shelf-colors";

const samples = filamentPaletteFor(null, undefined, "Glow").colors;
assert.ok(samples.length > 0);
for (const color of samples) assert.ok(filamentGlowPhoto(color), `${color.maker} ${color.name} needs a verified glow preview`);
const ids = new Set<number>();
let total = 0;
for (const photo of sources.photos) {
  assert.equal(ids.has(photo.sampleId), false, "Each sample has one verified glow photo");
  ids.add(photo.sampleId);
  const color = SOURCE_FILAMENT_COLORS.find(color => color.id === `fcx:${photo.sampleId}`)!;
  assert.ok(color);
  assert.equal(color.maker, photo.maker);
  assert.equal(color.name, photo.name);
  assert.equal(color.type, photo.type);
  assert.equal(filamentGlowPhoto(color), `/filament-glow/${photo.file}`);
  assert.match(photo.file, /^\d+\.webp$/);
  assert.equal(new URL(photo.sourcePage).protocol, "https:");
  assert.equal(new URL(photo.imageUrl).protocol, "https:");
  const bytes = await readFile(`public/filament-glow/${photo.file}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), photo.sha256);
  const image = await sharp(bytes).metadata();
  assert.equal(image.format, "webp");
  assert.ok(image.width && image.width <= 640 && image.height && image.height <= 640);
  assert.ok(bytes.length < 100_000, "Previews stay small enough for the picker");
  total += bytes.length;
}
assert.ok(total < 1_000_000, "The entire glow gallery stays below 1 MB");
const blue = samples.find(color => color.id === "fcx:1109")!;
assert.equal(filamentGlowPhoto({ ...blue, pageUrl: undefined }), null, "A matching name or hex cannot borrow another sample's glow");
assert.equal(filamentGlowPhoto({ ...blue, pageUrl: "https://filamentcolors.xyz/swatch/999999/" }), null);
assert.equal(filamentGlowPhoto({ ...blue, maker: "Other maker" }), null);
assert.equal(filamentGlowPhoto({ ...blue, type: "PETG" }), null);
assert.equal(filamentGlowPhoto({ ...blue, name: "Non-glowing Blue" }), null);
assert.equal(filamentGlowPhoto({ ...blue, name: "Blue", product: "PLA" }), null);
assert.equal(filamentGlowPhoto({ ...blue, maker: "AMOLEN" }), filamentGlowPhoto(blue));
for (const color of filamentPaletteFor().colors.filter(color => !filamentMatchesColorFilter(color, "Glow")))
  assert.equal(filamentGlowPhoto(color), null);

// An ordinary cream shelf color must not acquire a glow effect from a near-identical daylight hex.
const cream = { id: "cream", name: "Cream", materialName: "PLA", mode: "solid" as const, hex: blue.hex, style: blue.hex };
assert.equal(filamentMatchesColorFilter(shelfColorSample(cream)!.color, "Glow"), false);
const glow = shelfColorSample({ ...cream, id: "glow", name: "Glow Blue" });
assert.ok(glow && filamentMatchesColorFilter(glow.color, "Glow"));
const exact = shelfColorSample({ ...cream, id: "exact", amazonUrl: blue.amazonUrl });
assert.ok(exact?.exact);
assert.equal(exact.color.id, blue.id, "A saved product link still keeps its exact glow filament");

console.info(`Glow photos passed: ${samples.length} current colors, exact identities, ${sources.photos.length} verified assets (${total} bytes), ordinary-color isolation and shelf references.`);
