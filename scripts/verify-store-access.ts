import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { ANY_COLOR, AUTO_MATERIAL } from "../src/lib/catalog";
import { DEFAULT_FILAMENT_SETTINGS } from "../src/lib/filament-brands";
import { configuredFilamentRecords } from "../src/lib/filament-settings-data";
import { isMarketFilament } from "../src/lib/filament-palette-data";
import { STORE_ACCESS_REQUIRED } from "../src/lib/donation-policy";
import type { Actor } from "../src/lib/scope";

// In-memory member settings: no real database, payments or storage are touched.
let hasDonated = false;
let memberReads = 0;
let selectionReads = 0;
let oldSwatch: number | null = 42;
Reflect.set(globalThis, "prisma", {
  siteMaintenance: { findUnique: async () => null },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      memberReads++;
      return where.id === "member" ? { hasDonated } : null;
    },
  },
  catalogColor: { findFirst: async () => { selectionReads++; return { hex: "#123456", style: "#123456", mode: "solid" }; } },
  filamentBrand: { findMany: async () => DEFAULT_FILAMENT_SETTINGS.brands.map(brand => ({ ...brand, listings: [] })) },
  story: {
    findFirst: async () => ({ id: 1, uploaderId: "member", title: "Repeat", material: "PLA", colorName: "Blue", colorHex: "#123456",
      swatchId: oldSwatch, quantity: 1, priority: 50, note: "", printSettings: "", links: [], attachments: [],
      filename: "model.stl", storageKey: "must-not-be-copied", fileSize: 100, mimeType: "model/stl", dims: null, sourceUrl: null }),
  },
});

// Exercise the actual route handlers with a controlled signed-in session.
// Authentication itself is covered by verify:auth; these checks cover access
// after authentication, before any external work or file writes.
const signIn = (actor: Actor | null) => Reflect.set(globalThis, "storeAccessTestActor", actor);
signIn(null);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return new URL(resolved.url).pathname.endsWith("/src/lib/authz.ts")
      ? { ...resolved, url: new URL("./stubs/store-access-authz.ts", import.meta.url).href }
      : resolved;
  },
});

const { hasStoreAccess } = await import("../src/lib/store-access");
const { checkWish } = await import("../src/lib/intake");
const { requeueStory, StoryProblem } = await import("../src/lib/stories");
const { pledge, DonationProblem } = await import("../src/lib/donations");
const { GET: searchStore } = await import("../src/app/api/filament-library/route");
const { POST: upload } = await import("../src/app/api/upload/route");
const { POST: importModel } = await import("../src/app/api/import/route");
const member: Actor = { id: "member", name: "Member", email: "member@example.test", initials: "ME", role: "client", canAddDevice: false, canAddMember: false };
const admin: Actor = { ...member, id: "owner", role: "admin" };
const storeColor = configuredFilamentRecords(DEFAULT_FILAMENT_SETTINGS).find(isMarketFilament)!;
assert.ok(storeColor, "The fixture must have an available Store filament");
const autoWish = { title: "Test", material: AUTO_MATERIAL, colorName: "Blue", colorHex: "#123456", quantity: 1 };
const forbidden = (error: unknown) => error instanceof StoryProblem && error.status === 403 && error.message === STORE_ACCESS_REQUIRED;

assert.equal(await hasStoreAccess(member), false, "No donation must leave Store locked");
const readsBeforeAdmin = memberReads;
assert.equal(await hasStoreAccess(admin), true, "The owner manages Store without a donation");
assert.equal(memberReads, readsBeforeAdmin, "The owner's access does not query member settings");
assert.equal(await hasStoreAccess({ ...admin, role: "client", previewing: true }), false, "Member preview must not bypass the gate");

assert.equal(await hasStoreAccess({ ...member, id: "missing" }), false, "An unknown member must not unlock Store");

for (const selection of [{ swatchId: 42 }, { swatchId: -42 }, { swatchId: 1_000_000_042 }, { filamentColorId: storeColor.id }]) {
  await assert.rejects(checkWish(member, { ...autoWish, ...selection }), forbidden, "A crafted upload or import must not bypass Store access");
}
assert.equal(selectionReads, 0, "Refuse locked Store selections before resolving a filament");
const shelf = await checkWish(member, { ...autoWish, material: "PLA" });
assert.equal(shelf.selection.toBuy, null, "Library remains available before donating");
const any = await checkWish(member, { ...autoWish, colorName: ANY_COLOR, colorHex: null });
assert.equal(any.selection.mode, "whatever", "Any color remains available before donating");
await assert.rejects(requeueStory(member, 1), forbidden, "Repeating an old Store spool must recheck access before copying files");
oldSwatch = null;
await assert.rejects(requeueStory(member, 1, { material: AUTO_MATERIAL, filamentColorId: storeColor.id }), forbidden, "A repeat request cannot inject an Auto Store color");

hasDonated = true;
assert.equal(await hasStoreAccess(member), true, "The admin's donation confirmation unlocks Store without a ledger entry");
const chosen = await checkWish(member, { ...autoWish, filamentColorId: storeColor.id });
assert.equal(chosen.selection.hex, storeColor.hex, "A confirmed donor can submit an Auto Store choice");
assert.equal(await hasStoreAccess({ ...member, id: "someone-else" }), false, "One member's confirmation must not unlock another member");
hasDonated = false;
await assert.rejects(checkWish(member, { ...autoWish, filamentColorId: storeColor.id }), forbidden, "Unticking Donated revokes access on the next submission with the same signed-in actor");

await assert.rejects(pledge(member, { amount: "50", note: "Someone else's Ko-fi name" }), (error: unknown) =>
  error instanceof DonationProblem && error.status === 403,
  "Members cannot claim a gift or log a donation through the old operation");
await assert.rejects(pledge(admin, { amount: "0.99", note: "" }), (error: unknown) =>
  error instanceof DonationProblem && error.status === 400 && error.message === "The smallest amount is $1.",
  "Admin ledger entries retain the $1 minimum");

const context = { params: Promise.resolve({}) };
const searchRequest = new Request("http://localhost:3000/api/filament-library?material=PLA");
assert.equal((await searchStore(searchRequest, context)).status, 401, "Store requires a signed-in member");
signIn(member);
const refused = await searchStore(searchRequest, context);
assert.equal(refused.status, 403, "Direct Store searches must enforce the donation gate");
assert.equal((await refused.json()).error, STORE_ACCESS_REQUIRED);

const form = new FormData();
for (const [key, value] of Object.entries({ ...autoWish, filamentColorId: storeColor.id })) form.set(key, String(value));
const uploaded = await upload(new Request("http://localhost:3000/api/upload", { method: "POST", body: form }));
assert.equal(uploaded.status, 403, "The upload endpoint must reject injected Store choices");
assert.equal((await uploaded.json()).error, STORE_ACCESS_REQUIRED);

const priorSources = process.env.IMPORT_SOURCES;
process.env.IMPORT_SOURCES = "printables";
try {
  const imported = await importModel(new Request("http://localhost:3000/api/import", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ ...autoWish, swatchId: 42 }) }), context);
  assert.equal(imported.status, 403, "The import endpoint must reject Store choices before downloading a model");
  assert.equal((await imported.json()).error, STORE_ACCESS_REQUIRED);
} finally {
  if (priorSources === undefined) delete process.env.IMPORT_SOURCES;
  else process.env.IMPORT_SOURCES = priorSources;
}

signIn(admin);
assert.equal((await searchStore(new Request("http://localhost:3000/api/filament-library"), context)).status, 400,
  "The owner reaches Store's normal input validation without donating");
signIn(member);
hasDonated = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  if (!String(input).startsWith("https://filamentcolors.xyz/api/swatch/")) throw new Error(`Unexpected external request: ${String(input)}`);
  return Response.json({ count: 1, results: [{ id: 42, manufacturer: { name: "SUNLU" }, color_name: "Fixture Blue",
    hex_color: "123456", filament_type: { name: "PLA" }, published: true, is_available: true,
    amazon_purchase_link: "https://www.amazon.com/dp/B000TEST42", image_front: "https://filamentcolors.xyz/media/fixture-42.jpg" }] });
};
try {
  const available = await searchStore(searchRequest, context);
  assert.equal(available.status, 200, "A member marked Donated can search Store");
  assert.equal(available.headers.get("cache-control"), "private, no-store", "Store results must not cache access across donation status changes");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Store access checks passed: admin donation status, member isolation, roles, Library access, direct search/upload/import requests, repeat orders, revocation and disabled member claims.");
