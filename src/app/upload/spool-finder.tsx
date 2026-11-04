"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { WHATEVER_STYLE, hslHex, type CatalogColorChoice, type SwatchChoice } from "@/lib/catalog";
import { colorNameOf, filamentAlpha, filamentPaletteFor, type FilamentColor } from "@/lib/color-names";
import { FILAMENT_COLOR_FILTERS, colorDisplayName, colorTitleCase, filamentColorName, filamentColorStyle, filamentColorType, filamentMatchesColorFilter, type FilamentColorFilter, type FilamentColorType } from "@/lib/filament-color-types";
import { configuredFilamentRecords } from "@/lib/filament-settings-data";
import { filamentColorFits } from "@/lib/filament-palette-data";
import { DEFAULT_FILAMENT_SETTINGS, matchingFilamentBrand, type FilamentSettings } from "@/lib/filament-brands";
import { BrandLogo } from "@/components/brand-logo";
import { NavIcon } from "@/components/nav-icons";
import { FilamentPurchase } from "@/components/amazon-product";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { pickOf } from "@/lib/shade-field";
import { SwatchPhoto } from "@/components/swatch-photo";
import { FilamentPhoto } from "@/components/filament-photo";
import { SLIDER } from "@/components/ui";
import { shelfColors, shelfColorSample } from "@/lib/shelf-colors";
import { PersonalPalette, SavePaletteColor, type PersonalPaletteController } from "./personal-palette";
import Link from "next/link";
import { MIN_DONATION_LABEL, STORE_ACCESS_REQUIRED } from "@/lib/donation-policy";

/** What `GET /api/filament-library` answers with. */
type Found = { total: number; swatches: SwatchChoice[] };

type Search =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** `stale` while a newer search is on its way. */
  | { kind: "found"; found: Found; stale?: boolean };

/** How long typing has to pause before the library is asked again. */
const DEBOUNCE_MS = 300;

function SamplePhotoRetry({ onRetry }: { onRetry: () => void }) {
  return <div className="my-[12px] flex flex-wrap items-center justify-center gap-x-[10px] text-[12px] text-ink-2">
    <span role="status">Some sample photos couldn’t load.</span>
    <button type="button" onClick={onRetry} className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 font-bold underline underline-offset-4 hover:text-cherry-dk">Retry photos</button>
  </div>;
}

/**
 * Spools the owner does not have but can buy, in the "Store" tab: the
 * photographed filamentcolors.xyz samples for one material. Folded to a button until it
 * is wanted, so the library is not asked for nothing; it opens on its own
 * when a spool to buy is already picked, or when `suggested` says nothing on
 * the shelf looks like the colour picked up top. Key it by material: another
 * material starts folded, with a fresh search.
 */
export function OtherColors({
  filamentConfig = DEFAULT_FILAMENT_SETTINGS,
  material,
  owner,
  picked,
  onPick,
  near,
  onNear,
  clear,
  suggested,
  colorType,
}: {
  filamentConfig?: FilamentSettings;
  material: string;
  owner: string;
  picked: SwatchChoice | null;
  onPick: (swatch: SwatchChoice | null) => void;
  near: string | null;
  onNear: (hex: string | null) => void;
  /** The colour picked up top is partly see-through. */
  clear: boolean;
  suggested: boolean;
  colorType?: FilamentColorType;
}) {
  const [open, setOpen] = useState(picked !== null || suggested);

  // Another colour with nothing like it on the shelf opens the library, even after folding it.
  useEffect(() => {
    if (suggested) setOpen(true);
  }, [suggested, near]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
      >
        Other colors {owner} can get →
      </button>
    );
  }
  return (
    <section aria-labelledby="other-colors-heading" className="rounded-panel border-[3px] border-ink bg-porcelain p-[17.6px] shadow-stamp">
      <div className="mb-[8.8px] flex items-baseline justify-between gap-[13.2px]">
        <h3 id="other-colors-heading" className="m-0 font-display text-[17px] font-bold text-ink">
          Other colors
        </h3>
        {!picked && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
          >
            Fold away
          </button>
        )}
      </div>
      <SpoolFinder
        filamentConfig={filamentConfig}
        material={material}
        owner={owner}
        picked={picked}
        onPick={onPick}
        onBack={() => onPick(null)}
        near={near}
        onNear={onNear}
        clear={clear}
        colorType={colorType}
      />
    </section>
  );
}

/**
 * Spools the owner does not have but can buy: the filamentcolors.xyz library,
 * narrowed to the material picked, searched by words and shade. The server
 * does the searching (the browser may not reach that site), and reads the
 * picked swatch back from its own copy when the request is sent. `near` is
 * the colour picked from the chart at the top of the form, and the library
 * answers closest to it first; `clear`, see-through spools ahead of the rest.
 */
function SpoolFinder({
  filamentConfig,
  material,
  owner,
  picked,
  onPick,
  onBack,
  near,
  onNear,
  clear,
  colorType,
}: {
  filamentConfig: FilamentSettings;
  material: string;
  owner: string;
  picked: SwatchChoice | null;
  onPick: (swatch: SwatchChoice | null) => void;
  onBack: () => void;
  near: string | null;
  onNear: (hex: string | null) => void;
  clear: boolean;
  colorType?: FilamentColorType;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ kind: "loading" });
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(() => new Set());
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const visibleSwatches = search.kind === "found" ? search.found.swatches.filter(swatch => swatch.image) : [];
  const visibleTotal = search.kind === "found" ? search.found.total - (search.found.swatches.length - visibleSwatches.length) : 0;
  const pickedAmazonUrl = amazonListingUrl(picked?.buyUrl);

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
      if (colorType) params.set("colorType", colorType);
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
  }, [material, query, near, clear, colorType]);

  return (
    <>
      <p className="m-0 mb-[11px] text-[13.5px] leading-[1.45] text-ink-2">
        Swatched, Amazon-listed {material} colors from brands {owner} buys: {filamentConfig.brands.filter(brand => brand.active !== false).map((brand) => brand.name).join(", ") || "none enabled yet"}.
      </p>

      {picked && (
        <div
          aria-live="polite"
          className="mb-[13.2px] flex flex-col items-center gap-[6px] text-center"
        >
          <SwatchPhoto swatch={picked} bare sampleOnly retryKey={photoAttempt} onUnavailable={() => setFailedPhotos(previous => new Set(previous).add(picked.id))} className="w-[180px] flex-none" />
          <div className="min-w-0">
            <p className="m-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2">Spool to buy</p>
            <p className="m-0 break-words font-display text-[17px] font-bold leading-[1.2] text-ink">{colorTitleCase(picked.name)}</p>
            <p className="m-0 text-[13px] text-ink-2">
              {picked.maker} · {picked.type}
            </p>
            {pickedAmazonUrl && <FilamentPurchase url={pickedAmazonUrl} options={picked.purchaseOptions} className="mt-[5px] text-[12px] text-ink-2" />}
            <button
              type="button"
              onClick={onBack}
              className="mt-[4px] cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk"
            >
              Use a shelf color instead
            </button>
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
        placeholder="Search a color or brand — galaxy, Polymaker, matte…"
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

      {failedPhotos.size > 0 && <SamplePhotoRetry onRetry={() => { setFailedPhotos(new Set()); setPhotoAttempt(attempt => attempt + 1); }} />}
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
        {search.kind === "found" && visibleTotal === 0 && (
          <p className="m-0 py-[22px] text-center text-[14px] text-ink-2">
            No swatched {material} spools match that. Try fewer words, or another color.
          </p>
        )}
        {search.kind === "found" && visibleTotal > 0 && (
          <>
            <div
              role="radiogroup"
              aria-label="Spools to buy"
              aria-busy={search.stale ?? false}
              className={`${search.stale ? "opacity-50" : ""} grid max-h-[360px] grid-cols-1 gap-y-[20px] overflow-y-auto p-[12px] transition-opacity`}
            >
              {visibleSwatches.map((s) => {
                const active = s.id === picked?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${colorTitleCase(s.name)} by ${s.maker}, ${s.type}`}
                    onClick={() => onPick(s)}
                    className="group relative flex min-w-0 cursor-pointer flex-col items-center gap-[5px] border-0 bg-transparent p-0 focus-visible:outline-none"
                  >
                    <SwatchPhoto
                      swatch={s}
                      bare
                      sampleOnly
                      retryKey={photoAttempt}
                      onUnavailable={() => setFailedPhotos(previous => new Set(previous).add(s.id))}
                      className="w-full"
                    />
                    {active && <span aria-hidden className="absolute right-0 top-0 grid h-[20px] w-[20px] place-items-center rounded-full border-[2px] border-ink bg-sun text-[11px] font-bold text-ink">✓</span>}
                    <span
                      className={`line-clamp-2 text-center text-[12px] leading-[1.2] text-ink group-focus-visible:underline group-focus-visible:decoration-2 group-focus-visible:underline-offset-4 ${active ? "font-extrabold text-cherry-dk" : "font-bold"}`}
                    >
                      {colorTitleCase(s.name)}
                    </span>
                    <span className="line-clamp-1 text-center font-mono text-[10px] uppercase tracking-[0.04em] text-ink-3">
                      {s.maker} · {s.type}
                    </span>
                    <BrandLogo brand={matchingFilamentBrand(s.maker, filamentConfig.brands) ?? { name: s.maker }} className="h-[26px] w-[68px]" />
                    {s.buyUrl && <FilamentPurchase url={s.buyUrl} options={s.purchaseOptions} link={false} className="text-center text-[10px] text-ink-2" />}
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-[8px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
              {search.stale && "Looking… · "}
              {visibleTotal > visibleSwatches.length
                ? `First ${visibleSwatches.length} of ${visibleTotal} · search to narrow it down`
                : `${visibleTotal} ${visibleTotal === 1 ? "spool" : "spools"}`}
              {" · colors from "}
              {"filamentcolors.xyz"}
              {" · check the listing"}
            </p>
          </>
        )}
      </div>
    </>
  );
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Keep the rainbow on the scanned sample's silhouette, hole and printed texture. */
function AnyColorSwatch() {
  const sample = "/filament-swatches/polymaker-cope-white.webp";
  const mask = `url("${sample}") center / 100% 100% no-repeat`;
  return (
    <span aria-hidden className="grid min-h-[40px] w-full place-items-center">
      <span className="block w-full max-w-[480px] drop-shadow-[0_4px_4px_#1b212640]">
        <span className="relative block aspect-[15/4] w-full" style={{ background: WHATEVER_STYLE, mask, WebkitMask: mask }}>
          <img src={sample} alt="" width={480} height={128} className="block h-full w-full grayscale mix-blend-multiply" />
        </span>
      </span>
    </span>
  );
}

/** A shelf choice using the Store's borderless sample layout. */
function ShelfColorCard({
  label,
  detail,
  active,
  onClick,
  background,
  photo,
  reference,
  tabIndex,
  onKeyDown,
}: {
  label: string;
  detail?: string;
  active: boolean;
  onClick: () => void;
  background?: string;
  photo?: ReactNode;
  reference?: string;
  tabIndex: number;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-label={`${colorTitleCase(label)}${detail ? ` · ${detail}` : ""}`}
      aria-description={reference}
      aria-checked={active}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="group relative flex min-w-0 cursor-pointer flex-col items-center border-0 bg-transparent p-0 text-center focus-visible:outline-none"
    >
      {photo ?? <span
        aria-hidden
        className="grid aspect-[5/3] w-full max-w-[180px] place-items-center rounded-[6px] border border-ink/10"
        style={background ? { background } : undefined}
      />}
      {active && <span aria-hidden className="absolute right-0 top-0 grid h-[20px] w-[20px] place-items-center rounded-full border-[2px] border-ink bg-sun text-[11px] font-bold text-ink">✓</span>}
      <span className={`mt-[6px] break-words font-display text-[12px] leading-tight group-focus-visible:underline group-focus-visible:decoration-2 group-focus-visible:underline-offset-4 ${active ? "text-cherry-dk" : "text-ink"}`}>
        {colorTitleCase(label)}
      </span>
      {detail && <span className="mt-[3px] block break-words text-[10px] leading-tight text-ink-2">{detail}</span>}
      {reference && <span className="mt-[3px] block break-words text-[10px] leading-tight text-ink-2">{reference}</span>}
    </button>
  );
}

/**
 * The colour menu: every colour on the shelf it is given (one material's, or all of them),
 * as a filament preview card, plus "Any color". The market filament chart
 * opens from the "Store" tab, or when the colour already picked is
 * none of the shelf's: the shelf slides off to the left as it slides in from the right. Dragging
 * sideways slides between the two by hand.
 */
export function ColorMenu({
  filamentConfig = DEFAULT_FILAMENT_SETTINGS,
  colors,
  value,
  alpha,
  onChange: onSelect,
  material,
  personalPalette,
  otherColors,
  selectedFilament,
  selectedShelf: shelfChoice,
  storeAccess = false,
}: {
  filamentConfig?: FilamentSettings;
  colors: CatalogColorChoice[];
  value: string | null;
  alpha: number;
  onChange: (hex: string | null, alpha: number, filament?: FilamentColor, shelf?: CatalogColorChoice, name?: string) => void;
  material?: string | null;
  personalPalette?: PersonalPaletteController;
  /** Spools to buy are available only while the color chart is showing. */
  otherColors?: ReactNode;
  selectedFilament?: FilamentColor | null;
  selectedShelf?: CatalogColorChoice | null;
  storeAccess?: boolean;
}) {
  // Name custom shades here, where the source palette is already loaded.
  // The request form only needs the selected name and filament snapshot.
  const onChange = (hex: string | null, alpha: number, filament?: FilamentColor, shelf?: CatalogColorChoice) =>
    onSelect(hex, alpha, filament, shelf, hex ? colorNameOf(hex, alpha, filamentConfig) : undefined);
  const shelf = useMemo(() => shelfColors(colors).map(color => ({ ...color, sample: shelfColorSample(color, material ?? "", filamentConfig) })), [colors, material, filamentConfig]);
  const onShelf = (hex: string | null) =>
    !selectedFilament && hex !== null && alpha === 1 && shelf.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
  const selectedShelf = !selectedFilament && alpha === 1 ? shelf.find(c =>
    c.hex.toLowerCase() === value?.toLowerCase() && (!shelfChoice || c.id === shelfChoice.id
      || colorDisplayName(c.name).toLowerCase() === colorDisplayName(shelfChoice.name).toLowerCase()
        && c.mode === shelfChoice.mode && c.style === shelfChoice.style)) : undefined;

  // A colour of your own is one the shelf doesn't have.
  const ownPicked = value !== null && !onShelf(value);
  const [own, setOwn] = useState(storeAccess && ownPicked);
  // What slid in gets focus: the chart's selected color, or the selected shelf card.
  const pickerRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const shelfIndex = selectedShelf ? shelf.indexOf(selectedShelf) + 1 : 0;
  function navigateShelf(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = shelf.length + 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % count
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + count - 1) % count : null;
    if (next === null) return;
    event.preventDefault();
    const color = next === 0 ? undefined : shelf[next - 1];
    onChange(color?.hex ?? null, 1, undefined, color);
    shelfRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }
  function open(next: boolean) {
    setOwn(next);
    requestAnimationFrame(() =>
      (next
        ? pickerRef.current?.querySelector<HTMLElement>('[data-color-chart] [role=radio][tabindex="0"]') ??
          pickerRef.current?.querySelector<HTMLElement>("[data-color-type]")
        : shelfRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
          shelfRef.current?.querySelector<HTMLElement>("button")
      )?.focus({ preventScroll: true }),
    );
  }

  return (
    <>
      <SwipePair
        second={own}
        onShow={(next, tapped) => (tapped ? open(next) : setOwn(next))}
        labels={["Library", "Store"]}
        first={
          <div ref={shelfRef}>
            <div role="radiogroup" aria-label="Color you want" className="grid max-h-[380px] grid-cols-1 content-start gap-y-[20px] overflow-y-auto overscroll-contain p-[12px]">
              <ShelfColorCard label="Any color" active={value === null} photo={<AnyColorSwatch />} onClick={() => onChange(null, 1)} tabIndex={shelfIndex === 0 ? 0 : -1} onKeyDown={event => navigateShelf(event, 0)} />
              {shelf.map((c, index) => (
                <ShelfColorCard
                  key={c.id}
                  label={colorDisplayName(c.name)}
                  detail={c.detail}
                  active={!ownPicked && shelfIndex === index + 1}
                  background={c.style}
                  photo={c.sample ? <FilamentPhoto color={c.sample.color} bare sampleOnly className="w-full" /> : undefined}
                  reference={c.sample ? `${c.sample.exact ? "" : c.sample.baseColorOnly ? "Similar base color · " : "Similar color · "}${c.sample.color.maker} · ${c.sample.color.product}` : c.materialName ?? material ?? undefined}
                  onClick={() => onChange(c.hex, 1, undefined, c)}
                  tabIndex={shelfIndex === index + 1 ? 0 : -1}
                  onKeyDown={event => navigateShelf(event, index + 1)}
                />
              ))}
            </div>
            {personalPalette && selectedShelf?.mode === "solid" && (
              <div className="mt-[14px] flex justify-center">
                <SavePaletteColor color={{ name: selectedShelf.name, hex: selectedShelf.hex, alpha: 1 }} palette={personalPalette} compact={false} />
              </div>
            )}
          </div>
        }
        secondPanel={
          <div ref={pickerRef}>
            {!storeAccess && (
              <div className="rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] text-center">
                <div className="mb-[18px] flex h-[100px] items-center justify-center text-ink">
                  <NavIcon name="lock" size={112} className="drop-shadow-[3px_4px_2px_rgba(34,26,20,0.24)]" />
                </div>
                <h3 className="m-0 font-display text-[22px] text-ink">Unlock Store with {MIN_DONATION_LABEL}</h3>
                <p className="mt-[10px] text-[14px] leading-[1.5] text-ink-2">{STORE_ACCESS_REQUIRED}</p>
                <Link href="/bin" className="stamp inline-block rounded-chip border-[3px] border-ink bg-sun px-[17px] py-[10px] font-mono text-[12px] font-bold uppercase text-ink">
                  Go to Donate →
                </Link>
              </div>
            )}
            {storeAccess && own && personalPalette && (
              <PersonalPalette palette={personalPalette} value={value} alpha={alpha} onSelect={(color) => {
                const record = configuredFilamentRecords(filamentConfig).find(swatch => (!material || filamentColorFits(material, swatch)) && swatch.hex === color.hex && filamentColorName(swatch) === colorDisplayName(color.name));
                onChange(color.hex, color.alpha, record);
              }} />
            )}
            {storeAccess && own && <ColorChart value={value} alpha={alpha} onChange={onChange} material={material} personalPalette={personalPalette} filamentConfig={filamentConfig} selectedFilament={selectedFilament} />}
            {storeAccess && own && otherColors}
          </div>
        }
      />
      {personalPalette?.busy && <p role="status" className="sr-only">Updating your palette…</p>}
      {personalPalette?.error && <p role="alert" className="m-0 mt-[8px] text-center text-[12px] leading-[1.4] text-cherry-dk">{personalPalette.error}</p>}
    </>
  );
}

/**
 * Two panels sharing one spot, with two labeled buttons above them saying
 * which is showing. The second slides in from the right as the first slides
 * off to the left; tapping a button, or dragging sideways, swaps them. The
 * spot grows or shrinks to the panel showing.
 * `onShow` says whether a button was tapped, so the caller can move focus;
 * a drag leaves focus where it was.
 */
function SwipePair({
  second,
  onShow,
  labels,
  first,
  secondPanel,
}: {
  second: boolean;
  onShow: (second: boolean, tapped: boolean) => void;
  labels: [string, string];
  first: ReactNode;
  secondPanel: ReactNode;
}) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = (second ? secondRef : firstRef).current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [second]);

  // ---- dragging between the two: they follow the pointer, and swap past halfway or on a flick ----
  const boxRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; dragging: boolean; lastX: number; lastT: number; vx: number } | null>(null);
  // A drag ends in a click on whatever it started on; that click is swallowed.
  const dragged = useRef(false);
  /** Mid-drag: how far across, 0 the first to 1 the second, and the height between theirs. */
  const [pull, setPull] = useState<{ p: number; h: number } | null>(null);

  function pullAt(x: number, startX: number) {
    const p = clamp((second ? 1 : 0) - (x - startX) / (boxRef.current!.offsetWidth * SWIPE));
    const [from, to] = [firstRef.current!.offsetHeight, secondRef.current!.offsetHeight];
    return { p, h: from + (to - from) * p };
  }

  function onPointerDown(e: React.PointerEvent) {
    // Color controls and text selection keep their own drags.
    if (e.button !== 0 || (e.target as Element).closest("[data-color-picker], [role=slider], input, [role=listbox]")) return;
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
    const next = e.type === "pointercancel" ? second : flick ?? pullAt(e.clientX, g.x).p > 0.5;
    if (next !== second) onShow(next, false);
    setPull(null);
  }

  // Mid-drag the classes give way to where the pointer has them, with no easing.
  const held = (opacity: number, shift: number): React.CSSProperties => ({
    translate: `${shift * (100 / 3)}% 0`,
    opacity,
    transition: "none",
  });

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div aria-label="Color options" className="mb-[18px] grid grid-cols-2 gap-[4px] rounded-card border-[2px] border-ink bg-cream-2 p-[4px]">
        {([0, 1] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-label={labels[i]}
            aria-pressed={second === (i === 1)}
            onClick={() => second !== (i === 1) && onShow(i === 1, true)}
            className={`min-h-[40px] min-w-0 cursor-pointer rounded-[8px] border-0 px-[8px] py-[9px] font-display text-[12px] leading-tight transition-colors motion-reduce:transition-none ${
              second === (i === 1) ? "bg-ink text-cream shadow-soft" : "bg-transparent text-ink-2 hover:bg-porcelain"
            }`}
          >
            {labels[i]}
          </button>
        ))}
      </div>

      {/* Clips the slide at the card's edge, with room for a chosen circle's ring.
          Up and down still scrolls the page on a phone; sideways drags are ours. */}
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
        {/* ---- the first: slides off to the left for the second ---- */}
        <div
          ref={firstRef}
          inert={second}
          className={`${PANEL} ${second ? "pointer-events-none absolute inset-x-0 top-0 -translate-x-1/3 opacity-0" : "relative"}`}
          style={pull ? held(1 - pull.p, -pull.p) : undefined}
        >
          {first}
        </div>

        {/* ---- the second: slides in from the right to take its place ---- */}
        <div
          ref={secondRef}
          inert={!second}
          className={`${PANEL} ${second ? "relative" : "pointer-events-none absolute inset-x-0 top-0 translate-x-1/3 opacity-0"}`}
          style={pull ? held(pull.p, 1 - pull.p) : undefined}
        >
          {secondPanel}
        </div>
      </div>
    </div>
  );
}

/** Each panel of a swipe pair, sliding and fading as it swaps with the other. */
const PANEL = "w-full p-[10px] transition-[opacity,translate] duration-[400ms] ease-out motion-reduce:transition-none";

/** How far sideways, in pixels, a press has to move before it is a drag and not a tap. */
const DRAG_START = 8;

/** A drag across this share of the menu's width swaps all the way. */
const SWIPE = 0.6;

/** Pixels per millisecond that count as a flick. */
const FLICK = 0.4;

/** A chart of actual filament choices. Filters never replace the selected color. */
export function ColorChart({
  filamentConfig = DEFAULT_FILAMENT_SETTINGS,
  value,
  alpha,
  onChange,
  material,
  personalPalette,
  selectedFilament,
}: {
  filamentConfig?: FilamentSettings;
  value: string | null;
  alpha: number;
  onChange: (hex: string | null, alpha: number, filament?: FilamentColor) => void;
  material?: string | null;
  personalPalette?: PersonalPaletteController;
  selectedFilament?: FilamentColor | null;
}) {
  const id = useId();
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set());
  const [photoAttempt, setPhotoAttempt] = useState(0);
  // Browsing a hue never changes the requested filament until a sample is chosen.
  const [hueFilter, setHueFilter] = useState<number | null>(null);
  const hue = hueFilter ?? (value ? Math.round(pickOf(value).h) : 0);
  const hueName = ["Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Cyan", "Azure", "Blue", "Purple", "Magenta", "Pink"][Math.round(hue / 30) % 12]!;
  const [colorFilter, setColorFilter] = useState<FilamentColorFilter>(() => selectedFilament ? filamentColorType(selectedFilament) : alpha < 1 ? "Translucent" : "Solid");
  const filterLabel = colorFilter === "Translucent" ? "Clear" : colorFilter;
  const palette = useMemo(() => filamentPaletteFor(material, filamentConfig, colorFilter), [material, filamentConfig, colorFilter]);
  const gridRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filterGesture = useRef<{ id: number; x: number; y: number; scroll: number; dragging: boolean; moves: { x: number; time: number }[] } | null>(null);
  const filterDragged = useRef(false);
  const filterMomentum = useRef<number | null>(null);
  const finishPreviews = useMemo(() => FILAMENT_COLOR_FILTERS.map(type => {
    const examples = filamentPaletteFor(material, filamentConfig, type).colors;
    const preferred = type === "Solid" ? /^blue$/i : type === "Translucent" ? /^(?:clear|transparent|natural)$/i : type === "Silk" ? /gold/i : type === "Composite" ? /^bronze composite$/i : null;
    return { type, color: (preferred ? examples.find(color => preferred.test(colorDisplayName(color.name))) : null) ?? examples[0] };
  }), [material, filamentConfig]);

  function stopFilterMomentum() {
    if (filterMomentum.current !== null) cancelAnimationFrame(filterMomentum.current);
    filterMomentum.current = null;
  }

  useEffect(() => stopFilterMomentum, []);

  function coastFilters(row: HTMLDivElement, initialVelocity: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let velocity = Math.max(-2.5, Math.min(2.5, initialVelocity));
    let lastTime = performance.now();
    function frame(time: number) {
      const elapsed = Math.max(0, Math.min(time - lastTime, 32));
      lastTime = time;
      if (elapsed === 0) {
        filterMomentum.current = requestAnimationFrame(frame);
        return;
      }
      const speed = Math.max(0, Math.abs(velocity) - elapsed * 0.004);
      const nextVelocity = Math.sign(velocity) * speed;
      const before = row.scrollLeft;
      // Integrate the motion in pixels; category widths never set the destination.
      row.scrollLeft += (velocity + nextVelocity) * 0.5 * elapsed;
      velocity = nextVelocity;
      filterMomentum.current = speed > 0.02 && Math.abs(row.scrollLeft - before) > 0.1
        ? requestAnimationFrame(frame) : null;
    }
    filterMomentum.current = requestAnimationFrame(frame);
  }

  // Keep the active finish visible when a saved color or keyboard opens it.
  useEffect(() => {
    stopFilterMomentum();
    const row = filtersRef.current;
    const button = row?.querySelector<HTMLButtonElement>(`[data-color-type="${colorFilter}"]`);
    if (!row || !button) return;
    const bounds = row.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.left < bounds.left) row.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) row.scrollLeft += item.right - bounds.right;
  }, [colorFilter]);

  function dragFilters(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = filterGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) {
        filterGesture.current = null;
        return;
      }
      if (Math.abs(dx) < DRAG_START) return;
      gesture.dragging = true;
      filterDragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = "grabbing";
    }
    event.preventDefault();
    gesture.moves.push({ x: event.clientX, time: event.timeStamp });
    while (gesture.moves.length > 2 && gesture.moves[0].time < event.timeStamp - 100) gesture.moves.shift();
    event.currentTarget.scrollLeft = gesture.scroll - dx;
  }

  function endFilterDrag(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = filterGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    filterGesture.current = null;
    event.currentTarget.style.cursor = "";
    // Recent movement sets the flick's speed; a held or cancelled drag stops here.
    const first = gesture.moves[0];
    const last = gesture.moves[gesture.moves.length - 1];
    const elapsed = event.timeStamp - first.time;
    if (gesture.dragging && event.type === "pointerup" && event.timeStamp - last.time < 80 && elapsed > 0) {
      const velocity = (first.x - event.clientX) / elapsed;
      if (Math.abs(velocity) > 0.15) coastFilters(event.currentTarget, velocity);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Complete touch taps here too: a scrollable row can swallow the
    // browser's synthetic click immediately after a swipe.
    if (!gesture.dragging && event.type === "pointerup" && event.pointerType === "touch") {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-color-type]");
      const type = FILAMENT_COLOR_FILTERS.find(type => type === button?.dataset.colorType);
      if (type) setColorFilter(type);
    }
    // The click generated by releasing a drag must not select a finish.
    if (gesture.dragging) setTimeout(() => { filterDragged.current = false; }, 0);
  }

  function navigateFilters(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? FILAMENT_COLOR_FILTERS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % FILAMENT_COLOR_FILTERS.length
      : event.key === "ArrowLeft" ? (index + FILAMENT_COLOR_FILTERS.length - 1) % FILAMENT_COLOR_FILTERS.length
      : null;
    if (next === null) return;
    event.preventDefault();
    setColorFilter(FILAMENT_COLOR_FILTERS[next]!);
    filtersRef.current?.querySelectorAll<HTMLButtonElement>("[data-color-type]")[next]?.focus();
  }

  // A shelf or saved-palette selection should open its finish in the chart.
  useEffect(() => {
    setColorFilter(held => selectedFilament && filamentMatchesColorFilter(selectedFilament, held)
      ? held : selectedFilament ? filamentColorType(selectedFilament) : alpha < 1 ? "Translucent" : "Solid");
  }, [value, alpha, selectedFilament]);

  const selectedPalette = filamentPaletteFor(material, filamentConfig, alpha < 1 ? "Translucent" : "Solid");
  const swatch = selectedFilament ?? (value ? selectedPalette.colors.find(color => color.hex.toLowerCase() === value.toLowerCase() && filamentAlpha(color) === alpha) : null);
  const amazonUrl = amazonListingUrl(swatch?.amazonUrl ?? swatch?.pageUrl);
  const colors = useMemo(() => {
    return palette.colors
      .map(color => {
        const shade = pickOf(color.hex);
        // Include recorded component hues for gradient and multicolor filaments.
        const shades = [shade, ...(color.colors ?? []).map(pickOf)];
        const distance = hueFilter === null ? 0 : Math.min(...shades.filter(sample => sample.s >= 0.12).map(sample => {
          const difference = Math.abs(sample.h - hueFilter % 360);
          return Math.min(difference, 360 - difference);
        }));
        return { color, shade, distance };
      })
      .filter(sample => hueFilter === null || sample.distance <= 30)
      .sort((a, b) => {
        const aNeutral = a.shade.s < 0.12;
        const bNeutral = b.shade.s < 0.12;
        return a.distance - b.distance
          || Number(bNeutral) - Number(aNeutral)
          || (aNeutral && bNeutral ? b.shade.v - a.shade.v : a.shade.h - b.shade.h)
          || colorDisplayName(a.color.name).localeCompare(colorDisplayName(b.color.name));
      })
      .map(({ color }) => color);
  }, [palette, hueFilter]);
  const selectedVisible = colors.some(color => color.id === swatch?.id);

  useEffect(() => { gridRef.current?.scrollTo(0, 0); }, [material, colorFilter, hueFilter]);

  function choose(color: FilamentColor) {
    onChange(color.hex, filamentAlpha(color), color);
  }

  function navigate(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? colors.length - 1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % colors.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + colors.length - 1) % colors.length
      : null;
    if (next === null) return;
    event.preventDefault();
    choose(colors[next]!);
    gridRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <div data-color-picker data-color-chart className="mx-auto w-full max-w-[560px]">
      <p id={`${id}-filters-help`} className="m-0 mb-[6px] text-[11px] leading-tight text-ink-3">Drag or swipe to browse finishes</p>
      <div ref={filtersRef} role="group" aria-label="Filament filters" aria-describedby={`${id}-filters-help`}
        onDragStart={event => event.preventDefault()}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          stopFilterMomentum();
          filterDragged.current = false;
          filterGesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: event.currentTarget.scrollLeft, dragging: false, moves: [{ x: event.clientX, time: event.timeStamp }] };
        }}
        onPointerMove={dragFilters} onPointerUp={endFilterDrag} onPointerCancel={endFilterDrag}
        onLostPointerCapture={event => {
          // Touch presses initially capture the button; transferring that
          // capture to the row must not end the swipe.
          if (event.target === event.currentTarget) endFilterDrag(event);
        }}
        onClickCapture={event => {
          if (!filterDragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className="scrollbar-none mb-[14px] flex w-full touch-pan-y select-none flex-nowrap gap-[8px] overflow-x-auto overscroll-x-contain p-[4px] cursor-grab">
        {finishPreviews.map(({ type, color }, index) => (
          <button key={type} type="button" data-color-type={type} aria-pressed={colorFilter === type}
            onClick={() => setColorFilter(type)} onKeyDown={event => navigateFilters(event, index)}
            className={`flex min-h-[108px] w-[116px] shrink-0 cursor-[inherit] flex-col items-center justify-center gap-[8px] whitespace-nowrap rounded-card border-[2px] px-[8px] py-[10px] font-display text-[12px] leading-tight ${colorFilter === type ? "border-ink bg-ink text-cream shadow-soft" : "border-ink/20 bg-cream text-ink-2 hover:border-ink"}`}>
            {color ? <FilamentPhoto color={color} bare sampleOnly retryKey={photoAttempt} className="h-[64px] w-full [&_img]:max-h-[64px]"
              onUnavailable={() => setFailedPhotos(previous => new Set(previous).add(color.id))} />
            : type === "Scented" || type === "Glow" ? (
              <svg aria-hidden viewBox="0 0 32 20" className="h-[64px] w-[88px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {type === "Scented" ? <path d="M9 18c-6-5 6-7 0-12M16 18c-6-5 6-7 0-12M23 18c-6-5 6-7 0-12" />
                  : <path d="m16 4 2 4 4 .6-3 3 .7 4.4L16 14l-3.7 2 .7-4.4-3-3 4-.6 2-4ZM16 0v1M16 19v1M5 10H3M29 10h-2M6 2l2 2M24 16l2 2M6 18l2-2M24 4l2-2" />}
              </svg>
            ) : <span aria-hidden className="h-[64px] w-full rounded-[6px] border border-white/40" style={{ background: filamentColorStyle({ name: "Rainbow", type: "PLA", hex: type === "Marble" ? "#e6e3dc" : "#2787c9", colorType: type }) }} />}
            {type === "Translucent" ? "Clear" : type}
          </button>
        ))}
      </div>
      <div data-rainbow-filter className="mb-[16px] rounded-card border-[2px] border-ink/20 bg-cream-2 px-[12px] py-[10px]">
        <div className="flex min-h-[44px] items-center justify-between gap-[8px]">
          <label htmlFor={`${id}-hue`} className="font-display text-[13px] text-ink">Filter by color</label>
          {hueFilter !== null && <button type="button" onClick={() => setHueFilter(null)} className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-[11px] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk">All colors</button>}
        </div>
        <div className="flex min-h-[44px] items-center">
          <input id={`${id}-hue`} type="range" min={0} max={360} step={1} value={hue}
            aria-describedby={`${id}-hue-help`} aria-valuetext={hueFilter === null ? "All colors; move to filter" : `${hueName} shades`}
            onPointerDown={() => setHueFilter(current => current ?? hue)}
            onKeyDown={event => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) setHueFilter(current => current ?? hue);
            }}
            onChange={event => setHueFilter(Number(event.target.value))}
            className={`${SLIDER} min-w-0 touch-none`}
            style={{ background: "linear-gradient(to right, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)" }} />
        </div>
        <div className="flex items-center gap-[8px]">
          {hueFilter !== null && <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-[2px] border-ink" style={{ background: hslHex(hue % 360, 100, 50) }} />}
          <output htmlFor={`${id}-hue`} className="font-display text-[12px] text-ink">{hueFilter === null ? "All colors" : `${hueName} shades`}</output>
        </div>
        <p id={`${id}-hue-help`} className="m-0 mt-[6px] text-[11px] leading-[1.4] text-ink-2">Slide along the rainbow to show matching shades, then tap a sample to choose it.</p>
      </div>
      {failedPhotos.size > 0 && <SamplePhotoRetry onRetry={() => { setFailedPhotos(new Set()); setPhotoAttempt(attempt => attempt + 1); }} />}
      <div data-filament-selection className="relative mb-[16px] flex min-h-[52px] flex-col items-center gap-[6px] text-center">
        {personalPalette && <div className="absolute right-0 top-0">
          <SavePaletteColor color={swatch ? { name: filamentColorName(swatch), hex: swatch.hex, alpha: filamentAlpha(swatch) } : null} palette={personalPalette} />
        </div>}
        {swatch && <div className="flex min-h-[52px] w-full items-center justify-center">
          <FilamentPhoto key={swatch.id} color={swatch} bare sampleOnly retryKey={photoAttempt} onUnavailable={() => setFailedPhotos(previous => new Set(previous).add(swatch.id))} className={`w-[180px] flex-none ${personalPalette ? "max-w-[calc(100%-112px)]" : ""}`} />
        </div>}
        <div className={`min-w-0 ${!swatch && personalPalette ? "px-[50px]" : ""}`}>
          <p aria-live="polite" aria-atomic="true" className="m-0 break-words font-display text-[18px] leading-tight text-ink">
            {swatch ? colorTitleCase(swatch.name) : "Choose a filament color"}
          </p>
          {!swatch && <p className="m-0 mt-[4px] text-[12px] leading-tight text-ink-2">Browse the filament colors, then tap a color.</p>}
          {swatch && <div className="mt-[5px] flex items-center justify-center gap-[6px]"><BrandLogo brand={matchingFilamentBrand(swatch.maker, filamentConfig.brands) ?? { name: swatch.maker }} className="h-[24px] w-[48px]" /><p className="m-0 min-w-0 break-words text-[11px] leading-tight text-ink-2"><span className="sr-only">{swatch.maker} · </span>{swatch.product}</p></div>}
          {amazonUrl && <FilamentPurchase url={amazonUrl} options={swatch?.purchaseOptions} viewOnly className="mt-[6px] text-[11px] text-ink-2" />}
        </div>
      </div>
      <div className="my-[10px] flex items-baseline justify-between gap-[8px]">
        <span className="font-display text-[11px] uppercase tracking-[0.08em] text-ink-2">{hueFilter !== null ? `${hueName} shades` : "Color chart"}</span>
        <span role="status" className="text-[11px] text-ink-3">{colors.length} {colors.length === 1 ? "color" : "colors"}</span>
      </div>
      {colors.length > 0 ? (
        <div ref={gridRef} role="radiogroup" aria-label={`${filterLabel} filament colors`} aria-describedby={`${id}-chart-help`}
          className="grid max-h-[380px] grid-cols-1 content-start gap-y-[20px] overflow-y-auto overscroll-contain p-[12px]">
          {colors.map((color, index) => {
            const active = color.id === swatch?.id;
            return (
              <button key={color.id} type="button" role="radio" data-filament-color={color.id}
                aria-label={`${colorTitleCase(color.name)} by ${color.maker}, ${color.product}`} aria-checked={active}
                tabIndex={active || (!selectedVisible && index === 0) ? 0 : -1}
                onClick={() => choose(color)} onKeyDown={event => navigate(event, index)}
                className="group relative flex min-w-0 cursor-pointer flex-col items-center border-0 bg-transparent p-0 text-center focus-visible:outline-none">
                <FilamentPhoto color={color} bare sampleOnly retryKey={photoAttempt} onUnavailable={() => setFailedPhotos(previous => new Set(previous).add(color.id))} className="w-full" />
                {active && <span aria-hidden className="absolute right-0 top-0 grid h-[20px] w-[20px] place-items-center rounded-full border-[2px] border-ink bg-sun text-[11px] font-bold text-ink">✓</span>}
                <span className={`mt-[6px] break-words font-display text-[12px] leading-tight group-focus-visible:underline group-focus-visible:decoration-2 group-focus-visible:underline-offset-4 ${active ? "text-cherry-dk" : "text-ink"}`}>{colorTitleCase(color.name)}</span>
                <span className="mt-[3px] block break-words text-[10px] leading-tight text-ink-2">{color.maker} · {color.product}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 py-[24px] text-center text-[13px] leading-[1.45] text-ink-2">
          {hueFilter !== null
            ? `No ${hueName.toLowerCase()} shades match this material and finish. Move the rainbow slider or show all colors.`
            : `No swatched, Amazon-listed ${material ? `${material} ` : ""}${filterLabel.toLowerCase()} colors from the available brands yet. Choose another filter or a shelf color.`}
        </p>
      )}
      <p id={`${id}-chart-help`} className="m-0 mt-[10px] text-[11px] leading-[1.4] text-ink-3">Lighting and screen colors can vary; check the listing before choosing.</p>
    </div>
  );
}
