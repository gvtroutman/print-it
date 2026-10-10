import { NextResponse } from "next/server";

import { currentUser } from "@/lib/authz";
import type { Actor } from "@/lib/scope";
import { checkWish, openRequest } from "@/lib/intake";
import { MAX_BYTES, REJECTION_COPY } from "@/lib/models";
import { StoryProblem } from "@/lib/stories";
import { MAX_FILES_PER_ORDER, MAX_REQUEST_BYTES, formatBytes } from "@/lib/upload-limits";
import { BUSY_COPY, acquireSlot, releaseSlot } from "@/lib/upload-slots";

/**
 * Opening a request from the form — with a model, or without one.
 *
 * A route handler rather than a server action, for one reason: the browser
 * can watch a real XHR upload progress bar against this, and a large model
 * over office wifi is long enough that a spinner is not good enough.
 *
 * This handler is the multipart door and nothing more: it takes the body
 * apart and hands a name and some bytes to `src/lib/intake.ts`, which decides
 * whether they become a ticket. Importing from a link is the other door onto
 * the same code.
 */

export const runtime = "nodejs";
/** The whole file is buffered to measure its bounding box; do not cache. See
 *  the slot gate below for what keeps that buffering bounded. */
export const dynamic = "force-dynamic";

const bad = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return bad(401, "Sign in first.");

  // Cheap rejection before reading a single byte of the body. The allowance
  // over the file cap is multipart's own overhead, and it matches the
  // transport limit in next.config.ts so that a file just over the cap is
  // answered "too large" rather than truncated into a parse failure.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) {
    return bad(413, REJECTION_COPY.too_large);
  }

  // Taken *before* the body is read, because reading it is the expensive part.
  // See `src/lib/upload-slots.ts` for what the gate is protecting.
  if (!(await acquireSlot())) return bad(503, BUSY_COPY);
  try {
    return await handleUpload(request, user);
  } catch (error) {
    if (error instanceof StoryProblem) return bad(error.status, error.message);
    console.error("[upload] unexpected failure", error);
    return bad(500, "The request could not be saved. Try again.");
  } finally {
    releaseSlot();
  }
}

async function handleUpload(request: Request, user: Actor) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, "That upload did not arrive intact. Try again.");
  }

  // The model is optional: a request can be a few words, and the owner can
  // ask for a file in the conversation. `intake.ts` refuses one that is empty.
  const entry = form.get("file");
  const file = entry instanceof File ? entry : null;
  if (file && file.size > MAX_BYTES) return bad(413, REJECTION_COPY.too_large);

  // Everything else that came with it: more parts, photos, videos. The cap is
  // on the whole order, not each file, because what it protects is memory and
  // the whole body is held at once.
  const extras = form.getAll("attachments").filter((v): v is File => v instanceof File);
  if (extras.length + (file ? 1 : 0) > MAX_FILES_PER_ORDER) {
    return bad(413, `Up to ${MAX_FILES_PER_ORDER} files per order, the model included.`);
  }
  const total = extras.reduce((sum, f) => sum + f.size, file?.size ?? 0);
  if (total > MAX_BYTES) {
    return bad(413, `Those files come to ${formatBytes(total)} — an order can carry ${formatBytes(MAX_BYTES)} in all.`);
  }

  const checked = await checkWish({
    title: form.get("title") ?? "",
    material: form.get("material"),
    colorName: form.get("colorName") ?? "",
    colorHex: form.get("colorHex") || null,
    swatchId: form.get("swatchId"),
    quantity: form.get("quantity"),
    priority: form.get("priority") ?? undefined,
    note: form.get("note") ?? "",
    printSettings: form.get("printSettings") ?? "",
    links: form.getAll("links"),
  });

  const main = file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
  const attachments = await Promise.all(
    extras.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  return NextResponse.json(await openRequest(user, checked, main, undefined, attachments));
}
