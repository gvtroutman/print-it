"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { dismiss, markAllRead, markRead } from "@/app/actions/notifications";
import { NavIcon } from "@/components/nav-icons";

export type FeedItem = {
  id: string;
  text: string;
  when: string;
  read: boolean;
  storyId: number | null;
  featureId: number | null;
};

/**
 * The Notifications panel, behind a bell. Handoff §1: 360px, radius 14, lg
 * shadow, a 160ms fade-and-rise, an 8px dot per row, and a count badge on the
 * bell only when something is unread. Each row has an X that takes it off the feed for
 * good, and the panel's foot holds the places the activity leads to.
 */
export function ActivityMenu({
  items,
  unread,
  title,
  role,
}: {
  items: FeedItem[];
  unread: number;
  title: string;
  role: "client" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
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
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        className="group relative flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-full text-ink"
      >
        {/* Just the sticker, no button around it, so it is drawn a size up
            and grows a touch on hover. Its white die-cut edge only shows
            while the panel is open. A quiet bell is plain paper; with
            something new it goes yellow and swings the other way, clapper
            out on the left. */}
        <span className="flex scale-[1.3] transition-transform duration-[160ms] ease-out group-hover:scale-[1.45]">
          <NavIcon
            name="bell"
            fill={unread > 0 ? undefined : "var(--color-cream-2)"}
            flip={unread > 0}
            edge={open}
          />
        </span>
        {/* The count sits on the bell's shoulder, and only when there is
            something to read: a bell with a 0 on it is just noise. */}
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-[6px] -top-[6px] inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-ink bg-cherry-dk px-[5px] font-mono text-[12px] font-bold tabular-nums text-cream"
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="ppp-in absolute right-0 top-[50px] z-50 w-[360px] max-w-[84vw] rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp-lg">
          <div className="mb-[8.8px] flex items-baseline justify-between gap-[13.2px]">
            <h2 className="m-0 font-display text-[17px]">
              {title}
            </h2>
            {unread > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => void markAllRead())}
                className="cursor-pointer rounded-chip border-2 border-ink bg-cream-2 px-[10px] py-[2px] font-mono text-[11px] font-bold uppercase text-ink hover:bg-sun disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex max-h-[330px] flex-col gap-[4.4px] overflow-auto">
            {items.length === 0 && (
              <p className="m-0 px-[4px] py-[11px] font-mono text-[12px] uppercase text-ink-3">
                Nothing yet.
              </p>
            )}
            {items.map((item) => (
              // A row is two buttons side by side, not one inside the other:
              // the text opens what it is about, the X dismisses it.
              <div
                key={item.id}
                className={`flex items-stretch rounded-card border-2 border-transparent hover:border-ink hover:bg-cream-2 ${
                  item.read ? "bg-transparent" : "bg-sun-wash"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!item.read) startTransition(() => void markRead(item.id));
                    // Take them to whatever the notification is about. A feature
                    // request goes to /frr, a print to /story; a reference-less
                    // one (a withdrawal) just marks read.
                    const href =
                      item.featureId !== null
                        ? `/frr/${item.featureId}`
                        : item.storyId !== null
                          ? `/story/${item.storyId}`
                          : null;
                    if (href) window.location.assign(href);
                  }}
                  className="flex min-w-0 flex-1 cursor-pointer gap-[13.2px] py-[11px] pl-[13.2px] pr-[6px] text-left"
                >
                  <span
                    aria-hidden
                    className={`mt-[6px] h-[8px] w-[8px] flex-none rounded-full ${
                      item.read ? "bg-chrome" : "bg-cherry"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-[1.35]">
                      {item.text}
                    </span>
                    <span className="mt-[2px] block font-mono text-[11px] text-ink-3">
                      {item.when}
                      {item.read ? "" : " · unread"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Dismiss: ${item.text}`}
                  title="Dismiss"
                  onClick={() => startTransition(() => void dismiss(item.id))}
                  className="flex w-[34px] flex-none cursor-pointer items-center justify-center rounded-r-card font-mono text-[14px] font-bold text-ink-3 hover:bg-cherry-wash hover:text-cherry-dk disabled:opacity-50"
                >
                  <span aria-hidden>&times;</span>
                </button>
              </div>
            ))}
          </div>

          {/* The places the activity leads to live here rather than in the
              nav: History is where it ends up once a print is finished, the
              audit log is the owner's full record of it, and the API console
              is for the owner wanting the same feed over HTTP. Members get
              neither: both are admin-only surfaces. */}
          <div className="mt-[8.8px] flex flex-col gap-[2px] border-t-2 border-ink pt-[8.8px]">
            {[
              { label: "History", href: "/history" },
              ...(role === "admin"
                ? [
                    { label: "Audit log", href: "/admin/audit" },
                    { label: "API & docs", href: "/docs" },
                  ]
                : []),
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-card border-2 border-transparent px-[13.2px] py-[8px] font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink hover:border-ink hover:bg-cream-2"
              >
                {link.label}
                <span aria-hidden>&rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
