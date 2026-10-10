"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { hslHex, type SwatchChoice } from "@/lib/catalog";
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
 * answers closest to it first.
 */
function SpoolFinder({
  material,
  owner,
  picked,
  onPick,
  onBack,
  near,
  onNear,
}: {
  material: string;
  owner: string;
  picked: SwatchChoice | null;
  onPick: (swatch: SwatchChoice | null) => void;
  onBack: () => void;
  near: string | null;
  onNear: (hex: string | null) => void;
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
  }, [material, query, near]);

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
          {near ? "Closest to your color first" : "Pick a color up top to find spools like it"}
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

/**
 * The rainbow pad's colours: hue left to right, lightness top to bottom, at
 * one saturation a little short of what a screen can show, because filament
 * rarely comes that vivid and a colour nothing is near finds nothing like it.
 */
const PAD_SATURATION = 85;
/** The lightness at the pad's top and bottom edges: palest and darkest. */
const PAD_TOP = 96;
const PAD_BOTTOM = 6;

/** Hue `x` (0–1 across) and lightness `y` (0–1 down) on the pad, or `x` along the greys. */
type Spot = { strip: "rainbow"; x: number; y: number } | { strip: "grey"; x: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function hexOf(spot: Spot): string {
  if (spot.strip === "grey") {
    const v = Math.round(255 * (1 - spot.x)).toString(16).padStart(2, "0");
    return `#${v}${v}${v}`;
  }
  return hslHex((spot.x * 360) % 360, PAD_SATURATION, PAD_TOP - (PAD_TOP - PAD_BOTTOM) * spot.y);
}

/** Where a colour sits on the pad, or on the greys; for a colour picked before this mounted. */
function spotOf(hex: string): Spot {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return { strip: "grey", x: 1 - max };
  const d = max - min;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const l = ((max + min) / 2) * 100;
  return { strip: "rainbow", x: h / 6, y: clamp((PAD_TOP - l) / (PAD_TOP - PAD_BOTTOM)) };
}

/** What a screen reader hears for a spot: "light orange", "dark grey". */
function spotName(spot: Spot): string {
  if (spot.strip === "grey") {
    if (spot.x < 0.04) return "white";
    if (spot.x > 0.96) return "black";
    return spot.x < 0.35 ? "light grey" : spot.x < 0.65 ? "grey" : "dark grey";
  }
  const h = spot.x * 360;
  const hue =
    [[15, "red"], [45, "orange"], [70, "yellow"], [95, "lime"], [160, "green"], [200, "teal"], [250, "blue"],
      [280, "violet"], [320, "purple"], [345, "pink"], [361, "red"]].find(([end]) => h < (end as number))![1];
  const l = PAD_TOP - (PAD_TOP - PAD_BOTTOM) * spot.y;
  const shade = l > 85 ? "pale " : l > 68 ? "light " : l > 40 ? "" : l > 22 ? "dark " : "very dark ";
  return `${shade}${hue}`;
}

/** The pad's background: the rainbow, washed to white above and to black below. */
const PAD_BACKGROUND = (() => {
  const middle = ((PAD_TOP - 50) / (PAD_TOP - PAD_BOTTOM)) * 100;
  const hues = Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${PAD_SATURATION}% 50%)`).join(", ");
  return [
    `linear-gradient(to bottom, rgba(255,255,255,${(PAD_TOP - 50) / 50}), rgba(255,255,255,0) ${middle}%, rgba(0,0,0,0) ${middle}%, rgba(0,0,0,${(50 - PAD_BOTTOM) / 50}))`,
    `linear-gradient(to right, ${hues})`,
  ].join(", ");
})();

/**
 * A rainbow to pick a colour from: drag across the pad, or along the greys
 * under it, and the colour is picked when the finger lifts. Each is one tab
 * stop; the arrow keys move around it and pick as they go.
 */
export function ColorPicker({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  // Where the marker sits. A drag moves it without picking until it lets go,
  // so the library is not asked again on every pixel.
  const [spot, setSpot] = useState<Spot | null>(() => (value ? spotOf(value) : null));
  const shown = value === null ? null : spot ?? spotOf(value);

  function pointer(strip: Spot["strip"], commit: boolean) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
      else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const box = e.currentTarget.getBoundingClientRect();
      const x = clamp((e.clientX - box.left) / box.width);
      const next: Spot = strip === "grey" ? { strip, x } : { strip, x, y: clamp((e.clientY - box.top) / box.height) };
      setSpot(next);
      if (commit) onChange(hexOf(next));
    };
  }

  function keys(strip: Spot["strip"]) {
    return (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.025;
      const from: Spot =
        shown?.strip === strip ? shown : strip === "grey" ? { strip, x: 0.5 } : { strip, x: 0, y: 0.5 };
      const dx = { ArrowRight: step, ArrowLeft: -step }[e.key] ?? 0;
      const dy = { ArrowDown: step, ArrowUp: -step }[e.key] ?? 0;
      if (!dx && !dy) return;
      e.preventDefault();
      const next: Spot =
        from.strip === "grey"
          ? { strip: "grey", x: clamp(from.x + dx + dy) }
          : { strip: "rainbow", x: (from.x + dx + 1) % 1, y: clamp(from.y + dy) };
      setSpot(next);
      onChange(hexOf(next));
    };
  }

  const marker = (at: Spot) => (
    <span
      aria-hidden
      className="pointer-events-none absolute h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2.5px_#1b2126]"
      style={{
        left: `${at.x * 100}%`,
        top: at.strip === "grey" ? "50%" : `${at.y * 100}%`,
        background: hexOf(at),
      }}
    />
  );

  const strip = "relative cursor-crosshair touch-none rounded-[14px] border-[3px] border-ink focus-visible:outline-offset-4";

  return (
    <div className="mt-[6px] w-full max-w-[460px]">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Color you want"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={shown?.strip === "rainbow" ? Math.round(shown.x * 360) : undefined}
        aria-valuetext={shown?.strip === "rainbow" ? spotName(shown) : "none picked"}
        onPointerDown={pointer("rainbow", false)}
        onPointerMove={pointer("rainbow", false)}
        onPointerUp={pointer("rainbow", true)}
        onKeyDown={keys("rainbow")}
        className={`${strip} h-[176px]`}
        style={{ background: PAD_BACKGROUND }}
      >
        {shown?.strip === "rainbow" && marker(shown)}
      </div>
      <div className="mt-[8px] flex items-center gap-[13.2px]">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Or a grey"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown?.strip === "grey" ? Math.round(shown.x * 100) : undefined}
          aria-valuetext={shown?.strip === "grey" ? spotName(shown) : "none picked"}
          onPointerDown={pointer("grey", false)}
          onPointerMove={pointer("grey", false)}
          onPointerUp={pointer("grey", true)}
          onKeyDown={keys("grey")}
          className={`${strip} h-[30px] flex-1`}
          style={{ background: "linear-gradient(to right, #ffffff, #808080, #000000)" }}
        >
          {shown?.strip === "grey" && marker(shown)}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          // Kept in place when hidden, so picking a colour does not shift the pad.
          className={`flex-none cursor-pointer border-0 bg-transparent p-0 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-3 underline decoration-2 underline-offset-4 hover:text-cherry-dk ${
            value === null ? "invisible" : ""
          }`}
        >
          Any color
        </button>
      </div>
    </div>
  );
}
