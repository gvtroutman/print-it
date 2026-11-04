"use client";

import { useEffect, useRef, useState } from "react";
import { MemberCard, type MemberCardProps } from "@/components/member-card";
import { MemberAvatar } from "@/components/member-avatar";

/** The desktop account menu keeps only the card that opens the member page. */
export function UserMenu(props: MemberCardProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu for ${props.name}`}
        className="flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full p-[3px] text-ink transition-transform duration-[160ms] hover:scale-110 motion-reduce:transform-none lg:h-[60px] lg:w-[60px] lg:[--avatar-initial-size:18px]"
      >
        <MemberAvatar initials={props.initials} flair={props.flair} />
      </button>

      <div
        hidden={!open}
        className="ppp-in absolute right-0 top-[50px] z-50 w-[300px] max-w-[calc(100vw-32px)] lg:top-[66px]"
      >
        <MemberCard {...props} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}
