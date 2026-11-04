"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  ANY_COLOR,
  AUTO_MATERIAL,
  NEAR_ENOUGH,
  WHATEVER_STYLE,
  colourDistance,
  labOf,
  type CatalogColorChoice,
  type CatalogMaterialChoice,
  type SwatchChoice,
} from "@/lib/catalog";
// The same numbers the server enforces. `models.ts` cannot be imported here —
// it would pull `fflate` and the mesh parser into the browser bundle — which
// is why these three used to be copied into this file by hand.
import {
  ACCEPTED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_FILES_PER_ORDER,
  MAX_LINKS_PER_ORDER,
  MAX_UPLOAD_BYTES,
  VIDEO_EXTENSIONS,
  extensionOf,
  formatBytes,
  kindOf,
  type FileKind,
} from "@/lib/upload-limits";
import { parseLink } from "@/lib/links";
import { ARTWORK } from "@/lib/artwork-assets";

/** What the file picker offers: every model, photo and video type. */
const PICKER_ACCEPT = [...ACCEPTED_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(",");

const KIND_BADGE: Record<FileKind, { label: string; className: string }> = {
  model: { label: "3D", className: "bg-aqua text-ink" },
  image: { label: "Photo", className: "bg-sun text-ink" },
  video: { label: "Video", className: "bg-ink text-cream" },
};

import { SOURCE_LABEL, identifySource, type ImportSource } from "@/lib/import-source";
import { Button, Label, Notice } from "@/components/ui";
import { MaterialFacts } from "@/components/material-chart";
import { ColorSwatch } from "@/components/color-swatch";
import { InkCube } from "@/components/ink-cube";
import { NavIcon } from "@/components/nav-icons";

import type { FilamentColor } from "@/lib/filament-palette-data";
import { colorDisplayName, colorTitleCase, filamentColorName, filamentColorStyle, filamentColorType } from "@/lib/filament-color-types";
import { recordedSwatchChoice } from "@/lib/filament-choice";
import { filamentColorFits } from "@/lib/filament-palette-data";
import { DEFAULT_FILAMENT_SETTINGS, type FilamentSettings } from "@/lib/filament-brands";
import { MIN_DONATION_LABEL } from "@/lib/donation-policy";
import { usePersonalPalette } from "./personal-palette";
import type { SavedPaletteColor } from "@/lib/palette-types";

// StepCard mounts its contents on first open. Keep the multi-megabyte source
// palette out of the initial New Order navigation and load it with Color.
const ColorMenu = lazy(() => import("./spool-finder").then(module => ({ default: module.ColorMenu })));
const OtherColors = lazy(() => import("./spool-finder").then(module => ({ default: module.OtherColors })));

/**
 * The shelf colour of a material that looks most like `hex`, or null when
 * none is near enough to pass for it. "Whatever's loaded" is no colour at all.
 */
function closestShelfColor(item: CatalogMaterialChoice, hex: string): CatalogColorChoice | null {
  const target = labOf(hex);
  let best: { color: CatalogColorChoice; d: number } | null = null;
  for (const color of item.colors) {
    if (color.mode === "whatever" || !/^#[0-9a-f]{6}$/i.test(color.hex)) continue;
    const d = colourDistance(labOf(color.hex), target);
    if (d <= NEAR_ENOUGH && (!best || d < best.d)) best = { color, d };
  }
  return best?.color ?? null;
}

/**
 * An old ticket being printed again. When this is given the form has no
 * dropzone — the file is the old ticket's, copied on the server — and opens
 * with that ticket's wish filled in, ready to be changed. Print settings are
 * not asked for any more; an old ticket's ride along unchanged on the server.
 */
export type Again = {
  id: number;
  ref: string;
  /** Null when the old ticket was asked for in words, with no model. */
  filename: string | null;
  fileSize: number | null;
  title: string;
  material: string;
  colorName: string;
  colorHex?: string;
  /** The spool the old ticket asked the owner to buy, or null for a shelf colour. */
  swatch: SwatchChoice | null;
  /** Resolved on the server so a repeat needs no browser-wide palette lookup. */
  filament?: FilamentColor | null;
  quantity: number;
  note: string;
};

/** The most one request may ask for; the server says the same. */
const MAX_QUANTITY = 24;

/** A colour picked at most this solid looks for see-through spools first. */
const SEE_THROUGH = 0.8;

/** The round − and + either side of the amount. */
const STEP_BUTTON =
  "grid h-[44px] w-[44px] shrink-0 cursor-pointer place-items-center rounded-full border-2 border-ink/15 bg-porcelain text-ink shadow-[0_3px_8px_rgba(0,0,0,0.28)] transition-colors hover:border-ink hover:bg-sun-wash disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/15 disabled:hover:bg-porcelain";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "error"; message: string };

/** What `POST /api/import/files` answers with — a model and its printable files. */
type Listing = {
  source: ImportSource;
  model: { id: string; name: string; url: string; author: string | null; license: string | null };
  files: { id: string; name: string; size: number; tooLarge: boolean }[];
  otherFiles: number;
};

/**
 * The link step, when this instance imports.
 *
 *   idle     nothing asked yet
 *   looking  the server is asking the site what the model holds
 *   listed   it answered; `fileId` is the file picked, if one has been
 */
type Linked =
  | { kind: "idle" }
  | { kind: "looking"; url: string }
  | { kind: "listed"; url: string; listing: Listing; fileId: string | null };

/** One model from `POST /api/import/search`. Picking it looks up its `url`. */
type SearchHit = {
  id: string;
  name: string;
  url: string;
  author: string | null;
  thumb: string | null;
  likes: number | null;
  downloads: number | null;
};

/** The results showing, and where the next page starts. */
type Found = { query: string; total: number; hits: SearchHit[]; next: number };

/** The server's own limit on how deep the pages go. */
const MAX_SEARCH_OFFSET = 240;

/** Something that looks like a link rather than words to search for. */
const LINKISH = /^\s*(?:https?:\/\/|www\.)/i;

const compactCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * A little "i" that shows a note on hover, focus or tap. Tap matters because a
 * phone has no hover, and iOS does not focus a button it taps, so a click opens
 * it too; a tap anywhere else, Escape, or leaving with the mouse closes it. The
 * note stays in the DOM while closed so `id` can describe something else.
 */
function InfoTip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span
      ref={wrap}
      className="relative inline-block"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-ink bg-porcelain font-display text-[15px] leading-none text-ink hover:bg-sun"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute right-0 top-full z-10 mt-[8px] w-max max-w-[240px] rounded-card border-[3px] border-ink bg-ink px-[11px] py-[8px] text-left font-mono text-[12px] uppercase tracking-[0.04em] text-cream"
      >
        {children}
      </span>
    </span>
  );
}

/**
 * A single-choice dropdown: the chosen option and a chevron, opening onto the
 * other options stacked beneath it. A listbox rather than a native `<select>`
 * so the open list wears the same chunky outline as the rest of the form.
 * Arrow keys, Home/End, Enter/Space and Escape work as they do on a select.
 * A null `value` is nothing chosen yet; the trigger shows `placeholder` instead.
 */
function Dropdown({
  id,
  options,
  value,
  onChange,
  describedBy,
  placeholder,
}: {
  id: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
  describedBy?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosenIndex = () => (value === null ? 0 : Math.max(0, options.indexOf(value)));
  const [active, setActive] = useState(chosenIndex);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = `${id}-list`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function show() {
    setActive(chosenIndex());
    setOpen(true);
  }

  function pick(index: number) {
    const option = options[index];
    if (option !== undefined) onChange(option);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    const move = (next: number) => {
      e.preventDefault();
      if (!open) show();
      else setActive(Math.min(last, Math.max(0, next)));
    };
    switch (e.key) {
      case "ArrowDown": return move(active + 1);
      case "ArrowUp": return move(active - 1);
      case "Home": return move(0);
      case "End": return move(last);
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? pick(active) : show();
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
    }
  }

  return (
    <div ref={wrap} className="relative font-display">
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex w-full cursor-pointer items-center justify-between gap-[10px] border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-left text-[16px] font-bold text-ink hover:bg-sun ${
          open ? "rounded-t-card" : "rounded-card"
        }`}
      >
        <span className={`truncate ${value === null ? "font-normal text-ink-3" : ""}`}>{value ?? placeholder}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 12"
          className={`h-[10px] w-[18px] shrink-0 transition-transform ${open ? "" : "rotate-180"}`}
        >
          <path d="M2 10 10 2l8 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul
        id={listId}
        role="listbox"
        aria-labelledby={id}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 m-0 max-h-[280px] list-none overflow-y-auto rounded-b-card border-[3px] border-t-0 border-ink bg-cream-2 p-0 shadow-stamp"
      >
        {options.map((option, index) => {
          const selected = option === value;
          return (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={selected}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(index)}
              className={`cursor-pointer border-t-2 border-ink/25 px-[15px] py-[11px] text-[16px] first:border-t-0 ${
                index === active ? "bg-sun text-ink" : "text-ink-2"
              } ${selected ? "font-bold" : ""}`}
            >
              {option}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The three setup cards; sending is a separate action below the board. */
type StepNo = 1 | 2 | 3;

/** Pastel RGB fills appear only on the pressed or open section. */
const STEP_ACCENT: Record<StepNo, string> = {
  1: "bg-[#f5b4b0]",
  2: "bg-[#afe0c6]",
  3: "bg-[#b7e2f0]",
};

/** Clear of the sticky header; the same as the cards' `scroll-mt`. */
const BELOW_HEADER = 112;

/**
 * One section of the shared order container. Open, it shows the fields being filled in;
 * folded, it is a bar saying what was settled there, or inviting input.
 * Tapping it opens it again. Fields mount on their first opening and then
 * stay mounted while folded, only hidden, so moving between cards never loses
 * a file, a typed word or the spool library's search.
 *
 * Tapping the open card's header folds it too, so a tap opens and closes a
 * card, and opening one folds whichever was open. All three stay stacked
 * in order, at every screen size.
 */
function StepCard({
  n,
  title,
  open,
  done,
  summary,
  preview,
  disabled,
  onOpen,
  onClose,
  cardRef,
  children,
}: {
  n: StepNo;
  title: string;
  open: boolean;
  /** A usable choice is set for this card. */
  done: boolean;
  /** What the folded card says about this step. */
  summary: ReactNode;
  /** The icon or selected color shown in both open and folded headers. */
  preview?: ReactNode;
  disabled: boolean;
  onOpen: () => void;
  onClose: () => void;
  cardRef: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const headingId = `step-${n}-heading`;
  const [pressed, setPressed] = useState(false);
  const [visited, setVisited] = useState(open);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  const colored = open || (pressed && !disabled);
  const cardPreview = preview ?? (
    n === 3 ? (
      <ColorSwatch mode="whatever" style={WHATEVER_STYLE} mark={false} className="h-full w-full rounded-card border-[3px] border-ink" />
    ) : (
      <span className="grid h-full w-full place-items-center rounded-card border-[3px] border-ink bg-cream-2 text-ink">
        <NavIcon name={n === 1 ? "cube" : "spool"} size={32} edge={false} />
      </span>
    )
  );
  const cardIcon = (
    <span aria-hidden className={`flex-none ${done ? "h-[44px] w-[44px]" : "h-[28px] w-[28px]"}`}>
      {done ? cardPreview : (
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 4v16M4 12h16" />
        </svg>
      )}
    </span>
  );
  const checkmark = done && (
    <span aria-hidden className="flex h-[32px] w-[32px] flex-none items-center justify-center text-ink">
      <NavIcon name="checkmark" size={40} />
    </span>
  );
  // Equal header widths keep the completed preview icons in one column.
  const headingContent = (
    <span data-step-content className={`min-w-0 items-center gap-[8px] ${done ? "grid w-[160px] max-w-full justify-self-center grid-cols-[44px_minmax(0,1fr)]" : "grid w-[160px] max-w-full translate-x-[8px] grid-cols-[28px_minmax(0,1fr)]"}`}>
      {cardIcon}
      <span className={`min-w-0 ${done ? "text-center" : "text-left"}`}>
        <span id={headingId} className={`block font-display text-[17px] leading-tight ${done ? "" : "whitespace-nowrap"}`}>
          {done ? title : `Add ${title}`}
          {done && <span className="sr-only"> · Has input</span>}
        </span>
        {done && (
          <span className="mt-[3px] block truncate font-sans text-[13px] font-normal leading-[1.4] text-ink">
            {summary}
          </span>
        )}
      </span>
    </span>
  );
  return (
    <section
      ref={cardRef}
      aria-labelledby={headingId}
      data-open={open ? true : undefined}
      className={`order-section relative -mt-[3px] min-w-0 scroll-mt-[112px] border-[3px] border-ink first:mt-0 ${open ? "z-10" : "z-0"} ${n === 1 ? "rounded-t-panel" : n === 3 ? "rounded-b-panel" : ""} ${colored ? "shadow-stamp" : "border-dashed"}`}
    >
      <div
        className={`h-full ${open ? "bg-porcelain" : "bg-transparent"} ${n === 1 ? "rounded-t-[13px]" : n === 3 ? "rounded-b-[13px]" : ""}`}
      >
        <h2 className={`m-0 ${open ? "border-b-[3px] border-ink" : ""}`}>
          {/* Keep the same button and contents mounted when toggled, so the
              centered header stays in place as the fields open below it. */}
          <button
            type="button"
            data-step-toggle
            data-step-heading={open ? "" : undefined}
            data-step-open={!open ? "" : undefined}
            data-pressed={pressed && !disabled ? true : undefined}
            onClick={open ? onClose : onOpen}
            onPointerDown={(event) => {
              if (event.isPrimary && event.button === 0) setPressed(true);
            }}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setPressed(true);
            }}
            onKeyUp={() => setPressed(false)}
            onBlur={() => setPressed(false)}
            disabled={disabled}
            aria-expanded={open}
            className={`group relative flex min-h-[66px] w-full touch-manipulation cursor-pointer items-stretch border-0 p-0 text-ink transition-[filter,background-color] duration-[160ms] hover:brightness-[0.96] active:brightness-[0.92] data-[pressed=true]:brightness-[0.92] disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:brightness-100 ${n === 1 ? "rounded-t-[13px]" : n === 3 && !open ? "rounded-b-[13px]" : ""} ${colored ? STEP_ACCENT[n] : "bg-transparent"}`}
          >
            {done && colored && <span
              aria-hidden
              className={`layers absolute inset-y-0 left-0 w-[12px] border-r-[3px] border-ink ${n === 1 ? "rounded-tl-[13px]" : n === 3 && !open ? "rounded-bl-[13px]" : ""} ${STEP_ACCENT[n]}`}
            />}
            <span className={`min-w-0 flex-1 items-center justify-center gap-[8px] px-[13.2px] py-[11px] ${done ? "grid grid-cols-[32px_minmax(0,1fr)_32px]" : "flex"}`}>
              {done && <span aria-hidden />}
              {headingContent}
              {done && (
                <span className="flex flex-none transition-transform duration-150 ease-out group-hover:scale-125 group-disabled:scale-100">
                  {checkmark}
                  <span className="sr-only">Change</span>
                </span>
              )}
            </span>
          </button>
        </h2>

        <div hidden={!open}>
          <div className="px-[17.6px] py-[22px] sm:px-[26.4px]">{(open || visited) && children}</div>
        </div>
      </div>
    </section>
  );
}

export function UploadForm({
  owner,
  catalog,
  again,
  importSources = [],
  savedColors = [],
  filamentConfig = DEFAULT_FILAMENT_SETTINGS,
  storeAccess,
}: {
  owner: string;
  catalog: CatalogMaterialChoice[];
  again?: Again;
  /** The sites this instance imports from. Empty hides the link step entirely. */
  importSources?: ImportSource[];
  savedColors?: SavedPaletteColor[];
  filamentConfig?: FilamentSettings;
  storeAccess: boolean;
}) {
  const router = useRouter();
  const personalPalette = usePersonalPalette(savedColors);
  const inputRef = useRef<HTMLInputElement>(null);
  // A fresh request leaves the material blank until its card is clicked,
  // then starts on Auto with the colour chosen independently. Printing again
  // starts from what was asked for last time — where that is still on the shelf.
  // A material or colour the owner has since retired falls back to
  // the usual default, and `gone` says which, because a choice that quietly
  // changed under someone is one they will not notice until the print arrives.
  // An order left to the owner is left to them again.
  const againAuto = again?.material === AUTO_MATERIAL;
  const wanted = catalog.find((item) => item.name === again?.material);
  const initialMaterial = again && !againAuto
    ? wanted ?? catalog.find((item) => item.name === "PETG") ?? catalog[0]!
    : null;
  const wantedColor = wanted?.colors.find((item) => item.name === again?.colorName);
  // A spool to buy carries across while its material is still offered; the
  // server checks it against the library when the request is sent.
  const initialSwatch = storeAccess && wanted ? again?.swatch ?? null : null;
  const initialFilament = storeAccess && (initialSwatch || againAuto) ? again?.filament ?? null : null;
  const initialColor = initialMaterial && !initialSwatch
    ? wantedColor ?? initialMaterial.colors.find((item) => item.name === "Slate") ?? initialMaterial.colors[0]!
    : null;
  const gone = again && !againAuto
    ? [
        !wanted
          ? again.material
          : !wantedColor && !initialSwatch && !again.swatch
            ? `${again.material} in ${colorDisplayName(again.colorName)}`
            : null,
      ].filter((x): x is string => x !== null)
    : [];
  const storeSelectionRemoved = Boolean(!storeAccess && again?.swatch);

  // Everything picked for the order, in the order it was added. The first 3D
  // file is the main model — the one the slicer link and a reprint use — and
  // the rest ride along as attachments.
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [link, setLink] = useState("");
  const [linked, setLinked] = useState<Linked>({ kind: "idle" });
  // Models found by searching the import site, when the box held words.
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  // Reference links sent with the order — not the import link above.
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  // Whether the box for a reference link is showing.
  const [addingLink, setAddingLink] = useState(false);

  const primary = files.find((f) => kindOf(f.name) === "model") ?? null;
  const extras = files.filter((f) => f !== primary);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const [title, setTitle] = useState(again?.title ?? "");
  const [material, setMaterial] = useState<string | null>(initialMaterial?.name ?? (againAuto ? AUTO_MATERIAL : null));
  // Switching Auto off restores the last manual material, or starts on PETG.
  const manualMaterial = useRef(initialMaterial?.name ?? catalog.find((item) => item.name === "PETG")?.name ?? catalog[0]?.name);
  // A color checkmark records the user's choice; repeat orders already have one.
  const [colorChosen, setColorChosen] = useState(Boolean(again));
  // Whether the material's facts are open below its dropdown.
  const [aboutMaterial, setAboutMaterial] = useState(false);
  const [quantity, setQuantity] = useState<number>(again?.quantity ?? 1);
  // What is in the amount box while it is being typed in, or null
  // when it simply shows `quantity`. Kept apart from the number because a box
  // being edited passes through states that are not quantities — empty, most
  // obviously. Coercing each keystroke turned an emptied box straight back
  // into "1", so clearing it to type 3 produced 13.
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  // No slider any more: a new request takes the default, a repeat keeps its own.
  const [color, setColor] = useState<string | null>(initialColor?.name ?? null);
  // A spool the owner can get instead of one on the shelf. One or the other:
  // picking either clears the other.
  const [toBuy, setToBuy] = useState<SwatchChoice | null>(initialSwatch);
  // The colour picked from the rainbow at the top, before any material: it picks
  // the nearest shelf colour, or searches the library when the shelf has none.
  // `nearAlpha` is how solid it is; a see-through one looks for clear spools.
  // Printing again lights the circle of the colour asked for last time.
  const [near, setNear] = useState<string | null>(
    initialFilament?.hex ?? initialSwatch?.hex ?? (againAuto ? again?.colorHex ?? null : initialColor && initialColor.mode !== "whatever" && /^#[0-9a-f]{6}$/i.test(initialColor.hex) ? initialColor.hex : null),
  );
  const [nearAlpha, setNearAlpha] = useState(initialFilament?.translucent ? 0.5 : 1);
  const [nearName, setNearName] = useState(again?.colorName ?? "");
  const [nearFilament, setNearFilament] = useState<FilamentColor | null>(initialFilament);
  // A Library choice keeps its identity even when another finish shares its hex.
  const [nearShelf, setNearShelf] = useState<CatalogColorChoice | null>(() => initialColor && initialColor.mode !== "whatever"
    ? initialColor : againAuto && !initialFilament ? catalog.flatMap(item => item.colors).find(candidate =>
      candidate.name === again?.colorName && candidate.hex.toLowerCase() === again?.colorHex?.toLowerCase()) ?? null : null);
  const [note, setNote] = useState(again?.note ?? "");
  const [addingNote, setAddingNote] = useState(Boolean(again?.note));

  // New orders start folded; repeats open their existing model.
  const [step, setStep] = useState<StepNo | null>(again ? 1 : null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  // Off until a card is opened, so the page does not grab focus as it loads.
  const moved = useRef(false);
  // The card last folded by its own button, so focus can land on it folded.
  const folded = useRef<StepNo | null>(null);

  // The card just opened gets focus and, when its top is out of sight, the
  // window: on a phone the one before folds into a bar above it.
  useEffect(() => {
    if (!moved.current) return;
    if (step === null) {
      // Focus stays where it was: on the card just folded, now a button.
      if (folded.current) {
        cards.current[folded.current - 1]?.querySelector<HTMLElement>("[data-step-open]")?.focus();
      }
      return;
    }
    const card = cards.current[step - 1];
    if (!card) return;
    card.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
    const top = card.getBoundingClientRect().top;
    if (top < BELOW_HEADER - 8 || top > window.innerHeight * 0.6) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  }, [step]);

  /**
   * Client-side checks are for fast feedback only — the server re-runs all of
   * them against the actual bytes and is the one that decides.
   */
  function accept(picked: File[]) {
    setPhase({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;

    const next = [...files];
    const refused: string[] = [];
    let total = totalBytes;
    let addedModel = false;
    for (const f of picked) {
      // The same file dropped twice is one file.
      if (next.some((n) => n.name === f.name && n.size === f.size)) continue;
      const kind = kindOf(f.name);
      if (!kind) {
        refused.push(`${f.name} is not a 3D model, photo or video this takes.`);
      } else if (next.length >= MAX_FILES_PER_ORDER) {
        refused.push(`Up to ${MAX_FILES_PER_ORDER} files per order — ${f.name} was left out.`);
      } else if (total + f.size > MAX_UPLOAD_BYTES) {
        refused.push(`${f.name} would take the order past ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      } else {
        next.push(f);
        total += f.size;
        if (kind === "model") addedModel = true;
      }
    }
    setFiles(next);
    // One main model per ticket: a model from disk replaces one picked from a link.
    if (addedModel) setLinked({ kind: "idle" });
    if (refused.length > 0) setPhase({ kind: "error", message: refused.join(" ") });
  }

  function removeFile(target: File) {
    setPhase({ kind: "idle" });
    setFiles((current) => current.filter((f) => f !== target));
  }

  /** Puts `raw` on the order; false, with the reason shown, when it can't go. */
  function addLink(raw = linkDraft): boolean {
    const fail = (message: string) => (setLinkError(message), false);
    const parsed = parseLink(raw);
    if (!parsed.ok) return fail(parsed.error);
    if (links.includes(parsed.href)) return fail("That link is already on the order.");
    if (links.length >= MAX_LINKS_PER_ORDER) return fail(`Up to ${MAX_LINKS_PER_ORDER} links per order.`);
    setLinks([...links, parsed.href]);
    setLinkDraft("");
    setLinkError(null);
    setAddingLink(false);
    return true;
  }

  /**
   * One tap: the link already copied, read straight off the clipboard. Where
   * the browser won't hand it over (refused, or a plain-http page, where there
   * is no clipboard API) or what was copied isn't a link, the box opens
   * instead, to paste into by hand.
   */
  async function pasteLink() {
    let copied = "";
    try {
      copied = await navigator.clipboard.readText();
    } catch {
      /* no clipboard to read: the box below is the way in */
    }
    if (copied.trim() && addLink(copied)) return;
    if (!copied.trim()) setLinkError("Couldn't read a copied link. Paste it here instead.");
    setAddingLink(true);
  }

  const sourceNames = importSources.map((s) => SOURCE_LABEL[s]).join(" or ");
  const picked =
    linked.kind === "listed"
      ? linked.listing.files.find((f) => f.id === linked.fileId) ?? null
      : null;

  // A name is the one thing a request needs; a model, photos, links and a
  // note are welcome but none of them is required.
  const named = !!title.trim();

  function stepQuantity(by: number) {
    setQuantityDraft(null);
    setQuantity((n) => Math.min(MAX_QUANTITY, Math.max(1, n + by)));
    navigator.vibrate?.(12);
  }

  /**
   * Ask the server what the link holds. The browser never talks to the model
   * site itself — `connect-src 'self'` would refuse it, and the server is the
   * one that has to fetch the file anyway.
   */
  async function lookUp(from: string = link) {
    const url = from.trim();
    if (!url || linked.kind === "looking") return;
    // The same parse the server makes, for an answer before the round trip.
    if (!identifySource(url, importSources)) {
      setLinked({ kind: "idle" });
      return setPhase({ kind: "error", message: `That is not a link to a model on ${sourceNames}.` });
    }
    setPhase({ kind: "idle" });
    setLinked({ kind: "looking", url });
    try {
      const res = await fetch("/api/import/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinked({ kind: "idle" });
        return setPhase({ kind: "error", message: body.error ?? "That did not go through. Try again." });
      }
      const listing = body as Listing;
      // A model with exactly one printable file needs no choosing.
      const only = listing.files.length === 1 && !listing.files[0]!.tooLarge ? listing.files[0]!.id : null;
      // The imported file becomes the model; any picked from disk give way.
      setFiles((current) => current.filter((f) => kindOf(f.name) !== "model"));
      if (inputRef.current) inputRef.current.value = "";
      setLinked({ kind: "listed", url, listing, fileId: only });
      // A model's files are called things like `body_v2_final.stl`; the model
      // itself has a name a person chose. Offered, never forced: only into an
      // empty box, and it stays editable.
      setTitle((current) => current || listing.model.name.slice(0, 120));
    } catch {
      setLinked({ kind: "idle" });
      setPhase({ kind: "error", message: "The connection dropped. Try again." });
    }
  }

  /**
   * Find models by name, for someone with no link to paste. Like the lookup,
   * the server asks the site; a result is only a way to a link, which then
   * goes through `lookUp` exactly as a pasted one would. `more` adds the next
   * page to the results already showing.
   */
  async function search(more = false) {
    const query = more && found ? found.query : link.replace(/\s+/g, " ").trim();
    if (searching || linked.kind === "looking") return;
    if (query.length < 2) {
      return setPhase({ kind: "error", message: "Type at least two letters to search for." });
    }
    setPhase({ kind: "idle" });
    // A new search is a new look round; a model picked from the last one goes.
    if (!more) setLinked({ kind: "idle" });
    setSearching(true);
    try {
      const res = await fetch("/api/import/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, offset: more && found ? found.next : 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!more) setFound(null);
        return setPhase({ kind: "error", message: body.error ?? "That search did not go through. Try again." });
      }
      const page = body as { query: string; total: number; offset: number; hits: SearchHit[] };
      const next = page.offset + page.hits.length;
      setFound((current) =>
        more && current
          ? {
              ...current,
              total: page.total,
              next,
              // The site's order can shift between pages; a model shows once.
              hits: [...current.hits, ...page.hits.filter((h) => !current.hits.some((c) => c.id === h.id))],
            }
          : { query: page.query, total: page.total, hits: page.hits, next },
      );
    } catch {
      setPhase({ kind: "error", message: "The connection dropped. Try again." });
    } finally {
      setSearching(false);
    }
  }

  /** The import box: a link is looked up, anything else is searched for. */
  function findModel() {
    if (LINKISH.test(link)) void lookUp();
    else void search();
  }

  /**
   * Importing sends the wish and two ids; the server fetches the bytes. There
   * is nothing leaving this machine to measure, so no percentage — the bar
   * would be a lie.
   */
  async function sendImport(url: string, fileId: string) {
    setPhase({ kind: "uploading", percent: 100 });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url, fileId, title, material, ...wishColor,
          quantity, note, links,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setPhase({ kind: "error", message: body.error ?? "That did not go through. Try again." });
      }
      const id: number | null = body.story?.id ?? null;
      router.push(id === null ? "/me" : `/story/${id}?sent=1`);
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "The connection dropped. Try again." });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    accept(Array.from(e.dataTransfer.files ?? []));
  }

  /**
   * Printing again sends the wish and nothing else — there are no bytes to
   * move, so no progress to watch and no reason for XHR.
   */
  async function sendAgain(source: Again) {
    setPhase({ kind: "uploading", percent: 100 });
    try {
      const res = await fetch(`/api/stories/${source.id}/requeue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // No printSettings: left out, the old ticket's carry across as they were.
        // Both colour fields, always: naming either replaces the old ticket's choice.
        body: JSON.stringify({
          title, material, ...wishColor, quantity, note,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setPhase({ kind: "error", message: body.error ?? "That did not go through. Try again." });
      }
      const id: number | null = body.story?.id ?? null;
      router.push(id === null ? "/me" : `/story/${id}?sent=1`);
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "The connection dropped. Try again." });
    }
  }

  /** Why a card cannot be left behind yet, or null when it is settled. */
  function problemOn(n: StepNo): string | null {
    if (n === 1) {
      if (linked.kind === "listed" && !picked) return "Pick which file to print from that model, or choose another.";
      // An import is fetched by the server from two ids; there is no upload
      // for files from this disk to travel in.
      if (linked.kind === "listed" && files.length > 0) {
        return (
          "Photos and videos can't come along with an imported model yet. Remove them, " +
          "or download the model and drop it here with them."
        );
      }
      if (!named) return "Say what it is — a few words is enough.";
    }
    if (n === 2 && material === null) {
      return "Pick a material first, or turn on Auto.";
    }
    if (n === 3 && material !== null && !auto && color === null && toBuy === null) {
      return storeAccess
        ? `Pick a color from Library, or find a spool ${owner} can get in Store.`
        : `Pick a color from Library. A confirmed donation of ${MIN_DONATION_LABEL} unlocks Store.`;
    }
    return null;
  }

  function goTo(n: StepNo) {
    moved.current = true;
    setPhase({ kind: "idle" });
    setQuantityDraft(null);
    setStep(n);
  }

  /** Fold the open card, leaving all three as compact bars. */
  function foldAll() {
    moved.current = true;
    folded.current = step;
    setPhase({ kind: "idle" });
    setQuantityDraft(null);
    setStep(null);
  }

  /** On to the next card, once this one is settled. */
  function advance() {
    if (step === null || phase.kind === "uploading") return;
    const problem = problemOn(step);
    if (problem) return setPhase({ kind: "error", message: problem });
    if (step === 3) return foldAll();
    goTo((step + 1) as StepNo);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind === "uploading") return;
    // Enter in the quantity box submits without blurring it; show what is
    // actually being sent rather than a half-typed draft.
    setQuantityDraft(null);
    // The standalone send button validates the whole request, whichever
    // setup card is open.
    // Anything still missing reopens the card it belongs on.
    for (const n of [1, 2, 3] as const) {
      const problem = problemOn(n);
      if (problem) {
        goTo(n);
        return setPhase({ kind: "error", message: problem });
      }
    }
    if (again) return void sendAgain(again);
    if (linked.kind === "listed" && picked) return void sendImport(linked.url, picked.id);

    const body = new FormData();
    if (primary) body.set("file", primary);
    for (const extra of extras) body.append("attachments", extra);
    for (const l of links) body.append("links", l);
    body.set("title", title);
    // Never null here: problemOn(2) has just said so.
    body.set("material", material!);
    if (wishColor.swatchId !== null) body.set("swatchId", String(wishColor.swatchId));
    else if (wishColor.colorName) body.set("colorName", wishColor.colorName);
    if (wishColor.colorHex) body.set("colorHex", wishColor.colorHex);
    if (wishColor.filamentColorId) body.set("filamentColorId", wishColor.filamentColorId);
    body.set("quantity", String(quantity));
    body.set("note", note);

    // XHR rather than fetch: it is still the only way to observe upload
    // progress, and a large model over office wifi needs a real bar.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      setPhase({
        kind: "uploading",
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Handoff §3: submitting navigates to the new story's detail view.
        let id: number | null = null;
        try {
          id = JSON.parse(xhr.responseText).id ?? null;
        } catch {
          /* fall back to the board rather than stranding them here */
        }
        router.push(id === null ? "/me" : `/story/${id}?sent=1`);
        router.refresh();
        return;
      }
      let message = "That did not go through. Try again.";
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {
        /* a non-JSON error body is not worth surfacing verbatim */
      }
      setPhase({ kind: "error", message });
    });
    xhr.addEventListener("error", () =>
      setPhase({ kind: "error", message: "The connection dropped mid-upload." }),
    );
    xhr.addEventListener("abort", () => setPhase({ kind: "idle" }));

    setPhase({ kind: "uploading", percent: 0 });
    xhr.send(body);
  }

  const busy = phase.kind === "uploading";
  const selectedMaterial = catalog.find((item) => item.name === material) ?? null;
  const shelfChoices = useMemo(() => selectedMaterial ? selectedMaterial.colors
    : catalog.flatMap(item => item.colors.map(color => ({ ...color, materialName: item.name }))), [catalog, selectedMaterial]);
  const auto = material === AUTO_MATERIAL;

  // Left to the owner, the colour is the one picked up top, not a shelf spool:
  // a shelf colour by name and shade, one of your own, or any colour.
  const shelfMatch = !nearFilament && near !== null && nearAlpha === 1
    ? (nearShelf?.hex.toLowerCase() === near.toLowerCase() ? nearShelf : undefined)
      ?? catalog.flatMap((item) => item.colors).find((c) => c.mode !== "whatever" && c.hex.toLowerCase() === near.toLowerCase())
    : undefined;
  const autoColorName = near === null ? ANY_COLOR : nearFilament ? filamentColorName(nearFilament) : shelfMatch?.name ?? nearName;
  /** The colour half of the wish, as every way of sending it names it. */
  const wishColor = auto
    ? { colorName: autoColorName, colorHex: near, swatchId: null, filamentColorId: nearFilament?.id ?? null }
    : { colorName: color ?? "", colorHex: null, swatchId: toBuy?.id ?? null, filamentColorId: null };

  function chooseMaterial(next: string) {
    if (next === AUTO_MATERIAL) {
      setMaterial(AUTO_MATERIAL);
      setColor(null);
      setToBuy(null);
      return;
    }
    const item = catalog.find((candidate) => candidate.name === next);
    if (!item) return;
    manualMaterial.current = item.name;
    // A spool to buy was one kind of filament; another material starts from its shelf.
    if (item.name !== material) setToBuy(null);
    else if (toBuy) return;
    setMaterial(item.name);
    if (nearFilament) {
      setNearShelf(null);
      // A finish selection must not become a plain shelf color with a similar hex.
      const choice = recordedSwatchChoice(nearFilament);
      if (filamentColorFits(item.name, nearFilament)) {
        const shelf = filamentColorType(nearFilament) === "Solid" ? closestShelfColor(item, nearFilament.hex) : null;
        if (shelf?.mode === "solid") {
          setColor(shelf.name);
          setToBuy(null);
          return;
        }
        setColor(null);
        setToBuy(choice);
        return;
      }
    }
    setNearFilament(null);
    const match = item.colors.find(candidate => candidate.id === nearShelf?.id) ?? shelfColorFor(item, near);
    setColor(match?.name ?? null);
    setNearShelf(near && match?.mode !== "whatever" ? match : null);
    // A circle picked from another material's shelf moves to this one's nearest.
    if (near && match && match.mode !== "whatever" && /^#[0-9a-f]{6}$/i.test(match.hex)
      && catalog.some((m) => m.colors.some((c) => c.hex.toLowerCase() === near.toLowerCase()))) {
      setNear(match.hex);
    }
  }

  /**
   * The shelf colour a material starts on: the one nearest the colour picked
   * up top — none when nothing is near it, so the library opens instead — or,
   * with any colour, its "whatever" spool, else Slate.
   */
  function shelfColorFor(item: CatalogMaterialChoice, hex: string | null) {
    if (hex) return closestShelfColor(item, hex);
    return (
      item.colors.find((candidate) => candidate.mode === "whatever") ??
      item.colors.find((candidate) => candidate.name === "Slate") ??
      item.colors[0]!
    );
  }

  /**
   * A colour from the shelf circles or filament chart; null is any colour. From the
   * circles it is the shelf colour asked for, so it replaces a spool to buy
   * when the shelf has one like it. From the library's own colour filter a
   * spool to buy already picked stays.
   */
  function chooseNear(hex: string | null, alpha = 1, fromCircles = false, filament?: FilamentColor, shelfChoice?: CatalogColorChoice, name?: string) {
    setColorChosen(true);
    setNear(hex);
    setNearAlpha(hex ? alpha : 1);
    setNearName(name ?? hex ?? "");
    setNearFilament(filament ?? null);
    setNearShelf(shelfChoice ?? null);
    if (!selectedMaterial) return;
    if (shelfChoice) {
      setColor(shelfChoice.name);
      setToBuy(null);
      return;
    }
    if (filament) {
      const shelf = filamentColorType(filament) === "Solid" ? closestShelfColor(selectedMaterial, filament.hex) : null;
      if (shelf?.mode === "solid") {
        setColor(shelf.name);
        setToBuy(null);
        return;
      }
      setColor(null);
      setToBuy(recordedSwatchChoice(filament));
      return;
    }
    if (toBuy && !fromCircles) return;
    const shelf = hex ? closestShelfColor(selectedMaterial, hex) : shelfColorFor(selectedMaterial, null);
    if (toBuy) {
      if (!shelf) return;
      setToBuy(null);
    }
    if (hex || fromCircles || color === null) setColor(shelf?.name ?? null);
  }

  /** A spool to buy instead of the shelf colour; null goes back to the shelf. */
  function chooseToBuy(next: SwatchChoice | null) {
    setColorChosen(true);
    setNearShelf(null);
    setToBuy(next);
    if (next) setColor(null);
    else if (color === null && selectedMaterial) {
      // Back to the shelf means a shelf colour, even with nothing near the one picked.
      setColor((shelfColorFor(selectedMaterial, near) ?? shelfColorFor(selectedMaterial, null)!).name);
    }
  }

  const error = phase.kind === "error" && (
    <div className="mt-[17.6px]">
      <Notice tone="warn">{phase.message}</Notice>
    </div>
  );

  // ---- what each folded card says ----
  const fileCount = files.length + (picked ? 1 : 0);
  const modelHasInput = named || fileCount > 0 || links.length > 0 || Boolean(again?.filename);
  const whatSummary =
    [
      title.trim() || primary?.name || picked?.name || again?.filename || (note.trim() ? "Asked for in words" : ""),
      fileCount > 0 ? `${fileCount} ${fileCount === 1 ? "file" : "files"}` : "",
      links.length > 0 ? `${links.length} ${links.length === 1 ? "link" : "links"}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Nothing yet";
  const shelfColor = selectedMaterial?.colors.find((c) => c.name === color) ?? null;
  const materialSummary = material ?? "Not picked yet";
  // Before a material, or left to the owner, the colour is the circle picked.
  const byCircle = auto || selectedMaterial === null;
  const colorSummary = byCircle ? colorTitleCase(autoColorName)
    : toBuy ? `${colorTitleCase(toBuy.name)}, to get`
    : color ? colorTitleCase(color) : "No color yet";
  // Match the picker, including catalogue gradients and flakes. A custom
  // see-through colour keeps its alpha over the picker's pale checkerboard.
  const tint = near ? `${near}${Math.round(nearAlpha * 255).toString(16).padStart(2, "0")}` : null;
  const colorPreview: Pick<CatalogColorChoice, "mode" | "style"> | null = byCircle
    ? near
      ? nearFilament ? { mode: ["Gradient", "Multi Color"].includes(filamentColorType(nearFilament)) ? "gradient" : "solid", style: filamentColorStyle(nearFilament) } : shelfMatch ?? {
          mode: "solid",
          style: `linear-gradient(${tint}, ${tint}), repeating-conic-gradient(#d4d9dd 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px`,
        }
      : { mode: "whatever", style: WHATEVER_STYLE }
    : toBuy
      ? { mode: ["Gradient", "Multi Color"].includes(filamentColorType(toBuy)) ? "gradient" : "solid", style: filamentColorStyle(toBuy) }
      : shelfColor;

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        // Enter in a setup field advances that card; Enter in the amount
        // field or activating Print It! submits the request.
        if (e.key === "Enter" && !e.defaultPrevented && e.target instanceof HTMLInputElement
          && ["text", "url", "search"].includes(e.target.type) && e.target.closest("[data-request-board]")) {
          e.preventDefault();
          advance();
        }
      }}
      className="mx-auto flex w-full max-w-[860px] flex-col gap-[26.4px]"
    >
      <div data-request-board data-has-open={step !== null ? true : undefined} className="mx-auto flex w-[88%] max-w-[720px] flex-col rounded-panel">
      {/* ================= 1 · model ================= */}
      <StepCard
        n={1}
        title="Model"
        open={step === 1}
        done={modelHasInput}
        summary={whatSummary}
        preview={
          <span className="grid h-full w-full place-items-center rounded-card border-[3px] border-ink bg-aqua-wash text-ink">
            <NavIcon name="cube" size={32} edge={false} />
          </span>
        }
        disabled={busy}
        onOpen={() => goTo(1)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[0] = el)}
      >
        {again && (
          <div className="mb-[22px] rounded-panel border-[3px] border-ink bg-cream px-[22px] py-[17.6px]">
            <p className="m-0 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              {again.filename ? `Same file as ${again.ref} — no re-upload` : `Same as ${again.ref}`}
            </p>
            <p className="m-0 mt-[4px] break-words font-display text-[19px] text-ink">
              {again.filename ?? "No model — asked for in words"}
            </p>
            <p className="m-0 mt-[3px] font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
              {again.fileSize !== null ? `${formatBytes(again.fileSize)} · ` : ""}change anything, or send it as it was
            </p>
          </div>
        )}

        <div>
          {/* The question is the placeholder now; aria-label keeps it named
              for a screen reader once something is typed over it.
              aria-required, not `required`: the browser's own check would block
              Send while this card is folded, with nowhere visible to say why. */}
          <input
            id="title"
            aria-label="What is it?"
            aria-required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="What is it? *"
            className="w-full rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
          />
        </div>

        {/* ---- dropzone ---- */}
        {!again && <div className="relative mt-[22px]">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          /*
           * focus-within, because the input it wraps is visually hidden and its
           * own outline would be drawn on a 1px clipped box nobody can see. The
           * label carries the visuals, so the label shows the focus. Same colour
           * and offset as the global ring in globals.css.
           */
          className={`block cursor-pointer rounded-t-panel border-[3px] border-dashed px-[26.4px] py-[22px] text-center transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-cherry-dk ${
            dragging
              ? "border-ink bg-sun"
              : "border-ink-3 bg-porcelain hover:border-ink hover:bg-sun-wash"
          }`}
        >
          {/*
           * sr-only, NOT hidden.
           *
           * This was `className="hidden"` — display:none — which takes the input
           * out of the focus order entirely. A <label> is not focusable, so there
           * was no tab stop anywhere that opened the file picker, and the submit
           * button is disabled until a file is chosen. A keyboard or screen-reader
           * user therefore could not upload anything at all: the app's primary
           * function, unreachable, with no error and nothing to notice.
           *
           * sr-only clips it to a 1px box instead of removing it, so it stays
           * focusable and operable (Space and Enter open the picker) while the
           * dropzone above keeps every bit of the visual design.
           */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={PICKER_ACCEPT}
            className="sr-only"
            disabled={busy}
            aria-describedby="upload-limits"
            onChange={(e) => accept(Array.from(e.target.files ?? []))}
          />
          {/* Important classes, because the cube sets its own size inline. */}
          <InkCube className="mx-auto mb-[8.8px] block !h-[56px] !w-[56px]" />
          <span className="block font-display text-[19px] text-ink">
            {files.length > 0 ? "Drop more, or click to add" : "Upload files"}
          </span>
          <span className="mt-[6px] block text-[13px] leading-[1.5] text-ink-2">
            3D models, photos or videos
          </span>
          {(files.length > 0 || (busy && !picked)) && (
            <span className="mt-[6px] block font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
              {busy && !picked
                ? `Uploading… ${phase.percent}%`
                : `${formatBytes(totalBytes)} of ${formatBytes(MAX_UPLOAD_BYTES)} · checked on the server when you send it`}
            </span>
          )}

          {busy && !picked && (
            <span className="mt-[13.2px] block h-[10px] overflow-hidden rounded-full border-[3px] border-ink bg-cream-2">
              <span
                className="block h-full bg-cherry transition-[width] duration-200"
                style={{ width: `${phase.percent}%` }}
              />
            </span>
          )}
        </label>
        {/* Outside the <label>, so opening the note does not open the picker. */}
        <span className="absolute right-[12px] top-[12px]">
          <InfoTip id="upload-limits" label="What can I upload?">
            3D models, photos or videos – up to {MAX_UPLOAD_BYTES / (1024 * 1024)}MB
          </InfoTip>
        </span>
        </div>}

        {/* ---- links that explain the job ---- */}
        {!again && (
          <div className="rounded-b-panel border-[3px] border-t-0 border-dashed border-ink-3 bg-porcelain p-[13.2px]">
            {/* Folded to one line until wanted: most orders carry no link. */}
            {addingLink ? (
              <>
                <Label htmlFor="order-link">Link</Label>
                <div className="flex flex-wrap gap-[8.8px]">
                  <input
                    id="order-link"
                    type="url"
                    inputMode="url"
                    autoFocus
                    value={linkDraft}
                    disabled={busy}
                    onChange={(e) => {
                      setLinkDraft(e.target.value);
                      setLinkError(null);
                    }}
                    // Enter adds the link; it does not move to the next card.
                    // Escape on an empty box folds it away again.
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && !linkDraft.trim()) {
                        e.preventDefault();
                        setAddingLink(false);
                        setLinkError(null);
                      }
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      addLink();
                    }}
                    placeholder="https://… the product it fits, a video, a forum post"
                    className="min-w-0 flex-1 basis-[240px] rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !linkDraft.trim() || links.length >= MAX_LINKS_PER_ORDER}
                    onClick={() => addLink()}
                  >
                    Add link
                  </Button>
                </div>
              </>
            ) : (
              links.length < MAX_LINKS_PER_ORDER && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pasteLink()}
                  className="flex w-full cursor-pointer items-center justify-center gap-[8.8px] border-0 bg-transparent px-0 py-[8.8px] font-mono text-[16px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-[20px] w-[20px] flex-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                  </svg>
                  {links.length > 0 ? "Paste another link" : "Paste link"}
                </button>
              )
            )}
            {linkError && (
              <p role="alert" className="m-0 mt-[6px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-cherry-dk">
                {linkError}
              </p>
            )}
            {links.length > 0 && (
              <ul aria-label="Links on this order" className="m-0 mt-[8.8px] flex list-none flex-col gap-[6px] p-0">
                {links.map((l) => (
                  <li
                    key={l}
                    className="flex items-center gap-[11px] rounded-card border-[3px] border-ink bg-porcelain px-[11px] py-[7px]"
                  >
                    <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{l}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setLinks(links.filter((x) => x !== l))}
                      aria-label={`Remove ${l}`}
                      className="flex-none cursor-pointer rounded-chip border-2 border-ink bg-cream px-[8px] py-[1px] font-mono text-[13px] font-bold text-ink hover:bg-cherry hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---- what is on the order so far. Below the connected upload/link
             area and outside the <label>, so removing a file does not open
             the file picker. ---- */}
        {!again && files.length > 0 && (
          <ul aria-label="Files on this order" className="m-0 mt-[13.2px] flex list-none flex-col gap-[6px] p-0">
            {files.map((f) => {
              const kind = kindOf(f.name) ?? "model";
              const badge = KIND_BADGE[kind];
              return (
                <li
                  key={`${f.name}:${f.size}`}
                  className="flex items-center gap-[11px] rounded-card border-[3px] border-ink bg-porcelain px-[11px] py-[7px]"
                >
                  <FileThumb file={f} kind={kind} />
                  <span
                    className={`flex-none rounded-chip border-2 border-ink px-[7px] py-[1px] font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-[14.5px] font-bold text-ink">
                    {f.name}
                    {f === primary && (
                      <span className="ml-[8px] font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-cherry-dk">
                        main model
                      </span>
                    )}
                  </span>
                  <span className="flex-none font-mono text-[12px] text-ink-3">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeFile(f)}
                    aria-label={`Remove ${f.name}`}
                    className="flex-none cursor-pointer rounded-chip border-2 border-ink bg-cream px-[8px] py-[1px] font-mono text-[13px] font-bold text-ink hover:bg-cherry hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* ---- or find one (only where the instance has switched importing on) ---- */}
        {!again && importSources.length > 0 && (
          <div className="mt-[17.6px]">
            <Label htmlFor="import-link">Or find a model on {sourceNames}</Label>
            <div className="flex flex-wrap gap-[8.8px]">
              <input
                id="import-link"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={link}
                disabled={busy}
                onChange={(e) => setLink(e.target.value)}
                // Enter here means "find this", not "next card": the model is
                // not settled until a file has been picked.
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  findModel();
                }}
                placeholder="Search by name, or paste a link"
                className="min-w-[240px] flex-1 rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || searching || linked.kind === "looking" || !link.trim()}
                onClick={findModel}
              >
                {linked.kind === "looking"
                  ? "Looking…"
                  : searching
                    ? "Searching…"
                    : LINKISH.test(link)
                      ? "Find the files"
                      : "Search"}
              </Button>
            </div>

            {/* ---- what the search found. Folded away while a model is picked. ---- */}
            {found && linked.kind !== "listed" && (
              <div aria-live="polite" className="mt-[13.2px]">
                {found.hits.length === 0 ? (
                  <p className="m-0 text-[15px] text-ink-2">
                    Nothing on {sourceNames} matches “{found.query}”. Try fewer or different words.
                  </p>
                ) : (
                  <>
                    <p className="m-0 mb-[8.8px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                      {found.total.toLocaleString("en")} {found.total === 1 ? "model" : "models"} for “{found.query}” ·
                      pick one to see its files
                    </p>
                    <ul
                      aria-label="Models found"
                      className="m-0 grid list-none grid-cols-2 gap-[11px] p-0 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
                    >
                      {found.hits.map((hit) => {
                        const opening = linked.kind === "looking" && linked.url === hit.url;
                        return (
                          <li key={hit.id}>
                            <button
                              type="button"
                              disabled={busy || linked.kind === "looking"}
                              onClick={() => void lookUp(hit.url)}
                              className={`flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-card border-[3px] border-ink p-0 text-left transition-colors disabled:cursor-not-allowed ${
                                opening ? "bg-sun" : "bg-cream hover:bg-sun disabled:opacity-50"
                              }`}
                            >
                              <span className="block aspect-[4/3] w-full flex-none border-b-[3px] border-ink bg-cream-2">
                                {hit.thumb && (
                                  <img src={hit.thumb} alt="" loading="lazy" className="block h-full w-full object-cover" />
                                )}
                              </span>
                              <span className="block px-[10px] py-[8px]">
                                <span className="line-clamp-2 break-words text-[14px] font-bold leading-[1.25] text-ink">
                                  {hit.name}
                                </span>
                                <span className="mt-[3px] block truncate font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
                                  {opening
                                    ? "Looking…"
                                    : [
                                        hit.author ? `by ${hit.author}` : null,
                                        hit.likes ? `♥ ${compactCount.format(hit.likes)}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {found.hits.length < found.total && found.next <= MAX_SEARCH_OFFSET && (
                      <button
                        type="button"
                        disabled={busy || searching || linked.kind === "looking"}
                        onClick={() => void search(true)}
                        className="mx-auto mt-[13.2px] flex w-fit cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {searching ? "Finding more…" : "Show more"}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {linked.kind === "listed" && (
              <div
                aria-live="polite"
                className="mt-[13.2px] rounded-panel border-[3px] border-ink bg-porcelain px-[22px] py-[17.6px] shadow-stamp"
              >
                <div className="flex items-start justify-between gap-[13.2px]">
                  <p className="m-0 min-w-0 break-words font-display text-[19px] text-ink">{linked.listing.model.name}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setLinked({ kind: "idle" })}
                    className="flex-none cursor-pointer border-0 bg-transparent p-0 pt-[4px] font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {found ? "← Other results" : "Not this one"}
                  </button>
                </div>
                <p className="m-0 mt-[3px] font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
                  {[
                    linked.listing.model.author ? `by ${linked.listing.model.author}` : null,
                    linked.listing.model.license,
                  ]
                    .filter(Boolean)
                    .join(" · ") || SOURCE_LABEL[linked.listing.source]}
                </p>

                {linked.listing.files.length === 0 ? (
                  <p className="m-0 mt-[13.2px] text-[15px] text-ink-2">
                    There is no 3D file this app takes in that model, so there is nothing here to print.
                  </p>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Which file to print"
                    className="mt-[13.2px] flex max-h-[280px] flex-col gap-[6px] overflow-y-auto"
                  >
                    {linked.listing.files.map((f) => {
                      const active = f.id === linked.fileId;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={f.tooLarge || busy}
                          onClick={() => setLinked({ ...linked, fileId: f.id })}
                          className={`flex cursor-pointer items-baseline justify-between gap-[13.2px] rounded-card border-[3px] border-ink px-[13px] py-[9px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active ? "bg-cherry-dk text-cream" : "bg-cream text-ink hover:bg-sun"
                          }`}
                        >
                          <span className="min-w-0 break-words text-[15px] font-bold">{f.name}</span>
                          <span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.04em]">
                            {formatBytes(f.size)}
                            {f.tooLarge ? ` · over ${formatBytes(MAX_UPLOAD_BYTES)}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className="m-0 mt-[11px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  {linked.listing.files.length > 1 ? "One file per request · " : ""}
                  {linked.listing.otherFiles > 0
                    ? `${linked.listing.otherFiles} other ${linked.listing.otherFiles === 1 ? "file" : "files"} there cannot be printed here · `
                    : ""}
                  fetched and checked on the server when you send it
                </p>
              </div>
            )}
          </div>
        )}

      </StepCard>

      {/* ================= 2 · material ================= */}
      <StepCard
        n={2}
        title="Material"
        open={step === 2}
        done={material !== null}
        summary={materialSummary}
        preview={material !== null && (
          <span className="grid h-full w-full place-items-center rounded-card border-[3px] border-ink bg-sun-wash text-ink">
            {auto ? (
              <svg aria-hidden viewBox="0 0 24 24" className="h-[28px] w-[28px]" fill="var(--color-sun)" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
                <path d="m14 3 2.4 6.6L23 12l-6.6 2.4L14 21l-2.4-6.6L5 12l6.6-2.4L14 3Z" />
                <path d="m4 2 .8 2.2L7 5l-2.2.8L4 8l-.8-2.2L1 5l2.2-.8L4 2Z" />
              </svg>
            ) : (
              <NavIcon name="spool" size={32} edge={false} />
            )}
          </span>
        )}
        disabled={busy}
        onOpen={() => {
          if (material === null) chooseMaterial(AUTO_MATERIAL);
          goTo(2);
        }}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[1] = el)}
      >
        {gone.length > 0 && (
          <div className="mb-[22px]">
            <Notice tone="warn">
              {gone.join(" and ")} {gone.length === 1 ? "is" : "are"} not on offer any more, so
              that has been set to something that is. Check it before you send.
            </Notice>
          </div>
        )}

        {/* Clicking Add Material sets Auto; switching it off reveals the material picker. */}
        <div className="flex max-w-[520px] items-center justify-between gap-[6px]">
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            aria-controls="material-choice"
            disabled={busy || (auto && !manualMaterial.current)}
            onClick={() => chooseMaterial(auto ? manualMaterial.current ?? AUTO_MATERIAL : AUTO_MATERIAL)}
            className="flex min-h-[44px] cursor-pointer items-center gap-[12px] rounded-chip border-0 bg-transparent p-0 font-display text-[18px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Auto</span>
            <span
              aria-hidden
              className={`relative block h-[28px] w-[52px] flex-none rounded-full border-[3px] border-ink transition-colors motion-reduce:transition-none ${auto ? "bg-mint" : "bg-cream-3"}`}
            >
              <span className={`absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full border-2 border-ink bg-porcelain transition-transform motion-reduce:transition-none ${auto ? "translate-x-[24px]" : "translate-x-0"}`} />
            </span>
          </button>
          <button
            type="button"
            aria-label="About this filament"
            aria-expanded={aboutMaterial}
            aria-controls="material-about"
            onClick={() => setAboutMaterial((on) => !on)}
            className={`grid h-[40px] w-[40px] flex-none cursor-pointer place-items-center border-0 bg-transparent p-0 text-ink transition-transform duration-150 hover:scale-115 motion-reduce:transition-none ${
              aboutMaterial ? "scale-115" : ""
            }`}
          >
            <NavIcon name="info" />
          </button>
        </div>
        <div id="material-choice" className="max-w-[520px]">
          {!auto && (
            <div className="mt-[12px]">
              <label htmlFor="material" className="sr-only">
                Material
              </label>
              <Dropdown
                id="material"
                options={catalog.map((item) => item.name)}
                value={material}
                onChange={chooseMaterial}
                placeholder="Pick a filament"
              />
            </div>
          )}
        </div>
        <div
          id="material-about"
          hidden={!aboutMaterial}
          className="mt-[14px] rounded-card border-[3px] border-ink bg-cream-2 px-[18px] py-[16px]"
        >
          <MaterialFacts item={selectedMaterial} auto={auto} owner={owner} />
        </div>

      </StepCard>

      {/* ================= 3 · color ================= */}
      <StepCard
        n={3}
        title="Color"
        open={step === 3}
        done={colorChosen}
        summary={colorSummary}
        preview={colorPreview && (
          <ColorSwatch
            mode={colorPreview.mode}
            style={colorPreview.style}
            className="h-full w-full rounded-card border-[3px] border-ink"
          />
        )}
        disabled={busy}
        onOpen={() => goTo(3)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[2] = el)}
      >
        {/* The material's saved swatches, or every material's for Auto. */}
        {/* Keyed by material: another shelf starts back on Library. */}
        <section aria-label="Color">
          {storeSelectionRemoved && (
            <div className="mb-[17px]">
              <Notice tone="info">
                Your previous Store choice needs a confirmed {MIN_DONATION_LABEL} donation. This order starts with a Library color; choose one below or donate to unlock Store.
              </Notice>
            </div>
          )}
          <Suspense fallback={<p role="status" className="m-0 py-[22px] text-center text-[14px] text-ink-2">Loading colors…</p>}>
          <ColorMenu
            key={material ?? ""}
            colors={shelfChoices}
            storeAccess={storeAccess}
            value={near}
            alpha={nearAlpha}
            material={selectedMaterial?.name}
            personalPalette={personalPalette}
            filamentConfig={filamentConfig}
            selectedFilament={nearFilament}
            selectedShelf={nearShelf}
            onChange={(hex, alpha, filament, shelf, name) => chooseNear(hex, alpha, true, filament, shelf, name)}
            otherColors={storeAccess && selectedMaterial && (
              <>
                {near && !toBuy && closestShelfColor(selectedMaterial, near) === null && (
                  <p aria-live="polite" className="m-0 mt-[13.2px] text-[13.5px] leading-[1.45] text-ink-2">
                    Nothing {owner} has in {selectedMaterial.name} looks like your color. Pick a spool {owner} can get
                    below, or choose a color from Library.
                  </p>
                )}
                <hr aria-hidden className="mx-0 my-[24px] border-0 border-t-[3px] border-dashed border-ink/25" />
                {/* Keyed by material: another material starts folded, with a fresh library search. */}
                <OtherColors
                  key={selectedMaterial.name}
                  material={selectedMaterial.name}
                  owner={owner}
                  filamentConfig={filamentConfig}
                  colorType={nearFilament ? filamentColorType(nearFilament) : undefined}
                  picked={toBuy}
                  onPick={chooseToBuy}
                  near={near}
                  onNear={(hex) => chooseNear(hex)}
                  clear={near !== null && nearAlpha <= SEE_THROUGH}
                  suggested={near !== null && closestShelfColor(selectedMaterial, near) === null}
                />
              </>
            )}
          />
          </Suspense>
        </section>

      </StepCard>
      </div>

      {error}

      {/* Optional details and the send action stay outside the setup board. */}
      <div className="flex flex-col items-center gap-[17.6px]">
        {/* Equal side columns keep the counter centered as the note action changes. */}
        <div className="pixel-surface pixel-surface-copies grid w-[88%] max-w-[440px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[4px] rounded-full px-[8px] py-[6px] sm:gap-[12px] sm:px-[22px] sm:py-[8px]">
          <div className="col-start-2 row-start-1">
            <div className="flex items-center justify-center gap-[2px]">
              <button type="button" onClick={() => stepQuantity(-1)} disabled={busy || quantity <= 1} aria-label="One fewer" className={STEP_BUTTON}>
                <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
                  <path d="M4 10h12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
              </button>
              <input
                id="quantity"
                aria-label="Quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QUANTITY}
                disabled={busy}
                value={quantityDraft ?? quantity}
                onChange={(e) => {
                  setQuantityDraft(e.target.value);
                  // Incomplete drafts keep the last valid quantity until blur.
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 1) setQuantity(n);
                }}
                onBlur={() => setQuantityDraft(null)}
                className="w-[40px] appearance-none rounded-chip border-0 bg-transparent px-[4px] py-[10px] text-center font-mono text-[18px] font-bold tabular-nums text-ink [-moz-appearance:textfield] focus:bg-porcelain [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button type="button" onClick={() => stepQuantity(1)} disabled={busy || quantity >= MAX_QUANTITY} aria-label="One more" className={STEP_BUTTON}>
                <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
                  <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label={addingNote ? "Hide note" : note.trim() ? "Edit note" : "Add note"}
            title={addingNote ? "Hide note" : note.trim() ? "Edit note" : "Add note"}
            aria-expanded={addingNote}
            aria-controls="note-details"
            onClick={() => {
              setAddingNote((open) => !open);
              navigator.vibrate?.(12);
            }}
            disabled={busy}
            className={`col-start-3 row-start-1 grid h-[44px] w-[44px] max-w-full cursor-pointer place-items-center self-end justify-self-end rounded-chip border-2 p-[8px] text-ink transition-colors hover:border-ink hover:bg-sun-wash disabled:cursor-not-allowed disabled:opacity-40 ${addingNote || note.trim() ? "border-ink bg-porcelain" : "border-transparent bg-transparent"}`}
          >
            <NavIcon name="note" size={24} edge={false} />
          </button>
        </div>
        <div id="note-details" hidden={!addingNote} className="w-[88%] min-w-0 max-w-[720px]">
          <textarea
            id="note"
            aria-label="Notes"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            disabled={busy}
            placeholder="Add notes"
            className="w-full resize-y rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
          />
        </div>
        <Button
          type="submit"
          variant="ghost"
          disabled={busy}
          aria-label={busy ? undefined : again ? "Print It! again" : "Print It!"}
          aria-busy={busy}
          onPointerDown={(event) => { event.currentTarget.dataset.logoPressed = "true"; }}
          onPointerUp={(event) => { delete event.currentTarget.dataset.logoPressed; }}
          onPointerCancel={(event) => { delete event.currentTarget.dataset.logoPressed; }}
          onPointerLeave={(event) => { delete event.currentTarget.dataset.logoPressed; }}
          className="inline-flex min-w-[210px] max-w-full items-center justify-center !bg-porcelain !shadow-none px-[30px] hover:!bg-porcelain"
          data-send-request
        >
          {busy
            ? again ? "Sending…" : picked ? "Fetching it…" : `Sending… ${phase.percent}%`
            : (
              <span aria-hidden className="print-button-logo flex h-[33px] w-[144px] items-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size button artwork */}
                <img
                  src={ARTWORK.wordmarkStraight}
                  alt=""
                  width={759}
                  height={127}
                  className="block h-auto w-full"
                />
              </span>
            )}
        </Button>
      </div>
    </form>
  );
}

/**
 * A photo's own pixels, or a glyph for anything else. The object URL is the
 * browser's handle on a file already in memory — `img-src blob:` allows it —
 * and is released when the row goes, or it would hold the file until the tab
 * closed.
 */
function FileThumb({ file, kind }: { file: File; kind: FileKind }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "image") return;
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file, kind]);

  return (
    <span
      aria-hidden
      className="flex h-[40px] w-[40px] flex-none items-center justify-center overflow-hidden rounded-[6px] border-2 border-ink bg-cream-2 font-mono text-[9.5px] font-bold uppercase text-ink-2"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : kind === "video" ? (
        <span className="text-[16px] leading-none">▶</span>
      ) : (
        extensionOf(file.name).slice(1, 5)
      )}
    </span>
  );
}
