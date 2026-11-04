import assert from "node:assert/strict";
import { FILAMENT_COLOR_TYPES, filamentColorType, filamentColorStyle, filamentColorName } from "../src/lib/filament-color-types";
import { recordedSwatchId } from "../src/lib/filament-ids";
import { buyableFilamentBrand, FILAMENT_BRANDS, type FilamentSettings } from "../src/lib/filament-brands";
import { adminSwatchId } from "../src/lib/filament-ids";
import { filamentPaletteFor, colorNameOf } from "../src/lib/color-names";
import { SOURCE_FILAMENT_COLORS, configuredFilamentRecords, recordedSwatchChoice } from "../src/lib/filament-settings-data";

const glacier = { name: "Glacier", maker: "3DHoJor", type: "PLA", product: "Multi Rainbow Color Gradient Change PLA",
  hex: "#64cddd", colorType: "Multi Color" as const };
const glacierStyle = "linear-gradient(135deg, #35b8d9, #99dfea, #effbfc)";
assert.equal(filamentColorType(glacier), "Gradient", "Glacier must override misleading product wording and old type metadata");
assert.equal(filamentColorStyle(glacier), glacierStyle);
assert.equal(filamentColorName(glacier), "Glacier (Gradient)");
assert.equal(filamentColorStyle({ ...glacier, maker: "3d-hojor", name: " Glacier (w/ Fan) " }), glacierStyle);
assert.equal(filamentColorType({ ...glacier, maker: "Polymaker" }), "Multi Color");
assert.equal(filamentColorType({ ...glacier, name: "Rainbow" }), "Multi Color");
assert.equal(filamentColorType({ ...glacier, type: "PETG" }), "Multi Color");

// Exercise the real library parsers, primary/fallback search, and submission
// validation without calling live services or changing an owner's catalog.
const primary = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, maker: "Unapproved Fixture", name: `Link fixture red ${i}` })),
  ...["Elegoo", "Bambu Lab", "eSUN 3D", "Panchroma", "PINBALL", "Jayo", "CookieCad", "Voxelab"]
    .map((maker, i) => ({ id: i + 21, maker, name: "Link fixture red" })),
  { id: 29, maker: "SUNLU", name: "Unlisted fixture red" },
  { id: 30, maker: "SUNLU", name: "Unphotographed fixture red" },
  { id: 31, maker: "GEEETECH", name: "Link fixture red" },
  ...["Hatchbox", "Proto-pasta", "PRUSAMENT", "ColorFabb", "Matterhackers"]
    .map((maker, i) => ({ id: i + 32, maker, name: "Link fixture red" })),
].map(({ id, maker, name }) => ({
  id, manufacturer: { name: maker }, color_name: name, hex_color: "ff0000",
  filament_type: { name: "PLA" }, published: true, is_available: true,
  amazon_purchase_link: id === 29 ? null : `https://www.amazon.com/dp/B000TEST${String(id).padStart(2, "0")}?tag=example`,
  mfr_purchase_link: "https://example.com/filament",
  image_front: id === 30 ? null : `https://filamentcolors.xyz/media/fixture-${id}.jpg`,
}));
const fallback = [
  { manufacturer: "IEMAI", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "eSUN 3D", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Panchroma", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "PINBALL", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Jayo", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "CookieCad", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Voxelab", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Prusament", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Unapproved Fixture", name: "Red", material: "PLA", color_hex: "ff0000" },
  { manufacturer: "Overture", name: "Blue", material: "PETG", color_hex: "0000ff" },
].map(spool => ({ ...spool, name: `Unlisted Amazon fixture ${spool.name}` }));
let fallbackRequests = 0;
const originalFetch = globalThis.fetch;
const originalPrisma = Reflect.get(globalThis, "prisma");
let settings: FilamentSettings = {
  brands: FILAMENT_BRANDS.map((brand, i) => ({ ...brand, id: `brand-${i}`, active: true })), listings: [],
};
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("https://filamentcolors.xyz/api/swatch/"))
    return Response.json({ count: primary.length, results: primary });
  if (url === "https://donkie.github.io/SpoolmanDB/filaments.json") {
    fallbackRequests++;
    return Response.json(fallback);
  }
  throw new Error(`Unexpected network request: ${url}`);
};
// Only the available-material lookup is needed for a spool submitted by id.
Reflect.set(globalThis, "prisma", {
  catalogMaterial: { findFirst: async () => ({ name: "PLA" }) },
  filamentBrand: { findMany: async () => settings.brands.map(brand => ({ ...brand,
    listings: settings.listings.filter(link => link.brandId === brand.id) })) },
});

try {
  const { librarySwatch, searchLibrary } = await import("../src/lib/filament-library");
  const { resolveSelection, SELECTION_REFUSAL } = await import("../src/lib/catalog-data");
  const result = await searchLibrary("PLA");
  assert.equal(fallbackRequests, 0, "Sparse market searches must not fetch unswatched fallback listings");
  assert.equal(result.total, 14, "Search totals must exclude unapproved brands, unlisted spools and other materials");
  assert.equal(result.swatches.length, 14);
  assert.ok(result.swatches.every(s => buyableFilamentBrand(s.maker)));
  assert.ok(result.swatches.some(s => s.id > 0 && s.maker === "Elegoo"));
  assert.ok(result.swatches.every(s => s.buyUrl?.startsWith("https://www.amazon.com/dp/")));
  assert.ok(result.swatches.every(s => s.id > 0), "Fallback spools with no exact Amazon listing must be hidden");
  assert.ok(result.swatches.every(s => s.imageUrl || s.photoUrl), "Unphotographed records must be hidden before search totals");
  assert.ok(result.swatches.some(s => s.maker === "eSUN 3D"));
  assert.ok(result.swatches.some(s => s.maker === "Panchroma"));
  assert.ok(result.swatches.some(s => s.maker === "PINBALL"));
  assert.ok(result.swatches.some(s => s.maker === "Jayo"));
  assert.ok(result.swatches.some(s => s.maker === "CookieCad"));
  assert.ok(result.swatches.some(s => s.maker === "Bambu Lab"));
  assert.ok(result.swatches.some(s => s.maker === "Voxelab"));
  assert.ok(result.swatches.some(s => s.maker === "GEEETECH"));
  for (const maker of ["Hatchbox", "Proto-pasta", "PRUSAMENT", "ColorFabb", "Matterhackers"]) {
    assert.ok(result.swatches.some(s => s.maker === maker), `${maker}: added brand must appear in store results`);
    const found = await searchLibrary("PLA", { query: maker, near: "#ff0000" });
    assert.equal(found.total, 1, `${maker}: added brand must be searchable`);
    assert.equal(found.swatches[0]?.maker, maker);
  }
  for (const query of ["Unapproved Fixture", "Unknown Maker"]) {
    const found = await searchLibrary("PLA", { query, near: "#ff0000" });
    assert.equal(found.total, 0, `${query}: a query/nearest-color fallback must not reintroduce excluded makers`);
    assert.deepEqual(found.swatches, []);
  }
  const nearest = await searchLibrary("PLA", { near: "#ff0000", clear: true });
  assert.equal(nearest.total, 14);
  assert.ok(nearest.swatches.every(s => buyableFilamentBrand(s.maker)));
  const petg = await searchLibrary("PETG");
  assert.equal(petg.total, 0, "A material with no linked spool must remain empty");

  assert.ok(await librarySwatch(1), "Raw library lookup must retain records for historical references");
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: 1 }), { ok: false, reason: "brand" });
  assert.equal(SELECTION_REFUSAL.brand.status, 400);
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: 29 }), { ok: false, reason: "listing" });
  assert.equal(SELECTION_REFUSAL.listing.status, 400);
  for (const swatch of result.swatches) {
    const resolved = await resolveSelection({ material: "PLA", colorName: "Forged color", swatchId: swatch.id });
    assert.ok(resolved.ok, `${swatch.maker}: approved spool refused`);
    assert.equal(resolved.selection.toBuy?.swatchMaker, swatch.maker);
    assert.equal(resolved.selection.colorName, swatch.name);
  }
  const { spoolmanSwatches } = await import("../src/lib/spoolman-library");
  const fallbackSwatches = [...(await spoolmanSwatches()).values()];
  const unlistedPrusament = fallbackSwatches.find(s => s.maker === "Prusament")!;
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: unlistedPrusament.id }), { ok: false, reason: "listing" });
  const deniedFallback = fallbackSwatches.find(s => s.maker === "Unapproved Fixture")!;
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: deniedFallback.id }), { ok: false, reason: "brand" });
  const originalSettings = settings;
  for (const type of FILAMENT_COLOR_TYPES) {
    const palette = filamentPaletteFor("PLA", settings, type);
    const result = await searchLibrary("PLA", { colorType: type });
    assert.ok(result.swatches.every(s => filamentColorType(s) === type), `${type}: search mixed finishes`);
    for (const color of palette.colors) {
      const automatic = await resolveSelection({ material: "Auto", colorName: "Forged", colorHex: "#ffffff", swatchId: null, filamentColorId: color.id });
      assert.ok(automatic.ok);
      assert.equal(automatic.selection.hex, color.hex, "Auto must read the source instead of trusting submitted color data");
      assert.equal(automatic.selection.style, filamentColorStyle(color));
      if (color.source !== "openfilamentdatabase") continue;
      const resolved = await resolveSelection({ material: "PLA", colorName: "Forged", swatchId: recordedSwatchId(color.id) });
      assert.ok(resolved.ok);
      assert.equal(resolved.selection.hex, color.hex);
      assert.equal(resolved.selection.style, filamentColorStyle(color));
      assert.equal(resolved.selection.toBuy?.swatchBuyUrl, color.amazonUrl);
    }
  }
  const glacierBrand = settings.brands.find(brand => brand.name === "3DHoJor")!;
  settings = { ...originalSettings, listings: [{ id: 3, brandId: glacierBrand.id!, sourceId: null,
    name: glacier.name, type: glacier.type, product: glacier.product, hex: glacier.hex,
    amazonUrl: "https://www.amazon.com/dp/B000TEST03", active: true }] };
  const glacierColor = filamentPaletteFor("PLA", settings, "Gradient").colors.find(color => color.id === "admin:3");
  assert.equal(glacierColor?.id, "admin:3", "The owner's scanned Glacier sample must enable its exact existing listing");
  assert.equal(recordedSwatchChoice(glacierColor!).image, "/filament-swatches/3d-hojor-blue-glacier.webp");
  assert.ok(!filamentPaletteFor("PLA", settings, "Multi Color").colors.some(color => color.id === "admin:3"));
  const glacierSearch = await searchLibrary("PLA", { query: "Glacier 3DHoJor", colorType: "Gradient" });
  assert.equal(glacierSearch.total, 1, "A listed Glacier filament with an owner scan must appear in market search");
  assert.equal(glacierSearch.swatches[0]?.sampleImage, "/filament-swatches/3d-hojor-blue-glacier.webp");
  for (const wish of [
    { material: "Auto", colorName: "Forged", swatchId: null, filamentColorId: "admin:3" },
    { material: "PLA", colorName: "Forged", swatchId: adminSwatchId(3) },
  ]) {
    const resolved = await resolveSelection(wish);
    assert.ok(resolved.ok);
    assert.equal(resolved.selection.mode, "gradient");
    assert.equal(resolved.selection.style, glacierStyle);
    assert.equal(resolved.selection.colorName, "Glacier (Gradient)");
    assert.equal(resolved.selection.hex, glacier.hex, "The preview correction must retain the listing's base hex");
  }
  settings = originalSettings;
  assert.deepEqual(await resolveSelection({ material: "Auto", colorName: "Forged", swatchId: null, filamentColorId: "ofd:missing" }), { ok: false, reason: "gone" });
  const bundled = SOURCE_FILAMENT_COLORS.find(s => s.source === "openfilamentdatabase")!;
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: recordedSwatchId(bundled.id) }, { brands: [], listings: [] }), { ok: false, reason: "gone" });
  const elegoo = settings.brands.find(brand => brand.name === "ELEGOO")!;
  settings = { ...settings, listings: [{ id: 2, brandId: elegoo.id!, sourceId: "fcx:21", name: "Link fixture red", type: "PLA", product: "PLA",
    hex: "#ff0000", amazonUrl: "https://www.amazon.com/dp/B087654321", active: true }] };
  assert.equal((await librarySwatch(21))?.buyUrl, settings.listings[0]!.amazonUrl);
  settings = { ...settings, brands: [...settings.brands.map(brand => brand.id === elegoo.id ? { ...brand, name: "Renamed brand" } : brand),
    { id: "new-elegoo", name: "ELEGOO", aliases: [], active: true }] };
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: 21 }), { ok: false, reason: "listing" },
    "Transferring a catalog brand name must not transfer another brand's admin listing");
  settings = originalSettings;
  settings = { brands: [...settings.brands, { id: "custom", name: "Fixture Filament", aliases: ["Fixture Maker"], active: true }],
    listings: [{ id: 1, brandId: "custom", sourceId: null, name: "My violet", type: "PLA", product: "PLA Pro",
      hex: "#ca2345", amazonUrl: "https://www.amazon.com/dp/B012345678", active: true }] };
  const added = await searchLibrary("PLA", { query: "Fixture Filament" });
  assert.equal(added.total, 0, "An unlinked admin listing must stay out of market search");
  assert.ok(!filamentPaletteFor("PLA", settings).colors.some(color => color.id === "admin:1"));
  const resolved = await resolveSelection({ material: "PLA", colorName: "Forged", swatchId: adminSwatchId(1) });
  assert.ok(resolved.ok);
  assert.equal(resolved.selection.colorName, "My violet");
  assert.equal(resolved.selection.toBuy?.swatchBuyUrl, settings.listings[0]!.amazonUrl);
  const sample = SOURCE_FILAMENT_COLORS.find(color => color.id.startsWith("fcx:") && color.family === "PLA" && !color.translucent)!;
  settings = { ...settings, listings: settings.listings.map(link => ({ ...link, sourceId: sample.id })) };
  const linkedSearch = await searchLibrary("PLA", { query: "Fixture Filament" });
  assert.equal(linkedSearch.total, 1, "A custom listing linked to a printed sample must remain available");
  assert.equal(linkedSearch.swatches[0]?.id, adminSwatchId(1));
  assert.equal(linkedSearch.swatches[0]?.pageUrl, sample.pageUrl);
  const linkedColor = configuredFilamentRecords(settings).find(color => color.id === "admin:1")!;
  assert.equal(recordedSwatchChoice(linkedColor).image, `/api/filament-library/${recordedSwatchId(sample.id)}/image?v=3`);
  assert.equal(filamentPaletteFor("PLA", settings).nearest("#ca2345")?.id, "admin:1");
  settings = { ...settings, brands: settings.brands.map(brand => brand.id === "custom" ? { ...brand, active: false } : brand) };
  assert.equal((await searchLibrary("PLA", { query: "Fixture Filament" })).total, 0, "Disabling a brand must invalidate cached searches immediately");
  assert.equal(filamentPaletteFor("PLA", settings).colors.some(color => color.source === "admin"), false);
  assert.deepEqual(await resolveSelection({ material: "PLA", colorName: "", swatchId: adminSwatchId(1) }), { ok: false, reason: "gone" });
  settings = { ...settings, brands: settings.brands.map(brand => ({ ...brand, active: true })), listings: settings.listings.map(link => ({ ...link, active: false })) };
  assert.equal((await searchLibrary("PLA", { query: "Fixture Filament" })).total, 0, "Disabling a listing must hide it independently of the brand");
  settings = { brands: [], listings: [] };
  assert.equal((await searchLibrary("PLA")).total, 0, "Clearing brands must not reactivate the hardcoded defaults");
  assert.equal(filamentPaletteFor(null, settings).colors.length, 0);
  assert.equal(colorNameOf("#ABCDEF", 1, settings), "#abcdef", "An older selection must remain usable when the picker is empty");
  console.log("Filament brands verified: source filtering, database settings, custom brands/listings, Amazon URLs, immediate disable behavior, empty settings, authoritative submissions, and historical lookup.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalPrisma === undefined) Reflect.deleteProperty(globalThis, "prisma");
  else Reflect.set(globalThis, "prisma", originalPrisma);
}
