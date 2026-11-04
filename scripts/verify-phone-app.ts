import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { sharedFilamentUrl } from "../src/lib/shared-filament";
import { safeRedirect } from "../src/lib/safe-redirect";
import "./verify-phone-installation";

const exact = "https://www.amazon.com/dp/B012345678";
assert.equal(sharedFilamentUrl({ url: `${exact}?tag=tracking` }), exact);
assert.equal(sharedFilamentUrl({ text: `Check out this PLA filament!\n${exact}?ref_=share` }), exact);
assert.equal(sharedFilamentUrl({ title: `New filament (${exact}).` }), exact);
assert.equal(sharedFilamentUrl({ text: "https://unrelated.example/ first, then https://a.co/d/filament" }), "https://a.co/d/filament");
assert.equal(sharedFilamentUrl({ url: "https://amzn.to/abc123" }), "https://amzn.to/abc123");
assert.equal(sharedFilamentUrl({ text: "https://amzn.eu/d/abc123" }), "https://amzn.eu/d/abc123");
assert.equal(sharedFilamentUrl({ url: "https://www.amazon.co.uk/gp/product/B012345678" }), "https://www.amazon.co.uk/dp/B012345678");
for (const url of ["https://www.amazon.com/s?k=PLA", "https://a.co.evil.example/d/link", "https://a.co@evil.example/d/link",
  "https://fake:pass@a.co/d/link", "https://a.co:8443/d/link", "http://a.co/d/link", "javascript:alert(1)", "https://127.0.0.1/d/link", "https://a.co/"]) {
  assert.equal(sharedFilamentUrl({ text: `Product ${url}` }), null, url);
}
assert.equal(sharedFilamentUrl({ text: `${"x".repeat(8193)} ${exact}` }), null);
assert.equal(sharedFilamentUrl({ url: "not a link", title: exact }), exact);
const returnTo = `/share-filament?${new URLSearchParams({ url: "https://a.co/d/filament?x=1&y=2", brand: "test" })}`;
assert.equal(safeRedirect(returnTo), returnTo, "sign-in keeps the complete received link");

const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "standalone");
assert(manifest.related_applications.some((app: { platform: string; url: string }) =>
  app.platform === "webapp" && app.url === "/manifest.webmanifest"), "Chrome can check this PWA's installation from a browser tab");
assert.equal(manifest.share_target.method, "GET", "receiving a link must not save a listing");
assert.equal(manifest.share_target.action, "/share-filament");
assert.deepEqual(manifest.share_target.params, { title: "title", text: "text", url: "url" });
for (const icon of manifest.icons) {
  const bytes = await readFile(`public${icon.src}`);
  const size = Number(icon.sizes.split("x")[0]);
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}

// Exercise the worker with network success/failure. No session page or API can enter its cache.
const listeners = new Map<string, (event: unknown) => void>();
const fallback = new Response("offline fallback");
const offlineWordmark = "/print-it-wordmark-arched.png";
const cache = {
  async addAll(paths: string[]) {
    assert(paths.every(path => path.startsWith("/pwa/") || path === offlineWordmark));
    assert(paths.includes(offlineWordmark), "the offline wordmark is cached during installation");
  },
  async match(path: string) {
    if (path === offlineWordmark) return new Response("cached arched wordmark");
    return path === "/pwa/offline.html" ? fallback.clone() : undefined;
  },
};
let networkFails = false;
let claims = 0;
const deleted: string[] = [];
vm.runInNewContext(await readFile("public/sw.js", "utf8"), {
  URL,
  self: { location: { origin: "https://print.invalid" }, addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    skipWaiting: async () => {}, clients: { claim: async () => { claims++; } } },
  caches: { open: async () => cache, keys: async () => ["print-it-phone-v0", "print-it-phone-v1", "unrelated-cache"], delete: async (key: string) => { deleted.push(key); } },
  fetch: async () => { if (networkFails) throw new Error("offline"); return new Response("fresh page"); },
});
for (const name of ["install", "activate"]) {
  let work: Promise<unknown> | undefined;
  listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
  await work;
}
assert.equal(claims, 1);
assert.deepEqual(deleted, ["print-it-phone-v0", "print-it-phone-v1"]);
async function navigate(path: string, mode = "navigate", method = "GET") {
  let response: Promise<Response> | undefined;
  listeners.get("fetch")!({ request: { url: `https://print.invalid${path}`, mode, method }, respondWith: (promise: Promise<Response>) => { response = promise; } });
  return response ? (await response).text() : null;
}
assert.equal(await navigate("/admin/catalog/brands"), "fresh page");
networkFails = true;
assert.equal(await navigate(offlineWordmark, "no-cors"), "cached arched wordmark", "the logo loads without a network connection");
assert.equal(await navigate(`/share-filament?text=${encodeURIComponent(exact)}`), "offline fallback");
assert.equal(await navigate("/signin"), "offline fallback");
assert.equal(await navigate("/api/amazon-products"), null, "APIs remain uncached and never receive offline HTML");
assert.equal(await navigate("/api/auth/sign-out", "cors", "POST"), null);
assert.equal(await navigate("/share-filament", "cors", "POST"), null);
assert.equal(await navigate("/admin/catalog/brands", "cors"), null, "RSC requests are never intercepted");
const urlFlag = process.argv.indexOf("--url");
if (urlFlag !== -1) {
  const origin = new URL(process.argv[urlFlag + 1]!);
  const get = (path: string) => fetch(new URL(path, origin), { redirect: "manual" });
  for (const path of ["/manifest.webmanifest", "/sw.js", "/pwa/offline.html", "/pwa/offline.css", "/pwa/offline.js", offlineWordmark, ...manifest.icons.map((icon: { src: string }) => icon.src)]) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} must be public without a session`);
    if (path === "/sw.js") {
      assert.match(response.headers.get("content-type") ?? "", /javascript/);
      assert.match(response.headers.get("cache-control") ?? "", /no-cache/);
      assert.equal(response.headers.get("service-worker-allowed"), "/");
    }
    if (path === "/manifest.webmanifest") {
      assert.match(response.headers.get("content-type") ?? "", /manifest\+json/);
      assert.deepEqual(await response.json(), manifest);
    } else await response.arrayBuffer();
  }
  const install = await get("/install");
  assert.equal(install.status, 200);
  assert.match(await install.text(), /href="\/manifest.webmanifest"/);
  assert.match(install.headers.get("content-security-policy") ?? "", /worker-src 'self'/);
  const target = `/share-filament?${new URLSearchParams({ text: `PLA filament ${exact}`, title: "Amazon find" })}`;
  const share = await get(target);
  assert.equal(share.status, 307);
  const signin = new URL(share.headers.get("location")!, origin);
  assert.equal(signin.pathname, "/signin");
  assert.equal(signin.searchParams.get("next"), target, "anonymous sharing preserves all received fields through sign-in");
  const denied = await fetch(new URL("/api/admin/filament-listings/lookup", origin), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: "not-signed-in", amazonUrl: exact }),
  });
  assert.equal(denied.status, 401, "phone sharing must not bypass owner authorization");
  console.log(`Public installation assets and anonymous share/auth checks passed against ${origin.origin}.`);
}
console.log("Phone app checks passed: Amazon shares, unsafe URLs, sign-in return path, icons, offline fallback and uncached private requests.");
