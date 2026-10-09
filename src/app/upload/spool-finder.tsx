"use client";

import { useEffect, useState } from "react";

import { SWATCH_SHADES, type LibrarySwatch, type SwatchShade } from "@/lib/catalog";
import { FilamentSpool } from "@/components/color-swatch";

/** What `GET /api/filament-library` answers with. */
type Found = { total: number; swatches: LibrarySwatch[] };

type Search =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "found"; found: Found };

/** How long typing has to pause before the library is asked again. */
const DEBOUNCE_MS = 300;

/**
 * Spools the owner does not have but can buy: the filamentcolors.xyz library,
 * narrowed to the material picked, searched by words and shade. The server
 * does the searching (the browser may not reach that site), and reads the
 * picked swatch back from its own copy when the request is sent.
 *
 * Closed it is one button, so the shelf stays the obvious choice; a pick made
 * here replaces the shelf colour, and a shelf colour picked replaces this.
 */
export function SpoolFinder({
  material,
  owner,
  picked,
  onPick,
}: {
  material: string;
  owner: string;
  picked: LibrarySwatch | null;
  onPick: (swatch: LibrarySwatch | null) => void;
}) {
  const [open, setOpen] = useState(picked !== null);
  const [query, setQuery] = useState("");
  const [shade, setShade] = useState<SwatchShade | null>(null);
  const [search, setSearch] = useState<Search>({ kind: "loading" });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSearch({ kind: "loading" });
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ material });
      if (query.trim()) params.set("q", query.trim());
      if (shade) params.set("shade", shade);
      try {
        const res = await fetch(`/api/filament-library?${params}`, { signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return setSearch({ kind: "error", message: body.error ?? "The library did not answer. Try again." });
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
  }, [open, material, query, shade]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-[17.6px] flex w-full cursor-pointer items-center gap-[13.2px] rounded-card border-[3px] border-dashed border-ink-3 bg-porcelain px-[15px] py-[12px] text-left text-ink transition-colors hover:border-ink hover:bg-sun-wash"
      >
        <span aria-hidden className="font-display text-[26px] leading-none">+</span>
        <span>
          <span className="block font-display text-[17px] font-bold">Not on the shelf? Find a spool {owner} can get</span>
          <span className="block text-[13px] text-ink-2">
            Thousands of real {material} colors, from the filamentcolors.xyz library.
          </span>
        </span>
      </button>
    );
  }

  return (
    <section
      aria-labelledby="spool-finder-heading"
      className="mt-[17.6px] rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp"
    >
      <div className="mb-[11px] flex flex-wrap items-baseline justify-between gap-x-[13.2px] gap-y-[4px]">
        <h3 id="spool-finder-heading" className="m-0 font-display text-[19px] text-ink">
          Spools {owner} can get
        </h3>
        <button
          type="button"
          onClick={() => {
            onPick(null);
            setOpen(false);
          }}
          className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-3 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
        >
          {picked ? "Back to the shelf" : "Close"}
        </button>
      </div>

      {picked && (
        <div
          aria-live="polite"
          className="mb-[13.2px] flex items-center gap-[13.2px] rounded-card border-[3px] border-ink bg-sun px-[13px] py-[10px]"
        >
          <FilamentSpool mode="solid" style={picked.hex} className="h-[46px] w-[32px] flex-none" />
          <div className="min-w-0 flex-1">
            <p className="m-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2">Spool to buy</p>
            <p className="m-0 break-words font-display text-[17px] font-bold leading-[1.2] text-ink">{picked.name}</p>
            <p className="m-0 text-[13px] text-ink-2">
              {picked.maker} · {picked.type} ·{" "}
              <a href={picked.pageUrl} target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2">
                see the real swatch ↗
              </a>
            </p>
          </div>
        </div>
      )}
      {picked && (
        <p className="m-0 mb-[13.2px] text-[13.5px] leading-[1.45] text-ink-2">
          {owner} has to buy this spool first, so it can take a little longer than a color on the shelf.
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

      <div role="radiogroup" aria-label="Shade" className="mt-[10px] flex flex-wrap gap-[6px]">
        {SWATCH_SHADES.map((s) => {
          const active = s.key === shade;
          return (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setShade(active ? null : s.key)}
              className={`flex cursor-pointer items-center gap-[6px] rounded-chip border-2 border-ink px-[9px] py-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.05em] transition-colors ${
                active ? "bg-cherry-dk text-cream" : "bg-cream text-ink hover:bg-sun"
              }`}
            >
              <span aria-hidden className="h-[10px] w-[10px] rounded-full border-[1.5px] border-ink" style={{ background: s.dot }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-[13.2px] min-h-[120px]">
        {search.kind === "loading" && (
          <p className="m-0 py-[22px] text-center font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3">
            Rummaging through the library…
          </p>
        )}
        {search.kind === "error" && (
          <p role="alert" className="m-0 py-[22px] text-center text-[14px] text-cherry-dk">
            {search.message}
          </p>
        )}
        {search.kind === "found" && search.found.total === 0 && (
          <p className="m-0 py-[22px] text-center text-[14px] text-ink-2">
            No {material} spools match that. Try fewer words, or another shade.
          </p>
        )}
        {search.kind === "found" && search.found.total > 0 && (
          <>
            <div
              role="radiogroup"
              aria-label="Spools to buy"
              className="grid max-h-[360px] grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-[8px] overflow-y-auto pr-[2px]"
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
                    className={`flex min-w-0 cursor-pointer flex-col items-center gap-[5px] rounded-card border-[3px] px-[6px] py-[8px] transition-colors ${
                      active ? "border-ink bg-sun" : "border-transparent bg-transparent hover:border-ink/40 hover:bg-cream-2"
                    }`}
                  >
                    <FilamentSpool mode="solid" style={s.hex} className="h-[54px] w-[38px]" />
                    <span className="line-clamp-2 text-center text-[12px] font-bold leading-[1.2] text-ink">{s.name}</span>
                    <span className="line-clamp-1 text-center font-mono text-[10px] uppercase tracking-[0.04em] text-ink-3">
                      {s.maker}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-[8px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
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
    </section>
  );
}
