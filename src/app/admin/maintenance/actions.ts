"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { record } from "@/lib/audit";
import { DEFAULT_MAINTENANCE_MESSAGE, MAX_MAINTENANCE_MESSAGE } from "@/lib/maintenance";

export type MaintenanceFormState = { error?: string; saved?: boolean };

export async function saveMaintenance(_previous: MaintenanceFormState, form: FormData): Promise<MaintenanceFormState> {
  const admin = await requireAdmin();
  const enabled = form.get("enabled");
  const rawMessage = form.get("message");
  if ((enabled !== null && enabled !== "on") || typeof rawMessage !== "string" || rawMessage.trim().length > MAX_MAINTENANCE_MESSAGE) {
    return { error: `Use a repair message of ${MAX_MAINTENANCE_MESSAGE} characters or fewer.` };
  }
  const data = { enabled: enabled === "on", message: rawMessage.trim() || DEFAULT_MAINTENANCE_MESSAGE };
  try {
    await db.siteMaintenance.upsert({ where: { id: "site" }, create: { id: "site", ...data }, update: data });
  } catch {
    return { error: "The maintenance setting could not be saved. Please try again." };
  }
  await record({ action: "site.maintenance_changed", actor: admin, subject: "Print It!", detail: data });
  revalidatePath("/", "layout");
  return { saved: true };
}
