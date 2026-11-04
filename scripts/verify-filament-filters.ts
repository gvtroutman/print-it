import assert from "node:assert/strict";
import { filamentPaletteFor } from "../src/lib/color-names";
import { filamentColorName, filamentColorStyle, filamentColorType, filamentMatchesColorFilter, TRANSLUCENT_BACKGROUND } from "../src/lib/filament-color-types";
import { SOURCE_FILAMENT_COLORS } from "../src/lib/filament-settings-data";
import type { FilamentSettings } from "../src/lib/filament-brands";

// Use a photographed PLA source so these listings meet the market's eligibility rules.
const source = SOURCE_FILAMENT_COLORS.find(color => color.id.startsWith("fcx:")
  && color.family === "PLA" && !color.translucent && filamentColorType(color) === "Solid")!;
const settings: FilamentSettings = {
  brands: [{ id: "fixture", name: "Fixture", aliases: [] }],
  listings: [
    { name: "Rose", type: "PLA", product: "Rose scented PLA" },
    { name: "Scented Blue", type: "PLA", product: "Silk PLA" },
    { name: "Coffee", type: "Scented PLA", product: "PLA" },
    { name: "Glow Green", type: "PLA", product: "PLA" },
    { name: "Blue", type: "PLA", product: "Glow-in-the-dark PLA" },
    { name: "Green", type: "Luminous PLA", product: "PLA" },
    { name: "Rose", type: "PLA", product: "PLA" },
    { name: "Coffee", type: "PLA", product: "PLA" },
    { name: "Fluorescent Green", type: "PLA", product: "PLA" },
    { name: "Unscented Rose", type: "PLA", product: "PLA" },
    { name: "Non-glowing Green", type: "PLA", product: "PLA" },
    { name: "Brass Composite", type: "PLA", product: "PLA" },
    { name: "Bronze Composite", type: "PLA", product: "PLA" },
    { name: "Brown", type: "PLA", product: "Wood-filled PLA" },
  ].map((listing, id) => ({ ...listing, id, brandId: "fixture", sourceId: source.id,
    hex: "#112233", amazonUrl: "https://www.amazon.com/dp/B012345678", active: true })),
};

assert.deepEqual(filamentPaletteFor("PLA", settings, "Scented").colors.map(color => color.name),
  ["Rose", "Scented Blue", "Coffee"], "Scent labels must work in names, products and materials, even at the same hex");
assert.deepEqual(filamentPaletteFor("PLA", settings, "Glow").colors.map(color => color.name),
  ["Glow Green", "Blue", "Green"], "Glow labels must work in names, products and materials, even at the same hex");
const silk = filamentPaletteFor("PLA", settings, "Silk").colors[0]!;
assert.equal(silk.name, "Scented Blue");
assert.equal(filamentMatchesColorFilter(silk, "Scented"), true, "Scent must coexist with the original finish");
assert.equal(filamentColorType(silk), "Silk", "A specialty filter must preserve stored finish metadata");

assert.deepEqual(filamentPaletteFor("PLA", settings, "Composite").colors.map(color => color.name),
  ["Brass Composite", "Bronze Composite", "Brown"], "Composites at the same hex must remain distinct product choices");

for (const filter of ["Scented", "Glow", "Composite"] as const) {
  assert.equal(filamentPaletteFor("PETG", settings, filter).colors.length, 0, "Filters must respect the chosen material");
  assert.equal(filamentPaletteFor("Unknown material", settings, filter).nearest("#112233"), null);
  assert.equal(filamentPaletteFor(null, { ...settings, brands: [] }, filter).colors.length, 0, "Disabled brands must stay excluded");
  assert.equal(filamentPaletteFor(null, { ...settings, listings: settings.listings.map(link => ({ ...link, active: false })) }, filter).colors.length, 0);
  assert.equal(filamentPaletteFor(null, { ...settings, listings: settings.listings.map(link => ({ ...link, amazonUrl: "" })) }, filter).colors.length, 0);
}
for (const name of ["Non-scented Rose", "Scent-free Coffee", "Fragrance-free PLA"])
  assert.equal(filamentMatchesColorFilter({ name, type: "PLA" }, "Scented"), false, name);
assert.equal(filamentMatchesColorFilter({ name: "Phosphorescent Green", type: "PLA" }, "Glow"), true);
assert.equal(filamentMatchesColorFilter({ name: "Glowberry Pink", type: "PLA" }, "Glow"), false);

for (const color of [
  { name: "Marble White", type: "PLA" },
  { name: "Brick", type: "Panchroma Marble" },
  { name: "Grey", type: "PLA", product: "Marble PLA" },
]) {
  assert.equal(filamentMatchesColorFilter(color, "Marble"), true, "Marble labels in the color, material or product must reach the Marble filter");
  assert.equal(filamentMatchesColorFilter(color, "Solid"), false, "Marble filaments must leave the Solid filter");
}
assert.equal(filamentColorName({ name: "Brick", type: "Panchroma Marble" }), "Brick (Marble)", "Saved colors must reopen the Marble filter");
assert.equal(filamentColorType({ name: "Rainbow Marble", type: "PLA", colorType: "Gradient" }), "Gradient", "Explicit color effects keep their precedence");
assert.ok(filamentPaletteFor("PLA", undefined, "Marble").colors.length > 0, "The Marble filter must include existing eligible printed samples");

for (const color of [
  { name: "Copper Composite", type: "HTPLA" },
  { name: "Black", type: "PLA-CF" },
  { name: "Blue", type: "PETG-GF30" },
  { name: "Natural", type: "PLA", product: "Wood PLA" },
  { name: "Light Oak Wood", type: "PLA" },
  { name: "Matte Fiber Gray", type: "HTPLA" },
  { name: "Metal Filled Copper", type: "PLA", colorType: "Silk" as const },
  { name: "Gray", type: "PLA", product: "Steel-filled PLA", colorType: "Solid" as const },
  { name: "Black", type: "PETG Glass Fibre", colorType: "Translucent" as const, translucent: true },
]) {
  assert.equal(filamentMatchesColorFilter(color, "Composite"), true, JSON.stringify(color));
  assert.equal(filamentMatchesColorFilter(color, "Solid"), false, "Filled filaments must leave Solid");
}
for (const name of ["Copper", "Bronze", "Iron Gray", "Metallic Gold", "Glass Blue"])
  assert.equal(filamentMatchesColorFilter({ name, type: "PLA" }, "Composite"), false, "A color name alone does not establish a metal or glass filler");
assert.equal(filamentColorType({ name: "Rainbow Composite", type: "PLA", colorType: "Gradient" }), "Gradient", "Explicit physical color effects retain precedence");
const savedComposite = filamentColorName({ name: "Copper", type: "PLA", product: "Copper-filled PLA" });
assert.equal(savedComposite, "Copper (Composite)");
assert.equal(filamentColorType({ name: savedComposite, type: "PLA" }), "Composite", "Saved composite colors must reopen their finish");
const glassStyle = filamentColorStyle({ name: "Black", type: "PLA-GF", hex: "#112233", colorType: "Translucent", translucent: true });
assert.ok(glassStyle.includes("#112233"), "Composite previews must retain the measured base hex");
assert.ok(!glassStyle.includes(TRANSLUCENT_BACKGROUND), "Glass fibre must not render as a see-through finish");

const composites = filamentPaletteFor("PLA", undefined, "Composite").colors;
const solid = filamentPaletteFor("PLA", undefined, "Solid").colors;
for (const id of ["fcx:309", "fcx:310", "fcx:313", "fcx:315", "fcx:317"]) {
  assert.ok(composites.some(color => color.id === id && color.maker === "Protopasta"), `${id}: Proto-pasta metal composites must appear in Composite`);
  assert.ok(!solid.some(color => color.id === id), `${id}: Proto-pasta metal composites must leave Solid`);
}
assert.ok(filamentPaletteFor("PLA-CF", undefined, "Composite").colors.some(color => color.id === "fcx:4347"), "Composite filtering must respect the fiber material family");

console.log("Filament filters verified: composite/marble/scent/glow labels, finish overlap, saved finishes, same-hex variants, Proto-pasta composites, material matching, disabled brands/listings, and empty states.");
