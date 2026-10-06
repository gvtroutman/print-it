"use client";

import { useEffect, useRef, useState } from "react";
import { forgetMe, lockOwnerPages } from "@/app/actions/identity";

/**
 * Who this device says it is, and a way to change that: "Not you?" for
 * everyone, "Lock owner pages" for the printer owner.
 */
export function UserMenu({
  name,
  initials,
  role,
}: {
  name: string;
  initials: string;
  role: "client" | "admin";
}) {
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
        aria-label={`Account menu for ${name}`}
        className="stamp flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full border-[3px] border-ink bg-aqua font-mono text-[12px] font-bold text-ink hover:bg-sun"
      >
        {initials}
      </button>

      {open && (
        <div className="ppp-in absolute right-0 top-[50px] z-50 w-[264px] rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp-lg">
          <p className="m-0 font-display text-[17px] text-ink">{name}</p>
          <p className="m-0 mt-[8.8px] inline-block rounded-chip border-2 border-ink bg-cream-2 px-[8px] font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink">
            {role === "admin" ? "Printer owner" : "Regular"}
          </p>

          {/* The API console. In the account menu rather than the nav because
              it is a tool for the person, not a place the work lives — and
              because somebody who wants it goes looking here first. Not
              admin-only: a client's own tickets are as reachable over HTTP as
              they are on the board, under exactly the same scope. */}
          <div className="mt-[13.2px] border-t-2 border-dashed border-rule pt-[13.2px]">
            <a
              href="/docs"
              className="font-bold text-[14px] text-cherry-dk underline underline-offset-2 hover:text-cherry"
            >
              API &amp; docs →
            </a>
            <p className="m-0 mt-[2px] font-mono text-[11.5px] text-ink-3">
              Every endpoint, and a console to call them from.
            </p>
          </div>

          <form action={role === "admin" ? lockOwnerPages : forgetMe}>
            <button
              type="submit"
              className="stamp mt-[13.2px] w-full cursor-pointer rounded-chip border-[3px] border-ink bg-cream-2 px-[17.6px] py-[9px] text-[14px] font-bold text-ink hover:bg-cherry-wash"
            >
              {role === "admin" ? "Lock owner pages" : `Not ${name}? Switch`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
