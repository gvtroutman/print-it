import "server-only";

import { db } from "@/lib/db";
import type { Actor } from "@/lib/scope";

/** The owner's donation checkbox controls Store access; read it fresh each time. */
export async function hasStoreAccess(actor: Actor): Promise<boolean> {
  if (actor.role === "admin") return true;
  const member = await db.user.findUnique({
    where: { id: actor.id },
    select: { hasDonated: true },
  });
  return member?.hasDonated === true;
}
