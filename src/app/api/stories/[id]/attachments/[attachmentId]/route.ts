import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import { db } from "@/lib/db";
import { currentUser, storyRef } from "@/lib/authz";
import { storyScope } from "@/lib/scope";
import { record } from "@/lib/audit";
import { openStoredRange, storedSize } from "@/lib/storage";

/**
 * The bytes of one file sent with an order — a photo, a video, another part.
 *
 * The same gate as `/api/models/[id]`: a session, then `storyScope` applied to
 * the story the attachment belongs to, so a client asking for a file on
 * somebody else's ticket gets the 404 a missing one would. Proxied from
 * `MODELS_ROOT` for the same reason, which keeps `img-src` and `media-src` at
 * 'self'.
 *
 * Two things differ from the model route, both because these are shown rather
 * than only downloaded:
 *
 *   - Photos and videos are served `inline`, so an <img> or <video> can use
 *     them. That is safe because their content type was decided from their
 *     bytes on upload (see `inspectMedia`) and `nosniff` is set app-wide, so
 *     the browser renders them as exactly that and nothing else. Models are
 *     always `attachment`, as before.
 *   - `Range` is answered. A video seeks by asking for the bytes at that
 *     point, and Safari will not play one at all from a server that cannot.
 *
 * Only an explicit download (`?download=1`) is written to the audit trail.
 * The page fetching a photo to show it — and a video fetching itself in
 * pieces — would bury the events the trail exists for.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  const storyId = Number(id);
  if (!Number.isInteger(storyId)) return new NextResponse(null, { status: 404 });

  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const attachment = await db.storyAttachment.findFirst({
    where: { id: attachmentId, story: { AND: [{ id: storyId }, storyScope(user)] } },
    select: {
      filename: true, kind: true, mimeType: true, storageKey: true,
      story: { select: { uploaderId: true } },
    },
  });

  if (!attachment) {
    await record({
      action: "file.refused",
      actor: user,
      subject: `story:${id}/attachment:${attachmentId.slice(0, 40)}`,
      detail: { reason: "not visible to this account" },
    });
    return new NextResponse(null, { status: 404 });
  }

  let size: number | null;
  try {
    size = await storedSize(attachment.storageKey);
  } catch (error) {
    console.error("[attachments] storage read failed", error);
    return new NextResponse(null, { status: 502 });
  }
  // 502, not 404, for the reason the model route gives: the row is real and
  // the caller may see it; the missing file is this side's problem.
  if (size === null) {
    console.error("[attachments] row names a file that is not on disk", attachment.storageKey);
    return new NextResponse(null, { status: 502 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const inline = !download && attachment.kind !== "model";

  if (download && attachment.story.uploaderId !== user.id) {
    await record({
      action: "file.downloaded",
      actor: user,
      subject: storyRef(storyId),
      detail: { filename: attachment.filename, attachment: true },
    });
  }

  const name = attachment.filename.replace(/["\\\r\n]/g, "");
  const headers: Record<string, string> = {
    "content-type": attachment.mimeType || "application/octet-stream",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }
  const [start, end] = range ?? [0, size - 1];
  const body = size === 0 ? null : (Readable.toWeb(openStoredRange(attachment.storageKey, start, end)) as ReadableStream<Uint8Array>);

  return new NextResponse(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "content-length": String(size === 0 ? 0 : end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

/**
 * A single `bytes=` range, clamped to the file. Multi-range requests are
 * answered with the whole file, which the spec allows and no player sends.
 */
function parseRange(header: string | null, size: number): [number, number] | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // A suffix: the last n bytes.
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return [start, end];
}
