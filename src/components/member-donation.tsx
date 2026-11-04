"use client";

import { useId, useState, useTransition } from "react";
import { setMemberDonationAction } from "@/app/admin/invites/actions";
import { setPreviewDonationAction } from "@/app/actions/preview";

/** Save a donation confirmation as soon as the owner ticks the box. */
export function MemberDonation({ userId, name, hasDonated, preview = false }: {
  userId: string;
  name: string;
  hasDonated: boolean;
  preview?: boolean;
}) {
  const id = useId();
  const [checked, setChecked] = useState(hasDonated);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(next: boolean) {
    const previous = checked;
    setChecked(next);
    setError("");
    startTransition(async () => {
      const form = new FormData();
      if (!preview) form.set("userId", userId);
      form.set("hasDonated", String(next));
      try {
        const result = await (preview ? setPreviewDonationAction(form) : setMemberDonationAction(form));
        if (result.error) {
          setChecked(previous);
          setError(result.error);
        } else {
          setChecked(result.hasDonated === true);
        }
      } catch {
        setChecked(previous);
        setError("The donation setting could not be saved. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-[13.2px] gap-y-[4px]">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-[8px] text-[14px] font-bold text-ink">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => save(event.target.checked)}
          aria-label={`${name} has donated`}
          aria-describedby={`${id}-status`}
          className="h-[18px] w-[18px] cursor-pointer accent-[var(--color-cherry-dk)] disabled:cursor-wait"
        />
        Donated
      </label>
      <span id={`${id}-status`} role="status" className="text-[12px] text-ink-2">
        {pending ? "Saving…" : checked ? "Store unlocked" : "Store locked"}
      </span>
      {error && <span role="alert" className="basis-full text-[13px] text-cherry-dk">{error}</span>}
    </div>
  );
}
