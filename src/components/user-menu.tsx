"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { endPreviewAction, startPreviewAction } from "@/app/actions/preview";

/**
 * Replaces the prototype's role switcher, which the handoff marks as
 * "prototype only, drop it in production". Roles come from the session now,
 * so there is nothing to switch — this is the signed-in user and a way out.
 */
export function UserMenu({
  name,
  initials,
  email,
  role,
  passkeyCount,
  previewing,
}: {
  name: string;
  initials: string;
  email: string;
  role: "client" | "admin";
  passkeyCount: number;
  /** The printer owner, looking at the member view. */
  previewing?: boolean;
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

      {/* Hidden rather than unmounted, so the view switch is in the
          server-rendered page: `verify:queue` drives it from there. */}
      <div
        hidden={!open}
        className="ppp-in absolute right-0 top-[50px] z-50 w-[264px] rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp-lg"
      >
        <AccountPanel
          name={name}
          email={email}
          role={role}
          passkeyCount={passkeyCount}
          previewing={previewing}
        />
      </div>
    </div>
  );
}

/**
 * Who is signed in and the way out. Shared by the account menu and, on a
 * phone, the hamburger menu that stands in for it.
 *
 * For the printer owner the card with their name is also the switch between
 * the owner view and the member view. There is no banner while the member
 * view is on: the card says so, and the way back is one click on it.
 */
export function AccountPanel({
  name,
  initials,
  email,
  role,
  passkeyCount,
  previewing,
}: {
  name: string;
  /** Shown as an avatar beside the name. The phone menu passes it; the
      desktop menu doesn't, because there the avatar is the button. */
  initials?: string;
  email: string;
  role: "client" | "admin";
  passkeyCount: number;
  previewing?: boolean;
}) {
  // Spans, not paragraphs: on the owner's card this sits inside a button.
  const card = (
    <span className="flex items-center gap-[12px]">
      {initials && (
        <span
          aria-hidden
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-aqua font-mono text-[17px] font-bold text-ink"
        >
          {initials}
        </span>
      )}
      <span className="block min-w-0">
        <span className="block font-display text-[17px] text-ink">{name}</span>
        <span className="mt-[2px] block break-all font-mono text-[11.5px] text-ink-3">{email}</span>
        <span className="mt-[8.8px] inline-block rounded-chip border-2 border-ink bg-cream-2 px-[8px] font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink">
          {previewing ? "Previewing as a member" : role === "admin" ? "Printer owner" : "Invited member"}
        </span>
      </span>
    </span>
  );

  return (
    <>
      {role === "admin" || previewing ? (
        // A plain server-action form, so it works before hydration.
        <form action={previewing ? endPreviewAction : startPreviewAction}>
          <button
            type="submit"
            className="-m-[8px] block w-[calc(100%+16px)] cursor-pointer rounded-panel border-2 border-transparent bg-transparent p-[8px] text-left hover:border-ink hover:bg-cream-2"
          >
            {card}
            <span className="mt-[8.8px] block font-bold text-[14px] text-cherry-dk underline underline-offset-2">
              {previewing ? "Back to the owner view ⇄" : "Switch to the member view ⇄"}
            </span>
          </button>
        </form>
      ) : (
        card
      )}
      {/* How you sign in. The printer owner gets a way to change it;
          a member's device is their sign-in, and there is nothing to
          change. */}
      <div className="mt-[13.2px] border-t-2 border-dashed border-rule pt-[13.2px]">
        {role === "admin" ? (
          <>
            <p className="m-0 font-mono text-[11.5px] uppercase text-ink-3">
              {passkeyCount === 0
                ? "Signing in with a password"
                : `${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"} on this account`}
            </p>
            <a
              href="/welcome"
              className="mt-[6px] inline-block font-bold text-[14px] text-cherry-dk underline underline-offset-2 hover:text-cherry"
            >
              {passkeyCount === 0 ? "Add a passkey →" : "Add another →"}
            </a>
          </>
        ) : (
          <p className="m-0 font-mono text-[11.5px] uppercase text-ink-3">
            This device keeps you signed in. For another one, ask the
            printer owner for a link.
          </p>
        )}
      </div>

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

      <button
        type="button"
        onClick={async () => {
          // A member has no password to come back with, so signing out
          // is "until the printer owner sends a new link". Worth one
          // question before it happens rather than a surprise after.
          if (
            role === "client" &&
            !previewing &&
            !window.confirm(
              "Sign this device out? You will need a new link from the printer owner to get back in.",
            )
          ) {
            return;
          }
          await authClient.signOut();
          window.location.assign("/signin");
        }}
        className="stamp mt-[13.2px] w-full cursor-pointer rounded-chip border-[3px] border-ink bg-cream-2 px-[17.6px] py-[9px] text-[14px] font-bold text-ink hover:bg-cherry-wash"
      >
        Sign out
      </button>
    </>
  );
}
