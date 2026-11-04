/** Exercise the real guards/actions/routes without touching production data. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

let setting: { enabled: boolean; message: string } | null = null;
let writes = 0;
let failSave = false;
let role: "admin" | "client" | null = "admin";
let preview = false;
const events: unknown[] = [];
const paths: string[] = [];
Object.assign(globalThis, {
  maintenanceTestDb: {
    siteMaintenance: {
      findUnique: async () => setting,
      upsert: async ({ create, update }: { create: typeof setting; update: typeof setting }) => {
        if (failSave) throw new Error("Database unavailable");
        writes++;
        setting = setting ? update : create;
        return setting;
      },
    },
  },
  maintenanceTestAuth: { api: { getSession: async () => role ? {
    session: { id: "session" },
    user: { id: "member", role, name: "Member", email: "member@example.test", createdAt: new Date() },
  } : null } },
  maintenanceTestCookies: { get: () => preview ? { value: "session" } : undefined, set: () => { preview = false; } },
  maintenanceTestEvents: events,
  maintenanceTestPaths: paths,
});
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/db": "export const db=globalThis.maintenanceTestDb",
  "@/lib/auth": "export const auth=globalThis.maintenanceTestAuth",
  "@/lib/audit": "export const record=async e=>globalThis.maintenanceTestEvents.push(e)",
  "next/headers": "export const headers=async()=>new Headers();export const cookies=async()=>globalThis.maintenanceTestCookies",
  "next/navigation": "export const redirect=p=>{throw new Error('redirect:'+p)};export const notFound=()=>{throw new Error('notFound')}",
  "next/cache": "export const revalidatePath=p=>globalThis.maintenanceTestPaths.push(p)",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });

const { maintenanceStatus, DEFAULT_MAINTENANCE_MESSAGE } = await import("../src/lib/maintenance");
const { requireUser, requireAdmin } = await import("../src/lib/authz");
const { saveMaintenance } = await import("../src/app/admin/maintenance/actions");
const { leaveMaintenancePreview } = await import("../src/app/maintenance/actions");
const { withActor } = await import("../src/lib/api");
const { POST: upload } = await import("../src/app/api/upload/route");
const { GET: status } = await import("../src/app/api/maintenance/route");
const form = (enabled: boolean, message = "Replacing the nozzle. Back tomorrow.") => {
  const data = new FormData();
  if (enabled) data.set("enabled", "on");
  data.set("message", message);
  return data;
};
const context = { params: Promise.resolve({}) };
let handled = 0;
const api = withActor(async () => { handled++; return Response.json({ ok: true }); });
const request = () => new Request("http://localhost/api/stories", { method: "POST" });

assert.deepEqual(await maintenanceStatus(), { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
assert.deepEqual(await saveMaintenance({}, form(true)), { saved: true });
assert.equal(writes, 1);
assert.equal(events.length, 1);
assert.deepEqual(paths, ["/"]);
assert.equal((await requireAdmin()).role, "admin");
assert.equal((await api(request(), context)).status, 200, "Admin API access stays open");

role = "client";
await assert.rejects(requireUser("/upload"), /redirect:\/maintenance/);
await assert.rejects(saveMaintenance({}, form(false)), /redirect:\/maintenance/);
assert.equal(writes, 1, "Members cannot reopen the site");
const blocked = await api(request(), context);
assert.equal(blocked.status, 503);
assert.equal(blocked.headers.get("Retry-After"), "60");
assert.equal(blocked.headers.get("Cache-Control"), "no-store");
assert.equal((await blocked.json()).maintenance, true);
assert.equal(handled, 1, "No member handler executes while closed");
const uploadRequest = new Request("http://localhost/api/upload", { method: "POST", body: "must not be parsed" });
assert.equal((await upload(uploadRequest)).status, 503);
assert.equal(uploadRequest.bodyUsed, false, "Uploads are refused before buffering or saving files");
const publicStatus = await status();
assert.deepEqual(await publicStatus.json(), { enabled: true, message: "Replacing the nozzle. Back tomorrow." });
assert.equal(publicStatus.headers.get("Cache-Control"), "no-store");

role = null;
assert.equal((await api(request(), context)).status, 401, "API authentication still applies");
await assert.rejects(saveMaintenance({}, form(false)), /redirect:/);
role = "admin";
preview = true;
await assert.rejects(requireUser(), /redirect:\/maintenance/, "Member preview sees the closure");
await assert.rejects(leaveMaintenancePreview(), /redirect:\/admin\/maintenance/);
assert.equal(preview, false);
assert.equal((await requireAdmin()).role, "admin", "The owner can escape preview and reopen");
assert.ok((await saveMaintenance({}, form(true, "x".repeat(1001)))).error);
assert.equal(writes, 1);
failSave = true;
assert.ok((await saveMaintenance({}, form(false))).error);
assert.equal((await maintenanceStatus()).enabled, true, "Failed saves preserve the switch");
failSave = false;
assert.deepEqual(await saveMaintenance({}, form(false, " ")), { saved: true });
assert.deepEqual(await maintenanceStatus(), { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
role = "client";
assert.equal((await requireUser()).role, "client");
assert.equal((await api(request(), context)).status, 200);
await assert.rejects(saveMaintenance({}, form(true)), /notFound/, "Members cannot enable maintenance either");
assert.equal(writes, 2);
console.info("PASS maintenance persists, gates pages/actions/API/uploads, preserves admin access, exits preview, validates input and reopens");
