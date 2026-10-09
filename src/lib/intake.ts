import "server-only";

import { db } from "@/lib/db";
import { notify, printerOwner, storyRef } from "@/lib/authz";
import type { Actor } from "@/lib/scope";
import { record } from "@/lib/audit";
import { WishSchema, type Wish } from "@/lib/catalog";
import { SELECTION_REFUSAL, resolveSelection, type Selection } from "@/lib/catalog-data";
import { REJECTION_COPY, extensionOf, inspectModel, safeFilename } from "@/lib/models";
import { MEDIA_REJECTION_COPY, inspectMedia } from "@/lib/media";
import { parseLinks } from "@/lib/links";
import { kindOf, type FileKind } from "@/lib/upload-limits";
import { MIME_FOR, deleteModel, ensureStorageRoot, putModel, storageKeyFor } from "@/lib/storage";
import { StoryProblem } from "@/lib/stories";
import type { ImportSource } from "@/lib/import-source";

/**
 * Opening a request from a model's bytes — the part an upload and an import
 * have in common, once.
 *
 * It lived in the upload route while that was the only way a model arrived.
 * Importing from a link is a second door onto the same thing, and the reason
 * `stories.ts` exists applies here unchanged: a rule that lives in the caller
 * holds only for the caller that remembered it. Both doors now hand over a
 * name and some bytes, and everything that decides whether those become a
 * ticket is below.
 *
 * Order matters. Nothing is written to storage until the bytes have been
 * inspected, and no story row exists until the file is in place — so a
 * rejected file leaves nothing behind, and a story never points at a file
 * that was not stored.
 */

const problem = (status: number, message: string) => new StoryProblem(status, message);

export type CheckedWish = {
  wish: Wish;
  selection: Selection;
  /** Cleaned, http(s) only, no repeats — see src/lib/links.ts. */
  links: string[];
};

/**
 * The wish, held to the rules — before any bytes are read or fetched.
 *
 * Separate from `openRequest` so each door can refuse a bad wish cheaply: an
 * import should not pull 200 MB across the internet to discover the colour is
 * off the shelf.
 */
export async function checkWish(raw: Record<string, unknown>): Promise<CheckedWish> {
  const parsed = WishSchema.safeParse(raw);
  if (!parsed.success) {
    throw problem(400, parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const wish = parsed.data;

  const resolved = await resolveSelection(wish);
  if (!resolved.ok) {
    const refusal = SELECTION_REFUSAL[resolved.reason];
    throw problem(refusal.status, refusal.message);
  }
  const selection = resolved.selection;

  let links: string[];
  try {
    links = parseLinks(Array.isArray(raw.links) ? raw.links : []);
  } catch (error) {
    throw problem(400, error instanceof Error ? error.message : "Check the links.");
  }

  return { wish, selection, links };
}

/** Where a model came from, when it did not come from the requester's disk. */
export type Origin = { source: ImportSource; url: string };

/** A file sent with the order, as it arrived. */
export type Incoming = { name: string; bytes: Uint8Array };

type Checked = {
  filename: string;
  kind: FileKind;
  mimeType: string;
  dims: string | null;
  key: string;
  bytes: Uint8Array;
};

/**
 * One attachment, held to the same evidence-over-names rule as the model: a
 * photo has to be a photo in its bytes, another model has to parse. Refusals
 * name the file, because with several in an order "that file" is not enough.
 */
async function checkAttachment(actor: Actor, incoming: Incoming): Promise<Checked> {
  const filename = safeFilename(incoming.name);
  const kind = kindOf(filename);
  const extension = extensionOf(filename);

  let refusal: { reason: string; copy: string } | null = null;
  let checked: Checked | null = null;

  if (kind === "model") {
    const inspection = inspectModel(filename, incoming.bytes);
    if (inspection.ok) {
      checked = {
        filename, kind, bytes: incoming.bytes, dims: inspection.dims,
        mimeType: MIME_FOR[extension] ?? "application/octet-stream",
        key: storageKeyFor(extension),
      };
    } else {
      refusal = { reason: inspection.reason, copy: REJECTION_COPY[inspection.reason] };
    }
  } else if (kind === "image" || kind === "video") {
    const inspection = inspectMedia(filename, incoming.bytes);
    if (inspection.ok) {
      checked = {
        filename, kind: inspection.kind, bytes: incoming.bytes, dims: null,
        mimeType: inspection.mimeType,
        key: storageKeyFor(extension, "media"),
      };
    } else {
      refusal = { reason: inspection.reason, copy: MEDIA_REJECTION_COPY[inspection.reason] };
    }
  } else {
    refusal = { reason: "bad_extension", copy: "That is not a 3D model, photo or video this app takes." };
  }

  if (checked) return checked;
  await record({
    action: "upload.rejected",
    actor,
    subject: filename,
    detail: { reason: refusal!.reason, bytes: incoming.bytes.length, attachment: true },
  });
  throw problem(422, `${filename}: ${refusal!.copy}`);
}

let storageReady: Promise<void> | null = null;

/** The title a ticket gets when the requester gave none. */
function fallbackTitle(wish: Wish, filename: string | null, attachments: Incoming[]): string {
  if (filename) return filename.replace(/\.[^.]+$/, "");
  const line = wish.note.split("\n").map((l) => l.trim()).find(Boolean);
  if (line) return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
  const first = attachments[0];
  if (first) return safeFilename(first.name).replace(/\.[^.]+$/, "");
  return "Print request";
}

/**
 * Inspect, store, open the ticket, tell the owner, write the trail.
 *
 * `main` is the model, or null for a request made of words (and perhaps
 * photos or links) alone — the owner can ask for a file in the conversation.
 * Its name is whatever the door was given — a browser's filename or the one a
 * model site lists — and is cleaned here, so neither door can forget to.
 */
export async function openRequest(
  actor: Actor,
  { wish, selection, links }: CheckedWish,
  main: Incoming | null,
  origin?: Origin,
  attachments: Incoming[] = [],
) {
  // Nothing at all is not a request. A few words are.
  if (!main && !wish.title && !wish.note && attachments.length === 0 && links.length === 0) {
    throw problem(400, "Say what you need — a few words is enough.");
  }

  const filename = main ? safeFilename(main.name) : null;
  const bytes = main?.bytes ?? null;

  // Authoritative check. Whatever the browser allowed through, and whatever a
  // model site says a file is, this is what decides — extension, size and
  // actual content all have to agree.
  const inspection = filename && bytes ? inspectModel(filename, bytes) : null;
  if (inspection && !inspection.ok) {
    // A refused file creates no story, so it gets its own verb. Repeated
    // rejections from one account are worth being able to see.
    await record({
      action: "upload.rejected",
      actor,
      subject: filename!,
      detail: {
        reason: inspection.reason,
        bytes: bytes!.length,
        ...(origin ? { source: origin.source, sourceUrl: origin.url } : {}),
      },
    });
    throw problem(422, REJECTION_COPY[inspection.reason]);
  }
  const measured = inspection?.ok ? inspection : null;

  // Every attachment is checked before anything is written, so one bad photo
  // refuses the order whole rather than leaving half of it on the disk.
  const extras: Checked[] = [];
  for (const incoming of attachments) extras.push(await checkAttachment(actor, incoming));

  const extension = filename ? extensionOf(filename) : null;
  const key = extension !== null ? storageKeyFor(extension) : null;

  const written: string[] = [];
  const removeWritten = async () => {
    for (const k of written) await deleteModel(k).catch(() => undefined);
  };
  try {
    storageReady ??= ensureStorageRoot();
    await storageReady;
    // Noted before each write, not after: a write can fail after its file is
    // already in place, and removing a key that was never written is a no-op.
    if (key && bytes) {
      written.push(key);
      await putModel(key, bytes);
    }
    for (const extra of extras) {
      written.push(extra.key);
      await putModel(extra.key, extra.bytes);
    }
  } catch (error) {
    storageReady = null; // let the next attempt retry creating the directory
    console.error("[intake] storage write failed", error);
    await removeWritten();
    throw problem(502, "The file could not be stored. Try again in a moment.");
  }

  const title = wish.title || fallbackTitle(wish, filename, attachments);

  let story;
  try {
    story = await db.story.create({
      data: {
        title,
        uploaderId: actor.id,
        status: "Requested",
        quantity: wish.quantity,
        priority: wish.priority,
        material: wish.material,
        colorName: selection.colorName,
        colorHex: selection.hex,
        colorStyle: selection.style,
        colorMode: selection.mode,
        // A spool the owner has to buy first; left null for a shelf colour.
        ...selection.toBuy,
        note: wish.note,
        printSettings: wish.printSettings,
        filename,
        fileSize: bytes?.length ?? null,
        mimeType: extension !== null ? MIME_FOR[extension] ?? "application/octet-stream" : null,
        storageKey: key,
        dims: measured?.dims ?? null,
        sourceUrl: origin?.url ?? null,
        links,
        attachments: {
          create: extras.map((extra, i) => ({
            kind: extra.kind,
            filename: extra.filename,
            fileSize: extra.bytes.length,
            mimeType: extra.mimeType,
            storageKey: extra.key,
            dims: extra.dims,
            sortOrder: i,
          })),
        },
      },
    });
  } catch (error) {
    console.error("[intake] story insert failed", error);
    // No row points at them, so nothing ever would read them again.
    await removeWritten();
    throw problem(500, "The request could not be saved. Try again.");
  }

  // "every upload notifies the admin"
  const admin = await printerOwner();
  if (admin) {
    await notify({
      recipientId: admin.id,
      storyId: story.id,
      text: origin
        ? `${actor.name} imported “${title}”.`
        : filename
          ? `${actor.name} uploaded “${title}”.`
          : `${actor.name} asked for “${title}”.`,
    });
  }

  await record({
    action: "story.created",
    actor,
    subject: storyRef(story.id),
    detail: {
      title,
      ...(measured
        ? {
            filename,
            bytes: bytes!.length,
            format: measured.format,
            triangles: measured.triangles,
            dims: measured.dims,
          }
        : { model: false }),
      material: wish.material,
      quantity: wish.quantity,
      ...(selection.toBuy ? { spoolToBuy: selection.toBuy.swatchId } : {}),
      ...(extras.length ? { attachments: extras.map((e) => `${e.kind}:${e.filename}`) } : {}),
      ...(links.length ? { links: links.length } : {}),
      ...(origin ? { source: origin.source, sourceUrl: origin.url } : {}),
    },
  });

  return { id: story.id, ref: storyRef(story.id), title, dims: measured?.dims ?? null };
}
