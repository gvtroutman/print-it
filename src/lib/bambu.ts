import "server-only";

import { db } from "@/lib/db";

/**
 * The owner's Bambu Lab account, read for print history.
 *
 * Bambu Cloud keeps every job sent through it: when it started and ended,
 * the model, the printer and the filament. Syncing copies those jobs into
 * `printerPrint`, so the hour meter on the owner's home climbs by itself
 * between readings. Jobs started from an SD card or in LAN-only mode never
 * reach the cloud, so they never show up here.
 *
 * Sign-in is by emailed code, which works for Google and Apple accounts too:
 * no Bambu password ever passes through the app. The token is kept in the
 * single `bambuLink` row and renewed with its refresh token when it lapses.
 */

const API = "https://api.bambulab.com";
const HEADERS = {
  "User-Agent": "bambu_network_agent/01.09.05.01",
  "X-BBL-Client-Name": "OrcaSlicer",
  "X-BBL-Client-Type": "slicer",
  "X-BBL-Client-Version": "01.09.05.51",
  "Content-Type": "application/json",
  Accept: "application/json",
};
const PAGE = 100;
/** A visit to the owner's home starts a sync when the last one is older than this. */
export const SYNC_EVERY_MS = 15 * 60_000;

/** Bambu task status codes, checked against real history: 2 finished, 3 failed or cancelled. */
const OUTCOMES: Record<number, string> = { 2: "finished", 3: "failed" };

export class BambuError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: init.token ? { ...HEADERS, Authorization: `Bearer ${init.token}` } : HEADERS,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new BambuError("Bambu Lab did not answer. Try again in a minute.");
  }
  const text = await res.text();
  if (!res.ok) {
    let message = `Bambu Lab said no (${res.status}).`;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      if (parsed.message || parsed.error) message = `Bambu Lab: ${parsed.message || parsed.error}`;
    } catch {}
    throw new BambuError(message, res.status);
  }
  return (text.trim() ? JSON.parse(text) : {}) as T;
}

// ---------- sign-in ----------

/** Ask Bambu to email a sign-in code to the account. */
export async function sendCode(email: string): Promise<void> {
  await call("/v1/user-service/user/sendemail/code", { body: { email, type: "codeLogin" } });
}

type LoginResponse = { accessToken?: string; refreshToken?: string; expiresIn?: number; loginType?: string };

/** Trade the emailed code for a token and keep it. */
export async function connect(email: string, code: string): Promise<void> {
  const r = await call<LoginResponse>("/v1/user-service/user/login", { body: { account: email, code } });
  if (!r.accessToken) {
    throw new BambuError(
      r.loginType === "tfa"
        ? "This account has two-step sign-in on, which the code flow cannot finish."
        : "That code did not work. Ask for a new one.",
    );
  }
  const data = {
    email,
    accessToken: r.accessToken,
    refreshToken: r.refreshToken ?? "",
    expiresAt: r.expiresIn ? new Date(Date.now() + r.expiresIn * 1000) : null,
    lastError: "",
  };
  await db.bambuLink.upsert({ where: { id: "owner" }, create: { id: "owner", ...data }, update: data });
}

export async function disconnect(): Promise<void> {
  await db.bambuLink.deleteMany({});
}

export function bambuLink() {
  return db.bambuLink.findUnique({ where: { id: "owner" } });
}

async function refresh(refreshToken: string): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const r = await call<LoginResponse>("/v1/user-service/user/refreshtoken", { body: { refreshToken } });
    if (!r.accessToken) return null;
    await db.bambuLink.update({
      where: { id: "owner" },
      data: {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken || refreshToken,
        expiresAt: r.expiresIn ? new Date(Date.now() + r.expiresIn * 1000) : null,
      },
    });
    return r.accessToken;
  } catch {
    return null;
  }
}

// ---------- sync ----------

/** The fields of a Bambu task this app reads. Bambu sends many more. */
export type BambuTask = {
  id: number | string;
  title?: string;
  designTitle?: string;
  status?: number;
  startTime?: string | null;
  endTime?: string | null;
  costTime?: number;
  weight?: number;
  deviceId?: string;
  deviceName?: string;
};

type TaskPage = { total?: number; hits?: BambuTask[] };

async function fetchTasks(token: string): Promise<BambuTask[]> {
  const tasks: BambuTask[] = [];
  for (let page = 0; page < 50; page++) {
    const data = await call<TaskPage>(`/v1/user-service/my/tasks?limit=${PAGE}&offset=${tasks.length}`, { token });
    const hits = data.hits ?? [];
    tasks.push(...hits);
    if (hits.length < PAGE || (data.total !== undefined && tasks.length >= data.total)) break;
  }
  return tasks;
}

const toDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Copy Bambu tasks into `printerPrint`. A device this app has not seen yet is
 * given to the first printer card that does not follow one; with one printer
 * that is simply the P1S. Jobs from a device with no free card are skipped.
 * Returns how many jobs are stored afterwards.
 */
export async function applyTasks(tasks: BambuTask[]): Promise<number> {
  const printers = await db.printer.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const byDevice = new Map(printers.filter((p) => p.bambuDeviceId).map((p) => [p.bambuDeviceId!, p.id]));
  const free = printers.filter((p) => !p.bambuDeviceId);

  for (const task of tasks) {
    const startedAt = toDate(task.startTime);
    if (!startedAt || !task.deviceId) continue;

    let printerId = byDevice.get(task.deviceId);
    if (!printerId) {
      const claim = free.shift();
      if (!claim) continue;
      await db.printer.update({ where: { id: claim.id }, data: { bambuDeviceId: task.deviceId } });
      byDevice.set(task.deviceId, claim.id);
      printerId = claim.id;
    }

    // Real time on the machine. costTime is the slicer's estimate, not what the job took.
    const endedAt = toDate(task.endTime);
    const seconds = endedAt && endedAt > startedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) : 0;
    const outcome = OUTCOMES[task.status ?? -1] ?? (endedAt ? `status ${task.status}` : "printing");
    const data = {
      printerId,
      title: (task.designTitle || task.title || "Untitled").slice(0, 300),
      startedAt,
      endedAt,
      seconds,
      estimate: Math.max(0, Math.round(task.costTime ?? 0)),
      outcome,
      grams: typeof task.weight === "number" ? task.weight : null,
    };
    await db.printerPrint.upsert({ where: { id: String(task.id) }, create: { id: String(task.id), ...data }, update: data });
  }
  return db.printerPrint.count();
}

/**
 * Pull the whole history and store it. Never throws: the outcome lands on the
 * link row (`lastSyncAt`, `lastError`) for the card to show.
 */
export async function syncPrints(): Promise<{ ok: boolean; message: string }> {
  const link = await bambuLink();
  if (!link) return { ok: false, message: "Bambu Lab is not connected." };

  try {
    let tasks: BambuTask[];
    try {
      tasks = await fetchTasks(link.accessToken);
    } catch (error) {
      if (!(error instanceof BambuError && error.status === 401)) throw error;
      const token = await refresh(link.refreshToken);
      if (!token) throw new BambuError("Bambu Lab signed this app out. Connect it again.");
      tasks = await fetchTasks(token);
    }
    const stored = await applyTasks(tasks);
    await db.bambuLink.update({ where: { id: "owner" }, data: { lastSyncAt: new Date(), lastError: "" } });
    return { ok: true, message: `Synced ${stored} prints from Bambu Lab.` };
  } catch (error) {
    const message = error instanceof BambuError ? error.message : "The Bambu Lab sync failed.";
    if (!(error instanceof BambuError)) console.error("[bambu] sync failed", error);
    await db.bambuLink.update({ where: { id: "owner" }, data: { lastError: message } }).catch(() => {});
    return { ok: false, message };
  }
}

let running: Promise<unknown> | null = null;

/** Sync in the background when the last one is stale; one at a time. */
export function syncIfStale(link: { lastSyncAt: Date | null } | null): void {
  if (!link || running) return;
  if (link.lastSyncAt && Date.now() - link.lastSyncAt.getTime() < SYNC_EVERY_MS) return;
  running = syncPrints().finally(() => {
    running = null;
  });
}
