"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { deviceLinkAction, type InviteFormState } from "@/app/admin/invites/actions";
import { HandoverLink } from "@/components/handover-link";
import { Button, Notice } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Minting…" : "Make the link"}
    </Button>
  );
}

/**
 * The member's own "Link a device". No `userId` in the form: the action
 * reads the signed-in account, and would refuse any other name anyway.
 *
 * Whoever opens the link becomes this member on that device, so the copy
 * says to keep it to yourself. When there is an address the link goes there
 * instead and is shown nowhere — the same rule the owner's version keeps.
 */
export function SelfDeviceLink({
  hasEmail,
  expiresInMinutes,
}: {
  hasEmail: boolean;
  expiresInMinutes: number;
}) {
  const [state, formAction] = useActionState<InviteFormState, FormData>(deviceLinkAction, {});

  return (
    <form
      action={formAction}
      className="max-w-[620px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] shadow-stamp"
    >
      <h2 className="m-0 mb-[4px] font-display text-[22px] text-ink">Sign another device in</h2>
      <p className="m-0 mb-[17.6px] text-[14.5px] text-ink-2">
        {hasEmail
          ? "The link is emailed to you. Open it on the other device."
          : "The link appears here. Get it to the other device and open it there — and nowhere else, because whoever opens it is you."}
      </p>
      <Submit />

      {state.sent && !state.handoverUrl && (
        <div className="mt-[13.2px]">
          <Notice tone="good">
            Sent to {state.sent}. The link is inside the message and nowhere else.
          </Notice>
        </div>
      )}
      {state.handoverUrl && (
        <HandoverLink
          url={state.handoverUrl}
          note={`open it on the other device · works once, expires in ${expiresInMinutes} minutes`}
        />
      )}
      {state.error && (
        <div className="mt-[13.2px]">
          <Notice tone="warn">{state.error}</Notice>
        </div>
      )}
    </form>
  );
}
