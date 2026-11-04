import "./_env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import type { SavedPaletteColor } from "../src/lib/palette-types";
import { colorTitleCase } from "../src/lib/filament-color-types";
import { ensureCredentials, signInWithPassword } from "./_accounts";

const APP = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const members: string[] = [];
let createdOwner: string | null = null;

class Client {
  jar = new Map<string, string>();
  async raw(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init, redirect: "manual",
      headers: { origin: APP, cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), ...init.headers },
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";")[0]!;
      const split = pair.indexOf("=");
      this.jar.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return response;
  }
  async json(url: string, method = "GET", body?: unknown, origin = APP) {
    const response = await this.raw(`${APP}${url}`, {
      method,
      headers: { "content-type": "application/json", origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
}

async function signedIn(userId: string) {
  const client = new Client();
  const username = `palette-${randomUUID().slice(0, 8)}`;
  await ensureCredentials(APP, userId, username);
  assert.equal((await signInWithPassword(client, APP, username)).status, 200);
  return client;
}

async function browserChecks(client: Client, userId: string) {
  const { default: puppeteer } = await import("puppeteer-core");
  const out = path.resolve("shots/palette-review");
  await mkdir(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error instanceof Error ? error.message : String(error)));
  let failSave = false;
  let failRemove = false;
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (failSave && request.method() === "POST" && pathname === "/api/palette") {
      failSave = false;
      void request.respond({ status: 500, contentType: "application/json", body: '{"error":"Save failed for this check."}' });
    } else if (failRemove && request.method() === "DELETE" && pathname.startsWith("/api/palette/")) {
      failRemove = false;
      void request.respond({ status: 500, contentType: "application/json", body: '{"error":"Remove failed for this check."}' });
    } else void request.continue();
  });
  await page.setCookie(...[...client.jar].map(([name, value]) => ({ name, value, url: APP })));
  const card = 'section[aria-labelledby="step-3-heading"]';
  const savedButtons = 'section[aria-label="Your palette"] button[role="radio"]';
  const paletteButton = 'button[aria-label="Your palette"]';
  const drawer = 'section[aria-label="Your palette"]';
  const saveButton = '[data-color-picker] button[title][aria-pressed]';
  try {
    for (const width of [320, 393, 1280]) {
      await db.savedColor.deleteMany({ where: { userId } });
      await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 });
      await page.goto(`${APP}/upload`, { waitUntil: "networkidle0" });
      await page.click(`${card} [data-step-toggle]`);
      assert.equal(await page.$(paletteButton), null, "An empty palette has no icon on the shelf tab");
      await page.click('button[aria-label="Store"]');
      assert.equal(await page.$(paletteButton), null, "An empty palette has no icon in the color chart");
      await page.waitForSelector('[data-color-chart]', { visible: true });
      await page.waitForFunction(() => !document.querySelector("[data-color-picker]")!.closest("[inert]"));
      await new Promise((resolve) => setTimeout(resolve, 450));
      assert.equal(await page.$$eval('[data-rainbow-filter] input[type="range"]', inputs => inputs.length), 1, "Store must offer one rainbow color filter");
      await page.waitForSelector('[data-filament-color]', { visible: true });
      await page.click('[data-filament-color]');
      const chosenName = await page.$eval('[data-color-picker] [aria-live]', (el) => el.textContent!);
      assert.equal(await page.$eval(saveButton, (el) => (el as HTMLButtonElement).disabled), false, "Picking a shade must enable saving");
      // Save immediately after choosing a chart tile.
      await page.click(saveButton);
      await page.waitForSelector(paletteButton, { visible: true });
      assert.equal(await page.$eval(drawer, (el) => el.hasAttribute("hidden")), true, "The first save must not open the drawer");
      let colors = (await client.json("/api/palette")).body.colors as SavedPaletteColor[];
      assert.equal(colors.length, 1);
      assert.equal(colorTitleCase(colors[0]!.name), chosenName);
      await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-pressed") === "true" && !(document.querySelector(selector) as HTMLButtonElement).disabled, {}, saveButton);
      await page.click(paletteButton);
      await page.waitForSelector(savedButtons, { visible: true });
      failRemove = true;
      await page.click('section[aria-label="Your palette"] button[aria-label^="Unsave "]');
      await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Remove failed"));
      assert.equal(await page.$$eval(savedButtons, (els) => els.length), 1);
      assert.equal((await client.json("/api/palette")).body.colors.length, 1);
      await page.click('section[aria-label="Your palette"] button[aria-label^="Unsave "]');
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Your palette"]'));
      assert.equal(await page.$eval('[data-color-picker] [aria-live]', (el) => el.textContent), chosenName);
      failSave = true;
      await page.click(saveButton);
      await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Save failed"));
      assert.equal((await client.json("/api/palette")).body.colors.length, 0);
      await page.click(saveButton);
      await page.waitForSelector(paletteButton, { visible: true });
      assert.equal(await page.$eval(drawer, (el) => el.hasAttribute("hidden")), true, "Saving again must leave the drawer closed");
      await page.click(saveButton);
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Your palette"]'));
      assert.equal((await client.json("/api/palette")).body.colors.length, 0, "The selected color can be unsaved directly");
      assert.equal(await page.$eval('[data-color-picker] [aria-live]', (el) => el.textContent), chosenName);
      await page.click(saveButton);
      await page.waitForSelector(paletteButton, { visible: true });
      colors = (await client.json("/api/palette")).body.colors;
      await page.reload({ waitUntil: "networkidle0" });
      await page.click(`${card} [data-step-toggle]`);
      assert.equal(await page.$(paletteButton), null, "Saved colors stay hidden on the shelf tab after reloading");
      await page.click('button[aria-label="Store"]');
      await page.waitForSelector(paletteButton, { visible: true });
      assert.equal(await page.$eval(paletteButton, (el) => el.getAttribute("aria-expanded")), "false");
      await page.click(paletteButton);
      await page.waitForSelector(savedButtons, { visible: true });
      await page.click(savedButtons);
      await page.waitForFunction((name) => document.querySelector('[data-color-picker] [aria-live]')?.textContent === name, {}, colorTitleCase(colors[0]!.name));
      assert.equal(await page.$eval(savedButtons, (el) => el.getAttribute("aria-checked")), "true");
      await page.keyboard.press("Escape");
      assert.equal(await page.$eval(drawer, (el) => el.hasAttribute("hidden")), true);
      assert.equal(await page.$eval(paletteButton, (el) => el === document.activeElement), true, "Escape returns focus to the artist's palette icon");
      await page.click(paletteButton);
      await page.click('button[aria-label="Library"]');
      assert.equal(await page.$(paletteButton), null);
      await page.click('button[aria-label="Store"]');
      assert.equal(await page.$eval(paletteButton, (el) => el.getAttribute("aria-expanded")), "false", "Returning to the color chart must close the drawer");
      await new Promise((resolve) => setTimeout(resolve, 450));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => document.fonts.ready);
      await (await page.$(card))!.screenshot({ path: path.join(out, `personal-palette-${width}.png`) });
      await page.click(paletteButton);
      await new Promise((resolve) => setTimeout(resolve, 450));
      await (await page.$(card))!.screenshot({ path: path.join(out, `personal-palette-open-${width}.png`) });
      console.info(`${width}px: hidden palette, artist's icon, drawer toggle, Escape focus, save/unsave, error recovery, unchanged selection, reuse and reload persistence passed.`);
    }
    const repeat = await db.story.create({ data: { title: "Palette repeat check", uploaderId: userId, material: "Auto", colorName: "Black", colorHex: "#000000" } });
    try {
      await page.goto(`${APP}/story/${repeat.id}/again`, { waitUntil: "networkidle0" });
      await page.click('button[aria-label="Store"]');
      await page.waitForSelector(paletteButton, { visible: true });
      assert.equal(await page.$eval(drawer, (el) => el.hasAttribute("hidden")), true);
      await page.click(paletteButton);
      await page.waitForSelector(savedButtons, { visible: true });
      assert.equal(await page.$$eval(savedButtons, (els) => els.length), 1);
      console.info("Repeat orders load the same account palette.");
    } finally { await db.story.delete({ where: { id: repeat.id } }); }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: path.join(out, "palette-error.png"), fullPage: true });
    console.info(await page.$eval(card, (el) => el.textContent));
    throw error;
  } finally { await browser.close(); }
}

try {
  let owner = await db.user.findFirst({ where: { role: "admin" } });
  if (!owner) {
    owner = await db.user.create({ data: { name: "Palette owner check", email: `palette-owner-${randomUUID()}@example.test`, role: "admin" } });
    createdOwner = owner.id;
  }
  for (const name of ["Palette maker", "Other palette maker"]) {
    const member = await db.user.create({ data: { name, email: `palette-${randomUUID()}@example.test`, invitedById: owner.id } });
    members.push(member.id);
  }
  const client = await signedIn(members[0]!);
  const other = await signedIn(members[1]!);
  for (const [method, pathname] of [["GET", "/api/palette"], ["POST", "/api/palette"], ["DELETE", "/api/palette/missing"]]) {
    const response = await fetch(`${APP}${pathname}`, { method });
    assert.equal(response.status, 401);
  }
  const input = { name: "  My turquoise (w/ Fan)  ", hex: "#43C6AC", alpha: 1 };
  const saved = await client.json("/api/palette", "POST", input);
  assert.equal(saved.status, 200);
  assert.deepEqual(Object.keys(saved.body.color).sort(), ["alpha", "hex", "id", "name"]);
  assert.equal(saved.body.color.hex, "#43c6ac");
  assert.equal(saved.body.color.name, "My turquoise");
  const duplicates = await Promise.all(Array.from({ length: 6 }, () => client.json("/api/palette", "POST", input)));
  assert.ok(duplicates.every((result) => result.status === 200 && result.body.color.id === saved.body.color.id));
  assert.equal((await client.json("/api/palette")).body.colors.length, 1);
  assert.equal((await other.json("/api/palette")).body.colors.length, 0);
  assert.equal((await other.json(`/api/palette/${saved.body.color.id}`, "DELETE")).body.removed, 0);
  let admin: Client | null = null;
  if (createdOwner) {
    admin = await signedIn(owner.id);
    assert.equal((await admin.json(`/api/palette/${saved.body.color.id}`, "DELETE")).body.removed, 0, "Admin status must not grant access to another palette");
    assert.equal((await admin.json("/api/palette")).body.colors.length, 0);
  }
  const distinct = await other.json("/api/palette", "POST", input);
  assert.notEqual(distinct.body.color.id, saved.body.color.id);
  assert.equal((await client.json("/api/palette", "POST", { ...input, alpha: 0.5 })).status, 200);
  assert.equal((await client.json("/api/palette")).body.colors.length, 2);
  for (const bad of [
    { ...input, hex: "red" }, { ...input, name: " " }, { ...input, name: "a".repeat(81) },
    { ...input, alpha: -0.1 }, { ...input, alpha: 1.1 }, { ...input, userId: members[1] },
  ]) assert.equal((await client.json("/api/palette", "POST", bad)).status, 400);
  assert.equal((await client.json("/api/palette", "POST", input, "https://elsewhere.example")).status, 403);
  assert.equal((await client.json(`/api/palette/${saved.body.color.id}`, "DELETE", undefined, "https://elsewhere.example")).status, 403);
  assert.equal((await client.json(`/api/palette/${saved.body.color.id}`, "DELETE")).body.removed, 1);
  assert.equal((await client.json(`/api/palette/${saved.body.color.id}`, "DELETE")).body.removed, 0);
  assert.equal((await client.json("/api/openapi.json")).status, 403);
  if (admin) {
    const document = await admin.json("/api/openapi.json");
    assert.equal(document.status, 200, JSON.stringify(document.body));
    assert.ok(document.body.paths["/api/palette"].post);
    assert.ok(document.body.paths["/api/palette/{id}"].delete);
  }
  console.info(`Palette API checks passed: sessions, persistence, normalized colors, concurrent duplicate saves, opacity, ${admin ? "member/admin" : "member"} isolation, validation, Origin checks and removal.`);
  if (process.argv.includes("--browser")) await browserChecks(client, members[0]!);
} finally {
  await db.user.deleteMany({ where: { id: { in: members } } });
  if (createdOwner) await db.user.delete({ where: { id: createdOwner } });
  await db.$disconnect();
}
