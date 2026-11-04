import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Actor } from "../src/lib/scope";
import { completedJobHours, pipelineStage, jobMentionsTicket, studioSupportsModel } from "../src/lib/print-pipeline";

// Real services, API handlers and queue render, with isolated records. No live account or printer.
const owner: Actor = { id: "owner", name: "Member", email: "owner@example.test", initials: "ME", role: "admin", canAddDevice: false, canAddMember: false };
const member: Actor = { ...owner, id: "member", name: "Member", role: "client" };
let actor: Actor | null = owner;
const now = new Date("2026-10-14T12:00:00Z");
const fixture = (id: number, status: "Requested" | "Accepted" | "Printing" | "Delivery" | "Done" | "Declined" = "Accepted") => ({
  id, status, title: `Desk bracket ${id}`, uploaderId: "member", uploader: { id: "member", name: "Recipient", initials: "RE" },
  filename: "bracket.stl" as string | null, storageKey: "old-model" as string | null, fileSize: 134, mimeType: "model/stl", dims: "10 × 10 × 1 mm",
  flagged: false, flagReason: null as string | null, preparedAt: null as Date | null,
  quantity: 2, material: "PLA", colorName: "Jade White", colorHex: "#ffffff", colorMode: "solid", colorStyle: null,
  priority: 50, swatchId: null, note: "", printSettings: "", links: [], sourceUrl: null, attachments: [], comments: [], _count: { comments: 0 },
  filamentMeters: null as number | null, printHours: null as number | null, createdAt: now, updatedAt: now,
});
type Row = ReturnType<typeof fixture>;
let rows: Row[] = [fixture(1), fixture(2)];
const jobFixture = (id: string, outcome = "finished", seconds = 1800) => ({ id, storyId: null as number | null, printerId: "p1s", printer: { name: "Bambu P1S" }, title: "PI-1 bracket", outcome, seconds, estimate: 9999, startedAt: now, endedAt: outcome === "finished" ? new Date(now.getTime() + seconds * 1000) : null, syncedAt: now });
let jobs = [jobFixture("a"), jobFixture("b", "failed", 99)];
const events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
const paths: string[] = [], written: string[] = [], deleted: string[] = [];
let beforeWrite = () => {};
function matches(row: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Record<string, unknown>[]).every(part => matches(row, part));
    const actual = Reflect.get(row, key);
    if (value instanceof Date) return actual instanceof Date && actual.getTime() === value.getTime();
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("not" in value) return actual !== Reflect.get(value, "not");
      if ("in" in value) return (Reflect.get(value, "in") as unknown[]).includes(actual);
    }
    return actual === value;
  });
}
const database = {
  story: {
    findUnique: async ({ where }: { where: { id: number } }) => { const row = rows.find(r => r.id === where.id); return row ? structuredClone(row) : null; },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => matches(r, where)) ?? null,
    findMany: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: Array<Record<string, "asc" | "desc">> }) => rows.filter(r => matches(r, where)).sort((a, b) => {
      for (const clause of orderBy) {
        const [key, direction] = Object.entries(clause)[0]!;
        const difference = Number(Reflect.get(a, key)) - Number(Reflect.get(b, key));
        if (difference) return direction === "asc" ? difference : -difference;
      }
      return 0;
    }).map(r => ({ ...r, printJobs: jobs.filter(j => j.storyId === r.id) })),
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter(r => matches(r, where)).length,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      beforeWrite();
      const selected = rows.filter(r => matches(r, where));
      selected.forEach(r => Object.assign(r, data));
      return { count: selected.length };
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<Row> }) => Object.assign(rows.find(r => r.id === where.id)!, data),
  },
  printerPrint: {
    findUnique: async ({ where }: { where: { id: string } }) => jobs.find(j => j.id === where.id) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => jobs.filter(j => matches(j, where)),
    update: async ({ where, data }: { where: { id: string }; data: { storyId: number | null } }) => Object.assign(jobs.find(j => j.id === where.id)!, data),
  },
  $queryRaw: async () => [],
  $transaction: async <T>(operation: (tx: unknown) => Promise<T>) => operation(database),
};
Object.assign(globalThis, { pipelineDb: database, pipelineEvents: events, pipelinePaths: paths, pipelineActor: () => actor, pipelineStory: (id: number) => rows.find(r => r.id === id), pipelineOwner: owner, pipelineWritten: written, pipelineDeleted: deleted, React });
process.env.BETTER_AUTH_SECRET = "isolated-pipeline-test-only";
process.env.BETTER_AUTH_URL = "http://fixture.test";
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "next/cache": "export const revalidatePath=p=>globalThis.pipelinePaths.push(p)",
  "@/lib/db": "export const db=globalThis.pipelineDb",
  "@/lib/authz": `export { FLOW, storyRef } from '${new URL("../src/lib/scope.ts", import.meta.url).href}';export const currentUser=async()=>globalThis.pipelineActor();export const requireUser=async()=>globalThis.pipelineActor();export const getStoryOr404=async id=>globalThis.pipelineStory(id);export const requireAdmin=async()=>globalThis.pipelineOwner;export const printerName=async()=> 'Member';export const printerOwner=async()=>globalThis.pipelineOwner;export const notify=async()=>{}`,
  "@/lib/audit": "export const record=async e=>globalThis.pipelineEvents.push(e)",
  "@/lib/badges": "export const awardCompletedPrintBadges=async()=>{};export const createStoryWithBadges=async()=>{}",
  "@/lib/storage": "export const putModel=async k=>globalThis.pipelineWritten.push(k);export const deleteModel=async k=>globalThis.pipelineDeleted.push(k);export const storageKeyFor=()=> 'new-model';export const MIME_FOR={'.stl':'model/stl'};export const copyModel=async()=>{}",
  "@/lib/bambu": "export const bambuLink=async()=>null;export const syncIfStale=async()=>{}",
  "@/components/app-header": "export const AppHeader=()=>null",
  "@/components/toast": "export const Toast=()=>null",
  "./printer-hours": "export const PrinterHours=()=>null",
  "@/app/actions/stories": "export const advanceStory=async()=>{};export const clearFlag=async()=>{};export const declineStory=async()=>{};export const flagStory=async()=>{};export const recordStoryFilament=async()=>{};export const recordStoryPrintTime=async()=>{};export const withdrawStory=async()=>{}",
  "@/app/actions/ticket-pipeline": "export const prepareTicket=async()=>{};export const linkBambuJob=async()=>{};export const importTicketRuntime=async()=>{}",
  "@/components/bambu-job-panel": "export const BambuJobPanel=()=>null",
  "@/components/order-media": "export const OrderMedia=()=>null",
  "@/components/ticket-model-upload": "export const TicketModelUpload=()=>null",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(mocks, specifier)) return { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true };
  const resolved = nextResolve(specifier, context);
  if (resolved.url.endsWith(".module.css")) return { url: 'data:text/javascript,export default new Proxy({}, {get: (_, key) => String(key)})', shortCircuit: true };
  if (resolved.url.endsWith(".png")) return { url: 'data:text/javascript,export default {src:"/print-it-star.png",width:64,height:64}', shortCircuit: true };
  return resolved;
} });
const { setPreparation, assignBambuJob, importBambuRuntime, attachTicketModel } = await import("../src/lib/ticket-pipeline");
const { StoryProblem, advanceStory } = await import("../src/lib/stories");
const rejected = (status: number) => (e: unknown) => e instanceof StoryProblem && e.status === status;

assert.equal(pipelineStage(rows[0]!), "prepare");
await assert.rejects(setPreparation(member, 1, true, true), rejected(403));
await assert.rejects(setPreparation(owner, 1, true), rejected(400));
await assert.rejects(advanceStory(owner, 1), rejected(409));
rows[0]!.filename = null;
await assert.rejects(setPreparation(owner, 1, true, true), rejected(409));
rows[0]!.filename = "bracket.stl";
rows[0]!.flagged = true;
await assert.rejects(setPreparation(owner, 1, true, true), rejected(409));
rows[0]!.flagged = false;
beforeWrite = () => { rows[0]!.flagged = true; };
await assert.rejects(setPreparation(owner, 1, true, true), rejected(409));
beforeWrite = () => {}; rows[0]!.flagged = false;
await setPreparation(owner, 1, true, true);
assert.equal(pipelineStage(rows[0]!), "ready");
beforeWrite = () => { rows[0]!.flagged = true; };
await assert.rejects(advanceStory(owner, 1), rejected(409));
assert.equal(rows[0]!.status, "Accepted", "A concurrent flag must block starting the print");
beforeWrite = () => {}; rows[0]!.flagged = false;
await advanceStory(owner, 1);
assert.equal(pipelineStage(rows[0]!), "printing");
await assert.rejects(setPreparation(owner, 1, false), rejected(409));
await assert.rejects(assignBambuJob(member, 1, "a", true), rejected(403));
await assignBambuJob(owner, 1, "a", true);
await assignBambuJob(owner, 1, "a", true);
await assert.rejects(assignBambuJob(owner, 2, "a", true), rejected(409));
await assert.rejects(assignBambuJob(owner, 2, "a", false), rejected(409));
await assert.rejects(assignBambuJob(owner, 1, "missing", true), rejected(404));
await assignBambuJob(owner, 1, "b", true);
await assert.rejects(importBambuRuntime(owner, 1), rejected(409));
rows[0]!.status = "Delivery";
await assert.rejects(importBambuRuntime(member, 1), rejected(403));
assert.equal((await importBambuRuntime(owner, 1)).hours, 0.5);
assert.equal((await importBambuRuntime(owner, 1)).hours, 0.5, "Imports replace rather than accumulate");
assert.equal(rows[0]!.printHours, 0.5);
assert.equal(rows[0]!.filamentMeters, null, "Weight estimates cannot become extrusion meters");
jobs.push({ ...jobFixture("c", "printing", 0), storyId: 1 });
await assert.rejects(importBambuRuntime(owner, 1), rejected(409));
jobs[2]!.outcome = "finished"; jobs[2]!.endedAt = new Date(); jobs[2]!.seconds = 900;
assert.equal((await importBambuRuntime(owner, 1)).hours, 0.75, "Multiple successful plates sum once each, excluding failed attempts");
await assignBambuJob(owner, 1, "a", false);
await assignBambuJob(owner, 2, "a", true);
assert.equal(jobs[0]!.storyId, 2);
assert.equal(jobMentionsTicket("PI-1-part.stl", 1), true);
for (const title of ["PI-12", "PI-1a", "XPI-1"]) assert.equal(jobMentionsTicket(title, 1), false);
assert.equal(completedJobHours([{ outcome: "finished", endedAt: null, seconds: 0 }, jobs[0]!]), null, "Incomplete runtime cannot be partially imported");
for (const name of ["model.stl", "part.3mf", "part.STEP"]) assert.equal(studioSupportsModel(name), true);
assert.equal(studioSupportsModel("preview.glb"), false);

const stl = new TextEncoder().encode("solid bracket\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid bracket\n");
await assert.rejects(attachTicketModel(member, 2, "part.stl", stl), rejected(403));
await assert.rejects(attachTicketModel(owner, 2, "fake.stl", new Uint8Array([1, 2])), rejected(422));
await attachTicketModel(owner, 2, "../../part.stl", stl);
assert.equal(rows[1]!.filename, "part.stl");
assert.equal(rows[1]!.preparedAt, null);
assert.deepEqual(deleted, ["old-model"]);
beforeWrite = () => { rows[1]!.status = "Printing"; };
await assert.rejects(attachTicketModel(owner, 2, "other.stl", stl), rejected(409));
assert.equal(deleted.at(-1), "new-model", "Failed model updates clean up their new bytes");
beforeWrite = () => {};

const prepareRoute = await import("../src/app/api/stories/[id]/prepare/route");
const runtimeRoute = await import("../src/app/api/stories/[id]/bambu-runtime/route");
const jobsRoute = await import("../src/app/api/stories/[id]/bambu-jobs/route");
const request = (body?: object, origin = "http://fixture.test") => new Request("http://fixture.test/api/stories/2/prepare", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const context = { params: Promise.resolve({ id: "2" }) };
actor = null; assert.equal((await prepareRoute.POST(request(), context)).status, 401);
actor = member; assert.equal((await prepareRoute.POST(request(), context)).status, 403);
assert.equal((await runtimeRoute.POST(request(), context)).status, 403);
assert.equal((await jobsRoute.GET(new Request("http://fixture.test/api/stories/2/bambu-jobs"), context)).status, 403);
actor = owner; rows[1]!.status = "Accepted";
assert.equal((await prepareRoute.POST(request({ ready: true, confirmed: true }, "http://attacker.test"), context)).status, 403);
assert.equal((await prepareRoute.POST(request({ ready: "yes" }), context)).status, 400);
assert.equal((await prepareRoute.POST(request({ ready: true, confirmed: true }), context)).status, 200);
assert.equal((await prepareRoute.POST(request({ ready: false }), context)).status, 200);
assert.equal(rows[1]!.preparedAt, null);
assert.equal((await jobsRoute.POST(request({ jobId: "b" }), context)).status, 409);
assert.ok(events.some(e => e.action === "story.prepared") && events.some(e => e.action === "story.bambu_runtime_imported"));
assert.ok(paths.includes("/me") && paths.includes("/queue") && paths.includes("/story/1"));

rows = [fixture(11, "Requested"), fixture(12), { ...fixture(13), preparedAt: now }, fixture(14, "Printing"), fixture(15, "Delivery"), fixture(16, "Done"), fixture(17, "Declined")];
rows[1]!.flagged = true; rows[1]!.flagReason = "Check the thin walls";
// Existing tickets can still have retired values; they must never affect ordering.
rows.push(
  { ...fixture(20, "Requested"), createdAt: new Date("2026-10-13"), priority: 100 },
  { ...fixture(19, "Requested"), createdAt: new Date("2026-10-14"), priority: 100 },
  { ...fixture(18, "Requested"), createdAt: new Date("2026-10-13"), priority: 1 },
);
jobs = [{ ...jobFixture("render", "finished"), storyId: 14 }];
const QueuePage = (await import("../src/app/queue/page")).default;
const html = renderToStaticMarkup(await QueuePage({ searchParams: Promise.resolve({}) }));
for (const stage of ["review", "prepare", "ready", "printing", "pickup"]) assert.ok(html.includes(`stage-${stage}`));
assert.ok(html.includes("Open in Bambu Studio") && html.includes("printit-bambu://slice/13?t="));
assert.ok(html.includes("Check the thin walls") && html.includes("0.5 actual hours"));
assert.ok(!html.includes("Desk bracket 16") && !html.includes("Desk bracket 17"), "Finished and declined tickets leave the active pipeline");
assert.ok(html.indexOf("Desk bracket 18") < html.indexOf("Desk bracket 20") && html.indexOf("Desk bracket 20") < html.indexOf("Desk bracket 19"), "Queue ordering uses request date then ticket number, ignoring retired priorities");
assert.ok(!/priority/i.test(html), "Queue cards and instructions have no priority feature");
const StoryPage = (await import("../src/app/story/[id]/page")).default;
for (const viewer of [member, owner]) {
  actor = viewer;
  const ticketHtml = renderToStaticMarkup(await StoryPage({ params: Promise.resolve({ id: "11" }), searchParams: Promise.resolve({}) }));
  assert.ok(ticketHtml.includes("Desk bracket 11") && ticketHtml.includes("Quantity"));
  assert.ok(!/priority/i.test(ticketHtml), `${viewer.role} ticket detail has no priority fact or editor`);
}
const { WishSchema } = await import("../src/lib/catalog");
const { storyResource } = await import("../src/lib/api");
for (const priority of [100, "high", "URGENT!!"]) {
  const wish = WishSchema.parse({ material: "PLA", colorName: "White", quantity: 1, priority });
  assert.ok(!Object.hasOwn(wish, "priority"), "Legacy submission fields cannot select priority");
}
assert.ok(!Object.hasOwn(storyResource(rows[0]! as never), "priority"), "API ticket resources omit retired priority values");
if (process.env.PIPELINE_PREVIEW === "1") {
  mkdirSync("shots", { recursive: true });
  writeFileSync("shots/ticket-pipeline.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/pipeline.css"></head><body>${html}</body></html>`);
}
console.log("Ticket pipeline passed: readiness and races, owner-only APIs, Bambu jobs/runtime, model validation/replacement, oldest-first queue ordering, and priority-free member/admin tickets and API resources.");
