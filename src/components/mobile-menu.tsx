"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MemberCard, type MemberCardProps } from "@/components/member-card";
import { NavIcon, type NavIconName } from "@/components/nav-icons";

export type NavGroup = {
  heading?: string;
  items: Array<{ label: string; href: string; icon: NavIconName }>;
};

/**
 * On a phone, the nav tabs and the account menu fold into one hamburger. A
 * wrapping row of tabs under a full-width wordmark would eat half the screen
 * before the work starts, and the sticky header keeps all of it on screen.
 *
 * Rendered only below `sm`; above it the header shows the tabs and the
 * account menu as they always were.
 */
export function MobileMenu({
  nav,
  active,
  name,
  initials,
  email,
  joinedAt,
  flair,
  role,
  previewing,
}: {
  nav: NavGroup[];
  active: string;
  name: string;
  initials: string;
  email: string | null;
  joinedAt?: string;
  flair?: MemberCardProps["flair"];
  role: "client" | "admin";
  previewing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
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
        onClick={() => {
          setOpen((v) => !v);
          navigator.vibrate?.(12);
        }}
        onPointerDown={(event) => {
          if (event.isPrimary && event.button === 0) setPressing(true);
        }}
        onPointerUp={() => setPressing(false)}
        onPointerCancel={() => setPressing(false)}
        onPointerLeave={() => setPressing(false)}
        onBlur={() => setPressing(false)}
        data-pressing={pressing || undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Menu for ${name}`}
        className="pixel-surface mobile-menu-trigger flex h-[42px] w-[120px] cursor-pointer items-center justify-center rounded-chip border-[3px] border-ink text-ink"
      >
        <span aria-hidden className="flex w-[21px] flex-col gap-[4.5px]">
          <span className="mobile-menu-line h-[2.5px] rounded-full bg-ink" />
          <span className="mobile-menu-line h-[2.5px] rounded-full bg-ink" />
          <span className="mobile-menu-line h-[2.5px] rounded-full bg-ink" />
        </span>
      </button>

      {open && (
        <div className="ppp-in absolute left-1/2 top-full mt-[14px] -translate-x-1/2 z-50 max-h-[70dvh] w-[300px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp-lg">
          <nav className="flex flex-col gap-[13.2px]">
            {nav.map((group, i) => (
              <div
                key={group.heading ?? i}
                role={group.heading ? "group" : undefined}
                aria-label={group.heading}
                className="flex flex-col gap-[4px]"
              >
                {group.heading && (
                  <span
                    aria-hidden
                    className="mb-[2px] font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-3"
                  >
                    {group.heading}
                  </span>
                )}
                {group.items.map((item) => {
                  const current = item.href === active;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={current ? "page" : undefined}
                      className={`flex items-center gap-[12px] rounded-chip border-2 px-[13px] py-[9px] font-mono text-[12.5px] font-bold uppercase tracking-[0.08em] ${
                        current
                          ? "border-ink bg-sun text-ink"
                          : "border-transparent text-ink hover:border-ink hover:bg-cream-2"
                      }`}
                    >
                      <span className="flex translate-x-[30px] items-center gap-[12px]">
                        <NavIcon name={item.icon} size={36} />
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-[17.6px] border-t-2 border-ink pt-[17.6px]">
            <MemberCard
              name={name}
              initials={initials}
              email={email}
              joinedAt={joinedAt}
              flair={flair}
              role={role}
              previewing={previewing}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
