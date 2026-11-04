/** Real services and API handlers with controlled interleavings; no database or network. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { StoryStatus } from "@prisma/client";
import type { Actor } from "../src/lib/scope";

const member: Actor = { id: "member", name: "Member", email: "member@example.test", initials: "ME", role: "client", canAddDevice: false, canAddMember: false };
const owner: Actor = { ...member, id: "owner", name: "Owner", role: "admin" };
const fixture = (status: StoryStatus) => ({
  id: 1, title: "Race fixture", status, uploaderId: member.id,
  uploader: { id: member.id, name: member.name }, storageKey: "model.stl",
  attachments: [{ storageKey: "photo.png" }],
});
let row: ReturnType<typeof fixture> | null = null;
type Where = { AND?: Where[]; id?: number; uploaderId?: string; status?: StoryStatus };
const matches = (where: Where): boolean => row !== null &&
  (!where.AND || where.AND.every(matches)) &&
  (where.id === undefined || row.id === where.id) &&
  (where.uploaderId === undefined || row.uploaderId === where.uploaderId) &&
  (where.status === undefined || row.status === where.status);
let beforeWrite = () => {};
const deleted: string[] = [];
const notes: unknown[] = [];
const events: unknown[] = [];
const paths: string[] = [];
const now = new Date("2026-10-14T00:00:00Z");
const notices = [
  { id: "feature", recipientId: member.id, storyId: null, featureId: 7, badgeKey: null, text: "Feature updated", read: false, createdAt: now },
  { id: "print", recipientId: member.id, storyId: 1, featureId: null, badgeKey: null, text: "Print updated", read: false, createdAt: now },
  { id: "badge", recipientId: member.id, storyId: null, featureId: null, badgeKey: "first-print", text: "Sticker earned", read: false, createdAt: now },
  { id: "withdrawn", recipientId: member.id, storyId: null, featureId: null, badgeKey: null, text: "Old target", read: true, createdAt: now },
  { id: "foreign", recipientId: owner.id, storyId: null, featureId: 8, badgeKey: null, text: "Private", read: false, createdAt: now },
];
const database = {
  siteMaintenance: { findUnique: async () => null },
  story: {
    findFirst: async ({ where }: { where: Where }) => matches(where) ? structuredClone(row) : null,
    findUnique: async ({ where }: { where: Where }) => matches(where) ? structuredClone(row) : null,
    deleteMany: async ({ where }: { where: Where }) => {
      beforeWrite();
      if (!matches(where)) return { count: 0 };
      row = null;
      return { count: 1 };
    },
    updateMany: async ({ where, data }: { where: Where; data: { status: StoryStatus } }) => {
      beforeWrite();
      if (!matches(where)) return { count: 0 };
      Object.assign(row!, data);
      return { count: 1 };
    },
  },
  notification: {
    findMany: async ({ where, select, take }: { where: { recipientId: string; read?: boolean }; select: Record<string, true>; take: number }) =>
      notices.filter(n => n.recipientId === where.recipientId && (where.read === undefined || n.read === where.read))
        .slice(0, take).map(n => Object.fromEntries(Object.keys(select).map(key => [key, Reflect.get(n, key)]))),
    count: async ({ where }: { where: { recipientId: string; read: boolean } }) =>
      notices.filter(n => n.recipientId === where.recipientId && n.read === where.read).length,
  },
};
Object.assign(globalThis, {
  orderSafetyDatabase: database, orderSafetyActor: member, orderSafetyDeleted: deleted,
  orderSafetyNotes: notes, orderSafetyEvents: events, orderSafetyPaths: paths,
  fetch: async () => { throw new Error("Network disabled in order safety checks"); },
});
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "next/cache": "export const revalidatePath=p=>globalThis.orderSafetyPaths.push(p)",
  "@/lib/db": "export const db=globalThis.orderSafetyDatabase",
  "@/lib/auth": "export const auth={api:{generateOpenAPISchema:async()=>({paths:{},components:{schemas:{},securitySchemes:{}},tags:[]})}}",
  "@/lib/authz": [
    "export const currentUser=async()=>globalThis.orderSafetyActor",
    "export const printerOwner=async()=>({id:'owner',name:'Owner'})",
    "export const printerName=async()=>'Owner'",
    "export const notify=async n=>globalThis.orderSafetyNotes.push(n)",
  ].join(";"),
  "@/lib/storage": [
    "export const deleteModel=async k=>globalThis.orderSafetyDeleted.push(k)",
    "export const copyModel=async()=>{}",
    "export const storageKeyFor=()=> 'unused'",
  ].join(";"),
  "@/lib/audit": "export const record=async e=>globalThis.orderSafetyEvents.push(e)",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });

const { withdrawStory, declineStory, StoryProblem } = await import("../src/lib/stories");
const reset = (status: StoryStatus) => {
  row = fixture(status);
  beforeWrite = () => {};
  for (const list of [deleted, notes, events, paths]) list.length = 0;
};
const rejected = (status: number) => (error: unknown) => error instanceof StoryProblem && error.status === status;
const noSideEffects = () => {
  assert.deepEqual(deleted, []);
  assert.deepEqual(notes, []);
  assert.deepEqual(events, []);
  assert.deepEqual(paths, []);
};

for (const next of ["Printing", "Delivery", "Done"] as const) {
  reset("Accepted");
  beforeWrite = () => { row!.status = next; };
  await assert.rejects(withdrawStory(member, 1), rejected(409));
  assert.equal(row!.status, next);
  noSideEffects();
}
reset("Accepted");
beforeWrite = () => { row!.uploaderId = owner.id; };
await assert.rejects(withdrawStory(member, 1), rejected(409));
noSideEffects();
reset("Requested");
beforeWrite = () => { row = null; };
await assert.rejects(withdrawStory(member, 1), rejected(409));
noSideEffects();
for (const status of ["Requested", "Accepted", "Declined"] as const) {
  reset(status);
  assert.equal((await withdrawStory(member, 1)).wasStatus, status);
  assert.equal(row, null);
  assert.deepEqual(deleted, ["model.stl", "photo.png"]);
  assert.equal(events.length, 1);
  assert.equal(notes.length, status === "Declined" ? 0 : 1);
}
for (const status of ["Printing", "Delivery", "Done"] as const) {
  reset(status);
  await assert.rejects(withdrawStory(member, 1), rejected(409));
  noSideEffects();
}
reset("Requested");
await assert.rejects(withdrawStory(owner, 1), rejected(403));
noSideEffects();
await assert.rejects(withdrawStory({ ...member, id: "other" }, 1), rejected(404));
noSideEffects();
console.info("PASS withdrawal preserves changed/foreign/started orders and files; permitted withdrawals still work");

reset("Requested");
beforeWrite = () => { row!.status = "Accepted"; };
await assert.rejects(declineStory(owner, 1), rejected(409));
assert.equal(row!.status, "Accepted");
noSideEffects();
reset("Requested");
beforeWrite = () => { row = null; };
await assert.rejects(declineStory(owner, 1), rejected(409));
noSideEffects();
reset("Requested");
await declineStory(owner, 1);
assert.equal(row!.status, "Declined");
assert.equal(notes.length, 1);
assert.equal(events.length, 1);
reset("Accepted");
await assert.rejects(declineStory(owner, 1), rejected(403));
noSideEffects();
reset("Requested");
await assert.rejects(declineStory(member, 1), rejected(403));
noSideEffects();
console.info("PASS decline refuses concurrent acceptance/deletion and respects the Requested-only owner rule");

const { DELETE } = await import("../src/app/api/stories/[id]/route");
const { POST } = await import("../src/app/api/stories/[id]/decline/route");
const context = { params: Promise.resolve({ id: "1" }) };
reset("Accepted");
beforeWrite = () => { row!.status = "Printing"; };
assert.equal((await DELETE(new Request("http://localhost/api/stories/1", { method: "DELETE" }), context)).status, 409);
noSideEffects();
Reflect.set(globalThis, "orderSafetyActor", owner);
reset("Requested");
beforeWrite = () => { row!.status = "Accepted"; };
assert.equal((await POST(new Request("http://localhost/api/stories/1/decline", { method: "POST" }), context)).status, 409);
noSideEffects();
console.info("PASS both HTTP handlers report stale mutations as 409");

Reflect.set(globalThis, "orderSafetyActor", member);
const { GET } = await import("../src/app/api/notifications/route");
const feedContext = { params: Promise.resolve({}) };
const feed = await (await GET(new Request("http://localhost/api/notifications"), feedContext)).json();
assert.equal(feed.unread, 3);
assert.equal(feed.notifications.length, 4);
const note = (id: string) => feed.notifications.find((n: { id: string }) => n.id === id);
assert.equal(note("feature").featureId, 7);
assert.equal(note("feature").storyId, null);
assert.equal(note("feature").ref, "FRR-107");
assert.equal(note("print").ref, "PI-1");
assert.equal(note("print").featureId, null);
assert.equal(note("badge").badgeKey, "first-print");
assert.equal(note("badge").ref, null);
assert.equal(note("withdrawn").ref, null);
assert.equal(note("foreign"), undefined);
const unread = await (await GET(new Request("http://localhost/api/notifications?unread=true&limit=2"), feedContext)).json();
assert.equal(unread.notifications.length, 2);
assert.equal(unread.unread, 3);
const { buildOpenApiDocument } = await import("../src/lib/openapi");
const spec = await buildOpenApiDocument();
assert.ok(!Object.hasOwn(spec.paths, "/api/stories/{id}/priority"));
assert.ok(!Object.hasOwn(spec.components.schemas.Story.properties, "priority"));
assert.ok(!Object.hasOwn(spec.components.schemas.Wish.properties as object, "priority"));
assert.deepEqual(spec.components.schemas.Notification.properties.featureId.type, ["integer", "null"]);
assert.match(spec.components.schemas.Notification.properties.ref.description, /FRR/);
console.info("PASS notification API and OpenAPI retain print, feature, badge and missing targets with recipient scoping");
