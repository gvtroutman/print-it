"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PaletteColorInput, SavedPaletteColor } from "@/lib/palette-types";
import { colorDisplayName, colorTitleCase } from "@/lib/filament-color-types";

const displayColor = (color: SavedPaletteColor): SavedPaletteColor => ({ ...color, name: colorDisplayName(color.name) });

export function usePersonalPalette(initial: SavedPaletteColor[]) {
  const [colors, setColors] = useState(() => initial.map(displayColor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutating = useRef(false);

  const find = (color: PaletteColorInput) => colors.find((saved) =>
    saved.hex.toLowerCase() === color.hex.toLowerCase() && saved.alpha === color.alpha,
  );

  async function save(color: PaletteColorInput) {
    if (mutating.current || find(color)) return;
    mutating.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/palette", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...color, name: colorDisplayName(color.name) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.color) throw new Error(body.error ?? "That color could not be saved. Try again.");
      const saved = displayColor(body.color as SavedPaletteColor);
      setColors((held) => held.some((item) => item.id === saved.id) ? held : [...held, saved]);
    } catch (problem) {
      setError(problem instanceof Error && !(problem instanceof TypeError) ? problem.message : "The connection dropped. Try again.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/palette/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "That color could not be removed. Try again.");
      setColors((held) => held.filter((item) => item.id !== id));
    } catch (problem) {
      setError(problem instanceof Error && !(problem instanceof TypeError) ? problem.message : "The connection dropped. Try again.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  return { colors, busy, error, find, save, remove };
}

export type PersonalPaletteController = ReturnType<typeof usePersonalPalette>;

export function SavePaletteColor({ color, palette, compact = true }: {
  color: PaletteColorInput | null;
  palette: PersonalPaletteController;
  compact?: boolean;
}) {
  const saved = color ? palette.find(color) : undefined;
  const label = saved ? `Unsave ${colorTitleCase(saved.name)} from your palette` : color ? `Save ${colorTitleCase(color.name)} to your palette` : "Choose a color to save to your palette";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!!saved}
      title={label}
      disabled={!color || palette.busy}
      onClick={() => saved ? void palette.remove(saved.id) : color && void palette.save(color)}
      className={`flex flex-none cursor-pointer items-center justify-center rounded-[8px] border-0 bg-cream-2 font-display text-ink-2 hover:bg-cream-3 disabled:cursor-default ${compact ? "min-h-[52px] w-[44px] flex-col gap-[2px] text-[10px]" : "min-h-[40px] gap-[8px] px-[12px] text-[11px]"} ${!color ? "opacity-40" : ""}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill={saved ? "var(--color-mint)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M6 3h12v18l-6-4-6 4V3Z" />
        {saved && <path d="m9 9 2 2 4-4" fill="none" />}
      </svg>
      {palette.busy ? compact ? "Wait…" : "Updating palette…" : saved ? compact ? "Unsave" : "Unsave selected color" : compact ? "Save" : "Save selected color"}
    </button>
  );
}

export function PersonalPalette({ palette, value, alpha, onSelect }: {
  palette: PersonalPaletteController;
  value: string | null;
  alpha: number;
  onSelect: (color: SavedPaletteColor) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (palette.colors.length === 0) setOpen(false);
  }, [palette.colors.length]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  if (palette.colors.length === 0) return null;

  return (
    <div className="mx-auto mb-[18px] w-full max-w-[560px]">
      <div className="flex justify-end">
        <button
          ref={trigger}
          type="button"
          aria-label="Your palette"
          title="Your saved colors"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((held) => !held)}
          className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-[5px] rounded-card border-[2px] border-ink px-[9px] text-ink hover:bg-cream-3 ${open ? "bg-cream-3" : "bg-cream-2"}`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="var(--color-cream)" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 0 20h1.2a2.3 2.3 0 0 0 1.6-3.9 1.7 1.7 0 0 1 1.2-2.9h2A4 4 0 0 0 22 11a9.8 9.8 0 0 0-10-9Z" />
            <circle cx="7.5" cy="8" r="1.5" fill="var(--color-cherry)" stroke="none" />
            <circle cx="12" cy="5.8" r="1.5" fill="var(--color-sun)" stroke="none" />
            <circle cx="16.5" cy="8" r="1.5" fill="var(--color-mint)" stroke="none" />
            <circle cx="5.5" cy="12.5" r="1.5" fill="var(--color-aqua)" stroke="none" />
            <circle cx="9.5" cy="16" r="1.8" />
          </svg>
          <span className="font-display text-[11px]">{palette.colors.length}<span className="sr-only"> saved colors</span></span>
        </button>
      </div>
      <section
        id={id}
        aria-label="Your palette"
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        }}
        className="mt-[8px] rounded-card border-[2px] border-ink bg-cream-2 px-[12px] py-[12px]"
      >
        <div className="flex items-center justify-between gap-[8px]">
          <h2 className="m-0 font-display text-[13px] text-ink">Your saved colors</h2>
          <button type="button" aria-label="Close your palette" onClick={close} className="flex h-[44px] w-[44px] flex-none cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-ink-2 hover:bg-cream-3">
            <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div role="radiogroup" aria-label="Saved colors" className="mt-[8px] flex max-h-[280px] flex-wrap gap-x-[8px] gap-y-[12px] overflow-y-auto p-[5px]">
          {palette.colors.map((color) => {
            const name = colorTitleCase(color.name);
            const active = value?.toLowerCase() === color.hex.toLowerCase() && alpha === color.alpha;
            const tint = `${color.hex}${Math.round(color.alpha * 255).toString(16).padStart(2, "0")}`;
            return (
              <div key={color.id} className="relative flex w-[64px] min-w-0 flex-col items-center">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={name}
                  title={name}
                  onClick={() => onSelect(color)}
                  className="group flex w-full cursor-pointer flex-col items-center gap-[6px] border-0 bg-transparent p-0"
                >
                  <span aria-hidden className={`h-[44px] w-[44px] rounded-full border-[3px] border-ink ${active ? "shadow-[0_0_0_3px_#ffffff,0_0_0_5px_#1b2126]" : "group-hover:scale-[1.08]"}`} style={{ background: `linear-gradient(${tint}, ${tint}), repeating-conic-gradient(#d4d9dd 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px` }} />
                  <span className={`line-clamp-2 w-full break-words text-center font-display text-[10px] leading-[1.2] ${active ? "text-cherry-dk" : "text-ink-2"}`}>{name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Unsave ${name} from your palette`}
                  title={`Unsave ${name} from your palette`}
                  disabled={palette.busy}
                  onClick={() => void palette.remove(color.id)}
                  className="absolute -top-[4px] right-0 z-10 flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-full border-[2px] border-ink bg-cream text-ink hover:bg-cherry-wash hover:text-cherry-dk disabled:cursor-default disabled:opacity-40"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-[12px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
