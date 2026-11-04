import assert from "node:assert/strict";
import { SCANNED_FILAMENT_COLORS, scannedFilamentImage } from "../src/lib/filament-scanned-swatches";
import { filamentSampleImage, hasPrintedFilamentSample } from "../src/lib/filament-samples";
import { SOURCE_FILAMENT_COLORS, PRINTED_FILAMENT_COLORS, configuredFilamentRecords, managedLibrarySwatches, recordedSwatchChoice } from "../src/lib/filament-settings-data";
import { filamentPaletteFor } from "../src/lib/color-names";
import { storySwatch, WishSchema } from "../src/lib/catalog";
import { recordedSwatchId } from "../src/lib/filament-ids";
import { type FilamentSettings } from "../src/lib/filament-brands";

const allIds = SOURCE_FILAMENT_COLORS.map(color => recordedSwatchId(color.id));
assert.equal(new Set(allIds).size, allIds.length, "New scan ids must not collide with recorded swatch ids");
for (const color of SCANNED_FILAMENT_COLORS) {
  assert.equal(filamentSampleImage(color), color.pageUrl);
  assert.equal(recordedSwatchChoice(color).image, color.pageUrl);
  assert.ok(PRINTED_FILAMENT_COLORS.includes(color));
  assert.ok(!color.amazonUrl, "A photographed sample does not establish a purchase link");
  assert.ok(WishSchema.shape.filamentColorId.safeParse(color.id).success);
}
assert.equal(scannedFilamentImage({ maker: "Panchroma", name: "Blue", type: "PET PET CoPE" }), SCANNED_FILAMENT_COLORS[0].pageUrl);
assert.equal(scannedFilamentImage({ maker: "3d-hojor", name: "Glacier (Gradient)", type: "PLA" }), SCANNED_FILAMENT_COLORS[2].pageUrl);
for (const [color, file] of [
  [{ maker: "IEMAI", name: "White", type: "PETG" }, "iemai-petg-white"],
  [{ maker: "iemai", name: "Black", type: "PETG", product: "PETG" }, "iemai-petg-black"],
  [{ maker: "Justmaker", name: "Bronze (Silk)", type: "PLA", product: "Silk PLA" }, "justmaker-silk-pla-bronze"],
  [{ maker: "Bambu Lab", name: "Bambu Green", type: "PLA" }, "bambu-lab-pla-green"],
] as const) assert.equal(scannedFilamentImage(color), `/filament-swatches/${file}.webp`);
for (const color of [
  { maker: "Unknown", name: "Blue", type: "CoPE" },
  { maker: "Polymaker", name: "Aqua Blue", type: "CoPE" },
  { maker: "Polymaker", name: "Blue", type: "PETG" },
  { maker: "Panchroma", name: "Orange", type: "Basic PLA" },
  { maker: "Panchroma", name: "Orange", type: "Satin PETG" },
  { maker: "Polymaker", name: "White", type: "Silk CoPE" },
  { maker: "3DHoJor", name: "Glacier", type: "PETG", product: "Gradient" },
  { maker: "IEMAI", name: "White", type: "PLA" },
  { maker: "IEMAI", name: "Black", type: "PETG-CF" },
  { maker: "IEMAI", name: "White", type: "Matte PETG" },
  { maker: "Justmaker", name: "Bronze", type: "PLA" },
  { maker: "Polymaker", name: "Bronze", type: "Silk PLA" },
  { maker: "Bambu Lab", name: "Green", type: "Matte PLA" },
  { maker: "Bambu Lab", name: "Green", type: "PETG" },
]) assert.equal(scannedFilamentImage(color), null, "A similar color, different material or finish must not borrow an owner scan");
assert.equal(hasPrintedFilamentSample({ name: "Blue", type: "PLA", pageUrl: "https://www.amazon.com/dp/B012345678" }), false);

const settings: FilamentSettings = {
  brands: [{ id: "polymaker", name: "Polymaker", aliases: ["Panchroma"] }, { id: "hojor", name: "3DHoJor", aliases: [] }],
  listings: [
    { id: 1, brandId: "polymaker", sourceId: "scan:polymaker-cope-blue", name: "Blue", type: "CoPE", product: "CoPE", hex: "#112233", amazonUrl: "https://www.amazon.com/dp/B000TEST01", active: true },
    { id: 2, brandId: "hojor", sourceId: null, name: "Glacier", type: "PLA", product: "Multi Rainbow Color Gradient Change PLA", hex: "#223344", amazonUrl: "https://www.amazon.com/dp/B000TEST02", active: true },
    { id: 3, brandId: "polymaker", sourceId: null, name: "Orange", type: "PLA", product: "Basic PLA", hex: "#eb7650", amazonUrl: "https://www.amazon.com/dp/B000TEST03", active: true },
  ],
};
const colors = configuredFilamentRecords(settings);
const blue = colors.find(color => color.id === "admin:1")!;
assert.equal(blue.hex, "#112233", "Adding a photo must retain the saved listing's base hex");
assert.equal(filamentSampleImage(blue), SCANNED_FILAMENT_COLORS[0].pageUrl);
assert.ok(filamentPaletteFor("CoPE", settings).colors.some(color => color.id === blue.id));
assert.ok(filamentPaletteFor("PLA", settings, "Gradient").colors.some(color => color.id === "admin:2"));
assert.ok(!filamentPaletteFor("PLA", settings).colors.some(color => color.id === "admin:3"), "Basic PLA Orange must not inherit the Satin scan");
assert.ok(!colors.some(color => color.id === SCANNED_FILAMENT_COLORS[1].id), "Discontinued Satin remains a library reference without a purchase listing");
const library = managedLibrarySwatches(settings);
assert.equal(library.find(color => color.id === recordedSwatchId(blue.id))?.sampleImage, SCANNED_FILAMENT_COLORS[0].pageUrl);
assert.equal(storySwatch({ swatchId: recordedSwatchId(blue.id), swatchMaker: blue.maker, swatchType: blue.type,
  swatchBuyUrl: blue.amazonUrl!, colorName: blue.name, colorHex: blue.hex })?.image, SCANNED_FILAMENT_COLORS[0].pageUrl);
assert.equal(storySwatch({ swatchId: recordedSwatchId("scan:justmaker-silk-pla-bronze"), swatchMaker: "Justmaker", swatchType: "Silk PLA",
  swatchBuyUrl: null, colorName: "Bronze (Silk)", colorHex: "#796a6f" })?.image, "/filament-swatches/justmaker-silk-pla-bronze.webp");
assert.ok(!configuredFilamentRecords({ ...settings, brands: [] }).some(hasPrintedFilamentSample));
assert.ok(!filamentPaletteFor("CoPE", { ...settings, listings: settings.listings.map(link => ({ ...link, active: false })) }).colors.some(color => color.id === blue.id));
console.info("Scanned swatches passed: exact products, maker aliases, material/finish isolation, stable ids, saved colors, linked market samples, ticket photos and discontinued references.");
