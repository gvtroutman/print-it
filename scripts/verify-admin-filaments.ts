import "./_env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { ensureCredentials, signInWithPassword } from "./_accounts";
import { SOURCE_FILAMENT_COLORS } from "../src/lib/filament-settings-data";
import { adminSwatchId } from "../src/lib/filament-ids";

const APP = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const PAGE = `${APP}/admin/catalog/brands`;
const suffix = randomUUID().slice(0, 8);
const name = `Admin filament ${suffix}`;
const materialName = `PLA ${suffix}`;
const users: string[] = [];
const listings: number[] = [];
let brandId = "";
let materialId = "";
const htmlText = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

class Client {
  jar = new Map<string, string>();
  async raw(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { ...init, redirect: "manual", headers: {
      origin: APP, cookie: [...this.jar].map(([key, value]) => `${key}=${value}`).join("; "), ...init.headers,
    } });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";")[0]!; const index = pair.indexOf("=");
      this.jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async get(url: string) { return (await this.raw(url)).text(); }
  async submit(html: string, has: string[], values: Record<string, string | Blob>, origin = APP) {
    const form = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find(form => has.every(value => form.includes(value)));
    assert.ok(form, `Missing form: ${has.join(", ")}`);
    const body = new FormData();
    for (const tag of form.match(/<input\b[^>]*>/g) ?? []) {
      if (!tag.includes('type="hidden"')) continue;
      const key = /name="([^"]*)"/.exec(tag)?.[1];
      if (key) body.append(htmlText(key), htmlText(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
    }
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    return this.raw(PAGE, { method: "POST", headers: { origin }, body });
  }
  async search(query: string) {
    return (await this.raw(`${APP}/api/filament-library?${new URLSearchParams({ material: materialName, q: query })}`)).json();
  }
  async order(swatchId: number) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ title: "Admin filament check", note: "Print a desk organizer", material: materialName, colorName: "Forged", quantity: "1", swatchId: String(swatchId) })) body.set(key, value);
    return this.raw(`${APP}/api/upload`, { method: "POST", body });
  }
}
async function signIn(id: string) {
  const username = `filament-${randomUUID().slice(0, 8)}`;
  await ensureCredentials(APP, id, username);
  const client = new Client();
  assert.equal((await signInWithPassword(client, APP, username)).status, 200);
  return client;
}

try {
  const existingOwner = await db.user.findFirst({ where: { role: "admin" } });
  const owner = existingOwner ?? await db.user.create({ data: { name: "Filament owner", email: `filament-owner-${suffix}@example.test`, role: "admin", emailVerified: true } });
  if (!existingOwner) users.push(owner.id);
  const member = await db.user.create({ data: { name: "Filament member", email: `filament-member-${suffix}@example.test`, emailVerified: true, invitedById: owner.id } });
  users.push(member.id);
  const admin = await signIn(owner.id); const client = await signIn(member.id);
  assert.equal((await client.raw(PAGE)).status, 404);
  let html = await admin.get(PAGE);
  assert.ok(html.includes("Brands &amp; Amazon links"));
  assert.ok((await admin.get(`${APP}/admin/catalog`)).includes("/admin/catalog/brands"));
  const forbidden = await client.submit(html, ["Add brand"], { name });
  assert.ok(forbidden.status >= 400 || forbidden.status === 303);
  assert.equal(await db.filamentBrand.count({ where: { name } }), 0, "A member must not be able to use the owner's action id");
  await admin.submit(html, ["Add brand"], { name, aliases: `Alias ${suffix}` }, "https://elsewhere.example");
  assert.equal(await db.filamentBrand.count({ where: { name } }), 0, "Cross-origin writes must be rejected");
  const added = await admin.submit(html, ["Add brand"], { name, aliases: `Alias ${suffix}` });
  assert.equal(added.status, 303);
  const brand = await db.filamentBrand.findFirstOrThrow({ where: { name } }); brandId = brand.id;
  assert.equal(brand.active, true);
  const lookupUrl = `${APP}/api/admin/filament-listings/lookup`;
  const lookupRequest = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, amazonUrl: "https://www.amazon.com/dp/B066666666" }) };
  assert.equal((await new Client().raw(lookupUrl, lookupRequest)).status, 401);
  assert.equal((await client.raw(lookupUrl, lookupRequest)).status, 403, "Only admins may read unsaved listing details");
  assert.equal((await admin.raw(lookupUrl, { ...lookupRequest, headers: { ...lookupRequest.headers, origin: "https://elsewhere.example" } })).status, 403);
  assert.equal((await admin.raw(lookupUrl, { ...lookupRequest, body: JSON.stringify({ brandId, amazonUrl: "https://example.test/private" }) })).status, 400);
  if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") {
    const pulled = await admin.raw(lookupUrl, lookupRequest); assert.equal(pulled.status, 200);
    const details = await pulled.json(); assert.equal(details.type, "Silk PLA"); assert.equal(details.hex, "#7b35ab"); assert.equal(details.hexSource, "listing");
    assert.equal(await db.filamentListing.count({ where: { brandId } }), 0, "Importing details must not save a listing before review");
  }
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Add brand"], { name: name.toUpperCase() });
  assert.equal(await db.filamentBrand.count({ where: { key: brand.key } }), 1, "Brand matching must reject casing duplicates");
  await admin.submit(html, ["Add brand"], { name: `${name} other`, aliases: brand.name });
  assert.equal(await db.filamentBrand.count({ where: { name: `${name} other` } }), 0, "An alias must not hijack another brand");
  const editBrandForm = ['aria-label="Edit brand"'];
  await client.submit(html, editBrandForm, { field: "name", name: "Forbidden rename" });
  assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).name, name, "Inline edits must require an admin");
  await admin.submit(html, editBrandForm, { field: "aliases", aliases: `Alias ${suffix}, Second ${suffix}` }, "https://elsewhere.example");
  assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).aliases.length, 1, "Inline edits must reject cross-origin writes");
  await admin.submit(html, editBrandForm, { field: "aliases", aliases: `Alias ${suffix}, Second ${suffix}` });
  assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).aliases.length, 2);
  // Logo uploads are part of the same authorized brand action and decode to a still WebP.
  const { default: sharp } = await import("sharp");
  const logo = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#2787c9" } }).png().toBuffer();
  await admin.submit(html, editBrandForm, { field: "logo", name: "Unrelated stale name", aliases: "Stale alias", logo: new Blob([new Uint8Array(logo)], { type: "image/png" }) });
  const logoBrand = await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } });
  assert.ok(logoBrand.logoData?.startsWith("data:image/webp;base64,"));
  assert.equal(logoBrand.name, name, "Logo edits must preserve the current brand name");
  assert.equal(logoBrand.aliases.length, 2, "Logo edits must preserve aliases saved after the form loaded");
  const logoUrl = `${APP}/api/filament-brands/${brandId}/logo`;
  const logoResponse = await client.raw(logoUrl); assert.equal(logoResponse.status, 200); assert.equal(logoResponse.headers.get("content-type"), "image/webp");
  assert.equal((await new Client().raw(logoUrl)).status, 401);
  await admin.submit(html, editBrandForm, { field: "logo", logo: new Blob(["<svg/>"], { type: "image/svg+xml" }) });
  assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).logoData, logoBrand.logoData, "Invalid logo uploads must preserve the previous image");
  const fields = { brandId, sourceId: "", type: "PLA", product: "PLA Pro", name: "Owner violet", hex: "#123a67", amazonUrl: "https://www.amazon.com/s?k=filament" };
  await admin.submit(html, ["Add listing"], fields);
  assert.equal(await db.filamentListing.count({ where: { brandId } }), 0, "An Amazon search page must not qualify as a product listing");
  await client.submit(html, ["Add listing"], { ...fields, amazonUrl: "https://www.amazon.com/dp/B012345678" });
  assert.equal(await db.filamentListing.count({ where: { brandId } }), 0);
  const saved = await admin.submit(html, ["Add listing"], { ...fields, amazonUrl: "https://www.amazon.com/Product/dp/B012345678?tag=example" });
  assert.equal(saved.status, 303);
  const listing = await db.filamentListing.findFirstOrThrow({ where: { brandId } }); listings.push(listing.id);
  assert.equal(listing.amazonUrl, "https://www.amazon.com/dp/B012345678");
  const productRequest = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: [listing.amazonUrl] }) };
  assert.equal((await new Client().raw(`${APP}/api/amazon-products`, productRequest)).status, 401);
  assert.equal((await client.raw(`${APP}/api/amazon-products`, { ...productRequest, headers: { ...productRequest.headers, origin: "https://elsewhere.example" } })).status, 403);
  assert.equal((await client.raw(`${APP}/api/amazon-products`, { ...productRequest, body: JSON.stringify({ urls: ["https://www.amazon.com/dp/B000000000"] }) })).status, 404);
  const productResponse = await client.raw(`${APP}/api/amazon-products`, productRequest); assert.equal(productResponse.status, 200);
  const product = (await productResponse.json()).products[0];
  if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") { assert.equal(product.price.amount, 19.99); assert.ok(product.image); }
  else { assert.ok(["ready", "blocked", "unavailable"].includes(product.status)); }
  const material = await db.catalogMaterial.create({ data: { name: materialName } }); materialId = material.id;
  await db.catalogColor.upsert({ where: { materialId_name: { materialId: material.id, name: "Filament check" } },
    create: { materialId: material.id, name: "Filament check", hex: "#123a67", style: "#123a67" }, update: { active: true } });
  const found = await client.search(name);
  assert.equal(found.total, 0, "Custom listings without a printed swatch stay out of market searches");
  assert.deepEqual(found.swatches, []);
  const order = await client.order(adminSwatchId(listing.id)); assert.equal(order.status, 200, await order.clone().text());
  const ticket = await db.story.findUniqueOrThrow({ where: { id: (await order.json()).id } });
  assert.equal(ticket.colorName, listing.name); assert.equal(ticket.swatchBuyUrl, listing.amazonUrl);
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Add listing"], { ...fields, listingId: String(listing.id), amazonUrl: "https://www.amazon.com/dp/B087654321" });
  assert.equal((await db.filamentListing.findUniqueOrThrow({ where: { id: listing.id } })).amazonUrl, "https://www.amazon.com/dp/B087654321");
  assert.equal((await client.search(name)).total, 0, "Editing a product link must not create a printed swatch");
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Turn listing off", `value="${listing.id}"`], {});
  assert.equal((await client.search(name)).total, 0);
  assert.equal((await client.order(adminSwatchId(listing.id))).status, 409, "A stale or forged listing id must be rejected");
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Turn listing on", `value="${listing.id}"`], {});
  await admin.submit(html, ["Turn brand off"], {});
  assert.equal((await client.search(name)).total, 0);
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Turn brand on"], {});
  assert.equal((await client.search(name)).total, 0, "Re-enabling an unswatched listing must not offer it on the market");
  assert.equal((await db.story.findUniqueOrThrow({ where: { id: ticket.id } })).swatchBuyUrl, listing.amazonUrl, "Old tickets must retain their saved listing");

  const packageOptions = [
    { url: "https://www.amazon.com/dp/B022222222", label: "500 g roll" },
    { url: "https://www.amazon.com/dp/B033333333", label: "250 g × 8 pack (2 kg total)" },
    { url: "https://www.amazon.com/dp/B044444444", label: "5 m pen refill" },
  ];
  const packageFields = { ...fields, listingId: String(listing.id), amazonUrl: "https://www.amazon.com/dp/B087654321", packageLabel: "1 kg spool" };
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  for (const invalid of [
    [{ url: "https://www.amazon.com/s?k=filament", label: "250 g roll" }],
    [{ url: "https://www.amazon.ca/dp/B022222222", label: "500 g roll" }],
    [{ url: packageFields.amazonUrl, label: "Duplicate" }],
  ]) {
    await admin.submit(html, ["Add listing"], { ...packageFields, purchaseOptions: JSON.stringify(invalid) });
    assert.equal((await db.filamentListing.findUniqueOrThrow({ where: { id: listing.id } })).amazonUrl, packageFields.amazonUrl);
    assert.deepEqual((await db.filamentListing.findUniqueOrThrow({ where: { id: listing.id } })).purchaseOptions, [{ url: packageFields.amazonUrl, label: "Standard listing" }], "Rejected package changes must preserve saved choices");
  }
  await admin.submit(html, ["Add listing"], { ...packageFields, purchaseOptions: JSON.stringify(packageOptions) });
  assert.equal(((await db.filamentListing.findUniqueOrThrow({ where: { id: listing.id } })).purchaseOptions as unknown[]).length, 4);
  assert.equal((await client.search(name)).total, 0, "Adding package choices must not create a printed swatch");
  const packageResponse = await client.raw(`${APP}/api/amazon-products`, { ...productRequest, body: JSON.stringify({ urls: packageOptions.map(option => option.url) }) });
  assert.equal(packageResponse.status, 200, "Enabled alternatives must be allowed through the authenticated price route");
  const packageOrder = await client.order(adminSwatchId(listing.id)); assert.equal(packageOrder.status, 200);
  if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") {
    const packageTicket = await db.story.findUniqueOrThrow({ where: { id: (await packageOrder.json()).id } });
    assert.equal(packageTicket.swatchBuyUrl, packageOptions[2]!.url, "New orders must snapshot the cheapest total package");
  }
  assert.equal((await db.story.findUniqueOrThrow({ where: { id: ticket.id } })).swatchBuyUrl, listing.amazonUrl);
  await admin.submit(html, ["Turn listing off", `value="${listing.id}"`], {});
  assert.equal((await client.raw(`${APP}/api/amazon-products`, { ...productRequest, body: JSON.stringify({ urls: [packageOptions[0]!.url] }) })).status, 404);
  html = await admin.get(`${PAGE}?brand=${brandId}`);
  await admin.submit(html, ["Turn listing on", `value="${listing.id}"`], {});

  const jayo = await db.filamentBrand.findUniqueOrThrow({ where: { key: "jayo" } });
  const source = SOURCE_FILAMENT_COLORS.find(color => color.id.startsWith("fcx:") && /jayo/i.test(color.maker) && !color.translucent && color.family === "PLA")!;
  html = await admin.get(`${PAGE}?brand=${jayo.id}`);
  await admin.submit(html, ["Add listing"], { brandId: jayo.id, sourceId: source.id, name: "Forged source name", hex: "#ffffff", amazonUrl: "https://www.amazon.com/dp/B012345678" });
  const linked = await db.filamentListing.findUniqueOrThrow({ where: { sourceId: source.id } }); listings.push(linked.id);
  assert.equal(linked.name, source.name); assert.equal(linked.hex, source.hex, "A source listing must use its authoritative source color");
  assert.ok((await client.search("JAYO")).swatches.some((swatch: { id: number }) => swatch.id === adminSwatchId(linked.id)));
  assert.ok(await db.auditEvent.count({ where: { actorId: owner.id, action: "catalog.brand_added" } }));
  assert.ok(await db.auditEvent.count({ where: { actorId: owner.id, action: "catalog.listing_saved" } }));

  if (process.argv.includes("--browser")) {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const out = path.resolve("shots/admin-brands-review"); await mkdir(out, { recursive: true });
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error instanceof Error ? error.message : String(error)));
    await page.setCookie(...[...admin.jar].map(([key, value]) => ({ name: key, value, url: APP })));
    try {
      await page.setViewport({ width: 393, height: 1100 });
      await page.goto(`${PAGE}?brand=${brandId}`, { waitUntil: "networkidle0" });
      const editor = '[data-brand-editor]';
      const waitForSave = async () => {
        try { await page.waitForFunction(() => document.querySelector('[data-brand-save-status]')?.textContent?.trim() === "Saved." && document.querySelector('[data-brand-editor]')?.getAttribute('aria-busy') === 'false'); }
        catch (error) {
          console.info("Brand editor at failed save:", await page.$eval(editor, element => ({ text: element.textContent, busy: element.getAttribute("aria-busy"),
            fields: [...element.querySelectorAll<HTMLInputElement>('input[name="name"], input[name="field"], input[name="aliases"]')].map(input => ({ name: input.name, value: input.value, disabled: input.disabled })) })), errors);
          throw error;
        }
      };
      assert.equal(await page.$(`${editor} input[aria-label="Brand name"]`), null, "The duplicate name input must be absent until the name is tapped");
      assert.equal(await page.$$eval(`${editor} button`, buttons => buttons.some(button => button.textContent?.includes("Save brand"))), false);
      await page.click(`${editor} h2 button`);
      await page.waitForSelector(`${editor} input[aria-label="Brand name"]`);
      await page.waitForFunction(() => document.activeElement?.matches('[data-brand-editor] input[aria-label="Brand name"]'));
      await page.keyboard.type(`${name} renamed`);
      assert.equal(await page.$eval(`${editor} input[aria-label="Brand name"]`, input => (input as HTMLInputElement).value), `${name} renamed`);
      await page.keyboard.press("Enter");
      await waitForSave();
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).name, `${name} renamed`);
      assert.ok((await page.$eval('nav[aria-label="Filament brands"]', nav => nav.textContent))?.includes(`${name} renamed`), "The brand list must refresh after an inline rename");
      await page.click(`${editor} h2 button`);
      await page.keyboard.type("Cancelled rename");
      await page.keyboard.press("Escape");
      assert.equal(await page.$(`${editor} input[aria-label="Brand name"]`), null);
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).name, `${name} renamed`);
      await page.click(`${editor} h2 button`);
      await page.keyboard.type("JAYO");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector('[data-brand-save-status]')?.textContent?.includes("already belongs"));
      assert.equal(await page.$eval(`${editor} input[aria-label="Brand name"]`, input => (input as HTMLInputElement).value), "JAYO", "Rejected edits must retain the draft for correction");
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).name, `${name} renamed`);
      await page.$eval(`${editor} input[aria-label="Brand name"]`, input => { (input as HTMLInputElement).focus(); (input as HTMLInputElement).select(); });
      await page.keyboard.type(name);
      await page.click(`${editor} input[name="aliases"]`);
      await waitForSave();
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).name, name, "Tapping away must save the edited name");
      await page.click(`${editor} input[name="aliases"]`);
      await page.$eval(`${editor} input[name="aliases"]`, input => (input as HTMLInputElement).select());
      await page.keyboard.type(`Alias ${suffix}, Second ${suffix}, Browser ${suffix}`);
      await page.keyboard.press("Tab");
      await waitForSave();
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).aliases.length, 3);
      const logoFile = path.join(out, "inline-logo.png"); await writeFile(logoFile, logo);
      const fileChooserPromise = page.waitForFileChooser();
      await page.click(`${editor} button[title="Change brand logo"]`);
      const fileChooser = await fileChooserPromise;
      await fileChooser.accept([logoFile]);
      await waitForSave();
      assert.ok((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).logoData);
      await page.reload({ waitUntil: "networkidle0" });
      assert.equal(await page.$eval(`${editor} h2`, heading => heading.textContent), name);
      assert.ok(await page.$(`${editor} button[title="Change brand logo"] img`), "The uploaded logo must survive reopening the page");
      await page.$$eval(`${editor} button`, buttons => buttons.find(button => button.textContent === "Use default logo")?.click());
      await waitForSave();
      assert.equal((await db.filamentBrand.findUniqueOrThrow({ where: { id: brandId } })).logoData, null);
      for (const width of [320, 393, 1280]) {
        await page.setViewport({ width, height: 1100 });
        await page.goto(`${PAGE}?brand=${brandId}`, { waitUntil: "networkidle0" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.$eval('table [data-admin-listing]', row => row.children.length), 4);
        assert.equal(await page.$$eval('nav[aria-label="Filament brands"] img', images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), true);
        if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") {
          await page.waitForSelector('table img[alt*="on Amazon"]');
          await page.$eval('table img[alt*="on Amazon"]', image => image.scrollIntoView({ block: "center" }));
          await page.waitForFunction(() => { const image = document.querySelector<HTMLImageElement>('table img[alt*="on Amazon"]'); return image?.complete && image.naturalWidth > 0; });
          assert.equal(await page.$eval('table img[alt*="on Amazon"]', image => (image as HTMLImageElement).naturalWidth > 0), true);
          assert.ok((await page.$eval('table [data-amazon-price]', element => element.textContent))?.includes("6.00"));
          assert.equal(await page.$eval('table [data-package-link]', element => (element as HTMLAnchorElement).href), packageOptions[2]!.url);
          assert.equal(await page.$eval('table [data-package-label]', element => element.textContent), "5 m pen refill");
        }
        await page.screenshot({ path: path.join(out, `brands-${width}.png`), fullPage: true });
        await (await page.$(editor))!.screenshot({ path: path.join(out, `brand-card-${width}.png`) });
      }
      assert.equal(await page.$('[data-listing-form] input[name="listingId"]'), null, "The add panel must be for new listings only");
      await page.click('table [data-admin-listing] button');
      await page.waitForSelector('[data-listing-form] input[name="listingId"]');
      assert.equal(await page.$eval('[data-listing-form] input[name="listingId"]', input => (input as HTMLInputElement).value), String(listing.id));
      assert.equal(await page.$$eval('[data-listing-form] input[name="listingId"]', elements => elements.length), 1);
      assert.equal(await page.$$eval('[data-package-option]', elements => elements.length), 3, "Package options must survive reopening the edit form");
      await page.setViewport({ width: 393, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, "package-options-393.png"), fullPage: true });
      if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") {
        await page.goto(`${PAGE}?brand=${brandId}`, { waitUntil: "networkidle0" });
        const field = (name: string) => `[data-listing-form] input[name="${name}"]`;
        await page.type(field("amazonUrl"), "https://www.amazon.com/dp/B066666666");
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-listing-form] input[name="hex"]')?.value === "#7b35ab");
        assert.equal(await page.$eval(field("type"), input => (input as HTMLInputElement).value), "Silk PLA");
        assert.equal(await page.$eval(field("name"), input => (input as HTMLInputElement).value), "Purple");
        for (const width of [320, 393, 1280]) {
          await page.setViewport({ width, height: 1100 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Imported values and the hex preview must fit the viewport");
          await page.screenshot({ path: path.join(out, `imported-${width}.png`), fullPage: true });
        }
        await page.click('[data-listing-form] button[type="submit"]');
        await page.waitForFunction(() => document.querySelectorAll('table [data-admin-listing]').length === 2);
        const auto = await db.filamentListing.findFirstOrThrow({ where: { brandId, amazonUrl: "https://www.amazon.com/dp/B066666666" } }); listings.push(auto.id);
        assert.equal(auto.type, "Silk PLA"); assert.equal(auto.hex, "#7b35ab");
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-listing-form] input[name="amazonUrl"]')?.value === "");
        await page.type(field("name"), "My edited color");
        await page.type(field("hex"), "#abcdef");
        await page.type(field("amazonUrl"), "https://www.amazon.com/dp/B077777777");
        await page.waitForFunction(() => document.querySelector('[data-listing-lookup]')?.textContent?.includes("Your edited hex was kept"));
        assert.equal(await page.$eval(field("name"), input => (input as HTMLInputElement).value), "My edited color");
        assert.equal(await page.$eval(field("hex"), input => (input as HTMLInputElement).value), "#abcdef");
        await page.goto(`${PAGE}?brand=${brandId}`, { waitUntil: "networkidle0" });
        await page.type(field("amazonUrl"), "https://www.amazon.com/dp/B077777777");
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-listing-form] input[name="hex"]')?.value === "#123a67");
        assert.ok((await page.$eval('[data-listing-lookup]', element => element.textContent))?.includes("estimated from the product image"));
        await page.$eval(field("amazonUrl"), input => { (input as HTMLInputElement).focus(); (input as HTMLInputElement).select(); }); await page.keyboard.press("Backspace");
        await page.type(field("amazonUrl"), "https://www.amazon.com/dp/B066666666");
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-listing-form] input[name="hex"]')?.value === "#7b35ab");
      }
      await page.setViewport({ width: 393, height: 1100 });
      await page.goto(`${PAGE}?brand=${jayo.id}`, { waitUntil: "networkidle0" });
      await page.select('[data-listing-form] select[name="sourceId"]', source.id);
      await page.waitForFunction(() => !document.querySelector('[data-listing-form] input[name="hex"]'));
      assert.equal(await page.$('[data-listing-form] input[name="hex"]'), null, "Selecting a source must reveal its source preview instead of manual fields");
      await page.screenshot({ path: path.join(out, "source-color-393.png"), fullPage: true });
      const paletteSave = await client.raw(`${APP}/api/palette`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: listing.name, hex: listing.hex, alpha: 1 }) });
      assert.equal(paletteSave.status, 200);
      await page.setCookie(...[...client.jar].map(([key, value]) => ({ name: key, value, url: APP })));
      await page.goto(`${APP}/story/${ticket.id}/again`, { waitUntil: "networkidle0" });
      const colorToggle = 'section[aria-labelledby="step-3-heading"] [data-step-toggle]';
      if (await page.$eval(colorToggle, button => button.getAttribute("aria-expanded")) === "false") await page.click(colorToggle);
      await page.click('button[aria-label="Your palette"]');
      await page.waitForSelector('section[aria-label="Your palette"] button[role="radio"]', { visible: true });
      await page.click('section[aria-label="Your palette"] button[role="radio"]');
      await page.waitForSelector('[data-color-picker]');
      await page.waitForFunction(() => document.querySelector('[data-color-picker] [aria-live]')?.textContent === 'Owner violet');
      assert.equal(await page.$eval('[data-color-picker] [aria-live]', element => element.textContent), listing.name, "The repeat order form must use admin colors rather than the bundled defaults");
      if (process.env.AMAZON_PRODUCTS_FIXTURE === "true") {
        await page.waitForFunction(url => document.querySelector<HTMLAnchorElement>('[data-color-picker] [data-package-link]')?.href === url, {}, packageOptions[2]!.url);
        assert.equal(await page.$eval('[data-color-picker] [data-package-label]', element => element.textContent), "5 m pen refill");
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    console.info("Admin filament layout and catalog-color selection passed at 320, 393 and 1280px.");
  }
  console.info("Admin filament checks passed: authenticated actions, member and Origin rejection, brand/alias management, URL validation, custom and source listings, warm-search updates, disabling, authoritative orders, historical snapshots, and audit events.");
} finally {
  await db.filamentListing.deleteMany({ where: { id: { in: listings } } });
  if (brandId) await db.filamentBrand.deleteMany({ where: { id: brandId } });
  if (materialId) await db.catalogMaterial.deleteMany({ where: { id: materialId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
