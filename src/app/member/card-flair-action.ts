"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isCardFlair, type CardFlairKey } from "@/lib/card-flair";

export type CardFlairResult = { ok: true; flair: CardFlairKey | null } | { ok: false; error: string };

/** Save the signed-in account's icon for the current account or member preview. */
export async function setCardFlairAction(formData: FormData): Promise<CardFlairResult> {
  const user = await requireUser("/member");
  const view = user.previewing ? "member-preview" : "account";
  if (formData.getAll("view").length !== 1 || formData.get("view") !== view) {
    return { ok: false, error: "Your account view changed. Refresh the page and try again." };
  }
  const values = formData.getAll("flair");
  const value = values[0];
  if (values.length !== 1 || (value !== "" && !isCardFlair(value))) {
    return { ok: false, error: "Choose one of the stickers below." };
  }
  const flair = isCardFlair(value) ? value : null;

  try {
    if (flair) {
      const earned = await db.memberBadge.findUnique({
        where: { userId_badgeKey: { userId: user.id, badgeKey: flair } },
        select: { id: true },
      });
      if (!earned) return { ok: false, error: "Choose a sticker you've earned in your collection." };
    }
    await db.user.update({
      where: { id: user.id },
      data: user.previewing ? { previewCardFlair: flair } : { cardFlair: flair },
    });
  } catch {
    return { ok: false, error: "Your sticker could not be saved. Try again." };
  }

  // The card also appears in every page's account menu.
  revalidatePath("/", "layout");
  return { ok: true, flair };
}
