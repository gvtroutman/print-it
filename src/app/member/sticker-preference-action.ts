"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export type StickerPreferenceResult = { ok: true; enabled: boolean } | { ok: false; error: string };

/** This preference belongs to the signed-in account, including its preview. */
export async function setStickerPreferenceAction(formData: FormData): Promise<StickerPreferenceResult> {
  const user = await requireUser("/member");
  const values = formData.getAll("enabled");
  if (values.length !== 1 || (values[0] !== "true" && values[0] !== "false")) {
    return { ok: false, error: "Choose whether to show stickers." };
  }
  const enabled = values[0] === "true";
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { stickersEnabled: enabled } });
      if (!enabled) {
        // The row lock also serializes awards. Old announcements must not
        // become unread again when the member turns stickers back on.
        await tx.notification.updateMany({
          where: { recipientId: user.id, badgeKey: { not: null }, read: false },
          data: { read: true },
        });
      }
    });
  } catch {
    return { ok: false, error: "Your sticker setting could not be saved. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, enabled };
}
