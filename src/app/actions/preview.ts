"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { endPreview, requireUser, startPreview } from "@/lib/authz";
import { db } from "@/lib/db";
import { record } from "@/lib/audit";
import type { MemberDonationState } from "@/app/admin/invites/actions";

/**
 * The printer owner's member preview, on and off. How it works and why it is
 * safe is written up beside `currentUser` in `src/lib/authz.ts`.
 *
 * Both cards are selected from /member, which is available in either view.
 * Keep the owner there so their other card remains within reach.
 */

export async function selectMemberViewAction(formData: FormData): Promise<void> {
  const user = await requireUser("/member");
  if (user.role !== "admin" && !user.previewing) notFound();
  const view = z.enum(["admin", "member"]).safeParse(formData.get("view"));
  if (!view.success) notFound();
  if (view.data === "member") await startPreview();
  else await endPreview();
  redirect("/member");
}

/** Let the owner try both donation states while using the member preview. */
export async function setPreviewDonationAction(formData: FormData): Promise<MemberDonationState> {
  const user = await requireUser();
  if (!user.previewing) notFound();

  // Resolve the account behind the preview; never accept a target from the form.
  const owner = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });
  if (owner?.role !== "admin") notFound();

  const parsed = z.enum(["true", "false"]).safeParse(formData.get("hasDonated"));
  if (!parsed.success) return { error: "Check the donation setting and try again." };
  const hasDonated = parsed.data === "true";
  await db.user.update({ where: { id: owner.id }, data: { hasDonated } });
  await record({
    action: "donation.member_status_changed",
    actor: user,
    subject: user.email,
    detail: { userId: owner.id, hasDonated, preview: true },
  });
  revalidatePath("/member");
  revalidatePath("/bin");
  revalidatePath("/upload");
  revalidatePath("/story", "layout");
  return { hasDonated };
}
