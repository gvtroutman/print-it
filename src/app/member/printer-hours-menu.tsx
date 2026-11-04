"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A native disclosure keeps the hours form available before hydration. */
export function PrinterHoursMenu({ children, syncAction }: {
  children: ReactNode;
  syncAction?: (formData: FormData) => Promise<void>;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const menu = details.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const menu = details.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`pixel-surface inline-flex shrink-0 rounded-full ${syncAction ? "" : "pixel-surface-cream"}`}>
      {syncAction && <form action={syncAction} className="flex">
        <button type="submit" className="min-h-[40px] cursor-pointer rounded-l-full px-[12px] py-[6px] font-mono text-[12px] font-bold text-ink hover:bg-aqua-wash/40 sm:min-h-[32px]">Sync</button>
      </form>}
      <details ref={details} className="group">
        <summary className={`flex min-h-[40px] cursor-pointer list-none items-center justify-center gap-[6px] py-[6px] font-mono text-[12px] font-bold text-ink sm:min-h-[32px] [&::-webkit-details-marker]:hidden ${syncAction ? "min-w-[40px] rounded-r-full px-[8px] hover:bg-aqua-wash/40 sm:min-w-[32px]" : "rounded-full px-[12px] hover:bg-cream-2/40"}`}>
          {syncAction ? <span className="sr-only">Enter total hours</span> : "Total hours"}
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-[14px] w-[14px] transition-transform group-open:rotate-180">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </summary>
        <div className="absolute right-0 top-full z-20 mt-[10px] w-[min(320px,calc(100vw_-_88px))] rounded-card border-2 border-ink bg-porcelain p-[14px] text-left shadow-stamp-lg">
          {children}
        </div>
      </details>
    </div>
  );
}
