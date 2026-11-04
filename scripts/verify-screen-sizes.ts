import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { screenPage, screenEnvironment, screenSince, screenShare } from "../src/lib/screen-sizes";

for (const [path, group] of [
  ["/story/123?secret=private#model", "/story/:id"],
  ["/invite/secret-token", "/invite/:token"],
  ["/device/device-token", "/device/:token"],
  ["/frr/42/", "/frr/:id"],
  ["/frr/new", "/frr/new"], ["/frr/queue", "/frr/queue"],
  ["/story/123/again?private=token", "/story/:id/again"],
  ["/admin/catalog/private-colour", "/admin/catalog"],
  ["/signin?next=/invite/secret-token", "/signin"],
  ["/api/auth/sign-in", null], ["/unknown/private-name", null], ["/story/42/files", null],
] as const) assert.equal(screenPage(path), group, path);

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";
assert.deepEqual(screenEnvironment(iphone, true), { device: "Phone", browser: "Safari", os: "iOS / iPadOS" });
assert.equal(screenEnvironment(ipad, true).device, "Tablet");
assert.equal(screenEnvironment(ipad, false).os, "macOS");
assert.deepEqual(screenEnvironment(chrome, false), { device: "Desktop", browser: "Chrome", os: "Windows" });
assert.equal(screenEnvironment(chrome + " Edg/140.0.0.0", false).browser, "Edge");
assert.equal(screenEnvironment(chrome + " OPR/120.0", false).browser, "Opera");
assert.equal(screenEnvironment("Mozilla/5.0 (Linux; Android 15; SM-X700) Chrome/140.0 Safari/537.36", true).device, "Tablet");
assert.equal(screenEnvironment("Mozilla/5.0 (Linux; Android 15) Mobile Chrome/140.0 SamsungBrowser/28.0", true).browser, "Samsung Internet");
assert.equal(screenSince(30, new Date("2026-03-01T23:59:59Z")).toISOString(), "2026-01-31T00:00:00.000Z");
assert.equal(screenSince(7, new Date("2026-03-01T00:00:00Z")).toISOString(), "2026-02-23T00:00:00.000Z");
assert.equal(screenShare(3, 4), "75.0%");
assert.equal(screenShare(0, 0), "0%");

const saved: unknown[] = [];
Object.assign(globalThis, { screenSizeFixture: saved });
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "@/lib/screen-size-store"
    ? { url: "data:text/javascript," + encodeURIComponent("export async function recordScreenView(view){globalThis.screenSizeFixture.push(view)}"), shortCircuit: true }
    : nextResolve(specifier, context);
} });
process.env.BETTER_AUTH_URL = "https://print.example.test";
const { POST } = await import("../src/app/api/screen-sizes/route");
const valid = { page: "/upload", width: 390, height: 844, touch: true };
const request = (body: unknown = valid, headers: Record<string, string> = {}) => new Request("https://print.example.test/api/screen-sizes", {
  method: "POST", headers: { origin: "https://print.example.test", "content-type": "application/json", "user-agent": iphone, ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
for (const origin of ["https://hostile.example.test", "null", "", "https://print.example.test:444"]) {
  const req = request(valid, { origin });
  assert.equal((await POST(req)).status, 403);
  assert.equal(req.bodyUsed, false);
}
assert.equal((await POST(request(valid, { "sec-fetch-site": "cross-site" }))).status, 403);
assert.equal((await POST(request(valid, { "content-type": "text/plain" }))).status, 415);
assert.equal((await POST(request("x".repeat(1025)))).status, 413);
assert.equal((await POST(request("{"))).status, 400);
for (const body of [null, [], { ...valid, width: 0 }, { ...valid, height: 10001 },
  { ...valid, width: 390.5 }, { ...valid, width: "390" }, { ...valid, page: "/invite/private-token" },
  { ...valid, page: "/upload?private=name" }, { ...valid, userId: "member" }]) {
  assert.equal((await POST(request(body))).status, 400, JSON.stringify(body));
}
const protectedHeaders: Record<string, string>[] = [{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot" }];
for (const headers of protectedHeaders) {
  assert.equal((await POST(request(valid, headers))).status, 204);
}
assert.equal(saved.length, 0, "Invalid, cross-origin, bot and privacy-protected reports never write data");
assert.equal((await POST(request())).status, 204);
assert.deepEqual(saved, [{ page: "/upload", width: 390, height: 844, device: "Phone", browser: "Safari", os: "iOS / iPadOS" }]);
let capped = false;
for (let i = 0; i < 601; i++) {
  const response = await POST(request());
  if (response.status === 429) { capped = true; break; }
}
assert(capped, "Collection has a finite request budget");
console.log("Screen-size checks passed: private URLs, environments, UTC windows, body bounds, origin policy, tracking protection, saved fields and collection cap.");
