"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { setStickerPreferenceAction } from "@/app/member/sticker-preference-action";

export function MemberStickerPreference({ enabled }: { enabled: boolean }) {
  const id = useId();
  const [checked, setChecked] = useState(enabled);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => { setChecked(enabled); }, [enabled]);

  function save(next: boolean) {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const form = new FormData();
      form.set("enabled", String(next));
      try {
        const result = await setStickerPreferenceAction(form);
        if (!result.ok) setError(result.error);
        else {
          setChecked(result.enabled);
          setSaved(true);
        }
      } catch {
        setError("Your sticker setting could not be saved. Try again.");
      }
    });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-cream-2 p-[22px]">
      <div className="flex items-center gap-[14px]">
        <h2 id={`${id}-heading`} className="m-0 text-[26px] text-ink">Stickers</h2>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`${id}-heading`}
          aria-describedby={`${id}-help`}
          disabled={pending}
          onClick={() => save(!checked)}
          className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-chip border-0 bg-transparent p-0 disabled:cursor-wait disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-[28px] w-[52px] rounded-full border-[3px] border-ink transition-colors motion-reduce:transition-none ${checked ? "bg-mint" : "bg-cream-3"}`}
          >
            <span className={`absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full border-2 border-ink bg-porcelain transition-transform motion-reduce:transition-none ${checked ? "translate-x-[24px]" : "translate-x-0"}`} />
          </span>
        </button>
      </div>
      <p id={`${id}-help`} className="mb-0 mt-[10px] text-[14px] leading-[1.5] text-ink-2">
        Show your collection, profile stickers, and sticker notifications. Your earned stickers and progress stay saved when stickers are off.
      </p>
      <p role="status" className="mb-0 mt-[8px] text-[13px] text-ink-2">{pending ? "Saving…" : saved ? checked ? "Stickers turned on." : "Stickers turned off." : ""}</p>
      {error && <p role="alert" className="mb-0 mt-[8px] text-[13px] text-cherry-dk">{error}</p>}
    </section>
  );
}
