import type { ComponentProps, ReactNode } from "react";

import { StarFlare } from "@/components/star-flare";
import { ARTWORK } from "@/lib/artwork-assets";
import { ShopSign } from "@/components/shop-sign";

/**
 * The logotype: the block-letter wordmark on its own — the sign over the
 * door. The printer mark lives only in the favicon (src/app/icon.svg).
 *
 * A linked PNG, so edits to the mounted source appear on the next refresh.
 * Middleware lets `.png` through without a session. `size` is the height the
 * old script wordmark was set at. The letters arch, so they fill only about
 * half the image's height; the image is drawn taller than `size` to keep them
 * at roughly the old wordmark's width.
 *
 * The artwork route reads the source on every request and disables caching.
 *
 * `lit` runs the warm-up flicker once on load. Off by default so it fires on
 * the sign-in and claim screens only, where it is the first thing you see;
 * anywhere else it would be a tic.
 */
const WORDMARK = { src: ARTWORK.wordmarkArched, width: 905, height: 246 };

export function Brand({
  size = 34,
  lit = false,
  className = "",
}: {
  size?: number;
  lit?: boolean;
  /** Extra classes for the image, e.g. to size it differently by breakpoint. */
  className?: string;
}) {
  const height = Math.round(size * 1.1);
  return (
    <span className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size
          static file; next/image would add a resize round trip for nothing */}
      <img
        src={WORDMARK.src}
        alt="Print It!"
        width={Math.round((height * WORDMARK.width) / WORDMARK.height)}
        height={height}
        className={`logo-shadow block ${lit ? "ppp-neon" : ""} ${className}`}
      />
    </span>
  );
}

/** The little stamped label above a heading. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-[8.8px] inline-block rounded-chip border-2 border-ink bg-sun px-[13.2px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink">
      {children}
    </p>
  );
}

/**
 * The frame for every screen you reach before signing in. The header's kraft
 * paper fills the ground, tiled (`.kraft-tile` in globals.css), so the sign
 * over the counter is the first thing you see; one lit card on it,
 * checkerboard along the bottom edge.
 */
export function AuthShell({ children, closed = false, shopSign = false }: { children: ReactNode; closed?: boolean; shopSign?: boolean }) {
  return (
    <main className="kraft-tile flex min-h-screen flex-col items-center justify-center px-[26.4px] py-[35.2px]">
      <div className="relative mb-[26.4px] w-fit max-w-full px-[28px] sm:px-[44px]">
        <StarFlare size={22} className="absolute left-0 top-0 -rotate-12 sm:w-[28px]" />
        <Brand size={56} lit className="h-auto max-w-full" />
        <StarFlare size={30} className="absolute bottom-[-4px] right-0 rotate-12 sm:w-[38px]" />
      </div>
      {shopSign && <ShopSign closed={closed} />}
      <div className="w-full max-w-[520px] overflow-hidden rounded-panel border-[3px] border-ink bg-porcelain shadow-stamp-lg">
        {!shopSign && <div className={`layers border-b-[3px] border-ink ${closed ? "bg-sun" : "bg-aqua"} px-[26.4px] py-[13.2px]`}>
          <p className="m-0 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-ink">
            {closed ? "Closed · printer repairs" : "Open · come on in"}
          </p>
        </div>}
        <div className="p-[35.2px]">{children}</div>
        <div className="checker h-[10px]" aria-hidden />
      </div>
    </main>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="m-0 mb-[13.2px] text-[34px] leading-[1.05] text-ink">
      {children}
    </h1>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-[22px] text-[16.5px] leading-[1.55] text-ink-2 text-pretty">
      {children}
    </p>
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
};

/**
 * Chunky cut-out buttons: heavy keyline, hard offset shadow, and they squash
 * onto that shadow when pressed.
 *
 * Cherry-dark rather than plain cherry for the filled variant — white on
 * #E4322F is 4.0:1, which fails at button-label sizes. The darker fill clears
 * 6:1 and looks the same at a glance.
 */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "stamp cursor-pointer rounded-chip border-[3px] border-ink font-bold disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
  const skin = {
    primary: "bg-cherry-dk text-cream px-[28px] py-[13px] text-[16px] hover:bg-cherry",
    secondary: "bg-aqua text-ink px-[24px] py-[12px] text-[15px] hover:bg-aqua-wash",
    ghost:
      "bg-porcelain text-ink px-[20px] py-[11px] text-[15px] font-semibold hover:bg-cream-2",
  }[variant];
  return <button className={`${base} ${skin} ${className}`} {...props} />;
}

export function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-[6px] block font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2"
    >
      {children}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`w-full rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3 disabled:bg-cream-2 disabled:text-ink-2 ${className}`}
      {...props}
    />
  );
}

/**
 * An inline notice. Tone is carried by fill AND by a word, never by colour
 * alone — the heading text says which it is.
 */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "good";
  children: ReactNode;
}) {
  const skin = {
    info: { bg: "bg-cream-2", label: "Note" },
    warn: { bg: "bg-sun", label: "Hold on" },
    good: { bg: "bg-mint-wash", label: "Good" },
  }[tone];
  return (
    <div
      className={`rounded-card border-[3px] border-ink ${skin.bg} px-[17.6px] py-[13.2px] text-[15px] leading-[1.45] text-ink`}
    >
      <span className="mb-[2px] block font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
        {skin.label}
      </span>
      {children}
    </div>
  );
}

/** A field on the order docket: typed label over its value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[4px] font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="text-[16px] font-bold text-ink">{children}</div>
    </div>
  );
}

/**
 * Status chip. Bright fill, dark ink, heavy keyline — and the label is always
 * present, so the colour is reinforcement rather than the message.
 */
const CHIP_SKIN: Record<string, string> = {
  Requested: "bg-chrome text-ink",
  Accepted: "bg-aqua text-ink",
  Printing: "bg-sun text-ink",
  Delivery: "bg-cherry text-ink",
  Done: "bg-mint text-ink",
  Declined: "bg-cream-3 text-ink-2",
  // Feature-request states (see FEATURE_FLOW). Reuse the print palette's roles:
  // sun = in-progress/warning, cherry = wants-you-to-act.
  InProgress: "bg-sun text-ink",
  Shipped: "bg-cherry text-ink",
};

/** A range input as a thick bar with a ringed thumb; its track is its own background. */
export const SLIDER =
  "h-[26px] w-full cursor-pointer appearance-none rounded-full border-[3px] border-ink disabled:cursor-not-allowed disabled:opacity-40 " +
  "[&::-webkit-slider-thumb]:h-[20px] [&::-webkit-slider-thumb]:w-[20px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_2.5px_#1b2126] " +
  "[&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_2.5px_#1b2126]";

/**
 * A ticket whose colour the owner does not have yet: they picked a spool to
 * buy from the filamentcolors.xyz library (or SpoolmanDB) rather than one on
 * the shelf.
 */
export function SpoolToBuyChip() {
  return (
    <span className="inline-block flex-none rounded-chip border-2 border-ink bg-aqua px-[8px] py-[1px] font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink">
      Spool to buy
    </span>
  );
}

export function StatusChip({
  status,
  label,
  className = "",
}: {
  status: string;
  /** Display text when it differs from the enum value (e.g. "In progress"). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-chip border-2 border-ink px-[11px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] ${
        CHIP_SKIN[status] ?? CHIP_SKIN.Requested
      } ${className}`}
    >
      {label ?? status}
    </span>
  );
}
