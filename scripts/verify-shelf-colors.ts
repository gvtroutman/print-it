import assert from "node:assert/strict";
import { shelfColors, shelfColorSample } from "../src/lib/shelf-colors";
import { filamentColorType } from "../src/lib/filament-color-types";
import { printedSwatchId } from "../src/lib/filament-ids";
import type { CatalogColorChoice } from "../src/lib/catalog";
import { filamentSampleImage } from "../src/lib/filament-samples";

const blue = (id: string, materialName: string, hex: string): CatalogColorChoice => ({
  id, materialName, name: "Blue", hex, style: hex, mode: "solid",
});
const colors = [blue("petg-blue", "PETG", "#68cdf3"), blue("gf-blue", "PETG-GF", "#114d94")];
for (const [name, materialName, hex, file] of [
  ["IEMAI White", "PETG", "#e1e0e3", "iemai-petg-white"],
  ["Justmaker Bronze (Silk)", "PLA", "#796a6f", "justmaker-silk-pla-bronze"],
  ["IEMAI Black", "PETG", "#1d1c1f", "iemai-petg-black"],
  ["Bambu Lab Green", "PLA", "#00a256", "bambu-lab-pla-green"],
] as const) {
  const color: CatalogColorChoice = { id: file, name, materialName, hex, style: hex, mode: "solid" };
  const sample = shelfColorSample(color, "", { brands: [], listings: [] });
  assert.equal(filamentSampleImage(sample!.color), `/filament-swatches/${file}.webp`);
  assert.equal(sample?.exact, true, "Named owner scans must not be replaced with similar-color references");
}
const distinctWhites = shelfColors([
  { id: "white", name: "White", materialName: "PETG", hex: "#ffffff", style: "#ffffff", mode: "solid" },
  { id: "cope-white", name: "CoPE White", materialName: "CoPE", hex: "#efebec", style: "#efebec", mode: "solid" },
  { id: "iemai-white", name: "IEMAI White", materialName: "PETG", hex: "#e1e0e3", style: "#e1e0e3", mode: "solid" },
]);
assert.equal(distinctWhites.length, 3, "The added IEMAI and CoPE whites must remain separate from the existing White");
for (const [name, hex, scan] of [
  ["White", "#ffffff", "polymaker-cope-white"],
  ["CoPE White", "#f4f4f0", "polymaker-cope-white"],
  ["Blue", "#145390", "polymaker-cope-blue"],
] as const) {
  const color: CatalogColorChoice = { id: scan, name, hex, style: hex, mode: "solid", materialName: "CoPE" };
  const before = { ...color };
  const sample = shelfColorSample(color, "PETG", { brands: [], listings: [] });
  assert.equal(filamentSampleImage(sample!.color), `/filament-swatches/${scan}.webp`,
    "CoPE shelf entries must use the supplied scan rather than a nearby PETG sample");
  assert.equal(sample?.exact, true);
  assert.equal(sample?.baseColorOnly, false);
  assert.deepEqual(color, before, "The supplied photo must preserve the shelf selection");
}
for (const material of ["PETG", "PLA", "CPE", "TPU"])
  assert.notEqual(shelfColorSample({ id: "white", name: "White", hex: "#ffffff", style: "#ffffff", mode: "solid" }, material)?.color.id,
    "scan:polymaker-cope-white", "Other white filaments must not inherit the CoPE binding");
assert.equal(shelfColorSample({ id: "cope-white", name: "CoPE White", hex: "#ffffff", style: "#ffffff", mode: "solid" }, "PETG")?.color.id,
  "scan:polymaker-cope-white", "An explicitly named CoPE filament keeps its scan under the PETG family shelf");
const orange: CatalogColorChoice = { id: "orange", name: "Orange", hex: "#e4322f", style: "#e4322f", mode: "solid" };
const orangeBefore = { ...orange };
for (const material of ["PLA", "Satin PLA"]) {
  const sample = shelfColorSample(orange, material, { brands: [], listings: [] });
  assert.equal(filamentSampleImage(sample!.color), "/filament-swatches/panchroma-satin-pla-orange.webp",
    "The owner's Orange shelf entry must use its scan even when the saved hex is closer to a different swatch");
  assert.equal(sample?.exact, true);
  assert.equal(sample?.baseColorOnly, false);
}
assert.equal(shelfColorSample({ ...orange, materialName: "PLA" }, "PETG")?.color.id, "scan:panchroma-satin-pla-orange",
  "Auto uses the shelf entry's own material when selecting its scan");
assert.deepEqual(orange, orangeBefore, "Photo correction must not rewrite the saved color or selection");
for (const material of ["PETG", "TPU", "Silk PLA", "PLA-CF"])
  assert.notEqual(shelfColorSample(orange, material)?.color.id, "scan:panchroma-satin-pla-orange",
    "A different material or finish must not inherit the Satin Orange scan");
for (const mode of ["gradient", "funfetti"] as const)
  assert.notEqual(shelfColorSample({ ...orange, mode }, "PLA")?.color.id, "scan:panchroma-satin-pla-orange");
const choices = shelfColors([
  ...colors,
  { ...colors[0], id: "same-blue", materialName: "PLA", name: "BLUE", hex: "#68CDF3" },
  { ...colors[0], id: "invalid", hex: "not-a-color" },
  { ...colors[0], id: "whatever", mode: "whatever" },
]);
assert.deepEqual(choices.map(color => [color.id, color.detail]), [["petg-blue", "PETG"], ["gf-blue", "PETG-GF"]],
  "The earlier Blue must not hide Frosted Blue; identical shades still collapse");
assert.equal(shelfColors([colors[1]])[0].detail, undefined, "A single material needs no extra label");
const sameHexFinishes: CatalogColorChoice[] = [
  { id: "solid-red", name: "Solid Red", hex: "#ff0000", style: "#ff0000", mode: "solid" },
  { id: "gradient-red", name: "Gradient Red", hex: "#ff0000", style: "linear-gradient(red,blue)", mode: "gradient" },
];
assert.equal(shelfColors(sameHexFinishes.map(color => ({ ...color, name: "Red" }))).length, 2,
  "Identical names and base hexes must keep different finishes");
assert.deepEqual(shelfColors(colors.map(({ materialName: _materialName, ...color }) => color)).map(color => color.detail),
  ["#68cdf3", "#114d94"], "Unknown material labels must still distinguish the shades");

const shelfProduct = (name: string, materialName: string, hex: string, asin: string, mode: CatalogColorChoice["mode"] = "solid"): CatalogColorChoice => ({
  id: asin, name, materialName, hex, style: hex, mode, amazonUrl: `https://www.amazon.com/dp/${asin}`,
});
for (const [color, id] of [
  [shelfProduct("Green", "PLA", "#00ae42", "B0F68ZJ1F1"), 1970],
  [shelfProduct("Funfetti", "PLA", "#dfdfd3", "B0BRTJLMCR", "funfetti"), 1924],
  [shelfProduct("Space grey", "PETG", "#80817e", "B07PGXY9Z3"), 516],
] as const) {
  const before = { ...color };
  const sample = shelfColorSample(color, "", { brands: [], listings: [] });
  assert.equal(printedSwatchId(sample?.color.pageUrl), id);
  assert.equal(sample?.exact, true, "An on-hand filament keeps its exact sample even when its Store brand is disabled");
  assert.deepEqual(color, before, "A photo reference must not rewrite the saved shade or selection");
}
const black = shelfColorSample(shelfProduct("Black", "TPU", "#000000", "B09Q8RR6KD"));
assert.equal(black?.exact, false, "A nearby sample from another maker is labeled as a reference");
assert.equal(black?.color.family, "TPU", "Use the shelf material when it has photographed references");
const fiberReference = shelfColorSample(colors[1]);
assert.equal(fiberReference?.color.family, "PETG with fibre", "A filled filament should use a photographed composite reference when available");
assert.equal(filamentColorType(fiberReference!.color), "Composite");
assert.equal(fiberReference?.baseColorOnly, false, "A composite sample can demonstrate the shelf filament's finish");
assert.equal(fiberReference?.exact, false, "A similar composite sample must still be labeled as a reference");
const gradient = shelfColorSample(shelfProduct("Blue gradient", "PLA", "#99dfea", "B0D5M58Y3Q", "gradient"));
assert.equal(gradient?.baseColorOnly, false, "The scanned Glacier is now an available gradient reference");
assert.equal(gradient?.color.id, "scan:3d-hojor-blue-glacier");
assert.equal(gradient?.exact, true, "The owner identified Blue gradient as the scanned Glacier filament");
const gradientWithoutSample = shelfColorSample(shelfProduct("Blue gradient", "TPU", "#99dfea", "B0D5M58Y3Q", "gradient"));
assert.equal(gradientWithoutSample?.baseColorOnly, true, "A solid sample cannot claim to demonstrate a gradient");
assert.equal(shelfColorSample({ ...colors[0], materialName: "Unknown material" }), null);
assert.equal(shelfColorSample({ ...colors[0], mode: "whatever" }), null);
assert.equal(shelfColorSample({ ...colors[0], hex: "invalid" }), null);
assert.equal(shelfColorSample({ ...colors[0], materialName: undefined }, "PETG")?.color.family, "PETG");
const wrongMaterial = shelfColorSample(shelfProduct("Funfetti", "TPU", "#dfdfd3", "B0BRTJLMCR", "funfetti"));
assert.equal(wrongMaterial?.exact, false, "A matching product URL must not borrow an exact sample from another material");
assert.equal(wrongMaterial?.color.family, "TPU");

// Reusing lookup results must not mix renamed colors, finishes or settings.
const cachedSettings = { brands: [], listings: [] };
const cachedColor = shelfProduct("Blue", "PETG", "#68cdf3", "B012345678");
const cachedSample = shelfColorSample(cachedColor, "", cachedSettings);
assert.equal(shelfColorSample({ ...cachedColor, id: "new-form-object" }, "", cachedSettings), cachedSample,
  "Unrelated form edits should reuse the shelf reference");
for (const changed of [
  { ...cachedColor, materialName: "PLA" },
  { ...cachedColor, name: "Silk Blue" },
  { ...cachedColor, mode: "gradient" as const },
  { ...cachedColor, hex: "#151515" },
  { ...cachedColor, amazonUrl: "https://www.amazon.com/dp/B07PGXY9Z3" },
]) {
  assert.deepEqual(shelfColorSample(changed, "", cachedSettings), shelfColorSample(changed, "", { brands: [], listings: [] }),
    "A changed reference field must match a fresh lookup");
}
assert.notEqual(shelfColorSample(cachedColor, "", { brands: [], listings: [] }), cachedSample,
  "New settings must build fresh references rather than inheriting cached results");

const original = Reflect.get(globalThis, "prisma");
Reflect.set(globalThis, "prisma", {
  catalogColor: { findFirst: async ({ where }: { where: { name: string; hex?: { equals: string; mode: string } } }) => {
    if (where.hex) assert.equal(where.hex.mode, "insensitive");
    const color = [...colors, ...sameHexFinishes].find(color => color.name === where.name && (!where.hex || color.hex.toLowerCase() === where.hex.equals.toLowerCase()));
    return color ? { hex: color.hex, style: color.style, mode: color.mode } : null;
  } },
});
try {
  const { resolveSelection } = await import("../src/lib/catalog-data");
  for (const color of colors) {
    const result = await resolveSelection({ material: "Auto", colorName: "Blue", colorHex: color.hex.toUpperCase(), swatchId: null });
    assert.deepEqual(result, { ok: true, selection: { colorName: "Blue", hex: color.hex, style: color.style, mode: "solid", toBuy: null } },
      "Auto must save the clicked Blue shade rather than the first material's Blue");
  }
  const legacy = await resolveSelection({ material: "Auto", colorName: "Blue", swatchId: null });
  assert.equal(legacy.ok && legacy.selection.hex, colors[0].hex, "Existing clients without a shade remain supported");
  const custom = await resolveSelection({ material: "Auto", colorName: "Blue", colorHex: "#224466", swatchId: null });
  assert.equal(custom.ok && custom.selection.hex, "#224466", "A custom Blue is not replaced by a shelf Blue");
  for (const material of ["Auto", "PLA"]) {
    const color = sameHexFinishes[1];
    const result = await resolveSelection({ material, colorName: color.name, colorHex: color.hex, swatchId: null });
    assert.deepEqual(result, { ok: true, selection: { colorName: color.name, hex: color.hex, style: color.style, mode: color.mode, toBuy: null } },
      "The clicked finish must reach the saved selection even when a solid shares its hex");
  }
  console.info("Shelf colors passed: exact sample identities, labeled material/finish references, disabled Store brands, saved shade preservation, same-name shades, exact Auto snapshots, legacy clients and custom colors.");
} finally {
  Reflect.set(globalThis, "prisma", original);
}
