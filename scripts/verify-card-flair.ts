/** In-memory checks for earned-collection flair. No database or network. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { CARD_FLAIRS, earnedCardFlairs } from "../src/lib/card-flair";

const accounts = new Map([
  ["member", { id: "member", name: "Member", email: "member@example.test", initials: "ME", role: "client", cardFlair: null as string | null, previewCardFlair: null as string | null, createdAt: new Date("2026-01-01") }],
  ["other", { id: "other", name: "Other", email: "other@example.test", initials: "OT", role: "client", cardFlair: "hundred-prints" as string | null, previewCardFlair: null as string | null, createdAt: new Date("2026-02-01") }],
  ["owner", { id: "owner", name: "Owner", email: "owner@example.test", initials: "OW", role: "admin", cardFlair: null as string | null, previewCardFlair: null as string | null, createdAt: new Date("2026-01-01") }],
]);
const fixture = {
  active: "member" as string | null,
  preview: false,
  sessionId: "sticker-session",
  fail: false,
  failWrites: false,
  writes: 0,
  paths: [] as Array<[string, string]>,
  earned: new Map<string, Set<string>>([
    ["member", new Set(["first-print", "daily-fiber"])],
    ["other", new Set(["hundred-prints"])],
    ["owner", new Set(["first-print", "material-explorer"])],
  ]),
  session: () => fixture.active ? { user: accounts.get(fixture.active), session: { id: fixture.sessionId } } : null,
  db: {
    siteMaintenance: { findUnique: async () => null },
    user: { update: async ({ where, data }: { where: { id: string }; data: { cardFlair?: string | null; previewCardFlair?: string | null } }) => {
      if (fixture.fail || fixture.failWrites) throw new Error("Database unavailable");
      assert.equal(where.id, fixture.active, "Only the signed-in account can be updated");
      assert.equal(Object.keys(data).length, 1, "Only one icon preference changes per save");
      assert.ok(Object.hasOwn(data, "cardFlair") || Object.hasOwn(data, "previewCardFlair"));
      const account = accounts.get(where.id)!;
      Object.assign(account, data);
      fixture.writes++;
      return account;
    } },
    memberBadge: { findUnique: async ({ where }: { where: { userId_badgeKey: { userId: string; badgeKey: string } } }) => {
      if (fixture.fail) throw new Error("Database unavailable");
      const { userId, badgeKey } = where.userId_badgeKey;
      assert.equal(userId, fixture.active, "Collection ownership is checked for the signed-in account");
      return fixture.earned.get(userId)?.has(badgeKey) ? { id: `${userId}-${badgeKey}` } : null;
    } },
  },
};
Reflect.set(globalThis, "cardFlairFixture", fixture);
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/auth": "export const auth={api:{getSession:async()=>globalThis.cardFlairFixture.session()}}",
  "@/lib/db": "export const db=globalThis.cardFlairFixture.db",
  "next/headers": "export const headers=async()=>new Headers();export const cookies=async()=>({get:()=>globalThis.cardFlairFixture.preview?{value:'sticker-session'}:undefined})",
  "next/navigation": "export function redirect(){throw new Error('Sign-in required')}export function notFound(){throw new Error('Not found')}",
  "next/cache": "export function revalidatePath(...args){globalThis.cardFlairFixture.paths.push(args)}",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });

const { setCardFlairAction } = await import("../src/app/member/card-flair-action");
const { currentUser } = await import("../src/lib/authz");
const form = (value?: string) => {
  const data = new FormData();
  data.set("view", fixture.active === "owner" && fixture.preview && fixture.sessionId === "sticker-session" ? "member-preview" : "account");
  if (value !== undefined) data.set("flair", value);
  return data;
};

fixture.active = null;
await assert.rejects(setCardFlairAction(form("first-print")), /Sign-in required/);
assert.equal(fixture.writes, 0);
fixture.active = "member";
const multiple = form("first-print");
multiple.append("flair", "daily-fiber");
const file = new FormData();
file.set("view", "account");
file.set("flair", new Blob(["sticker"]), "sticker.svg");
for (const payload of [form(), form("missing"), form("abs-brick"), form("asa-sun"), form("nylon-gear"), form("pc-shield"), form("hips-support"), form("around-the-world"), form("first-print,daily-fiber"), form('["first-print","daily-fiber"]'), form("https://example.test/sticker.svg"), multiple, file, ...["cube", "spool", "bulb", "send", "turtle", "rabbit"].map(form)]) {
  assert.equal((await setCardFlairAction(payload)).ok, false);
}
accounts.get("member")!.cardFlair = "cube";
assert.equal((await currentUser())!.cardFlair, null, "Legacy generic icons never appear on a card");
accounts.get("member")!.cardFlair = null;

assert.deepEqual(earnedCardFlairs(["around-the-world"]), [], "Retired achievements cannot be selected even with an old award");
accounts.get("member")!.cardFlair = "around-the-world";
fixture.earned.get("member")!.add("around-the-world");
assert.equal((await currentUser())!.cardFlair, null, "A retired selected achievement is hidden before migration cleanup");
assert.equal((await setCardFlairAction(form("around-the-world"))).ok, false);
accounts.get("member")!.cardFlair = null;
fixture.earned.get("member")!.delete("around-the-world");

assert.deepEqual(earnedCardFlairs([]), [], "An empty collection offers no sticker artwork");
assert.deepEqual(earnedCardFlairs(["first-print", "daily-fiber", "unknown"]).map((flair) => flair.key), ["first-print", "daily-fiber"]);
for (const flair of CARD_FLAIRS.filter((item) => !fixture.earned.get("member")!.has(item.key))) {
  const payload = form(flair.key);
  payload.set("userId", "other");
  assert.equal((await setCardFlairAction(payload)).ok, false, "Unearned, hidden, gift, and another member's stickers must be refused");
}
assert.equal(fixture.writes, 0);
assert.equal(fixture.paths.length, 0);

fixture.earned.set("member", new Set(CARD_FLAIRS.map((flair) => flair.key)));
for (const flair of CARD_FLAIRS) {
  const payload = form(flair.key);
  payload.set("userId", "other");
  assert.deepEqual(await setCardFlairAction(payload), { ok: true, flair: flair.key });
  assert.equal(accounts.get("member")!.cardFlair, flair.key);
  assert.equal((await currentUser())!.cardFlair, flair.key, "Owned collection stickers survive a fresh account read");
  assert.equal(accounts.get("other")!.cardFlair, "hundred-prints");
}
accounts.get("member")!.cardFlair = "first-print";
fixture.earned.get("member")!.delete("first-print");
assert.equal((await currentUser())!.cardFlair, null, "A sticker no longer in the collection is hidden in every menu");
assert.deepEqual(await setCardFlairAction(form("")), { ok: true, flair: null });
assert.equal((await currentUser())!.cardFlair, null);
fixture.earned.get("member")!.add("first-print");

fixture.fail = true;
const previousWrites = fixture.writes;
const previousPaths = fixture.paths.length;
assert.equal((await setCardFlairAction(form("first-print"))).ok, false);
assert.equal(fixture.writes, previousWrites);
assert.equal(fixture.paths.length, previousPaths);
fixture.fail = false;

fixture.active = "owner";
assert.equal((await setCardFlairAction(form("daily-fiber"))).ok, false, "Owners cannot bypass collection ownership");
assert.deepEqual(await setCardFlairAction(form("first-print")), { ok: true, flair: "first-print" });
assert.equal((await currentUser())!.cardFlair, "first-print");
assert.equal(accounts.get("owner")!.previewCardFlair, null, "Saving an admin icon leaves the member-preview icon alone");
fixture.preview = true;
assert.equal((await currentUser())!.cardFlair, null, "Member preview starts with its own initials rather than inheriting the admin icon");
const staleAdminForm = form("material-explorer");
staleAdminForm.set("view", "account");
const writesBeforeStaleView = fixture.writes;
assert.equal((await setCardFlairAction(staleAdminForm)).ok, false, "An old admin tab cannot save into the member preview");
assert.equal(fixture.writes, writesBeforeStaleView);
assert.deepEqual(await setCardFlairAction(form("material-explorer")), { ok: true, flair: "material-explorer" });
assert.equal((await currentUser())!.cardFlair, "material-explorer");
assert.equal((await currentUser())!.previewing, true);
assert.equal(accounts.get("owner")!.cardFlair, "first-print", "Choosing an icon in member preview preserves the admin icon");
assert.equal(accounts.get("owner")!.previewCardFlair, "material-explorer");
assert.equal((await setCardFlairAction(form("love-of-my-life"))).ok, false, "Member preview cannot claim Recipient's gift sticker");

fixture.preview = false;
const stalePreviewForm = form("material-explorer");
stalePreviewForm.set("view", "member-preview");
const writesBeforeAdminReturn = fixture.writes;
assert.equal((await setCardFlairAction(stalePreviewForm)).ok, false, "An old member-preview tab cannot overwrite the admin icon");
assert.equal(fixture.writes, writesBeforeAdminReturn);
assert.equal((await currentUser())!.cardFlair, "first-print", "Returning to admin restores the saved admin icon");
assert.deepEqual(await setCardFlairAction(form("")), { ok: true, flair: null });
assert.equal(accounts.get("owner")!.previewCardFlair, "material-explorer", "Clearing the admin icon leaves the preview icon saved");
fixture.preview = true;
assert.equal((await currentUser())!.cardFlair, "material-explorer", "The preview icon survives switching views");
assert.deepEqual(await setCardFlairAction(form("first-print")), { ok: true, flair: "first-print" });
assert.equal(accounts.get("owner")!.cardFlair, null, "Replacing the preview icon leaves the admin initials alone");
fixture.earned.get("owner")!.delete("first-print");
assert.equal((await currentUser())!.cardFlair, null, "Preview icons also require current sticker ownership");
fixture.earned.get("owner")!.add("first-print");
fixture.failWrites = true;
assert.equal((await setCardFlairAction(form("material-explorer"))).ok, false);
assert.equal(accounts.get("owner")!.previewCardFlair, "first-print", "A failed preview save keeps the previous choice");
fixture.failWrites = false;
assert.deepEqual(await setCardFlairAction(form("")), { ok: true, flair: null });
assert.equal((await currentUser())!.cardFlair, null);
assert.equal(accounts.get("owner")!.cardFlair, null, "Clearing the preview icon leaves the admin icon alone");
assert.deepEqual(await setCardFlairAction(form("material-explorer")), { ok: true, flair: "material-explorer" });

fixture.sessionId = "fresh-session";
assert.equal((await currentUser())!.previewing, undefined, "A previous session's preview cookie does not select the preview icon");
assert.equal((await currentUser())!.cardFlair, null);
fixture.sessionId = "sticker-session";
fixture.active = "member";
const forgedPreview = form("daily-fiber");
forgedPreview.set("previewing", "true");
forgedPreview.set("userId", "owner");
assert.deepEqual(await setCardFlairAction(forgedPreview), { ok: true, flair: "daily-fiber" });
assert.equal((await currentUser())!.previewing, undefined, "Members cannot enable owner preview with its cookie or form fields");
assert.equal(accounts.get("member")!.previewCardFlair, null);
assert.equal(accounts.get("owner")!.cardFlair, null);
assert.equal(accounts.get("owner")!.previewCardFlair, "material-explorer");
assert.deepEqual(await setCardFlairAction(form("")), { ok: true, flair: null });
assert.equal(accounts.get("member")!.cardFlair, null);
assert.equal(accounts.get("other")!.cardFlair, "hundred-prints");
assert.equal(fixture.paths.length, fixture.writes);
assert.ok(fixture.paths.every(([route, type]) => route === "/" && type === "layout"));
console.log("Collection flair passed: earned-only choices, gift ownership, separate admin/member-preview icons, replacement/removal, view switching, session isolation, ownership on reads, and save errors.");
