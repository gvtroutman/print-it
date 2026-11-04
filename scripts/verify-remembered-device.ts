/** Run against a fresh, isolated app/database with REMEMBER_DEVICE_TEST=true. */
import "./_env";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import {
  DEVICE_MARKER_COOKIE, DEVICE_SESSION_SECONDS, REMEMBER_DEVICE_HEADER,
  REMEMBERED_SESSION_SECONDS, SESSION_IDLE_SECONDS,
} from "../src/lib/auth-rules";
import { tokenFromSessionCookie } from "../src/lib/device-marker";
import { TEST_PASSWORD, ensureCredentials } from "./_accounts";

const APP = process.env.BETTER_AUTH_URL!;
assert.equal(process.env.REMEMBER_DEVICE_TEST, "true", "An isolated test app is required.");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(APP).hostname));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname));

class Browser {
  readonly jar = new Map<string, string>();
  readonly ages = new Map<string, number>();
  readonly lastCookies = new Map<string, string>();
  store(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(";")[0]!;
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq), value = pair.slice(eq + 1);
      this.lastCookies.set(name, line);
      const age = /Max-Age=(-?\d+)/i.exec(line)?.[1];
      if (age) this.ages.set(name, Number(age));
      if (!value || age === "0") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async raw(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", APP);
    headers.set("cookie", [...this.jar].map(([name, value]) => `${name}=${value}`).join("; "));
    const res = await fetch(new URL(url, APP), { ...init, headers, redirect: "manual" });
    this.store(res);
    return res;
  }
  async signIn(username: string, remember?: boolean, password = TEST_PASSWORD) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (remember !== undefined) headers[REMEMBER_DEVICE_HEADER] = String(remember);
    return this.raw("/api/auth/sign-in/username", {
      method: "POST", headers, body: JSON.stringify({ username, password }),
    });
  }
  get sessionName() { return [...this.jar.keys()].find((name) => name.includes("session_token"))!; }
  get token() { return tokenFromSessionCookie(this.jar.get(this.sessionName)!); }
  async session() {
    return db.session.findUniqueOrThrow({ where: { token: this.token } });
  }
  async who() { return (await this.raw("/api/auth/get-session")).json(); }
}

function near(actual: number, expected: number, tolerance = 10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, got ${actual}`);
}

async function main() {
  assert.equal(await db.user.count(), 0, "Use a fresh database, never a real account database.");
  const owner = await db.user.create({ data: {
    email: "remember-owner@example.test", name: "Remember Owner", role: "admin", initials: "RO",
  } });
  const member = await db.user.create({ data: {
    email: "remember-member@example.test", name: "Remember Member", role: "client", initials: "RM",
  } });
  await ensureCredentials(APP, owner.id, "remember-owner");
  await ensureCredentials(APP, member.id, "remember-member");

  const anon = new Browser();
  anon.jar.set(DEVICE_MARKER_COOKIE, "true");
  assert.equal(await (await anon.raw("/api/auth/get-session", {
    headers: { [REMEMBER_DEVICE_HEADER]: "true" },
  })).json(), null);
  anon.jar.clear();
  assert.equal((await anon.signIn("remember-owner", true, "incorrect-password")).ok, false);
  assert.equal(anon.jar.has(DEVICE_MARKER_COOKIE), false);
  console.info("PASS unauthenticated/failed sign-ins cannot remember a device");

  const ordinary = new Browser();
  assert.ok((await ordinary.signIn("remember-owner")).ok);
  near(((await ordinary.session()).expiresAt.getTime() - Date.now()) / 1000, SESSION_IDLE_SECONDS);
  assert.equal(ordinary.ages.get(ordinary.sessionName), SESSION_IDLE_SECONDS);

  const remembered = new Browser();
  assert.ok((await remembered.signIn("remember-owner", true)).ok);
  let row = await remembered.session();
  const originalExpiry = row.expiresAt.getTime();
  near((originalExpiry - Date.now()) / 1000, REMEMBERED_SESSION_SECONDS);
  near(remembered.ages.get(remembered.sessionName)!, REMEMBERED_SESSION_SECONDS);
  assert.match(remembered.lastCookies.get(remembered.sessionName)!, /HttpOnly/i);
  assert.match(remembered.lastCookies.get(remembered.sessionName)!, /SameSite=Lax/i);
  assert.ok(remembered.jar.has(DEVICE_MARKER_COOKIE));
  await remembered.raw("/queue");
  assert.equal(remembered.ages.get(remembered.sessionName), REMEMBERED_SESSION_SECONDS);
  console.info("PASS remembered password sign-in has matching persistent cookie/row; page navigation preserves it");

  const oldToken = remembered.token;
  await db.session.update({ where: { token: oldToken }, data: { createdAt: new Date(Date.now() - 360_000) } });
  const reauth = await remembered.raw("/reauth?next=/queue");
  assert.match(await reauth.text(), /Is that still you/);
  assert.ok((await remembered.signIn("remember-owner")).ok);
  assert.notEqual(remembered.token, oldToken);
  assert.equal((await remembered.session()).expiresAt.getTime(), originalExpiry);
  assert.equal(await db.session.findUnique({ where: { token: oldToken } }), null);
  console.info("PASS stale remembered session requires re-authentication, preserves expiry, and revokes the old token");

  // Even at the end of its lifetime, device recognition must not slide expiry.
  const almostExpired = new Date(Date.now() + 120_000);
  await db.session.update({ where: { token: remembered.token }, data: { expiresAt: almostExpired } });
  await remembered.who();
  assert.equal((await remembered.session()).expiresAt.getTime(), almostExpired.getTime());
  await db.session.update({ where: { token: remembered.token }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await remembered.who(), null);
  console.info("PASS remembered expiry is fixed and an expired row cannot be restored by a marker");

  await db.$executeRawUnsafe('DELETE FROM "rateLimit"');
  assert.ok((await remembered.signIn("remember-owner", true)).ok);
  const captured = new Browser();
  for (const [key, value] of remembered.jar) captured.jar.set(key, value);
  assert.ok((await remembered.raw("/api/auth/sign-out", { method: "POST", headers: {
    "content-type": "application/json",
  }, body: "{}" })).ok);
  assert.equal(remembered.jar.has(DEVICE_MARKER_COOKIE), false);
  assert.equal(await captured.who(), null);
  console.info("PASS sign-out clears recognition and immediately rejects a copied cookie");

  assert.ok((await remembered.signIn("remember-owner", true)).ok);
  assert.ok((await remembered.signIn("remember-owner", false)).ok);
  assert.equal(remembered.jar.has(DEVICE_MARKER_COOKIE), false);
  assert.equal(remembered.ages.get(remembered.sessionName), SESSION_IDLE_SECONDS);
  assert.ok((await remembered.signIn("remember-owner", true)).ok);
  assert.ok((await remembered.signIn("remember-member")).ok);
  assert.equal(remembered.jar.has(DEVICE_MARKER_COOKIE), false);
  assert.equal(remembered.ages.get(remembered.sessionName), SESSION_IDLE_SECONDS);
  console.info("PASS unchecking restores short sign-in; account switching never inherits recognition");

  const memberDevice = new Browser();
  memberDevice.store(await auth.api.signInMemberDevice({ body: { userId: member.id }, asResponse: true }));
  await memberDevice.raw("/queue");
  assert.equal(memberDevice.ages.get(memberDevice.sessionName), DEVICE_SESSION_SECONDS);
  assert.equal((await memberDevice.who()).user.id, member.id);
  console.info("PASS existing passwordless member device sign-in still works");

  await db.$executeRawUnsafe('DELETE FROM "rateLimit"');
  assert.ok((await ordinary.signIn("remember-owner", true)).ok);
  await ensureCredentials(APP, owner.id, "remember-owner");
  assert.equal(await ordinary.who(), null);
  assert.ok((await ordinary.signIn("remember-member", true)).ok);
  await db.user.update({ where: { id: member.id }, data: { banned: true } });
  await db.session.deleteMany({ where: { userId: member.id } });
  assert.equal(await ordinary.who(), null);
  assert.equal((await ordinary.signIn("remember-member", true)).ok, false);
  console.info("PASS password resets and revoked access end remembered sessions");

  const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
      protocol: "ctap2", transport: "internal", hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(APP + "/signin", { waitUntil: "networkidle2" });
    assert.ok(await page.$eval('input[name="rememberDevice"]', (el) => (el as HTMLInputElement).checked));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mkdir("shots/remembered-device", { recursive: true });
    await page.screenshot({ path: "shots/remembered-device/signin-mobile.png", fullPage: true });
    await page.type("#username", "remember-owner");
    await page.type("#password", TEST_PASSWORD);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('button[type="submit"]')]);
    const cookies = await browser.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name.includes("session_token"))!;
    near(sessionCookie.expires - Date.now() / 1000, REMEMBERED_SESSION_SECONDS);
    const restored = await browser.createBrowserContext();
    await restored.setCookie(...cookies);
    const returningPage = await restored.newPage();
    await returningPage.goto(APP + "/signin", { waitUntil: "networkidle2" });
    assert.equal(new URL(returningPage.url()).pathname, "/queue");
    await restored.close();
    console.info("PASS mobile sign-in UI and returning browser skip login with a persistent cookie");

    await page.goto(APP + "/welcome", { waitUntil: "networkidle2" });
    await (await page.waitForSelector("::-p-text(Add a passkey)"))!.click();
    await page.waitForFunction(() => document.body.innerText.includes("Passkey saved"));
    assert.equal(await db.passkey.count({ where: { userId: owner.id } }), 1);
    await page.evaluate(async () => { await fetch("/api/auth/sign-out", { method: "POST",
      headers: { "content-type": "application/json" }, body: "{}" }); });
    await page.goto(APP + "/signin", { waitUntil: "networkidle2" });
    if (new URL(page.url()).pathname === "/signin") {
      await page.$("#username").then((input) => input?.click()).catch(() => {});
      await page.waitForFunction(() => location.pathname !== "/signin", { timeout: 3000 }).catch(() => {});
    }
    if (new URL(page.url()).pathname === "/signin") {
      await (await page.waitForSelector("::-p-text(Use a passkey instead)"))!.click();
      await page.waitForFunction(() => location.pathname !== "/signin");
    }
    const passkeyCookie = (await browser.cookies()).find((cookie) => cookie.name.includes("session_token"))!;
    near(passkeyCookie.expires - Date.now() / 1000, REMEMBERED_SESSION_SECONDS);
    row = await db.session.findUniqueOrThrow({ where: { token: tokenFromSessionCookie(passkeyCookie.value) } });
    const passkeyExpiry = row.expiresAt.getTime();
    await db.session.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - 360_000) } });
    await page.goto(APP + "/reauth?next=/queue", { waitUntil: "networkidle2" });
    await (await page.waitForSelector("::-p-text(Confirm with a passkey)"))!.click();
    await page.waitForFunction(() => location.pathname === "/queue");
    const confirmedCookie = (await browser.cookies()).find((cookie) => cookie.name.includes("session_token"))!;
    const confirmed = await db.session.findUniqueOrThrow({ where: { token: tokenFromSessionCookie(confirmedCookie.value) } });
    assert.equal(confirmed.expiresAt.getTime(), passkeyExpiry);
    assert.equal(await db.session.findUnique({ where: { id: row.id } }), null);
    console.info("PASS real WebAuthn sign-in remembers the browser and passkey re-authentication preserves it");

    // Keep autofill pending while changing the checkbox, then allow it to
    // complete. The final verification must use the current preference.
    await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: false });
    await page.evaluate(async () => { await fetch("/api/auth/sign-out", { method: "POST",
      headers: { "content-type": "application/json" }, body: "{}" }); });
    await page.goto(APP + "/signin", { waitUntil: "networkidle2" });
    await page.click('input[name="rememberDevice"]');
    await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
    await page.waitForFunction(() => location.pathname !== "/signin", { timeout: 3000 }).catch(() => {});
    if (new URL(page.url()).pathname === "/signin") {
      await (await page.waitForSelector("::-p-text(Use a passkey instead)"))!.click();
      await page.waitForFunction(() => location.pathname !== "/signin");
    }
    const shortCookies = await browser.cookies();
    const shortCookie = shortCookies.find((cookie) => cookie.name.includes("session_token"))!;
    near(shortCookie.expires - Date.now() / 1000, SESSION_IDLE_SECONDS);
    assert.equal(shortCookies.some((cookie) => cookie.name === DEVICE_MARKER_COOKIE), false);
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    console.info("PASS passkey sign-in honors unchecking Remember this device while autofill is pending");
  } finally { await browser.close(); }
  console.info("Remembered-device verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
