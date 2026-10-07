"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_STORY_PRIORITY,
  PRIORITY_CHIP,
  QUANTITY_PRESETS,
  STORY_PRIORITIES,
  type CatalogMaterialChoice,
  type StoryPriorityName,
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
  MODEL_FORMATS_TEXT,
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
import { ColorSwatch } from "@/components/color-swatch";

/**
 * An old ticket being printed again. When this is given the form has no
 * dropzone — the file is the old ticket's, copied on the server — and opens
 * with that ticket's wish filled in, ready to be changed.
 */
export type Again = {
  id: number;
  ref: string;
  filename: string;
  fileSize: number;
  title: string;
  material: string;
  colorName: string;
  quantity: number;
  priority: StoryPriorityName;
  note: string;
  printSettings: string;
};

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
  | { kind: "looking" }
  | { kind: "listed"; url: string; listing: Listing; fileId: string | null };

/** Segmented control. Handoff §3: track #eaecee, 3px inset, 6px options. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  mono = false,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  mono?: boolean;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-[6px]"
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`flex-1 cursor-pointer rounded-chip border-[3px] border-ink px-[10px] py-[8px] font-mono text-[12.5px] font-bold uppercase tracking-[0.06em] transition-colors ${
              active
                ? "bg-cherry-dk text-cream"
                : "bg-porcelain text-ink hover:bg-sun"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
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
  // Printing again starts from what was asked for last time — where that is
  // still on the shelf. A material or colour the owner has since
  // retired falls back to the usual default, and `gone` says which, because a
  // choice that quietly changed under someone is one they will not notice
  // until the print arrives.
  const wanted = catalog.find((item) => item.name === again?.material);
  const initialMaterial = wanted ?? catalog.find((item) => item.name === "PETG") ?? catalog[0]!;
  const wantedColor = wanted?.colors.find((item) => item.name === again?.colorName);
  const initialColor = wantedColor ?? initialMaterial.colors.find((item) => item.name === "Slate") ?? initialMaterial.colors[0]!;
  const gone = again
    ? [
        !wanted ? again.material : !wantedColor ? `${again.material} in ${again.colorName}` : null,
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
  // Reference links sent with the order — not the import link above.
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const primary = files.find((f) => kindOf(f.name) === "model") ?? null;
  const extras = files.filter((f) => f !== primary);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const [title, setTitle] = useState(again?.title ?? "");
  const [material, setMaterial] = useState<string>(initialMaterial.name);
  const [quantity, setQuantity] = useState<number>(again?.quantity ?? 1);
  // What is in the "type a number" box while it is being typed in, or null
  // when it simply shows `quantity`. Kept apart from the number because a box
  // being edited passes through states that are not quantities — empty, most
  // obviously. Coercing each keystroke turned an emptied box straight back
  // into "1", so clearing it to type 3 produced 13.
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const [priority, setPriority] = useState<StoryPriorityName>(again?.priority ?? DEFAULT_STORY_PRIORITY);
  const [color, setColor] = useState<string>(initialColor.name);
  const [note, setNote] = useState(again?.note ?? "");
  const [printSettings, setPrintSettings] = useState(again?.printSettings ?? "");

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

  function addLink() {
    const parsed = parseLink(linkDraft);
    if (!parsed.ok) return setLinkError(parsed.error);
    if (links.includes(parsed.href)) return setLinkError("That link is already on the order.");
    if (links.length >= MAX_LINKS_PER_ORDER) {
      return setLinkError(`Up to ${MAX_LINKS_PER_ORDER} links per order.`);
    }
    setLinks([...links, parsed.href]);
    setLinkDraft("");
    setLinkError(null);
  }

  const sourceNames = importSources.map((s) => SOURCE_LABEL[s]).join(" or ");
  const picked =
    linked.kind === "listed"
      ? linked.listing.files.find((f) => f.id === linked.fileId) ?? null
      : null;

  /**
   * Ask the server what the link holds. The browser never talks to the model
   * site itself — `connect-src 'self'` would refuse it, and the server is the
   * one that has to fetch the file anyway.
   */
  async function lookUp() {
    const url = link.trim();
    if (!url || linked.kind === "looking") return;
    // The same parse the server makes, for an answer before the round trip.
    if (!identifySource(url, importSources)) {
      setLinked({ kind: "idle" });
      return setPhase({ kind: "error", message: `That is not a link to a model on ${sourceNames}.` });
    }
    setPhase({ kind: "idle" });
    setLinked({ kind: "looking" });
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
          url, fileId, title, material, colorName: color, quantity, priority, note, printSettings, links,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setPhase({ kind: "error", message: body.error ?? "That did not go through. Try again." });
      }
      const id: number | null = body.story?.id ?? null;
      router.push(id === null ? "/board" : `/story/${id}?sent=1`);
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
        body: JSON.stringify({ title, material, colorName: color, quantity, priority, note, printSettings }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setPhase({ kind: "error", message: body.error ?? "That did not go through. Try again." });
      }
      const id: number | null = body.story?.id ?? null;
      router.push(id === null ? "/board" : `/story/${id}?sent=1`);
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "The connection dropped. Try again." });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind === "uploading") return;
    // Enter in the quantity box submits without blurring it; show what is
    // actually being sent rather than a half-typed draft.
    setQuantityDraft(null);
    if (again) return void sendAgain(again);
    if (linked.kind === "listed" && picked) {
      // An import is fetched by the server from two ids; there is no upload
      // for files from this disk to travel in.
      if (files.length > 0) {
        return setPhase({
          kind: "error",
          message:
            "Photos and videos can't come along with an imported model yet. Remove them, " +
            "or download the model and drop it here with them.",
        });
      }
      return void sendImport(linked.url, picked.id);
    }
    if (!primary) return;

    const body = new FormData();
    body.set("file", primary);
    for (const extra of extras) body.append("attachments", extra);
    for (const l of links) body.append("links", l);
    body.set("title", title);
    body.set("material", material);
    body.set("colorName", color);
    body.set("quantity", String(quantity));
    body.set("priority", priority);
    body.set("note", note);
    body.set("printSettings", printSettings);

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
        router.push(id === null ? "/board" : `/story/${id}?sent=1`);
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
  const selectedMaterial = catalog.find((item) => item.name === material) ?? catalog[0]!;

  function chooseMaterial(next: string) {
    const item = catalog.find((candidate) => candidate.name === next);
    if (!item) return;
    setMaterial(item.name);
    setColor((item.colors.find((candidate) => candidate.name === "Slate") ?? item.colors[0]!).name);
  }

  return (
    <form onSubmit={submit} className="max-w-[780px]">
      {again && (
        <div className="rounded-panel border-[3px] border-ink bg-porcelain px-[22px] py-[17.6px] shadow-stamp">
          <p className="m-0 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Same file as {again.ref} — no re-upload
          </p>
          <p className="m-0 mt-[4px] break-words font-display text-[19px] text-ink">{again.filename}</p>
          <p className="m-0 mt-[3px] font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
            {formatBytes(again.fileSize)} · change anything below, or send it as it was
          </p>
        </div>
      )}
      {gone.length > 0 && (
        <div className="mt-[13.2px]">
          <Notice tone="warn">
            {gone.join(" and ")} {gone.length === 1 ? "is" : "are"} not on offer any more, so
            that has been set to something that is. Check it before you send.
          </Notice>
        </div>
      )}

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
        className={`block cursor-pointer rounded-panel border-[3px] border-dashed px-[26.4px] py-[35.2px] text-center transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-cherry-dk ${
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
        <span
          aria-hidden
          className="mx-auto mb-[13.2px] block h-[56px] w-[56px] rounded-full border-[3px] border-ink bg-aqua"
        />
        <span className="block font-display text-[19px] text-ink">
          {files.length > 0 ? "Drop more, or click to add" : "Drop your 3D model here — and any photos or videos"}
        </span>
        <span className="mt-[6px] block font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
          {busy && !picked
            ? `Uploading… ${phase.percent}%`
            : files.length > 0
              ? `${formatBytes(totalBytes)} of ${formatBytes(MAX_UPLOAD_BYTES)} · checked on the server when you send it`
              : `or click to choose · ${MODEL_FORMATS_TEXT} · photos · videos · ${formatBytes(MAX_UPLOAD_BYTES)} in all`}
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
      {!again && files.length > 0 && !primary && linked.kind !== "listed" && (
        <p className="m-0 mt-[8.8px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-cherry-dk">
          Add a 3D model too — photos and videos go with a model, not instead of one.
        </p>
      )}

      {/* ---- links that explain the job ---- */}
      {!again && (
        <div className="mt-[17.6px]">
          <Label htmlFor="order-link">Links (optional)</Label>
          <div className="flex flex-wrap gap-[8.8px]">
            <input
              id="order-link"
              type="url"
              inputMode="url"
              value={linkDraft}
              disabled={busy}
              onChange={(e) => {
                setLinkDraft(e.target.value);
                setLinkError(null);
              }}
              // Enter adds the link; it does not send the order.
              onKeyDown={(e) => {
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
              onClick={addLink}
            >
              Add link
            </Button>
          </div>
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
          <p className="m-0 mt-[6px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
            Anything that shows {owner} what it is for · up to {MAX_LINKS_PER_ORDER}
          </p>
        </div>
      )}

      {/* ---- or a link (only where the instance has switched importing on) ---- */}
      {!again && importSources.length > 0 && (
        <div className="mt-[17.6px]">
          <Label htmlFor="import-link">Or paste a {sourceNames} link</Label>
          <div className="flex flex-wrap gap-[8.8px]">
            <input
              id="import-link"
              type="url"
              inputMode="url"
              value={link}
              disabled={busy}
              onChange={(e) => setLink(e.target.value)}
              // Enter here means "look this up", not "send the request": the
              // form is not ready to send until a file has been picked.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void lookUp();
              }}
              placeholder="https://www.printables.com/model/…"
              className="min-w-[240px] flex-1 rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy || linked.kind === "looking" || !link.trim()}
              onClick={() => void lookUp()}
            >
              {linked.kind === "looking" ? "Looking…" : "Find the files"}
            </Button>
          </div>

          {linked.kind === "listed" && (
            <div
              aria-live="polite"
              className="mt-[13.2px] rounded-panel border-[3px] border-ink bg-porcelain px-[22px] py-[17.6px] shadow-stamp"
            >
              <p className="m-0 break-words font-display text-[19px] text-ink">{linked.listing.model.name}</p>
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

      {phase.kind === "error" && (
        <div className="mt-[13.2px]">
          <Notice tone="warn">{phase.message}</Notice>
        </div>
      )}

      {/* ---- title + material ---- */}
      <div className="mt-[26.4px] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[22px]">
        <div>
          <Label htmlFor="title">What is it?</Label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Hook for the monitor arm"
            className="w-full rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[16px] text-ink placeholder:text-ink-3"
          />
        </div>
        <div>
          <Label htmlFor="material">Material you&rsquo;d like</Label>
          <Segmented
            label="Material"
            options={catalog.map((item) => item.name)}
            value={material}
            onChange={chooseMaterial}
          />
        </div>
      </div>

      {/* ---- quantity ---- */}
      <div className="mt-[22px] max-w-[320px]">
        <Label htmlFor="quantity">How many do you need?</Label>
        <Segmented
          label="Quantity"
          mono
          options={QUANTITY_PRESETS}
          value={QUANTITY_PRESETS.includes(quantity as never) ? quantity : 0}
          onChange={(n) => {
            setQuantityDraft(null);
            setQuantity(n);
          }}
        />
        <div className="mt-[8.8px] flex items-center gap-[8.8px]">
          <label htmlFor="quantity-other" className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink-3">
            or type a number
          </label>
          <input
            id="quantity-other"
            type="number"
            min={1}
            max={24}
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
            className="w-[80px] rounded-card border-[3px] border-ink bg-porcelain px-[10px] py-[6px] font-mono text-[14px] font-bold tabular-nums text-ink"
          />
        </div>
      </div>

      {/* ---- priority ---- */}
      <div className="mt-[22px] max-w-[420px]">
        <Label htmlFor="priority">How much does it matter?</Label>
        <div role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-[6px]">
          {STORY_PRIORITIES.map((p) => {
            const active = p === priority;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPriority(p)}
                className={`flex-1 cursor-pointer rounded-chip border-[3px] border-ink px-[10px] py-[8px] font-mono text-[12.5px] font-bold uppercase tracking-[0.06em] transition-colors ${
                  active ? "bg-cherry-dk text-cream" : "bg-porcelain text-ink hover:bg-sun"
                }`}
              >
                {PRIORITY_CHIP[p]?.label ?? p}
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-[8.8px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
          {owner} sees the urgent ones first. You can change it later.
        </p>
      </div>

      {/* ---- colour ---- */}
      <fieldset className="mt-[22px] border-0 p-0">
        <legend className="mb-[8.8px] font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2">
          Color you&rsquo;re hoping for
        </legend>
        <div className="flex flex-wrap gap-[13.2px]">
          {selectedMaterial.colors.map((c) => {
            const active = c.name === color;
            return (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${c.name} filament`}
                onClick={() => setColor(c.name)}
                className="flex w-[80px] cursor-pointer flex-col items-center gap-[7px] border-0 bg-transparent p-0"
              >
                <ColorSwatch
                  mode={c.mode}
                  style={c.style}
                  className={`h-[48px] w-[48px] rounded-full border-[3px] border-ink transition-transform ${
                    active ? "scale-110 ring-[4px] ring-cherry-dk ring-offset-2 ring-offset-cream" : ""
                  }`}
                />
                <span
                  className={`font-mono text-[11px] font-bold uppercase tracking-[0.04em] ${
                    active ? "text-cherry-dk" : "text-ink-2"
                  }`}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-[11px] font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
          {owner} confirms what&rsquo;s actually on the spool.
        </p>
      </fieldset>

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

      {/* ---- print settings (optional, FRR-103) ---- */}
      <div className="mt-[22px]">
        <Label htmlFor="printSettings">Print settings (optional)</Label>
        <textarea
          id="printSettings"
          rows={3}
          value={printSettings}
          onChange={(e) => setPrintSettings(e.target.value)}
          maxLength={2000}
          placeholder="Any specific slicer settings: layer height, infill, supports, temps…"
          className="w-full resize-y rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] font-mono text-[15px] text-ink placeholder:text-ink-3"
        />
        <p className="m-0 mt-[6px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
          Comes with some files — saves a round of messages with {owner}.
        </p>
      </div>

      {/* ---- actions ---- */}
      <div className="mt-[26.4px] flex flex-wrap items-center gap-[13.2px]">
        <Button type="submit" disabled={(!primary && !again && !picked) || busy} className="px-[30px]">
          {busy
            ? again ? "Sending…" : picked ? "Fetching it…" : `Sending… ${phase.percent}%`
            : again ? `Send it to ${owner} again` : `Send it to ${owner}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(again ? `/story/${again.id}` : "/board")}
        >
          Cancel
        </Button>
        {!primary && !again && !picked && (
          <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink-3">Add a 3D model to continue.</span>
        )}
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
