"use server";

import { redirect } from "next/navigation";
import { currentUser, endPreview } from "@/lib/authz";

/** Preview is a client role; allow the owner to leave it even while closed. */
export async function leaveMaintenancePreview() {
  const user = await currentUser();
  if (user?.previewing) await endPreview();
  redirect("/admin/maintenance");
}
