import assert from "node:assert/strict";
import { resolveAmazonListing } from "./lib/resolve-amazon-listing";

const urls = ["B011111111", "B022222222", "B033333333", "B044444444", "B055555555"]
  .map(asin => `https://www.amazon.com/dp/${asin}`);
const colors = [
  { id: "available", name: "Blue", hex: "#2787c9", style: "#2787c9", mode: "solid", amazonUrl: urls[0], active: true, material: { active: true } },
  { id: "disabled-color", amazonUrl: urls[1], active: false, material: { active: true } },
  { id: "disabled-material", amazonUrl: urls[2], active: true, material: { active: false } },
];
const original = Reflect.get(globalThis, "prisma");
let reads = 0;
Reflect.set(globalThis, "prisma", {
  catalogColor: { findMany: async ({ where, select }: { where: { amazonUrl: { in: string[] }; active?: boolean; material?: { active: boolean } }; select: { amazonUrl: boolean } }) => {
    reads++;
    assert.equal(select.amazonUrl, true);
    return colors.filter(color => where.amazonUrl.in.includes(color.amazonUrl!)
      && (where.active === undefined || color.active === where.active)
      && (!where.material || color.material.active === where.material.active));
  } },
  filamentBrand: { findMany: async () => [{ id: "brand", name: "Fixture", aliases: [], active: true,
    logoData: null, updatedAt: new Date(), listings: [{ id: 1, brandId: "brand", sourceId: null, name: "Red",
      hex: "#ff0000", type: "PLA", product: "PLA", amazonUrl: urls[3], active: true, purchaseOptions: [] }] }] },
  catalogMaterial: { findMany: async ({ where, select }: { where: { active: boolean; colors: { some: { active: boolean } } }; select: { colors: { select: { amazonUrl: boolean } } } }) => {
    assert.equal(where.active, true);
    assert.equal(where.colors.some.active, true);
    assert.equal(select.colors.select.amazonUrl, true, "The request form must receive the saved shelf photo link");
    return [{ id: "pla", name: "PLA", description: "", strength: null, flex: null, heat: null, finish: null, outdoors: null,
      colors: [colors[0]] }];
  } },
});
try {
  const { allowedAmazonListings } = await import("../src/lib/amazon-product-access");
  const { availableCatalog } = await import("../src/lib/catalog-data");
  assert.equal((await availableCatalog())[0].colors[0].amazonUrl, urls[0]);
  assert.equal(await allowedAmazonListings([urls[0]], false), true, "An available shelf link needs no buying-catalog entry");
  for (const url of [urls[1], urls[2], urls[4]]) assert.equal(await allowedAmazonListings([url], false), false);
  assert.equal(await allowedAmazonListings([urls[1], urls[2]], true), true, "Admins can preview disabled shelf photos");
  assert.equal(await allowedAmazonListings([urls[4]], true), false, "Admin previews still require a saved link");
  assert.equal(await allowedAmazonListings([urls[3]], false), true, "Buying-catalog photos still work");
  const before = reads;
  assert.equal(await allowedAmazonListings(["https://evil.example/image.jpg"], true), false);
  assert.equal(await allowedAmazonListings([`${urls[0]}?tracking=1`], false), false);
  assert.equal(await allowedAmazonListings([], false), true);
  assert.equal(reads, before, "Noncanonical or empty requests should not reach the database");
  assert.equal(await resolveAmazonListing(`${urls[0]}?th=1&tracking=1`), urls[0]);
  assert.equal(await resolveAmazonListing("https://www.amazon.com/s?k=blue+filament"), null);
  assert.equal(await resolveAmazonListing("https://evil.example/image.jpg"), null);
  const request: typeof fetch = async () => new Response(null, { status: 302, headers: { location: urls[0] } });
  assert.equal(await resolveAmazonListing("https://a.co/d/shelf", request), urls[0]);
  console.info("Shelf photos passed: saved links in the request form, shelf-only access, disabled color/material restrictions, admin previews, buying-catalog compatibility, canonical links and Amazon share links.");
} finally { Reflect.set(globalThis, "prisma", original); }
