import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { amazonProducts, amazonResponseBytes } from "../src/lib/amazon-products";
import { readAmazonPage } from "../src/lib/amazon-page";
import { amazonImageUrl, amazonPriceText } from "../src/lib/amazon-product";
import { amazonListingUrl } from "../src/lib/amazon-listing";
import { brandLogoUpload } from "../src/lib/brand-logo-upload";
import { FILAMENT_BRANDS, filamentBrandKey } from "../src/lib/filament-brands";
import { filamentBrandLogo } from "../src/lib/filament-brand-logos";
import { filamentTypeFromText } from "../src/lib/amazon-filament-details";
import { catalogHexForProduct } from "../src/lib/filament-import-data";
import { importFilamentDetails } from "../src/lib/filament-import";
import { estimateFilamentPhotoHex } from "../src/lib/filament-photo-color";
import type { FilamentColor } from "../src/lib/filament-palette-data";

const image = "https://m.media-amazon.com/images/I/fixture._SL160_.jpg";
const url = "https://www.amazon.com/dp/B012345678";
const asin = "B012345678";
const checked = "2026-10-12T12:00:00Z";
const money = (price: string, more = "") => `<div ${more}><span class="a-price"><span class="a-offscreen">${price}</span></span></div>`;
const page = (id = asin, content = money("$19.99")) => `<title>Amazon product</title><input id="ASIN" value="${id}"><img id="landingImage" src="${image}"><div id="corePriceDisplay_desktop_feature_div">${content}</div>`;
const parsed = (html: string, link = url) => readAmazonPage(html, link, checked);
assert.deepEqual(parsed(page()).price, { amount: 19.99, currency: "USD" });
assert.equal(amazonPriceText(parsed(page())), "USD 19.99");
assert.equal(parsed(page()).imageUrl, image);
assert.equal(parsed(page("B999999999")).price, null, "Never use a parent or different variant's price");
assert.equal(parsed(`<link rel="canonical" href="https://www.amazon.com/dp/B999999999">${page()}`).price?.amount, 19.99, "Selected ASIN outranks Amazon's parent canonical link");
assert.equal(parsed(`<link rel="canonical" href="${url}">${money("$9.99", 'id="recommendations"')}`).price, null, "Recommendation prices must not be read");
assert.equal(parsed(page(asin, money("$5.99", 'id="subscriptionPrice"') + money("$19.99"))).price?.amount, 19.99);
assert.equal(parsed(page(asin, money("$5.99", 'id="snsDetailPagePrice"'))).price, null);
assert.equal(parsed(page(asin, `<div>Prime-exclusive ${money("$5.99")}</div>`)).price, null);
assert.equal(parsed(page(asin, '<span class="a-price a-text-price"><span class="a-offscreen">$999.99</span></span>' + money("$19.99"))).price?.amount, 19.99);
assert.equal(parsed(page(asin, money("$3.99", 'hidden'))).price, null);
assert.equal(parsed(page(asin, money("-$19.99"))).price, null);
assert.equal(parsed(page(asin, money("From $19.99"))).price, null);
assert.equal(parsed(page(asin, money("$12.34.56"))).price, null);
assert.equal(parsed(page() + '<div id="availability">Currently unavailable.</div>').price, null);
assert.equal(parsed(page(asin, '<span class="a-price"><span class="a-offscreen"></span><span class="a-price-symbol">$</span><span class="a-price-whole">19.</span><span class="a-price-fraction">99</span></span>')).price?.amount, 19.99, "Modern split whole/fraction markup must work");
assert.deepEqual(parsed(page(asin, money("1.234,56 €")), "https://www.amazon.de/dp/B012345678").price, { amount: 1234.56, currency: "EUR" });
assert.deepEqual(parsed(page(asin, money("$19.99")), "https://www.amazon.ca/dp/B012345678").price, { amount: 19.99, currency: "CAD" });
assert.equal(parsed(page(asin, money("$19.99")), "https://www.amazon.de/dp/B012345678").price, null, "Do not guess EUR from an ambiguous dollar symbol");
const structured = `<script type="application/ld+json">${JSON.stringify({ "@graph": [
  { "@type": "Product", sku: "B999999999", offers: { "@type": "Offer", price: 1, priceCurrency: "USD" } },
  { "@type": "Product", sku: asin, image, offers: { "@type": "Offer", price: "21.49", priceCurrency: "USD", availability: "https://schema.org/InStock" } },
] })}</script>`;
assert.deepEqual(parsed(structured).price, { amount: 21.49, currency: "USD" });
assert.equal(parsed(structured).imageUrl, image);
const specs = '<span id="productTitle">Fixture Matte PLA+ Filament</span><table id="productOverview_feature_div"><tr><td>Material</td><td>Polylactic Acid</td></tr><tr><td>Color</td><td>1kg Ruby</td></tr><tr><td>Hex Code</td><td>C02040</td></tr></table>';
const detailed = parsed(page() + specs);
assert.deepEqual(detailed.filament, { title: "Fixture Matte PLA+ Filament", type: "Matte PLA+", colorName: "Ruby", hex: "#c02040" });
assert.equal(parsed(page("B999999999") + specs).filament, null);
assert.equal(parsed(page() + '<div id="reviews">PETG Carbon Fiber #00ffff</div>').filament?.type, null);
assert.equal(filamentTypeFromText("", "PLA / PETG / ABS printer compatibility"), null);
assert.equal(filamentTypeFromText("Nylon", "PA6-CF Filament"), "Nylon-CF");
assert.equal(filamentTypeFromText("PETG", "PETG-GF Filament"), "PETG-GF");
assert.equal(filamentTypeFromText("", "Silk PLA Filament"), "Silk PLA");
const catalogProduct = parsed(page() + specs.replace('<tr><td>Hex Code</td><td>C02040</td></tr>', ''));
const brand = { name: "Fixture", aliases: [] };
const color: FilamentColor = { id: "fixture", name: "Ruby", maker: "Fixture", type: "Matte PLA+", product: "Matte PLA+", hex: "#b02244", family: "PLA", source: "openfilamentdatabase", translucent: false, pageUrl: url, amazonUrl: url };
assert.equal(catalogHexForProduct(catalogProduct, brand, [color]), color.hex);
for (const mismatch of [{ ...color, name: "Blue" }, { ...color, maker: "Other brand" }, { ...color, type: "PETG" }, { ...color, type: "PLA", product: "PLA" }, { ...color, translucent: true }, { ...color, amazonUrl: "https://www.amazon.com/dp/B999999999" }])
  assert.equal(catalogHexForProduct(catalogProduct, brand, [mismatch]), null);
assert.equal(catalogHexForProduct(catalogProduct, brand, [color, { ...color, hex: "#c03055" }]), null);
assert.equal((await importFilamentDetails(detailed, brand, [])).hexSource, "listing");
assert.equal((await importFilamentDetails(catalogProduct, brand, [color])).hexSource, "catalog");
assert.equal(parsed('<title>Robot Check</title><form action="/errors/validateCaptcha"></form>' + page()).status, "blocked");
assert.equal(parsed(page().replace(image, "https://evil.example/logo.jpg")).imageUrl, null);
for (const unsafe of ["https://evil.example/images/I/logo.jpg", "https://m.media-amazon.com.evil.example/images/I/logo.jpg", "https://m.media-amazon.com:8443/images/I/logo.jpg", "http://m.media-amazon.com/images/I/logo.jpg", "https://m.media-amazon.com/images/I/logo.svg"])
  assert.equal(amazonImageUrl(unsafe), null);

const originalFetch = globalThis.fetch; const originalNow = Date.now;
let clock = originalNow(); Date.now = () => clock;
let calls = 0; let active = 0; let maximum = 0; let failed = false;
globalThis.fetch = async (input, init) => {
  const request = String(input); calls++;
  assert.ok(amazonListingUrl(request), "All requests must be direct Amazon pages, without an API call");
  assert.equal(init?.redirect, "manual"); assert.ok(init?.signal);
  active++; maximum = Math.max(maximum, active);
  await new Promise(resolve => setTimeout(resolve, 2)); active--;
  return failed ? new Response(null, { status: 503 }) : new Response(page(new URL(request).pathname.split("/").at(-1)), { headers: { "content-type": "text/html; charset=utf-8" } });
};
try {
  const urls = Array.from({ length: 8 }, (_, i) => `https://www.amazon.com/dp/B${String(i).padStart(9, "0")}`);
  const [first, second] = await Promise.all([amazonProducts([...urls, urls[0]]), amazonProducts(urls)]);
  assert.equal(first.length, 8); assert.deepEqual(first, second); assert.equal(calls, 8); assert.equal(maximum, 2);
  assert.ok(first[0].image?.startsWith("/api/amazon-products/image?listing="));
  await amazonProducts(["https://evil.example/dp/B012345678"]); assert.equal(calls, 8);
  clock += 16 * 60_000; failed = true;
  const expired = await amazonProducts([urls[0]]); assert.equal(expired[0].price, null); assert.equal(expired[0].status, "blocked");
  await amazonProducts([urls[0], "https://www.amazon.com/dp/B888888888"]); assert.equal(calls, 9, "Back off after a blocked page and never show an expired price");
  clock += 6 * 60_000; failed = false;
  assert.equal((await amazonProducts([urls[0]]))[0].price?.amount, 19.99); assert.equal(calls, 10);
  let redirectCalls = 0;
  globalThis.fetch = async (input) => {
    redirectCalls++;
    return redirectCalls === 1 ? new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } })
      : new Response(page(), { headers: { "content-type": "text/html" } });
  };
  assert.equal((await amazonProducts(["https://www.amazon.fr/dp/B012345678"]))[0].status, "unavailable"); assert.equal(redirectCalls, 1);
  redirectCalls = 0;
  globalThis.fetch = async () => {
    redirectCalls++;
    return redirectCalls === 1 ? new Response(null, { status: 302, headers: { location: `/Product/dp/${asin}` } })
      : new Response(page(), { headers: { "content-type": "text/html" } });
  };
  assert.equal((await amazonProducts(["https://www.amazon.ca/dp/B012345678"]))[0].price?.currency, "CAD"); assert.equal(redirectCalls, 2);
  await assert.rejects(amazonResponseBytes(new Response(new Uint8Array(1025)), 1024), /too large/);
  assert.equal((await amazonResponseBytes(new Response("hello"), 5)).length, 5);

  const png = await sharp({ create: { width: 600, height: 300, channels: 3, background: "#2787c9" } }).png().toBuffer();
  assert.equal(await estimateFilamentPhotoHex(png, "Blue"), "#2787c9");
  assert.equal(await estimateFilamentPhotoHex(png, "Red"), null, "A mismatched image must not import the wrong color");
  const white = await sharp({ create: { width: 96, height: 96, channels: 3, background: "#ffffff" } }).png().toBuffer();
  assert.equal(await estimateFilamentPhotoHex(white, "Blue"), null, "A white background cannot invent a filament hex");
  globalThis.fetch = async input => { assert.equal(String(input), image); return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } }); };
  const estimated = await importFilamentDetails({ ...catalogProduct, filament: { ...catalogProduct.filament!, colorName: "Blue" } }, brand, []);
  assert.equal(estimated.hex, "#2787c9"); assert.equal(estimated.hexSource, "image");
  assert.equal((await importFilamentDetails({ ...catalogProduct, filament: { ...catalogProduct.filament!, colorName: "Red + Blue", title: "Dual color PLA filament" } }, brand, [])).hex, null);
  const encoded = await brandLogoUpload(new File([new Uint8Array(png)], "logo.png"));
  const metadata = await sharp(Buffer.from(encoded.slice(23), "base64")).metadata();
  assert.equal(metadata.format, "webp"); assert.ok(metadata.width! <= 256 && metadata.height! <= 128);
  await assert.rejects(brandLogoUpload(new File(["<svg xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2'/></svg>"], "logo.svg")), /valid, still/);
  await assert.rejects(brandLogoUpload(new File([new Uint8Array(256 * 1024 + 1)], "logo.png")), /under 256 KB/);
  const sources = JSON.parse(await readFile("public/filament-brands/sources.json", "utf8"));
  assert.equal(Object.keys(sources.logos).length, FILAMENT_BRANDS.length); assert.ok(sources.logos.polymaker.source.includes("Polymaker_logo"));
  assert.ok(sources.logos.geeetech.source.includes("Geeetech_logo"));
  assert.equal(sources.logos.pinball.source, "owner-supplied:9346.jpg");
  for (const brand of FILAMENT_BRANDS) {
    const key = filamentBrandKey(brand.name);
    assert.ok(sources.logos[key], `${brand.name}: bundled logo missing`);
    assert.equal(filamentBrandLogo(brand), `/filament-brands/${key}.webp`);
  }
  for (const [key, info] of Object.entries(sources.logos) as [string, { sha256: string }][]) {
    const bytes = await readFile(`public/filament-brands/${key}.webp`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), info.sha256);
    const metadata = await sharp(bytes).metadata(); assert.ok(metadata.width! <= 256 && metadata.height! <= 128);
  }
  console.info("Amazon links and logos passed: product-page details, selected ASIN, material and hex import, catalog identity, labeled photo estimates, prices, cache/backoff, safe redirects/body limits, and logo uploads/hashes.");
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
