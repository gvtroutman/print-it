import { ok, withActor } from "@/lib/api";
import { deleteNotification, listNotifications } from "@/lib/notifications";

/**
 * Dismiss one notification — the X on a row in the Activity panel, over HTTP.
 *
 * Somebody else's id deletes nothing and answers `dismissed: false` rather
 * than a 404, because a 404 here would be an oracle for whose notification
 * is whose. The scoping is `deleteNotification`'s, shared with the panel's
 * server action.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withActor<{ id: string }>(async (_request, actor, { id }) => {
  const count = await deleteNotification(actor, id);
  const { unread } = await listNotifications(actor, { limit: 1 });
  return ok({ dismissed: count > 0, unread });
});
