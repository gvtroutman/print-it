import assert from "node:assert/strict";
import type { BambuTask } from "../src/lib/bambu";

// Exercise the real importer and sync against in-memory storage and cloud responses.
// No owner's database, credentials or printer is used.
type StoredPrint = {
  id: string; printerId: string; title: string; startedAt: Date; endedAt: Date | null;
  seconds: number; estimate: number; outcome: string; grams: number | null; storyId?: number | null;
};
const prints = new Map<string, StoredPrint>();
const printer = { id: "p1s", bambuDeviceId: "fixture-device" };
const link = { id: "owner", accessToken: "fixture-token", refreshToken: "", lastSyncAt: null as Date | null, lastError: "" };
const originalPrisma = Reflect.get(globalThis, "prisma");
const originalFetch = globalThis.fetch;
let tasks: BambuTask[] = [];
let requests = 0;
let cloudError = false;
let waitForCloud: Promise<void> | null = null;

Reflect.set(globalThis, "prisma", {
  printer: { findMany: async () => [printer] },
  printerPrint: {
    upsert: async ({ where, create, update }: { where: { id: string }; create: StoredPrint; update: Omit<StoredPrint, "id"> }) => {
      prints.set(where.id, prints.has(where.id) ? { ...prints.get(where.id)!, ...update } : create);
    },
    count: async () => prints.size,
  },
  bambuLink: {
    findUnique: async () => ({ ...link }),
    update: async ({ data }: { data: Partial<typeof link> }) => Object.assign(link, data),
  },
});
globalThis.fetch = async (input, init) => {
  assert.match(String(input), /^https:\/\/api\.bambulab\.com\/v1\/user-service\/my\/tasks\?/);
  assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-token");
  requests++;
  const snapshot = tasks.map((task) => ({ ...task }));
  if (waitForCloud) await waitForCloud;
  return cloudError
    ? Response.json({ message: "Temporarily unavailable" }, { status: 503 })
    : Response.json({ total: snapshot.length, hits: snapshot });
};

const task = (id: string, status: number, endTime: string | null): BambuTask => ({
  id, status, deviceId: "fixture-device", title: "swatch.stl",
  startTime: "2026-10-13T14:04:00Z", endTime, costTime: 2700,
});
const totalSeconds = () => [...prints.values()].reduce((sum, print) => sum + print.seconds, 0);

try {
  const { applyTasks, syncPrints, syncIfStale } = await import("../src/lib/bambu");
  await applyTasks([
    task("finished", 2, "2026-10-13T14:34:00Z"),
    task("failed", 3, "2026-10-13T14:06:00Z"),
    task("active-1", 1, "2026-10-13T14:04:20Z"),
    task("active-4", 4, "2026-10-13T14:04:00Z"),
    { ...task("invalid-start", 2, null), startTime: "invalid" },
    { ...task("missing-device", 2, null), deviceId: undefined },
  ]);
  assert.equal(prints.size, 4, "Malformed tasks must not become print records");
  assert.equal(prints.get("finished")!.seconds, 1800, "A 30-minute print adds 0.5 hours, not its 45-minute estimate");
  assert.equal(prints.get("failed")!.seconds, 120, "Failed jobs count only the time they actually ran");
  for (const id of ["active-1", "active-4"]) {
    assert.equal(prints.get(id)!.outcome, "printing", "Both active Bambu status codes need a readable label");
    assert.equal(prints.get(id)!.seconds, 0, "An active job's placeholder end must not inflate the meter");
    assert.equal(prints.get(id)!.endedAt, null);
  }

  // Simulate the screenshot's legacy row, then a due sync after the job finished.
  prints.get("active-4")!.outcome = "status 4";
  prints.get("active-4")!.storyId = 42;
  tasks = [task("active-4", 2, "2026-10-13T14:34:00Z")];
  link.lastSyncAt = new Date(Date.now() - 65_000);
  await syncIfStale(link);
  assert.equal(requests, 0, "Quiet history keeps the normal 15-minute interval");
  await syncIfStale(link, true);
  assert.equal(requests, 1, "Active history checks again after one minute");
  assert.equal(prints.get("active-4")!.outcome, "finished");
  assert.equal(prints.get("active-4")!.seconds, 1800, "The awaited refresh must expose the finished duration on this page load");
  assert.equal(prints.get("active-4")!.storyId, 42, "Cloud refresh preserves the owner's ticket assignment");
  assert.equal(totalSeconds(), 3720);
  await syncPrints();
  assert.equal(prints.size, 4, "Re-sync updates the same task, without adding it twice");
  assert.equal(totalSeconds(), 3720, "Repeated sync must not double-count time");
  const syncedRequests = requests;
  await syncIfStale(link, true);
  assert.equal(requests, syncedRequests, "Fresh active history should not hammer Bambu on every request");

  // A page must await an already-running manual sync, even with a fresh sync timestamp.
  let releaseCloud!: () => void;
  waitForCloud = new Promise<void>((resolve) => { releaseCloud = resolve; });
  const first = syncPrints();
  assert.equal(syncPrints(), first, "Concurrent refreshes share one cloud request");
  let pageReady = false;
  const page = syncIfStale(link, true).then(() => { pageReady = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(pageReady, false, "The page must not read the old meter before its running sync finishes");
  assert.equal(requests, syncedRequests + 1);
  releaseCloud();
  await Promise.all([first, page]);
  waitForCloud = null;
  assert.equal(pageReady, true);

  // A failed refresh preserves known hours and reports the problem instead of inventing runtime.
  cloudError = true;
  const lastSuccessfulSync = link.lastSyncAt;
  const failed = await syncPrints();
  assert.equal(failed.ok, false);
  assert.match(link.lastError, /Temporarily unavailable/);
  assert.equal(link.lastSyncAt, lastSuccessfulSync);
  assert.equal(totalSeconds(), 3720);
  cloudError = false;
  assert.equal((await syncPrints()).ok, true, "A failed sync must release the shared promise so retry works");
  assert.equal(link.lastError, "");
  await syncIfStale(null, true);
  console.info("Bambu checks passed: active statuses, real duration, completion refresh, duplicate prevention, sync intervals, concurrent requests and failure recovery.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalPrisma === undefined) Reflect.deleteProperty(globalThis, "prisma");
  else Reflect.set(globalThis, "prisma", originalPrisma);
}
