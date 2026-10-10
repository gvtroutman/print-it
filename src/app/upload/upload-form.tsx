"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  ANY_COLOR,
  AUTO_MATERIAL,
  DEFAULT_STORY_PRIORITY,
  NEAR_ENOUGH,
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
import { InkCube } from "@/components/ink-cube";
import { NavIcon } from "@/components/nav-icons";
import { PrioritySlider } from "@/components/priority-slider";

import { ColorMenu, OtherColors, colorNameOf } from "./spool-finder";

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
  /** The spool the old ticket asked the owner to buy, or null for a shelf colour. */
  swatch: SwatchChoice | null;
  quantity: number;
  priority: number;
  note: string;
};

/** The most one request may ask for; the server says the same. */
const MAX_QUANTITY = 24;

/** A colour picked at most this solid looks for see-through spools first. */
const SEE_THROUGH = 0.8;

/** The round − and + either side of the amount. */
const STEP_BUTTON =
  "grid h-[44px] w-[44px] cursor-pointer place-items-center rounded-full border-0 bg-cream-2 text-ink transition-colors hover:bg-cream-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cream-2";

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

/** The four cards of the request board, in the order they are filled in. */
type StepNo = 1 | 2 | 3 | 4;

/** Each card's own colour, along its top when open and its edge when folded. */
const STEP_ACCENT: Record<StepNo, string> = { 1: "bg-aqua", 2: "bg-sun", 3: "bg-[#f4c531]", 4: "bg-mint" };

/** Clear of the sticky header; the same as the cards' `scroll-mt` and the folded columns' `top`. */
const BELOW_HEADER = 112;

function StepBadge({ n, done }: { n: StepNo; done: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-[32px] w-[32px] flex-none place-items-center rounded-full border-[3px] border-ink font-display text-[16px] leading-none text-ink ${
        done ? "bg-mint" : "bg-porcelain"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}

/**
 * One card of the request board. Open, it is the step being filled in and
 * takes the room; folded, it is a narrow column beside it (a bar on a phone)
 * saying what was settled there, and tapping it opens it again. The fields
 * stay mounted while folded, only hidden, so moving between cards never loses
 * a file, a typed word or the spool library's search.
 *
 * Tapping the open card's header folds it too, so a tap opens and closes a
 * card, and opening one folds whichever was open. With all four folded,
 * none is pushed aside, so they share the row evenly: the whole order at a
 * glance.
 */
function StepCard({
  n,
  title,
  open,
  allFolded,
  done,
  summary,
  disabled,
  onOpen,
  onClose,
  cardRef,
  footer,
  children,
}: {
  n: StepNo;
  title: string;
  open: boolean;
  /** No card is open, so the folded ones share the row. */
  allFolded: boolean;
  done: boolean;
  /** What the folded card says about this step. */
  summary: ReactNode;
  disabled: boolean;
  onOpen: () => void;
  onClose: () => void;
  cardRef: (el: HTMLElement | null) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const headingId = `step-${n}-heading`;
  return (
    <section
      ref={cardRef}
      aria-labelledby={headingId}
      className={`min-w-0 scroll-mt-[112px] ${
        open || allFolded ? "lg:flex-1" : "lg:w-[132px] lg:flex-none xl:w-[156px]"
      }`}
    >
      <div
        className={`h-full rounded-panel border-[3px] border-ink bg-porcelain ${open ? "shadow-stamp-lg" : "shadow-stamp"}`}
      >
        {open ? (
          <h2 className="m-0">
            {/* The whole header is the fold control. Focused when the card
                opens, so a screen reader hears where it landed. */}
            <button
              type="button"
              data-step-heading
              onClick={onClose}
              disabled={disabled}
              aria-expanded
              className={`layers flex w-full cursor-pointer items-center gap-[11px] rounded-t-[13px] border-0 border-b-[3px] border-ink px-[17.6px] py-[11px] text-left text-ink transition-[filter] hover:brightness-[0.96] disabled:cursor-not-allowed disabled:hover:brightness-100 sm:px-[26.4px] ${STEP_ACCENT[n]}`}
            >
              <StepBadge n={n} done={false} />
              <span id={headingId} className="min-w-0 flex-1 font-display text-[22px] leading-tight">
                {title}
              </span>
            </button>
          </h2>
        ) : (
          <button
            type="button"
            data-step-open
            onClick={onOpen}
            disabled={disabled}
            aria-expanded={false}
            className="group flex h-full w-full cursor-pointer items-stretch rounded-[13px] border-0 bg-transparent p-0 text-left text-ink transition-colors hover:bg-sun-wash disabled:cursor-not-allowed disabled:hover:bg-transparent lg:flex-col"
          >
            <span
              aria-hidden
              className={`layers w-[12px] flex-none rounded-l-[13px] border-r-[3px] border-ink lg:h-[14px] lg:w-auto lg:rounded-l-none lg:rounded-t-[13px] lg:border-b-[3px] lg:border-r-0 ${STEP_ACCENT[n]}`}
            />
            <span className="flex min-w-0 flex-1 items-center gap-[11px] px-[13.2px] py-[11px] lg:sticky lg:top-[112px] lg:flex-none lg:flex-col lg:items-start lg:gap-[8.8px] lg:px-[15px] lg:py-[17.6px]">
              <StepBadge n={n} done={done} />
              <span className="min-w-0 flex-1 lg:w-full lg:flex-none">
                <span id={headingId} className="block font-display text-[17px] leading-tight">
                  {title}
                </span>
                <span className="mt-[3px] block truncate text-[13px] leading-[1.4] text-ink-2 lg:whitespace-normal lg:break-words">
                  {summary}
                </span>
              </span>
              {done && (
                // A pencil sticker says "edit" without a word; the word is
                // still there for a screen reader.
                <span className="flex flex-none text-ink transition-transform duration-150 ease-out group-hover:scale-125 group-disabled:scale-100">
                  <NavIcon name="pencil" />
                  <span className="sr-only">Change</span>
                </span>
              )}
            </span>
          </button>
        )}

        <div hidden={!open}>
          <div className="px-[17.6px] py-[22px] sm:px-[26.4px]">{children}</div>
          <div className="flex flex-wrap items-end justify-between gap-[13.2px] border-t-[3px] border-dashed border-ink/25 px-[17.6px] py-[17.6px] sm:px-[26.4px]">
            {footer}
          </div>
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
}: {
  owner: string;
  catalog: CatalogMaterialChoice[];
  again?: Again;
  /** The sites this instance imports from. Empty hides the link step entirely. */
  importSources?: ImportSource[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // A fresh request starts on Auto, the filament left to the owner, so the
  // dropdown shows the choice it opens with and the colour comes from the
  // circles up top. Printing
  // again starts from what was asked for last time — where that is still on
  // the shelf. A material or colour the owner has since retired falls back to
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
  const initialSwatch = wanted ? again?.swatch ?? null : null;
  const initialColor = initialMaterial && !initialSwatch
    ? wantedColor ?? initialMaterial.colors.find((item) => item.name === "Slate") ?? initialMaterial.colors[0]!
    : null;
  const gone = again && !againAuto
    ? [
        !wanted
          ? again.material
          : !wantedColor && !initialSwatch
            ? `${again.material} in ${again.colorName}`
            : null,
      ].filter((x): x is string => x !== null)
    : [];

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
  const [material, setMaterial] = useState<string | null>(initialMaterial?.name ?? AUTO_MATERIAL);
  // Whether the material's facts are open below its dropdown.
  const [aboutMaterial, setAboutMaterial] = useState(false);
  const [quantity, setQuantity] = useState<number>(again?.quantity ?? 1);
  // What is in the amount box while it is being typed in, or null
  // when it simply shows `quantity`. Kept apart from the number because a box
  // being edited passes through states that are not quantities — empty, most
  // obviously. Coercing each keystroke turned an emptied box straight back
  // into "1", so clearing it to type 3 produced 13.
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const [priority, setPriority] = useState<number>(again?.priority ?? DEFAULT_STORY_PRIORITY);
  const [color, setColor] = useState<string | null>(initialColor?.name ?? null);
  // A spool the owner can get instead of one on the shelf. One or the other:
  // picking either clears the other.
  const [toBuy, setToBuy] = useState<SwatchChoice | null>(initialSwatch);
  // The colour picked from the rainbow at the top, before any material: it picks
  // the nearest shelf colour, or searches the library when the shelf has none.
  // `nearAlpha` is how solid it is; a see-through one looks for clear spools.
  // Printing again lights the circle of the colour asked for last time.
  const [near, setNear] = useState<string | null>(
    initialColor && initialColor.mode !== "whatever" && /^#[0-9a-f]{6}$/i.test(initialColor.hex) ? initialColor.hex : null,
  );
  const [nearAlpha, setNearAlpha] = useState(1);
  const [note, setNote] = useState(again?.note ?? "");

  // The card that is open (null when all are folded), and the furthest one
  // reached by moving on.
  const [step, setStep] = useState<StepNo | null>(1);
  const [reached, setReached] = useState<StepNo>(1);
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
          quantity, priority, note, links,
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
          title, material, ...wishColor, quantity, priority, note,
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
      return "Pick a material first, or Auto. Swipe across to see what each one is good at.";
    }
    if (n === 3 && material !== null && !auto && color === null && toBuy === null) {
      return `Pick a color from the circles, or a spool ${owner} can get from Other colors.`;
    }
    return null;
  }

  function goTo(n: StepNo) {
    moved.current = true;
    setPhase({ kind: "idle" });
    setQuantityDraft(null);
    setStep(n);
    setReached((r) => (n > r ? n : r));
  }

  /** Fold the open card, leaving all four folded side by side. */
  function foldAll() {
    moved.current = true;
    folded.current = step;
    setPhase({ kind: "idle" });
    setQuantityDraft(null);
    setStep(null);
  }

  /** On to the next card, once this one is settled. */
  function advance() {
    if (step === null) return;
    const problem = problemOn(step);
    if (problem) return setPhase({ kind: "error", message: problem });
    goTo((step + 1) as StepNo);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind === "uploading") return;
    // Enter in the quantity box submits without blurring it; show what is
    // actually being sent rather than a half-typed draft.
    setQuantityDraft(null);
    // The Next buttons submit too, so Enter in a field moves on a card;
    // only the last card sends.
    if (step !== 4) return advance();
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
    body.set("quantity", String(quantity));
    body.set("priority", String(priority));
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
  const auto = material === AUTO_MATERIAL;

  // Left to the owner, the colour is the one picked up top, not a shelf spool:
  // a shelf colour by name, one of your own by hex too, or any colour.
  const shelfMatch = near !== null && nearAlpha === 1
    ? catalog.flatMap((item) => item.colors).find((c) => c.mode !== "whatever" && c.hex.toLowerCase() === near.toLowerCase())
    : undefined;
  const autoColorName = near === null ? ANY_COLOR : shelfMatch?.name ?? colorNameOf(near, nearAlpha);
  /** The colour half of the wish, as every way of sending it names it. */
  const wishColor = auto
    ? { colorName: autoColorName, colorHex: near !== null && !shelfMatch ? near : null, swatchId: null }
    : { colorName: color ?? "", colorHex: null, swatchId: toBuy?.id ?? null };

  function chooseMaterial(next: string) {
    if (next === AUTO_MATERIAL) {
      setMaterial(AUTO_MATERIAL);
      setColor(null);
      setToBuy(null);
      return;
    }
    const item = catalog.find((candidate) => candidate.name === next);
    if (!item) return;
    // A spool to buy was one kind of filament; another material starts from its shelf.
    if (item.name !== material) setToBuy(null);
    else if (toBuy) return;
    setMaterial(item.name);
    const match = shelfColorFor(item, near);
    setColor(match?.name ?? null);
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
   * A colour from the circles or the rainbow; null is any colour. From the
   * circles it is the shelf colour asked for, so it replaces a spool to buy
   * when the shelf has one like it. From the library's own colour filter a
   * spool to buy already picked stays.
   */
  function chooseNear(hex: string | null, alpha = 1, fromCircles = false) {
    setNear(hex);
    setNearAlpha(hex ? alpha : 1);
    if (!selectedMaterial) return;
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
  const dotHex = byCircle ? near : toBuy?.hex ?? shelfColor?.hex ?? null;
  const colorSummary = (
    <>
      {dotHex && /^#[0-9a-f]{6}$/i.test(dotHex) && (
        <span
          aria-hidden
          className="mr-[6px] inline-block h-[11px] w-[11px] rounded-full border-2 border-ink align-[-1px]"
          style={{ background: dotHex }}
        />
      )}
      {byCircle ? autoColorName : toBuy ? `${toBuy.name}, to get` : color ?? "No color yet"}
    </>
  );
  const sendSummary = `Priority ${priority} · ${quantity} ${quantity === 1 ? "copy" : "copies"}`;

  const back = (to: StepNo) => (
    <Button type="button" variant="ghost" disabled={busy} onClick={() => goTo(to)}>
      Back
    </Button>
  );

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-[13.2px] lg:flex-row lg:items-stretch lg:gap-[17.6px]"
    >
      {/* ================= 1 · what to print ================= */}
      <StepCard
        n={1}
        title="What to print"
        open={step === 1}
        done={reached > 1 && problemOn(1) === null}
        summary={whatSummary}
        disabled={busy}
        allFolded={step === null}
        onOpen={() => goTo(1)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[0] = el)}
        footer={
          // A lone child in the footer's justify-between row; mx-auto centres it.
          <div className="mx-auto">
            <Button type="submit" disabled={busy}>
              Next: material
            </Button>
          </div>
        }
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
        {!again && <label
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
          className={`mt-[22px] block cursor-pointer rounded-panel border-[3px] border-dashed px-[26.4px] py-[13.2px] text-center transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-cherry-dk ${
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
            onChange={(e) => accept(Array.from(e.target.files ?? []))}
          />
          {/* Important classes, because the cube sets its own size inline. */}
          <InkCube className="mx-auto mb-[8.8px] block !h-[72px] !w-[72px]" />
          <span className="block font-display text-[19px] text-ink">
            {files.length > 0 ? "Drop more, or click to add" : "Drop files here, or click to choose"}
          </span>
          <span className="mt-[6px] block font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
            {busy && !picked
              ? `Uploading… ${phase.percent}%`
              : files.length > 0
                ? `${formatBytes(totalBytes)} of ${formatBytes(MAX_UPLOAD_BYTES)} · checked on the server when you send it`
                : `3D models, photos or videos – up to ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`}
          </span>

          {busy && !picked && (
            <span className="mt-[13.2px] block h-[10px] overflow-hidden rounded-full border-[3px] border-ink bg-cream-2">
              <span
                className="block h-full bg-cherry transition-[width] duration-200"
                style={{ width: `${phase.percent}%` }}
              />
            </span>
          )}
        </label>}

        {/* ---- what is on the order so far. Outside the <label>, so a remove
             button does not also open the file picker. ---- */}
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

        {/* ---- links that explain the job ---- */}
        {!again && (
          <div className="mt-[17.6px]">
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
                    className="min-w-[240px] flex-1 rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
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
                  className="mx-auto flex w-fit cursor-pointer items-center gap-[6px] border-0 bg-transparent p-0 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-2 underline-offset-4 hover:text-cherry-dk disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-[15px] w-[15px] flex-none"
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

        {step === 1 && error}
      </StepCard>

      {/* ================= 2 · material ================= */}
      <StepCard
        n={2}
        title="Material"
        open={step === 2}
        done={reached > 2 && problemOn(2) === null}
        summary={materialSummary}
        disabled={busy}
        allFolded={step === null}
        onOpen={() => goTo(2)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[1] = el)}
        footer={
          <>
            {back(1)}
            <Button type="submit" disabled={busy}>
              Next: color
            </Button>
          </>
        }
      >
        {gone.length > 0 && (
          <div className="mb-[22px]">
            <Notice tone="warn">
              {gone.join(" and ")} {gone.length === 1 ? "is" : "are"} not on offer any more, so
              that has been set to something that is. Check it before you send.
            </Notice>
          </div>
        )}

        {/* ---- the dropdown, and an info button that opens what the one picked is like below it ---- */}
        <div className="flex max-w-[480px] items-start gap-[10px]">
          <div className="min-w-0 flex-1">
            <label htmlFor="material" className="sr-only">
              Material
            </label>
            <Dropdown
              id="material"
              options={[AUTO_MATERIAL, ...catalog.map((item) => item.name)]}
              value={material}
              onChange={chooseMaterial}
              placeholder="Pick a filament, or Auto"
            />
          </div>
          <button
            type="button"
            aria-label="About this filament"
            aria-expanded={aboutMaterial}
            aria-controls="material-about"
            onClick={() => setAboutMaterial((on) => !on)}
            className={`grid h-[54px] w-[54px] flex-none cursor-pointer place-items-center rounded-full border-[3px] border-ink font-display text-[22px] font-bold leading-none text-ink hover:bg-sun ${
              aboutMaterial ? "bg-sun" : "bg-porcelain"
            }`}
          >
            <span aria-hidden>i</span>
          </button>
        </div>
        <div
          id="material-about"
          hidden={!aboutMaterial}
          className="mt-[14px] rounded-card border-[3px] border-ink bg-cream-2 px-[18px] py-[16px]"
        >
          <MaterialFacts item={selectedMaterial} auto={auto} owner={owner} />
        </div>

        {step === 2 && error}
      </StepCard>

      {/* ================= 3 · color ================= */}
      <StepCard
        n={3}
        title="Color"
        open={step === 3}
        done={reached > 3 && problemOn(3) === null}
        summary={colorSummary}
        disabled={busy}
        allFolded={step === null}
        onOpen={() => goTo(3)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[2] = el)}
        footer={
          <>
            {back(2)}
            <Button type="submit" disabled={busy}>
              Next: send it
            </Button>
          </>
        }
      >
        {/* ---- the shelf as circles: the material's own, or every material's ---- */}
        {/* Keyed by material: another shelf starts back on its circles. */}
        <section aria-label="Color">
          <ColorMenu
            key={material ?? ""}
            colors={selectedMaterial ? selectedMaterial.colors : catalog.flatMap((item) => item.colors)}
            value={near}
            alpha={nearAlpha}
            onChange={(hex, alpha) => chooseNear(hex, alpha, true)}
          />
        </section>

        {selectedMaterial && (
          <>
            {near && !toBuy && closestShelfColor(selectedMaterial, near) === null && (
              <p aria-live="polite" className="m-0 mt-[13.2px] text-[13.5px] leading-[1.45] text-ink-2">
                Nothing {owner} has in {selectedMaterial.name} looks like your color. Pick a spool {owner} can get
                below, or one of the circles.
              </p>
            )}
            <hr aria-hidden className="mx-0 my-[24px] border-0 border-t-[3px] border-dashed border-ink/25" />
            {/* Keyed by material: another material starts folded, with a fresh library search. */}
            <OtherColors
              key={selectedMaterial.name}
              material={selectedMaterial.name}
              owner={owner}
              picked={toBuy}
              onPick={chooseToBuy}
              near={near}
              onNear={(hex) => chooseNear(hex)}
              clear={near !== null && nearAlpha <= SEE_THROUGH}
              suggested={near !== null && closestShelfColor(selectedMaterial, near) === null}
            />
          </>
        )}

        {step === 3 && error}
      </StepCard>

      {/* ================= 4 · send it ================= */}
      <StepCard
        n={4}
        title="Send it"
        open={step === 4}
        done={false}
        summary={sendSummary}
        disabled={busy}
        allFolded={step === null}
        onOpen={() => goTo(4)}
        onClose={foldAll}
        cardRef={(el) => void (cards.current[3] = el)}
        footer={
          <>
            {back(3)}
            <div className="flex flex-wrap items-end gap-[13.2px]">
              {/* Amount sits by the send button: the last thing settled before it goes. */}
              <div>
                <Label htmlFor="quantity">Amount</Label>
                <div className="inline-flex items-center gap-[6px] py-[3px]">
                  <button
                    type="button"
                    onClick={() => stepQuantity(-1)}
                    disabled={quantity <= 1}
                    aria-label="One fewer"
                    className={STEP_BUTTON}
                  >
                    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
                      <path d="M4 10h12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                    </svg>
                  </button>
                  <input
                    id="quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_QUANTITY}
                    value={quantityDraft ?? quantity}
                    onChange={(e) => {
                      setQuantityDraft(e.target.value);
                      // Only a whole number of at least one becomes the quantity. The
                      // upper limit is left to the server, whose refusal says who to ask.
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1) setQuantity(n);
                    }}
                    // Leaving the box settles it: whatever is not a quantity gives way
                    // to the last one that was.
                    onBlur={() => setQuantityDraft(null)}
                    className="w-[48px] appearance-none rounded-chip border-0 bg-transparent px-[4px] py-[10px] text-center font-mono text-[16px] font-bold tabular-nums text-ink [-moz-appearance:textfield] focus:bg-cream-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepQuantity(1)}
                    disabled={quantity >= MAX_QUANTITY}
                    aria-label="One more"
                    className={STEP_BUTTON}
                  >
                    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
                      <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={busy} className="px-[30px]">
                {busy
                  ? again ? "Sending…" : picked ? "Fetching it…" : `Sending… ${phase.percent}%`
                  : again ? `Send it to ${owner} again` : `Send it to ${owner}`}
              </Button>
            </div>
          </>
        }
      >
        {/* ---- priority ---- */}
        <div className="max-w-[420px]">
          <Label htmlFor="priority">Priority</Label>
          <PrioritySlider id="priority" value={priority} onChange={setPriority} />
        </div>

        {/* ---- note ---- */}
        <div className="mt-[22px]">
          {/* Named, not "he" — the printer owner is a role anyone can hold. */}
          <Label htmlFor="note">Anything {owner} should know</Label>
          <textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="No rush — needs to survive a bit of pulling."
            className="w-full resize-y rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
          />
        </div>

        {step === 4 && error}
      </StepCard>
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
