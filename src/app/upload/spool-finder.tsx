"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { COLOR_GRID, type SwatchChoice } from "@/lib/catalog";
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
 * the colour picked from the grid at the top of the form, and the library
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

/** What a screen reader hears for each column, then each row of `COLOR_GRID`. */
const HUE_NAMES = ["sky blue", "blue", "violet", "purple", "pink", "red", "orange", "yellow", "lime", "green"];
const ROW_NAMES = [
  "darkest", "very dark", "dark", "deep", "rich", "bright", "clear", "light", "soft", "pale", "palest",
];

function cellLabel(row: number, col: number) {
  if (row === 0) {
    if (col === 0) return "white";
    if (col === COLOR_GRID[0]!.length - 1) return "black";
    return `grey ${col} of ${COLOR_GRID[0]!.length - 2}`;
  }
  return `${ROW_NAMES[row - 1] ?? ""} ${HUE_NAMES[col] ?? ""}`.trim();
}

/**
 * A grid of colours to search by, laid out like a phone's colour picker. One
 * tab stop for the whole grid; the arrow keys move around it, Home and End
 * go to a row's ends, and Enter or Space picks. Picking the chosen colour
 * again clears it.
 */
export function ColorGrid({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  const rows = COLOR_GRID.length;
  const cols = COLOR_GRID[0]!.length;
  const chosen = value === null ? -1 : COLOR_GRID.flat().indexOf(value);
  const [focus, setFocus] = useState(chosen >= 0 ? chosen : 0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  function move(e: React.KeyboardEvent, index: number) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const next = {
      ArrowRight: row * cols + Math.min(cols - 1, col + 1),
      ArrowLeft: row * cols + Math.max(0, col - 1),
      ArrowDown: Math.min(rows - 1, row + 1) * cols + col,
      ArrowUp: Math.max(0, row - 1) * cols + col,
      Home: row * cols,
      End: row * cols + cols - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setFocus(next);
    cells.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color you want"
      // Square cells, and capped so twelve rows of them stay under the fold.
      className="mt-[6px] grid w-full max-w-[460px] overflow-hidden rounded-[14px] border-[3px] border-ink"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {COLOR_GRID.flatMap((row, r) =>
        row.map((hex, c) => {
          const index = r * cols + c;
          const active = index === chosen;
          return (
            <button
              key={index}
              ref={(el) => {
                cells.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={cellLabel(r, c)}
              tabIndex={index === focus ? 0 : -1}
              onClick={() => {
                setFocus(index);
                onChange(active ? null : hex);
              }}
              onKeyDown={(e) => move(e, index)}
              className={`relative aspect-square cursor-pointer border-0 p-0 transition-transform focus-visible:z-20 ${
                active ? "z-10 scale-[1.08] rounded-[6px]" : "hover:z-10 hover:scale-[1.05] hover:rounded-[5px]"
              }`}
              style={{
                background: hex,
                boxShadow: active ? "0 0 0 2.5px #ffffff, 0 0 0 5px #1b2126" : undefined,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
