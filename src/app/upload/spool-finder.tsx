"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { hslHex, type CatalogColorChoice, type SwatchChoice } from "@/lib/catalog";
import { SwatchPhoto } from "@/components/swatch-photo";

/** What `GET /api/filament-library` answers with. */
type Found = { total: number; swatches: SwatchChoice[] };

type Search =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** `stale` while a newer search is on its way. */
  | { kind: "found"; found: Found; stale?: boolean };

/** How long typing has to pause before the library is asked again. */
const DEBOUNCE_MS = 300;

type Tab = "shelf" | "library";

/**
 * One card for a material's colours, with two tabs. "In library" is the
 * owner's shelf — `shelf`, the spools already there — and is what the card
 * opens on. "Other colors" is the filamentcolors.xyz library: spools the
 * owner does not have but can buy.
 *
 * A pick in either tab replaces the other. The card opens on the other
 * colours when a spool to buy is already picked, and switches there when
 * `suggested` says nothing on the shelf looks like the colour picked up top.
 * Key it by material: another material starts back on its shelf.
 */
export function ColorCard({
  material,
  owner,
  shelf,
  shelfCount,
  picked,
  onPick,
  near,
  onNear,
  clear,
  suggested,
}: {
  material: string;
  owner: string;
  shelf: ReactNode;
  shelfCount: number;
  picked: SwatchChoice | null;
  onPick: (swatch: SwatchChoice | null) => void;
  near: string | null;
  onNear: (hex: string | null) => void;
  /** The colour picked up top is partly see-through. */
  clear: boolean;
  suggested: boolean;
}) {
  const id = useId();
  const [tab, setTab] = useState<Tab>(picked !== null || suggested ? "library" : "shelf");
  // The library is only asked once its tab has been opened, then stays
  // mounted so a search typed there survives a look back at the shelf.
  const [visited, setVisited] = useState(tab === "library");

  function show(next: Tab) {
    setTab(next);
    if (next === "library") setVisited(true);
  }

  // Another colour with nothing like it on the shelf opens the other colours,
  // even after going back to the shelf.
  useEffect(() => {
    if (suggested) show("library");
  }, [suggested, near]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "shelf", label: "In library", count: shelfCount },
    { key: "library", label: "Other colors" },
  ];

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = e.key === "Home" ? "shelf" : e.key === "End" ? "library" : tab === "shelf" ? "library" : "shelf";
    show(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={`${material} colors`}
        // Folder tabs on top of the card, not inside it: the open one is joined
        // to the card by covering its top edge.
        className="relative z-10 flex gap-[6px] px-[13.2px]"
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              id={`${id}-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => show(t.key)}
              onKeyDown={onTabKey}
              // The open tab sits on the card's edge, joined to its panel.
              className={`-mb-[3px] flex cursor-pointer items-center gap-[7px] rounded-t-[12px] border-[3px] px-[14px] py-[8px] font-display text-[16px] font-bold transition-colors ${
                active
                  ? "border-ink border-b-porcelain bg-porcelain text-ink"
                  : "border-transparent bg-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-[7px] py-[1px] font-mono text-[11px] font-bold ${
                    active ? "bg-sun text-ink" : "bg-cream-2 text-ink-2"
                  }`}
                >
                  {t.count}
                </span>
              )}
              {t.key === "library" && picked && (
                <span aria-label="(picked)" className="h-[9px] w-[9px] rounded-full bg-cherry-dk" />
              )}
            </button>
          );
        })}
      </div>
      <div className="rounded-panel border-[3px] border-ink bg-porcelain shadow-stamp">
        <div
          id={`${id}-panel-shelf`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-shelf`}
          hidden={tab !== "shelf"}
          className="p-[17.6px]"
        >
          {picked && (
            <p aria-live="polite" className="m-0 mb-[13.2px] text-[13.5px] leading-[1.45] text-ink-2">
              You picked <b className="text-ink">{picked.name}</b> from the other colors. Tap a spool here to switch to
              one {owner} already has.
            </p>
          )}
          {shelf}
        </div>

        <div
          id={`${id}-panel-library`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-library`}
          hidden={tab !== "library"}
          className="p-[17.6px]"
        >
          {visited && (
            <SpoolFinder
              material={material}
              owner={owner}
              picked={picked}
              onPick={onPick}
              onBack={() => {
                onPick(null);
                show("shelf");
              }}
              near={near}
              onNear={onNear}
              clear={clear}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Spools the owner does not have but can buy: the filamentcolors.xyz library,
 * narrowed to the material picked, searched by words and shade. The server
 * does the searching (the browser may not reach that site), and reads the
 * picked swatch back from its own copy when the request is sent. `near` is
 * the colour picked from the rainbow at the top of the form, and the library
 * answers closest to it first; `clear`, see-through spools ahead of the rest.
 */
function SpoolFinder({
  material,
  owner,
  picked,
  onPick,
  onBack,
  near,
  onNear,
  clear,
}: {
  material: string;
  owner: string;
  picked: SwatchChoice | null;
  onPick: (swatch: SwatchChoice | null) => void;
  onBack: () => void;
  near: string | null;
  onNear: (hex: string | null) => void;
  clear: boolean;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    // The last results stay up, faded, until the new ones arrive: a blank
    // panel on every chip read as "nothing there".
    setSearch((prev) => (prev.kind === "found" ? { ...prev, stale: true } : { kind: "loading" }));
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ material });
      if (query.trim()) params.set("q", query.trim());
      if (near) params.set("near", near);
      if (clear) params.set("clear", "1");
      try {
        const res = await fetch(`/api/filament-library?${params}`, { signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return setSearch({ kind: "error", message: body.error ?? "filamentcolors.xyz did not answer. Try again." });
        }
        setSearch({ kind: "found", found: body as Found });
      } catch {
        if (!controller.signal.aborted) setSearch({ kind: "error", message: "The connection dropped. Try again." });
      }
    }, query ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [material, query, near, clear]);

  return (
    <>
      <p className="m-0 mb-[11px] text-[13.5px] leading-[1.45] text-ink-2">
        Thousands of real {material} colors {owner} doesn&apos;t have yet, but can get.
      </p>

      {picked && (
        <div
          aria-live="polite"
          className="mb-[13.2px] flex items-center gap-[13.2px] rounded-card border-[3px] border-ink bg-sun px-[13px] py-[10px]"
        >
          <SwatchPhoto swatch={picked} className="w-[120px] flex-none" />
          <div className="min-w-0 flex-1">
            <p className="m-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2">Spool to buy</p>
            <p className="m-0 break-words font-display text-[17px] font-bold leading-[1.2] text-ink">{picked.name}</p>
            <p className="m-0 text-[13px] text-ink-2">
              {picked.maker} · {picked.type} ·{" "}
              <a href={picked.pageUrl} target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2">
                see the real swatch ↗
              </a>
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-[4px] cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
            >
              Back to the library
            </button>
          </div>
        </div>
      )}
      {picked && (
        <p className="m-0 mb-[13.2px] text-[13.5px] leading-[1.45] text-ink-2">
          {owner} has to buy this spool first, so it can take a little longer than a color in the library.
        </p>
      )}

      <label htmlFor="spool-search" className="sr-only">
        Search spools
      </label>
      <input
        id="spool-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // Enter searches as it is; it does not send the order.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        maxLength={80}
        placeholder="Search a color or maker — galaxy, Polymaker, matte…"
        className="w-full rounded-card border-[3px] border-ink bg-cream px-[15px] py-[11px] text-[16px] text-ink placeholder:text-ink-3"
      />

      <div className="mt-[11px] flex items-center justify-between gap-[13.2px]">
        <p className="m-0 flex items-center gap-[8px] font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {near && (
            <span
              aria-hidden
              className="inline-block h-[18px] w-[18px] flex-none rounded-[5px] border-[2px] border-ink"
              style={{ background: near }}
            />
          )}
          {near
            ? `Closest to your color first${clear ? ", see-through ones ahead" : ""}`
            : "Pick a color up top to find spools like it"}
        </p>
        {near && (
          <button
            type="button"
            onClick={() => onNear(null)}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
          >
            Any color
          </button>
        )}
      </div>

      <div className="mt-[13.2px] min-h-[120px]">
        {search.kind === "loading" && (
          <p className="m-0 py-[22px] text-center font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3">
            Rummaging through the swatches…
          </p>
        )}
        {search.kind === "error" && (
          <p role="alert" className="m-0 py-[22px] text-center text-[14px] text-cherry-dk">
            {search.message}
          </p>
        )}
        {search.kind === "found" && search.found.total === 0 && (
          <p className="m-0 py-[22px] text-center text-[14px] text-ink-2">
            No {material} spools match that. Try fewer words, or another color.
          </p>
        )}
        {search.kind === "found" && search.found.total > 0 && (
          <>
            <div
              role="radiogroup"
              aria-label="Spools to buy"
              aria-busy={search.stale ?? false}
              className={`${search.stale ? "opacity-50" : ""} grid max-h-[360px] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-[14px] gap-y-[16px] overflow-y-auto p-[8px] transition-opacity`}
            >
              {search.found.swatches.map((s) => {
                const active = s.id === picked?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${s.name} by ${s.maker}, ${s.type}`}
                    onClick={() => onPick(s)}
                    // No box around it: the photo, with its name and maker under.
                    // The chosen one's photo wears a ring.
                    className="group flex min-w-0 cursor-pointer flex-col items-center gap-[5px] border-0 bg-transparent p-0"
                  >
                    <SwatchPhoto
                      swatch={s}
                      className={`w-full transition-transform ${
                        active ? "scale-[1.04] shadow-[0_0_0_3px_#ffffff,0_0_0_6px_#1b2126]" : "group-hover:scale-[1.04]"
                      }`}
                    />
                    <span
                      className={`line-clamp-2 text-center text-[12px] leading-[1.2] text-ink ${active ? "font-extrabold text-cherry-dk" : "font-bold"}`}
                    >
                      {s.name}
                    </span>
                    <span className="line-clamp-1 text-center font-mono text-[10px] uppercase tracking-[0.04em] text-ink-3">
                      {s.maker}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-[8px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
              {search.stale && "Looking… · "}
              {search.found.total > search.found.swatches.length
                ? `First ${search.found.swatches.length} of ${search.found.total} · search to narrow it down`
                : `${search.found.total} ${search.found.total === 1 ? "spool" : "spools"}`}
              {" · colors from "}
              <a href="https://filamentcolors.xyz/" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
                filamentcolors.xyz
              </a>
              {" · screens are not spools, so check the real swatch"}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/** A colour picked from the rainbow: hue in degrees, saturation 0–1, lightness 0–100, opacity 0–1. */
type Pick = { h: number; s: number; l: number; a: number };

/** Where a fresh pick starts: a pure colour, solid. */
const FRESH = { s: 1, l: 50, a: 1 };

const clamp = (n: number) => Math.min(1, Math.max(0, n));

const hexOf = (pick: Pick) => hslHex(pick.h % 360, pick.s * 100, pick.l);

/** The pick as "#rrggbbaa", for showing it over the checkerboard. */
const cssOf = (pick: Pick) => `${hexOf(pick)}${Math.round(pick.a * 255).toString(16).padStart(2, "0")}`;

/** A colour picked before this mounted, back into hue, saturation and lightness. */
function pickOf(hex: string, a: number): Pick {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100, a };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / (1 - Math.abs(2 * l - 1)), l: l * 100, a };
}

/** What a screen reader hears for a pick, and what the box says under it: "light orange". */
function pickName({ h, s, l }: Pick): string {
  if (l > 97) return "white";
  if (l < 4) return "black";
  if (s < 0.12) return l > 70 ? "light grey" : l < 30 ? "dark grey" : "grey";
  const hue = (
    [[15, "red"], [45, "orange"], [70, "yellow"], [95, "lime"], [160, "green"], [200, "teal"], [250, "blue"],
      [280, "violet"], [320, "purple"], [345, "pink"], [361, "red"]] as const
  ).find(([end]) => h < end)![1];
  const shade = l > 85 ? "pale " : l > 65 ? "light " : l > 38 ? "" : l > 20 ? "dark " : "very dark ";
  return `${shade}${s < 0.45 ? "muted " : ""}${hue}`;
}

/** The pad: every hue across, vivid at the top fading to grey at the bottom. */
const PAD_BACKGROUND = [
  "linear-gradient(to bottom, rgba(128,128,128,0), rgba(128,128,128,0.5), rgb(128,128,128))",
  `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} 100% 50%)`).join(", ")})`,
].join(", ");

/** A pale checkerboard, so a see-through colour looks see-through. */
const CHECKER = "repeating-conic-gradient(#d4d9dd 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px";

/** A range input as a thick bar with a ringed thumb; its track is its own background. */
const SLIDER =
  "h-[26px] w-full cursor-pointer appearance-none rounded-full border-[3px] border-ink disabled:cursor-not-allowed disabled:opacity-40 " +
  "[&::-webkit-slider-thumb]:h-[20px] [&::-webkit-slider-thumb]:w-[20px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_2.5px_#1b2126] " +
  "[&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_2.5px_#1b2126]";

const SLIDER_LABEL = "w-[104px] flex-none font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2";

/** The "your own" circle: the whole rainbow around it. */
const RAINBOW = `conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} 100% 50%)`).join(", ")})`;

/** One circle in the colour menu, with its name under. */
function MenuCircle({
  label,
  active,
  onClick,
  background,
  dashed,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  background?: string;
  dashed?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="group flex w-[64px] min-w-0 cursor-pointer flex-col items-center gap-[6px] border-0 bg-transparent p-0"
    >
      <span
        aria-hidden
        className={`grid h-[44px] w-[44px] place-items-center rounded-full border-[3px] transition-transform ${
          dashed ? "border-dashed border-ink-3" : "border-ink"
        } ${active ? "scale-[1.08] shadow-[0_0_0_3px_#ffffff,0_0_0_6px_#1b2126]" : "group-hover:scale-[1.08]"}`}
        style={background ? { background } : undefined}
      >
        {children}
      </span>
      <span
        className={`line-clamp-2 text-center font-mono text-[10px] font-bold uppercase leading-[1.2] tracking-[0.04em] ${
          active ? "text-cherry-dk" : "text-ink-2"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * The colour menu: every colour on the owner's shelf, across all materials,
 * as a circle, then "Any color" and a rainbow circle for your own. The full
 * picker — rainbow, dark · light, see-through — only opens from that last
 * circle, or when the colour already picked is none of the shelf's: the
 * circles slide off to the left as it slides in from the right. Dragging
 * sideways slides between the two by hand.
 */
export function ColorMenu({
  colors,
  value,
  alpha,
  onChange,
}: {
  colors: CatalogColorChoice[];
  value: string | null;
  alpha: number;
  onChange: (hex: string | null, alpha: number) => void;
}) {
  // One circle per colour name, the first material's look winning.
  const shelf: CatalogColorChoice[] = [];
  const seen = new Set<string>();
  for (const c of colors) {
    const key = c.name.toLowerCase();
    if (c.mode === "whatever" || !/^#[0-9a-f]{6}$/i.test(c.hex) || seen.has(key)) continue;
    seen.add(key);
    shelf.push(c);
  }
  const onShelf = (hex: string | null) =>
    hex !== null && alpha === 1 && shelf.some((c) => c.hex.toLowerCase() === hex.toLowerCase());

  // A colour of your own is one the circles don't have.
  const ownPicked = value !== null && !onShelf(value);
  const [own, setOwn] = useState(ownPicked);
  // The colour of your own, shown in the middle of its rainbow circle.
  const tint = value ? `${value}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : "";

  // The menu and the picker share one spot; it grows or shrinks to the one showing.
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const ownRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = (own ? pickerRef : menuRef).current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [own]);

  function open(next: boolean) {
    setOwn(next);
    // Focus follows to what slid in: the rainbow pad, or back to its circle.
    requestAnimationFrame(() =>
      (next
        ? pickerRef.current?.querySelector<HTMLElement>("[role=slider]")
        : ownRef.current?.querySelector<HTMLElement>("button")
      )?.focus({ preventScroll: true }),
    );
  }

  // ---- dragging between the two: they follow the pointer, and swap past halfway or on a flick ----
  const boxRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; dragging: boolean; lastX: number; lastT: number; vx: number } | null>(null);
  // A drag ends in a click on whatever it started on; that click is swallowed.
  const dragged = useRef(false);
  /** Mid-drag: how far across, 0 the circles to 1 the picker, and the height between theirs. */
  const [pull, setPull] = useState<{ p: number; h: number } | null>(null);

  function pullAt(x: number, startX: number) {
    const p = clamp((own ? 1 : 0) - (x - startX) / (boxRef.current!.offsetWidth * SWIPE));
    const [from, to] = [menuRef.current!.offsetHeight, pickerRef.current!.offsetHeight];
    return { p, h: from + (to - from) * p };
  }

  function onPointerDown(e: React.PointerEvent) {
    // The rainbow pad and the sliders keep their own drags.
    if (e.button !== 0 || (e.target as Element).closest("[role=slider], input[type=range]")) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.dragging) {
      const [dx, dy] = [e.clientX - g.x, e.clientY - g.y];
      // Mostly up or down is a scroll, not a drag.
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) return void (gesture.current = null);
      if (Math.abs(dx) < DRAG_START) return;
      g.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (e.timeStamp > g.lastT) g.vx = (e.clientX - g.lastX) / (e.timeStamp - g.lastT);
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    setPull(pullAt(e.clientX, g.x));
  }

  function onPointerEnd(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.dragging) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false));
    // A flick goes the way it was thrown, however short; otherwise past halfway swaps.
    const flick = Math.abs(g.vx) > FLICK ? g.vx < 0 : null;
    setOwn(e.type === "pointercancel" ? own : flick ?? pullAt(e.clientX, g.x).p > 0.5);
    setPull(null);
  }

  // Mid-drag the classes give way to where the pointer has them, with no easing.
  const held = (opacity: number, shift: number): React.CSSProperties => ({
    translate: `${shift * (100 / 3)}% 0`,
    opacity,
    transition: "none",
  });

  return (
    // Clips the slide at the card's edge, with room for the chosen circle's ring.
    // Up and down still scrolls the page on a phone; sideways drags are ours.
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className="relative -m-[10px] touch-pan-y select-none overflow-hidden transition-[height] duration-[400ms] ease-out motion-reduce:transition-none"
      style={pull ? { height: pull.h, transition: "none" } : height === null ? undefined : { height }}
    >
      {/* ---- the circles: slide off to the left for your own ---- */}
      <div
        ref={menuRef}
        inert={own}
        className={`${PANEL} ${own ? "absolute inset-x-0 top-0 -translate-x-1/3 opacity-0" : "relative"}`}
        style={pull ? held(1 - pull.p, -pull.p) : undefined}
      >
        <div role="radiogroup" aria-label="Color you want" className="flex flex-wrap gap-x-[8px] gap-y-[13.2px]">
          <MenuCircle label="Any color" active={value === null} dashed onClick={() => onChange(null, 1)} />
          {shelf.map((c) => (
            <MenuCircle
              key={c.id}
              label={c.name}
              active={!ownPicked && value !== null && value.toLowerCase() === c.hex.toLowerCase()}
              background={c.style}
              onClick={() => onChange(c.hex, 1)}
            />
          ))}
          <div ref={ownRef} className="contents">
            <MenuCircle label="Your own" active={ownPicked} background={RAINBOW} onClick={() => open(true)}>
              <span
                className="h-[20px] w-[20px] rounded-full border-[2.5px] border-ink"
                style={{ background: ownPicked ? `linear-gradient(${tint}, ${tint}), ${CHECKER}` : "#ffffff" }}
              />
            </MenuCircle>
          </div>
        </div>
      </div>

      {/* ---- the picker: slides in from the right to take their place ---- */}
      <div
        ref={pickerRef}
        inert={!own}
        className={`${PANEL} ${own ? "relative" : "absolute inset-x-0 top-0 translate-x-1/3 opacity-0"}`}
        style={pull ? held(pull.p, 1 - pull.p) : undefined}
      >
        <button
          type="button"
          onClick={() => open(false)}
          className="mb-[6px] cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
        >
          ← Shelf colors
        </button>
        <ColorPicker value={value} alpha={alpha} onChange={onChange} />
      </div>
    </div>
  );
}

/** Each half of the colour menu, sliding and fading as it swaps with the other. */
const PANEL = "w-full p-[10px] transition-[opacity,translate] duration-[400ms] ease-out motion-reduce:transition-none";

/** How far sideways, in pixels, a press has to move before it is a drag and not a tap. */
const DRAG_START = 8;

/** A drag across this share of the menu's width swaps all the way. */
const SWIPE = 0.6;

/** Pixels per millisecond that count as a flick. */
const FLICK = 0.4;

/**
 * A colour picker in three parts: a rainbow pad to aim a target at (hue
 * across, vivid to grey down), a big box showing the colour picked, and
 * sliders for how light or dark it is and how see-through. The pad is one
 * tab stop that the arrow keys move around. A colour is handed on once the
 * pointer or slider rests a moment, so the library is not asked again on
 * every pixel of a drag.
 */
export function ColorPicker({
  value,
  alpha,
  onChange,
}: {
  value: string | null;
  alpha: number;
  onChange: (hex: string | null, alpha: number) => void;
}) {
  const [pick, setPick] = useState<Pick | null>(() => (value ? pickOf(value, alpha) : null));
  const handOn = useRef(onChange);
  handOn.current = onChange;
  // The last colour handed on, so it is not mistaken for one from elsewhere.
  const sent = useRef({ hex: value, a: alpha });
  // The target was just moved from outside, so it is not handed back.
  const synced = useRef(false);

  // A colour picked elsewhere on the form — a shelf circle, "Any color" —
  // moves the target there too.
  useEffect(() => {
    if (value === sent.current.hex && alpha === sent.current.a) return;
    sent.current = { hex: value, a: alpha };
    synced.current = value !== null;
    setPick(value ? pickOf(value, alpha) : null);
  }, [value, alpha]);

  useEffect(() => {
    if (!pick) return;
    if (synced.current) {
      synced.current = false;
      return;
    }
    const hex = hexOf(pick);
    if (hex === value && pick.a === alpha) return;
    const timer = setTimeout(() => {
      sent.current = { hex, a: pick.a };
      handOn.current(hex, pick.a);
    }, 200);
    return () => clearTimeout(timer);
  }, [pick]);

  function aim(e: React.PointerEvent<HTMLDivElement>) {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const box = e.currentTarget.getBoundingClientRect();
    const h = clamp((e.clientX - box.left) / box.width) * 360;
    const s = 1 - clamp((e.clientY - box.top) / box.height);
    setPick((prev) => ({ ...FRESH, ...prev, h, s }));
  }

  function nudge(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.025;
    const dh = { ArrowRight: step, ArrowLeft: -step }[e.key] ?? 0;
    const ds = { ArrowUp: step, ArrowDown: -step }[e.key] ?? 0;
    if (!dh && !ds) return;
    e.preventDefault();
    setPick((prev) => {
      const from = prev ?? { h: 0, ...FRESH };
      return { ...from, h: (from.h + dh * 360 + 360) % 360, s: clamp(from.s + ds) };
    });
  }

  const hex = pick ? hexOf(pick) : null;
  const solid = pick ? hexOf({ ...pick, l: 50 }) : "#808080";

  return (
    <div className="mt-[6px] w-full max-w-[560px]">
      <div className="flex items-start gap-[13.2px]">
        {/* ---- 1 · the rainbow, with a target where the colour is ---- */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Color you want"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={pick ? Math.round(pick.h) : undefined}
          aria-valuetext={pick ? pickName(pick) : "none picked"}
          onPointerDown={aim}
          onPointerMove={aim}
          onKeyDown={nudge}
          className="relative h-[176px] min-w-0 flex-1 cursor-crosshair touch-none rounded-[14px] border-[3px] border-ink focus-visible:outline-offset-4"
          style={{ background: PAD_BACKGROUND }}
        >
          {pick && (
            <svg
              aria-hidden
              viewBox="0 0 34 34"
              className="pointer-events-none absolute h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(pick.h / 360) * 100}%`, top: `${(1 - pick.s) * 100}%` }}
            >
              <g fill="none" strokeLinecap="round">
                <g stroke="#1b2126" strokeWidth="5">
                  <circle cx="17" cy="17" r="8" />
                  <path d="M17 2.5v6M17 25.5v6M2.5 17h6M25.5 17h6" />
                </g>
                <g stroke="#ffffff" strokeWidth="2">
                  <circle cx="17" cy="17" r="8" />
                  <path d="M17 2.5v6M17 25.5v6M2.5 17h6M25.5 17h6" />
                </g>
              </g>
              <circle cx="17" cy="17" r="2" fill="#ffffff" stroke="#1b2126" strokeWidth="1.2" />
            </svg>
          )}
        </div>

        {/* ---- 2 · the colour picked, big ---- */}
        <div className="flex w-[96px] flex-none flex-col items-center gap-[6px] sm:w-[120px]">
          <div
            aria-hidden
            className={`grid aspect-square w-full place-items-center overflow-hidden rounded-[14px] border-[3px] ${
              pick ? "border-ink" : "border-dashed border-ink-3"
            }`}
            style={pick ? { background: `linear-gradient(${cssOf(pick)}, ${cssOf(pick)}), ${CHECKER}` } : undefined}
          >
            {!pick && (
              <span className="px-[6px] text-center font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                Any color
              </span>
            )}
          </div>
          {pick && (
            <p aria-live="polite" className="m-0 text-center text-[12.5px] font-bold leading-[1.25] text-ink">
              {pickName(pick)}
              {pick.a < 1 && (
                <span className="block font-normal text-ink-2">{Math.round((1 - pick.a) * 100)}% see-through</span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setPick(null);
              sent.current = { hex: null, a: 1 };
              onChange(null, 1);
            }}
            // Kept in place when hidden, so picking a colour does not shift anything.
            className={`cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 underline decoration-2 underline-offset-4 hover:text-cherry-dk ${
              pick ? "" : "invisible"
            }`}
          >
            Any color
          </button>
        </div>
      </div>

      {/* ---- 3 · lighter or darker, and how see-through ---- */}
      <div className="mt-[13.2px] grid gap-[11px]">
        <label className="flex items-center gap-[11px]">
          <span className={SLIDER_LABEL}>Dark · light</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pick ? Math.round(pick.l) : 50}
            disabled={!pick}
            aria-valuetext={pick ? pickName(pick) : undefined}
            onChange={(e) => setPick((prev) => prev && { ...prev, l: Number(e.target.value) })}
            className={SLIDER}
            style={{ background: `linear-gradient(to right, #000000, ${solid}, #ffffff)` }}
          />
        </label>
        <label className="flex items-center gap-[11px]">
          <span className={SLIDER_LABEL}>See-through</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pick ? Math.round((1 - pick.a) * 100) : 0}
            disabled={!pick}
            aria-valuetext={pick ? `${Math.round((1 - pick.a) * 100)}% see-through` : undefined}
            onChange={(e) => setPick((prev) => prev && { ...prev, a: 1 - Number(e.target.value) / 100 })}
            className={SLIDER}
            style={{ background: `linear-gradient(to right, ${hex ?? "#808080"}, ${hex ?? "#808080"}80, ${hex ?? "#808080"}00), ${CHECKER}` }}
          />
        </label>
      </div>
    </div>
  );
}
