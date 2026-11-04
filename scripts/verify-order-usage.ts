import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma, type Story } from "@prisma/client";
import { load } from "cheerio";
import type { Actor } from "../src/lib/scope";

// Render the real orders/admin pages and call the real actions/API handlers with isolated
// records. No member account, database, printer or external service is used.
const member: Actor = { id: "member", name: "Member", email: "member@example.test", initials: "ME", role: "client", canAddDevice: false, canAddMember: false };
const owner: Actor = { ...member, id: "owner", name: "Owner", role: "admin" };
const paths: string[] = [];
const events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
const fixture = (id: number, status: Story["status"], printHours: number | null, filamentMeters: number | null, uploaderId = member.id) => ({
  id, title: `Order ${id}`, status, uploaderId, quantity: 100,
  printHours: printHours === null ? null : new Prisma.Decimal(printHours),
  filamentMeters: filamentMeters === null ? null : new Prisma.Decimal(filamentMeters),
  material: "PLA", colorName: "Blue", colorHex: "#123456", colorStyle: null, colorMode: "solid",
  filename: null, fileSize: null, mimeType: null, dims: null, sourceUrl: null,
  swatchId: null, swatchMaker: null, swatchType: null, swatchBuyUrl: null,
  priority: 50, note: "", printSettings: "", flagged: false, flagReason: null,
  links: [], attachments: [], _count: { comments: 0 },
  uploader: { id: uploaderId, name: uploaderId, initials: "ME" },
  createdAt: new Date("2026-10-13T12:00:00Z"), updatedAt: new Date("2026-10-13T12:00:00Z"),
});
type Row = ReturnType<typeof fixture>;
type Where = { AND?: Where[]; id?: number | { lt: number }; uploaderId?: string | { in: string[] }; status?: string | { in: string[] }; material?: string | { not: string } };
let rows: Row[] = [
  fixture(1, "Delivery", 1.25, 25.123),
  fixture(2, "Done", 0, null),
  fixture(3, "Done", null, null),
  fixture(4, "Printing", 999, 999),
  fixture(5, "Requested", 999, 999),
  fixture(6, "Accepted", 999, 999),
  fixture(7, "Declined", 999, 999),
  fixture(8, "Done", 10, 100, "another-member"),
];
const matches = (row: Row, where: Where): boolean =>
  (!where.AND || where.AND.every(part => matches(row, part))) &&
  (where.id === undefined || (typeof where.id === "number" ? row.id === where.id : row.id < where.id.lt)) &&
  (where.uploaderId === undefined || (typeof where.uploaderId === "string" ? row.uploaderId === where.uploaderId : where.uploaderId.in.includes(row.uploaderId))) &&
  (where.material === undefined || (typeof where.material === "string" ? row.material === where.material : row.material !== where.material.not)) &&
  (where.status === undefined || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status)));
const selected = (where: Where) => rows.filter(row => matches(row, where));
const aggregate = async ({ where, _sum = {}, _count = {} }: { where: Where; _sum?: Record<string, true>; _count?: Record<string, true> }) => {
  const selection = selected(where);
  const sum = Object.fromEntries(Object.keys(_sum).map(key => {
    const values = selection.map(row => Reflect.get(row, key)).filter(value => value !== null);
    return [key, values.length ? values.reduce((total: Prisma.Decimal, value) => total.plus(value), new Prisma.Decimal(0)) : null];
  }));
  const count = Object.fromEntries(Object.keys(_count).map(key => [key, selection.filter(row => Reflect.get(row, key) !== null).length]));
  return { _sum: sum, _count: count };
};
let refuseWrite = false;
const prisma = {
  story: {
    findMany: async ({ where, take }: { where: Where; take?: number }) => selected(where).sort((a, b) => b.id - a.id).slice(0, take),
    findUnique: async ({ where }: { where: Where }) => selected(where)[0] ?? null,
    findFirst: async ({ where }: { where: Where }) => selected(where)[0] ?? null,
    count: async ({ where }: { where: Where }) => selected(where).length,
    groupBy: async ({ where, take }: { where: Where; take: number }) => {
      const counts = new Map<string, number>();
      for (const row of selected(where)) counts.set(row.material, (counts.get(row.material) ?? 0) + 1);
      return [...counts].map(([material, count]) => ({ material, _count: { material: count } }))
        .sort((a, b) => b._count.material - a._count.material).slice(0, take);
    },
    aggregate,
    updateMany: async ({ where, data }: { where: Where; data: Partial<Omit<Row, "printHours" | "filamentMeters">> & { printHours?: number | null; filamentMeters?: number | null } }) => {
      if (refuseWrite) return { count: 0 };
      const selection = selected(where);
      for (const row of selection) {
        const { printHours, filamentMeters, ...rest } = data;
        Object.assign(row, rest);
        if (printHours !== undefined) row.printHours = printHours === null ? null : new Prisma.Decimal(printHours);
        if (filamentMeters !== undefined) row.filamentMeters = filamentMeters === null ? null : new Prisma.Decimal(filamentMeters);
      }
      return { count: selection.length };
    },
  },
  user: {
    findMany: async () => [member, owner, { ...member, id: "another-member", name: "Another member" }]
      .map(actor => ({ ...actor, banned: false, _count: { stories: rows.filter(row => row.uploaderId === actor.id).length } })),
  },
  memberBadge: { createMany: async () => ({ count: 0 }) },
  auditEvent: { create: async ({ data }: { data: typeof events[number] }) => events.push(data) },
  $queryRaw: async () => [],
  $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma),
};
Reflect.set(globalThis, "prisma", prisma);
Reflect.set(globalThis, "React", React);
Reflect.set(globalThis, "orderUsageTestPaths", paths);
const signIn = (actor: Actor | null) => Reflect.set(globalThis, "orderUsageTestActor", actor);
signIn(member);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier.endsWith(".module.css")) {
      return { url: "data:text/javascript,export default new Proxy({}, { get: (_, name) => String(name) })", shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const path = new URL(resolved.url).pathname;
    if (path.endsWith("/src/lib/authz.ts") || ["next/cache", "next/headers", "next/navigation"].includes(specifier)) {
      return { ...resolved, url: new URL("./stubs/order-usage-context.ts", import.meta.url).href };
    }
    if (path.endsWith("/src/components/app-header.tsx")) {
      return { ...resolved, url: "data:text/javascript,export const AppHeader = () => null" };
    }
    if (path.endsWith(".png")) {
      return { ...resolved, url: 'data:text/javascript,export default {src:"/print-it-star.png",width:64,height:64}' };
    }
    return resolved;
  },
});
const { default: OrdersPage } = await import("../src/app/me/page");
const { default: PrintsPage } = await import("../src/app/admin/prints/page");
const { recordStoryPrintTime: saveTimeForm } = await import("../src/app/actions/stories");
const { PATCH: saveTime } = await import("../src/app/api/stories/[id]/time/route");
const { POST: advance } = await import("../src/app/api/stories/[id]/advance/route");
const { printHoursOr400, recordStoryPrintTime } = await import("../src/lib/stories");
const page = async () => renderToStaticMarkup(await OrdersPage({ searchParams: Promise.resolve({}) }));
const patch = (id: number, body: Record<string, unknown>, origin?: string) => saveTime(new Request(`http://localhost:3000/api/stories/${id}/time`, {
  method: "PATCH", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: String(id) }) });
const move = (id: number, body: Record<string, unknown> = {}) => advance(new Request(`http://localhost:3000/api/stories/${id}/advance`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: String(id) }) });

let html = await page();
assert.ok(html.includes("1.25 h") && html.includes("25.123 m"), "Totals count Delivery and Done once, without multiplying by quantity or counting unfinished/declined orders");
assert.ok(!html.includes("Recorded on"), "Usage totals omit completed-order coverage notes");
assert.ok(!html.includes("Order 8") && !html.includes("100 m"), "Neither member orders nor usage totals include another member");
signIn(owner);
html = await page();
assert.ok(html.includes("11.25 h") && html.includes("125.123 m"), "The owner's All orders totals cover the group");
let $ = load(html);
assert.equal($("input[name=printHours]").length, 4, "Admin All orders offers time entry for every completed print");
assert.equal($("#time-record-1").attr("value"), "1.25", "Editing starts with this print's saved time");
assert.equal($("#time-record-2").attr("value"), "0", "Recorded zero stays editable as zero");
for (const id of [4, 5, 6, 7]) assert.equal($(`#time-record-${id}`).length, 0, "Unfinished or declined prints cannot record actual time");

const from = "/admin/prints?who=member&who=another-member&before=9";
html = renderToStaticMarkup(await PrintsPage({ searchParams: Promise.resolve({ who: [member.id, "another-member"], before: "9" }) }));
$ = load(html);
assert.equal($("input[name=printHours]").length, 4, "Prints by person has one time form per completed print");
assert.equal($("#time-record-1").closest("form").find("input[name=id]").attr("value"), "1", "The time form targets its own ticket");
assert.equal($("#time-record-1").closest("form").find("input[name=from]").attr("value"), from, "Time entry remembers all selected people and the older-page cursor");
assert.ok(html.includes("Print time: 1.25 h") && html.includes("Print time not recorded"), "The admin list distinguishes saved time from unknown time");

signIn({ ...owner, role: "client", previewing: true });
html = await page();
assert.ok(html.includes("0 h") && html.includes("0 m"), "Member preview retains its own scope and empty totals");
assert.equal(load(html)("input[name=printHours]").length, 0, "Member preview has no admin time controls");
signIn(member);
assert.equal(load(await page())("input[name=printHours]").length, 0, "Members see totals without time editing controls");
await assert.rejects(PrintsPage({ searchParams: Promise.resolve({ who: member.id }) }), /Admin required/);

for (const actor of [null, member, { ...owner, role: "client", previewing: true }] satisfies Array<Actor | null>) {
  signIn(actor);
  assert.equal((await patch(1, { printHours: 5 })).status, actor ? 403 : 401);
}
await assert.rejects(recordStoryPrintTime(member, 1, 5), error => (error as { status: number }).status === 403);
signIn(owner);
assert.equal((await patch(1, { printHours: 5 }, "https://elsewhere.example")).status, 403);
assert.equal((await patch(1, {})).status, 400);
assert.equal((await patch(999, { printHours: 5 })).status, 404);
for (const id of [4, 5, 6, 7]) assert.equal((await patch(id, { printHours: 5 })).status, 409);
for (const value of [-1, 1_000_001, 0.0001, true, {}, "nope"]) assert.equal((await patch(1, { printHours: value })).status, 400);
for (const value of [NaN, Infinity, -Infinity, [], false]) assert.throws(() => printHoursOr400(value));
assert.equal(printHoursOr400(" 1.5 "), 1.5);
assert.equal(printHoursOr400(" "), null);
assert.equal(printHoursOr400(1_000_000), 1_000_000);
assert.equal(events.length, 0, "Refused writes must not be audited as successful");
assert.equal((await patch(1, { printHours: 2.5 })).status, 200);
assert.equal((await patch(1, { printHours: 2.5 })).status, 200);
assert.equal((await move(1)).status, 200);
assert.equal(rows[0]!.printHours?.toNumber(), 2.5, "Moving Delivery to Done preserves the saved runtime");
assert.equal(rows[0]!.filamentMeters?.toNumber(), 25.123, "Time edits do not change filament measurements");
signIn(member);
html = await page();
assert.ok(html.includes("2.5 h") && html.includes("25.123 m"), "Corrections, repeated saves and collection must not accumulate duplicates");
signIn(owner);
assert.equal((await patch(1, { printHours: null })).status, 200);
signIn(member);
html = await page();
assert.ok(html.includes("0 h") && html.includes("25.123 m"), "Clearing usage reduces the time total while preserving recorded zero and filament usage");
signIn(owner);
assert.equal((await move(5, { printHours: 1 })).status, 409, "Time cannot be logged before completion");
assert.equal((await move(4, { printHours: -1, filamentMeters: 50 })).status, 400);
assert.equal(rows[3]!.status, "Printing", "Invalid measurements must leave the status alone");
const completed = await move(4, { printHours: 0.5, filamentMeters: 50 });
assert.equal(completed.status, 200);
const body = await completed.json();
assert.equal(body.story.printHours, 0.5);
assert.equal(body.story.filamentMeters, 50);
assert.ok(events.some(event => event.action === "story.status_changed" && event.detail?.printHours === 0.5), "Completion records actual runtime in the audit trail");
refuseWrite = true;
const priorEvents = events.length;
assert.equal((await patch(4, { printHours: 9 })).status, 409);
assert.equal(rows[3]!.printHours?.toNumber(), 0.5);
assert.equal(events.length, priorEvents, "A stale write must not report or audit success");
refuseWrite = false;
assert.ok(paths.includes("/me") && paths.includes("/story/1"), "Saved measurements refresh the totals and ticket");
assert.ok(paths.includes("/admin/prints"), "Time edits also refresh Prints by person");

const submitTime = async (id: number, printHours: string, origin = from) => {
  const form = new FormData();
  form.set("id", String(id));
  form.set("printHours", printHours);
  form.set("from", origin);
  let destination = "";
  await assert.rejects(saveTimeForm(form), error => {
    if (!(error instanceof Error) || !("location" in error)) return false;
    destination = String(error.location);
    return true;
  });
  return new URL(destination, "https://print.example");
};
rows = [fixture(10, "Done", null, 27.54), fixture(11, "Done", 2, 10), fixture(12, "Done", 8, 50, "another-member")];
signIn(owner);
let destination = await submitTime(10, "1.5", `${from}&toast=old&error=old#prints`);
assert.equal(rows[0]!.printHours?.toNumber(), 1.5, "The admin time form assigns hours to the selected print");
assert.equal(rows[1]!.printHours?.toNumber(), 2, "Recording one print does not change another print's time");
assert.equal(rows[2]!.printHours?.toNumber(), 8, "Recording one member's print does not change another member's time");
assert.equal(rows[0]!.filamentMeters?.toNumber(), 27.54, "The time form preserves this print's recorded filament");
assert.deepEqual(destination.searchParams.getAll("who"), [member.id, "another-member"]);
assert.equal(destination.searchParams.get("before"), "9");
assert.equal(destination.searchParams.get("toast"), "Print time saved: 1.5 hours.");
assert.equal(destination.searchParams.has("error"), false);
assert.equal(destination.hash, "#prints");
signIn(member);
assert.ok((await page()).includes("3.5 h"), "Per-print hours feed only that member's accrued total");
const unauthorizedForm = new FormData();
unauthorizedForm.set("id", "10");
unauthorizedForm.set("printHours", "9");
await assert.rejects(saveTimeForm(unauthorizedForm), /Admin required/);
assert.equal(rows[0]!.printHours?.toNumber(), 1.5);
signIn(owner);
destination = await submitTime(10, "-1");
assert.ok(destination.searchParams.has("error"), "Invalid time returns a visible error");
assert.deepEqual(destination.searchParams.getAll("who"), [member.id, "another-member"], "Validation errors preserve the selected people");
html = renderToStaticMarkup(await PrintsPage({ searchParams: Promise.resolve({ who: member.id, error: destination.searchParams.get("error")! }) }));
assert.ok(html.includes("Enter actual print time") && html.includes('role="status"'), "Prints by person renders action errors");
destination = await submitTime(10, "2.5", "https://elsewhere.example/prints");
assert.equal(destination.pathname, "/queue", "Time forms cannot redirect off-site");
await submitTime(10, "0", "/me");
assert.equal(rows[0]!.printHours?.toNumber(), 0, "A zero-hour correction is saved");
await submitTime(10, "", "/me");
assert.equal(rows[0]!.printHours, null, "Blank time clears an incorrect entry");
signIn(member);
assert.ok((await page()).includes("2 h"), "Corrections replace the old time in the member total");
rows = [fixture(9, "Done", null, null)];
signIn(member);
html = await page();
$ = load(html);
assert.equal($("p").filter((_, element) => $(element).text() === "—").length, 2, "Unknown historical measurements stay unknown for both totals");

const usualMaterial = async () => {
  const match = (await page()).match(/<p\b[^>]*>([^<]*)<\/p><p\b[^>]*>Your usual material<\/p>/);
  assert.ok(match, "The member profile shows its usual material card");
  return match[1];
};
const materialOrder = (id: number, material: string, uploaderId = member.id) => ({ ...fixture(id, "Done", null, null, uploaderId), material });
rows = [
  ...Array.from({ length: 4 }, (_, i) => materialOrder(20 + i, "Auto")),
  materialOrder(24, "PLA"),
  materialOrder(25, "PLA"),
  materialOrder(26, "PETG"),
  ...Array.from({ length: 5 }, (_, i) => materialOrder(30 + i, "PETG", "another-member")),
];
assert.equal(await usualMaterial(), "PLA", "The most requested actual material wins even when Auto and another member's material are more frequent");
rows = [materialOrder(40, "Auto"), materialOrder(41, "Auto"), materialOrder(42, "PLA", "another-member")];
assert.equal(await usualMaterial(), "—", "Auto-only members have no usual material, even when another member has chosen one");
rows = [];
assert.equal(await usualMaterial(), "—", "Members without requests have no usual material");
console.log("Order usage checks passed: scoped totals and usual material excluding Auto, per-print admin forms, filtered return paths, partial/unknown/zero measurements, all-copy totals, owner-only recording, validation, corrections, collection, completion, stale writes, API values, audit and refresh.");
