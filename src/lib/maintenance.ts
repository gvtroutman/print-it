import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/scope";

export const DEFAULT_MAINTENANCE_MESSAGE = "The printer is down for repairs. Print It! is temporarily closed while we get it running again. Please check back soon.";
export const MAX_MAINTENANCE_MESSAGE = 1000;

// Request-scoped only: every new navigation/API request sees the saved switch.
export const maintenanceStatus = cache(async () => {
  const setting = await db.siteMaintenance.findUnique({ where: { id: "site" } });
  return {
    enabled: setting?.enabled ?? false,
    message: setting?.message.trim() || DEFAULT_MAINTENANCE_MESSAGE,
  };
});

export async function maintenanceFor(actor: Pick<Actor, "role"> | null) {
  if (actor?.role === "admin") return null;
  const status = await maintenanceStatus();
  return status.enabled ? status : null;
}

/** API callers get JSON, including uploads submitted from an already-open tab. */
export async function maintenanceResponse(actor: Pick<Actor, "role">): Promise<Response | null> {
  const status = await maintenanceFor(actor);
  return status ? Response.json({ error: status.message, maintenance: true }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60" },
  }) : null;
}
