/** Actual feature services with controlled interleavings; no real database. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { FeatureStatus } from "@prisma/client";
import type { Actor } from "../src/lib/scope";

const member: Actor = { id: "member", name: "Member", initials: "ME", email: "member@example.test", role: "client", canAddDevice: false, canAddMember: false };
const owner: Actor = { ...member, id: "owner", role: "admin" };
const fixture = (status: FeatureStatus) => ({ id: 1, title: "Fixture", status, requesterId: member.id, requester: { name: member.name } });
let row: ReturnType<typeof fixture> | null = null;
let beforeWrite = () => {};
const effects: unknown[] = [];
type Where = { AND?: Where[]; id?: number; requesterId?: string; status?: FeatureStatus };
const matches = (where: Where): boolean => row !== null &&
  (!where.AND || where.AND.every(matches)) &&
  (where.id === undefined || row.id === where.id) &&
  (where.requesterId === undefined || row.requesterId === where.requesterId) &&
  (where.status === undefined || row.status === where.status);
const database = { featureRequest: {
  findFirst: async ({ where }: { where: Where }) => matches(where) ? structuredClone(row) : null,
  findUnique: async ({ where }: { where: Where }) => matches(where) ? structuredClone(row) : null,
  deleteMany: async ({ where }: { where: Where }) => {
    beforeWrite();
    if (!matches(where)) return { count: 0 };
    row = null;
    return { count: 1 };
  },
  updateMany: async ({ where, data }: { where: Where; data: { status: FeatureStatus } }) => {
    beforeWrite();
    if (!matches(where)) return { count: 0 };
    Object.assign(row!, data);
    return { count: 1 };
  },
} };
Object.assign(globalThis, { featureSafetyDb: database, featureSafetyEffects: effects,
  fetch: async () => { throw new Error("Network disabled"); } });
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "next/cache": "export const revalidatePath=p=>globalThis.featureSafetyEffects.push(p)",
  "@/lib/db": "export const db=globalThis.featureSafetyDb",
  "@/lib/audit": "export const record=async e=>globalThis.featureSafetyEffects.push(e)",
  "@/lib/authz": "export const printerOwner=async()=>({id:'owner'});export const printerName=async()=>'Owner';export const notify=async e=>globalThis.featureSafetyEffects.push(e)",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { withdrawFeature, declineFeature, advanceFeature, FeatureProblem } = await import("../src/lib/features");
const reset = (status: FeatureStatus) => { row = fixture(status); beforeWrite = () => {}; effects.length = 0; };
const rejected = (status: number) => (e: unknown) => e instanceof FeatureProblem && e.status === status;
for (const next of ["Accepted", "InProgress", "Done"] as const) {
  reset("Requested");
  beforeWrite = () => { row!.status = next; };
  await assert.rejects(withdrawFeature(member, 1), rejected(409));
  assert.equal(row!.status, next);
  assert.deepEqual(effects, []);
}
reset("Requested");
beforeWrite = () => { row!.requesterId = owner.id; };
await assert.rejects(withdrawFeature(member, 1), rejected(409));
assert.ok(row);
assert.deepEqual(effects, []);
for (const status of ["Requested", "Declined"] as const) {
  reset(status);
  await withdrawFeature(member, 1);
  assert.equal(row, null);
  assert.ok(effects.length > 0);
}
reset("Requested");
await assert.rejects(withdrawFeature(owner, 1), rejected(403));
for (const op of [declineFeature, advanceFeature]) {
  for (const next of ["Accepted", "InProgress", "Done", null] as const) {
    reset("Requested");
    beforeWrite = () => { row = next === null ? null : fixture(next); };
    await assert.rejects(op(owner, 1), rejected(409));
    assert.equal((row as ReturnType<typeof fixture> | null)?.status ?? null, next);
    assert.deepEqual(effects, []);
  }
  reset("Requested");
  await assert.rejects(op(member, 1), rejected(403));
  assert.deepEqual(effects, []);
  await op(owner, 1);
  assert.equal((row as ReturnType<typeof fixture> | null)?.status, op === declineFeature ? "Declined" : "Accepted");
  assert.ok(effects.length > 0);
}
console.info("PASS feature withdrawal, decline and advance enforce current ownership/state before effects");
