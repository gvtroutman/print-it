"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resendInviteAction, type InviteFormState } from "@/app/admin/invites/actions";
import { HandoverLink } from "@/components/handover-link";
import { Notice } from "@/components/ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-aqua px-[15px] py-[6px] font-mono text-[11.5px] font-bold uppercase text-ink hover:bg-sun disabled:opacity-50"
    >
      {pending ? "Minting…" : label}
    </button>
  );
}

/**
 * Rotate an invitation's link and send it again.
 *
 * For an invitation with no address — or a deployment with no mail — there is
 * nothing to send, so the fresh link is shown here for the admin to hand over.
 * Either way the old link stops working the moment this runs.
 *
 * `display: contents` on the form, so the button sits in the row's action
 * group as a sibling of "Withdraw", while the link (which needs the whole
 * row) breaks onto its own line beneath; the group grows to the full row
 * when there is one, see `has-[[data-handover]]` on the page.
 */
export function ResendInvite({
  inviteId,
  hasEmail,
  expiresInDays,
}: {
  inviteId: string;
  hasEmail: boolean;
  expiresInDays: number;
}) {
  const [state, formAction] = useActionState<InviteFormState, FormData>(
    resendInviteAction,
    {},
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={inviteId} />
      <Submit label={hasEmail ? "Send again" : "New link"} />
      {state.sent && !state.handoverUrl && (
        <div data-handover className="basis-full">
          <Notice tone="good">Sent again to {state.sent}. The old link no longer works.</Notice>
        </div>
      )}
      {state.handoverUrl && (
        <div data-handover className="basis-full">
          <HandoverLink
            url={state.handoverUrl}
            note={`works once, expires in ${expiresInDays} days — the old link is dead`}
          />
        </div>
      )}
      {state.error && (
        <div data-handover className="basis-full">
          <Notice tone="warn">{state.error}</Notice>
        </div>
      )}
    </form>
  );
}
