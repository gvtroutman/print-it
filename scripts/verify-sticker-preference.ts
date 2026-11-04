/** Real account reads and actions with an isolated in-memory database. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const accounts = new Map(["member", "other", "owner"].map(id => [id, {
  id, name: id, email: `${id}@example.test`, initials: "ME", createdAt: new Date("2026-01-01"),
  role: id === "owner" ? "admin" : "client", stickersEnabled: true,
  cardFlair: "first-print", previewCardFlair: "daily-fiber",
}]));
type Note = { id: string; recipientId: string; badgeKey: string | null; read: boolean };
type Filter = { recipientId: string; badgeKey?: null | { not: null }; read?: boolean };
let notes: Note[] = [
  { id: "award", recipientId: "member", badgeKey: "first-print", read: false },
  { id: "order", recipientId: "member", badgeKey: null, read: false },
  { id: "other-award", recipientId: "other", badgeKey: "first-print", read: false },
];
const matches = (note: Note, where: Filter) => note.recipientId === where.recipientId &&
  (where.read === undefined || note.read === where.read) &&
  (where.badgeKey === undefined || (where.badgeKey === null ? note.badgeKey === null : note.badgeKey !== null));
const fixture = {
  active: "member" as string | null, preview: false, fail: false, failCleanup: false,
  paths: [] as string[], writes: 0,
  session: () => fixture.active ? { user: accounts.get(fixture.active), session: { id: "preference-session" } } : null,
};
const db = {
  siteMaintenance: { findUnique: async () => null },
  user: { update: async ({ where, data }: { where: { id: string }; data: { stickersEnabled: boolean } }) => {
    if (fixture.fail) throw new Error("Save failed");
    assert.equal(where.id, fixture.active, "Updates must belong to the signed-in account");
    assert.deepEqual(Object.keys(data), ["stickersEnabled"], "Keep earned stickers and chosen icons intact");
    Object.assign(accounts.get(where.id)!, data);
    fixture.writes++;
  } },
  memberBadge: { findUnique: async () => ({ id: "earned" }) },
  notification: {
    updateMany: async ({ where, data }: { where: Filter; data: { read: boolean } }) => {
      if (fixture.failCleanup) throw new Error("Cleanup failed");
      const affected = notes.filter(note => matches(note, where));
      affected.forEach(note => Object.assign(note, data));
      return { count: affected.length };
    },
    findMany: async ({ where }: { where: Filter }) => notes.filter(note => matches(note, where)),
    count: async ({ where }: { where: Filter }) => notes.filter(note => matches(note, where)).length,
  },
};
const transaction = async (run: (tx: typeof db) => Promise<void>) => {
  const before = structuredClone([...accounts]);
  const beforeNotes = structuredClone(notes);
  try { await run(db); }
  catch (error) {
    accounts.clear();
    before.forEach(([id, account]) => accounts.set(id, account));
    notes = beforeNotes;
    throw error;
  }
};
Object.assign(globalThis, { stickerPreferenceFixture: fixture, stickerPreferenceDb: { ...db, $transaction: transaction } });
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/auth": "export const auth={api:{getSession:async()=>globalThis.stickerPreferenceFixture.session()}}",
  "@/lib/db": "export const db=globalThis.stickerPreferenceDb",
  "next/headers": "export const headers=async()=>new Headers();export const cookies=async()=>({get:()=>globalThis.stickerPreferenceFixture.preview?{value:'preference-session'}:undefined})",
  "next/navigation": "export function redirect(){throw new Error('Sign-in required')}export function notFound(){throw new Error('Not found')}",
  "next/cache": "export function revalidatePath(path,type){globalThis.stickerPreferenceFixture.paths.push(path+':'+type)}",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { setStickerPreferenceAction } = await import("../src/app/member/sticker-preference-action");
const { currentUser, unreadCount } = await import("../src/lib/authz");
const { listNotifications, notificationScope } = await import("../src/lib/notifications");
const form = (value?: string) => {
  const payload = new FormData();
  if (value !== undefined) payload.set("enabled", value);
  return payload;
};
fixture.active = null;
await assert.rejects(setStickerPreferenceAction(form("false")), /Sign-in required/);
fixture.active = "member";
const duplicate = form("false"); duplicate.append("enabled", "true");
const file = form(); file.set("enabled", new Blob(["false"]), "setting.txt");
for (const payload of [form(), form(""), form("0"), form("False"), duplicate, file]) {
  assert.equal((await setStickerPreferenceAction(payload)).ok, false);
}
assert.equal(fixture.writes, 0);
assert.equal((await currentUser())!.cardFlair, "first-print");
const forged = form("false"); forged.set("userId", "other");
assert.deepEqual(await setStickerPreferenceAction(forged), { ok: true, enabled: false });
const disabled = (await currentUser())!;
assert.equal(disabled.stickersEnabled, false, "Preference survives a fresh account read");
assert.equal(disabled.cardFlair, null, "All account menus use initials while disabled");
assert.equal(accounts.get("member")!.cardFlair, "first-print", "The chosen icon stays saved");
assert.equal(accounts.get("other")!.stickersEnabled, true, "Cannot change another member's preference");
assert.equal(notes.find(note => note.id === "award")!.read, true);
assert.equal(notes.find(note => note.id === "order")!.read, false, "Order notifications stay unread");
assert.equal(notes.find(note => note.id === "other-award")!.read, false, "Other members' notifications stay unchanged");
// Even an unread award arriving from another producer remains hidden.
notes.push({ id: "late-award", recipientId: "member", badgeKey: "daily-fiber", read: false });
assert.deepEqual(notificationScope(disabled), { recipientId: "member", badgeKey: null });
assert.deepEqual((await listNotifications(disabled)).items.map(note => note.id), ["order"]);
assert.equal((await listNotifications(disabled, { unreadOnly: true })).unread, 1);
assert.equal(await unreadCount(disabled), 1);
await setStickerPreferenceAction(form("false"));
assert.deepEqual(await setStickerPreferenceAction(form("true")), { ok: true, enabled: true });
const restored = (await currentUser())!;
assert.equal(restored.cardFlair, "first-print", "Re-enabling restores the selected icon");
assert.equal((await listNotifications(restored)).items.length, 3);
assert.equal(await unreadCount(restored), 1, "Re-enabling causes no backlog of unread awards");

fixture.fail = true;
assert.equal((await setStickerPreferenceAction(form("false"))).ok, false);
assert.equal(accounts.get("member")!.stickersEnabled, true);
fixture.fail = false;
fixture.failCleanup = true;
const pathsBeforeFailure = fixture.paths.length;
assert.equal((await setStickerPreferenceAction(form("false"))).ok, false);
assert.equal(accounts.get("member")!.stickersEnabled, true, "Cleanup failure rolls the preference back");
assert.equal(fixture.paths.length, pathsBeforeFailure, "Failed saves do not revalidate");
fixture.failCleanup = false;

fixture.active = "owner"; fixture.preview = true;
assert.equal((await currentUser())!.cardFlair, "daily-fiber");
await setStickerPreferenceAction(form("false"));
assert.equal((await currentUser())!.cardFlair, null);
fixture.preview = false;
assert.equal((await currentUser())!.stickersEnabled, false, "The preference follows the account across views");
assert.equal((await currentUser())!.cardFlair, null);
await setStickerPreferenceAction(form("true"));
assert.equal((await currentUser())!.cardFlair, "first-print");
fixture.preview = true;
assert.equal((await currentUser())!.cardFlair, "daily-fiber", "Both saved icons survive");
assert.ok(fixture.paths.every(path => path === "/:layout"));
console.log("Sticker preference passed: authentication, strict inputs, member isolation, rollback, saved icons, account preview, filtered feeds and unread counts, and no unread announcement backlog.");
