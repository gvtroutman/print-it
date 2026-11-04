import assert from "node:assert/strict";
import { filamentPurchaseOptions, lowestFilamentPurchase, savedPurchaseOptions } from "../src/lib/filament-purchases";
import { cheapestFilamentListing } from "../src/lib/filament-purchase-selection";
import { configuredFilamentRecords, SOURCE_FILAMENT_COLORS } from "../src/lib/filament-settings-data";
import { DEFAULT_FILAMENT_SETTINGS } from "../src/lib/filament-brands";
import { filamentSizeListings } from "./lib/filament-size-listings";
import { combineFilamentColors, type FilamentColor } from "../src/lib/filament-palette-data";
import type { AmazonProduct } from "../src/lib/amazon-product";

const urls = ["B011111111", "B022222222", "B033333333", "B044444444"].map(asin => `https://www.amazon.com/dp/${asin}`);
const options = filamentPurchaseOptions(urls[0], urls.map((url, i) => ({ url, label: ["1 kg spool", "500 g roll", "250 g × 8 pack", "5 m pen refill"][i]! })));
const priced = (amounts: (number | null)[]): AmazonProduct[] => amounts.map((amount, i) => ({ url: urls[i]!, status: "ready", checkedAt: new Date().toISOString(), image: null, price: amount === null ? null : { amount, currency: "USD" } }));
assert.equal(lowestFilamentPurchase(options, priced([18, 12, 32, 6])).option?.url, urls[3], "Pen refill should win on total spend");
assert.equal(lowestFilamentPurchase(options, priced([18, 12, 32, null])).option?.url, urls[1], "Half roll beats quarter-roll bundle at its FULL price");
assert.equal(lowestFilamentPurchase(options, priced([8, 12, 32, 9])).option?.url, urls[0], "A discounted 1 kg roll can still be cheapest");
assert.equal(lowestFilamentPurchase(options, priced([null, null, null, null])).option?.url, urls[0]);
assert.equal(lowestFilamentPurchase(options, priced([18, 12, 32, null])).complete, false);
assert.equal(lowestFilamentPurchase(options, priced([18, 12, 32, 6])).complete, true);
const blocked = priced([18, 12, 32, 1]); blocked[3]!.status = "blocked";
assert.equal(lowestFilamentPurchase(options, blocked).option?.url, urls[1]);
const currencies = priced([18, 12, 32, 1]); currencies[3]!.price!.currency = "CAD";
assert.equal(lowestFilamentPurchase(options, currencies).compared, 0, "Do not compare incompatible currencies");
assert.equal(filamentPurchaseOptions(urls[0], [{ url: urls[0]!, label: "1 kg" }, { url: "https://www.amazon.ca/dp/B022222222", label: "500 g" }]).length, 1);
assert.deepEqual(savedPurchaseOptions([{ url: "https://example.com", label: "500 g" }]), []);

const sizeData = [
  { id: "kg", variant_id: "red", filament_weight: 1000, diameter: 1.75 },
  { id: "half", variant_id: "red", filament_weight: 500, diameter: 1.75, spool_refill: true },
  { id: "quarter", variant_id: "red", filament_weight: 250, diameter: 1.75 },
  { id: "wide", variant_id: "red", filament_weight: 100, diameter: 2.85 },
  { id: "old", variant_id: "red", filament_weight: 50, diameter: 1.75, discontinued: true },
  { id: "blue", variant_id: "blue", filament_weight: 250, diameter: 1.75 },
];
const links = sizeData.map((size, i) => ({ size_id: size.id, url: `source-${i}` }));
const resolved = new Map(links.map((link, i) => [link.url, `https://www.amazon.com/dp/B00000000${i}`]));
const packages = filamentSizeListings(sizeData, links, resolved);
assert.deepEqual(packages.get("red")?.map(option => option.label), ["250 g spool", "500 g refill", "1 kg spool"]);
assert.equal(packages.get("blue")?.length, 1, "Different colors keep separate package choices");

const measured: FilamentColor = { id: "fcx:1", maker: "Example", name: "Red", type: "PLA", product: "PLA", hex: "#ff0000", family: "PLA", source: "filamentcolors", translucent: false, pageUrl: "https://example.com", amazonUrl: urls[0] };
const listed: FilamentColor = { ...measured, id: "ofd:red", source: "openfilamentdatabase", purchaseOptions: options };
assert.equal(combineFilamentColors([measured], [listed]).swatches[0]?.purchaseOptions?.length, 4, "Combining sources must preserve package sizes");
const catalog = configuredFilamentRecords(DEFAULT_FILAMENT_SETTINGS);
assert.ok(catalog.some(color => color.purchaseOptions?.some(option => /250 g/.test(option.label))));
assert.ok(catalog.some(color => color.purchaseOptions?.some(option => /500 g/.test(option.label))));
assert.ok(!SOURCE_FILAMENT_COLORS.find(color => color.maker === "SUNLU" && color.product === "TPU" && color.name === "Black")?.purchaseOptions?.length, "Small PLA packages must never attach to TPU");

const original = globalThis.fetch;
globalThis.fetch = async input => {
  const asin = new URL(String(input)).pathname.split("/").at(-1)!;
  const amount = [18, 12, 32, 6][urls.findIndex(url => url.endsWith(asin))];
  return new Response(`<input id="ASIN" value="${asin}"><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$${amount}</span></span></div>`, { headers: { "content-type": "text/html" } });
};
try { assert.equal(await cheapestFilamentListing(urls[0]!, options), urls[3], "Authoritative ticket selection must use the same cheapest link"); }
finally { globalThis.fetch = original; }
console.log("Filament packages verified: half/quarter rolls, pen refills, full bundle costs, availability, currency/marketplace boundaries, exact variants, source merging and authoritative purchase links.");
