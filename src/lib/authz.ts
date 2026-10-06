import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { db } from "@/lib/db";
import { ownerUnlocked, whoId } from "@/lib/identity";
import { storyScope, type Actor } from "@/lib/scope";

// The pure rules live in `scope.ts` so they can be imported without pulling in
// `server-only`. Re-exported here so callers have one import to reach for.
export {
  storyScope,
  storyRef,
  FLOW,
  BOARD,
  isTerminal,
  nextStatus,
  assertTransition,
  AuthzError,
  // feature-request rules (the 'frr' track)
  featureScope,
  featureRef,
  featureLabel,
  FEATURE_FLOW,
  FEATURE_BOARD,
  isFeatureTerminal,
  nextFeatureStatus,
  assertFeatureTransition,
  type Actor,
} from "@/lib/scope";

const toActor = (u: { id: string; name: string; initials: string; role: string }): Actor => ({
  id: u.id,
  name: u.name,
  initials: u.initials || "??",
  role: u.role === "admin" ? "admin" : "client",
});

/**
 * Whoever is at the keyboard, or null. Throws only when `APP_SECRET` is
 * missing, which is a deployment that cannot work at all.
 *
 * There is no sign-in. An unlocked owner cookie makes you the printer owner;
 * otherwise the name picked on `/hello` says who you are. A `ppp.who` cookie
 * can only ever resolve to a *client* row — the owner's row is reachable
 * through `ADMIN_PASSWORD` and nothing else.
 */
export async function currentUser(): Promise<Actor | null> {
  if (await ownerUnlocked()) {
    const owner = await printerOwner();
    if (owner) return toActor(owner);
  }

  const id = await whoId();
  if (!id) return null;
  const user = await db.user.findFirst({ where: { id, role: "client" } });
  return user ? toActor(user) : null;
}

/** Gate for any page or action that needs a name. Sends people to pick one. */
export async function requireUser(returnTo?: string): Promise<Actor> {
  const user = await currentUser();
  if (user) return user;

  redirect(returnTo ? `/hello?next=${encodeURIComponent(returnTo)}` : "/hello");
}

/**
 * Gate for owner-only surfaces (the queue, the catalog, the audit trail).
 *
 * Somebody who has not unlocked the owner pages is sent to the password
 * prompt, which returns them to `returnTo` once they have.
 */
export async function requireAdmin(returnTo?: string): Promise<Actor> {
  const user = await currentUser();
  if (user?.role === "admin") return user;
  redirect(returnTo ? `/owner?next=${encodeURIComponent(returnTo)}` : "/owner");
}

/**
 * Fetch one story under the caller's scope. A client asking for somebody
 * else's story gets a 404, not a 403 — a 403 would confirm the story exists.
 */
export async function getStoryOr404(storyId: number, actor: Actor) {
  const story = await db.story.findFirst({
    where: { AND: [{ id: storyId }, storyScope(actor)] },
    include: {
      uploader: { select: { id: true, name: true, initials: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, initials: true, role: true } },
        },
      },
    },
  });
  if (!story) notFound();
  return story;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** The admin (printer owner). Every upload notification goes here. */
export const printerOwner = cache(() =>
  db.user.findFirst({ where: { role: "admin" } }),
);

/**
 * The printer owner's first name, for copy that addresses them directly —
 * "Send it to Ruben", "what's in it for Ruben?". The handoff writes the copy
 * this way on purpose: you are asking a colleague a favour, not filing a
 * ticket against a role.
 *
 * Only ever rendered once somebody has picked a name. `/hello` and `/owner`
 * stay generic rather than telling a stranger who runs the printer.
 */
export const printerName = cache(async (): Promise<string> => {
  const admin = await printerOwner();
  return admin?.name.trim().split(/\s+/)[0] ?? "the printer owner";
});

export async function notify(opts: {
  recipientId: string;
  storyId?: number;
  /** A feature request this is about, for the 'frr' track. */
  featureId?: number;
  text: string;
}): Promise<void> {
  await db.notification.create({
    data: {
      recipientId: opts.recipientId,
      storyId: opts.storyId ?? null,
      featureId: opts.featureId ?? null,
      text: opts.text,
    },
  });
}

/** Notifications are per recipient, and scoped the same way stories are. */
export function unreadCount(actor: Actor) {
  return db.notification.count({
    where: { recipientId: actor.id, read: false },
  });
}
