/**
 * Validation of the photos and videos sent with an order.
 *
 * The same stance as `models.ts`: the name is a claim and the bytes are the
 * evidence. Each accepted type is recognised by its signature, the name has to
 * agree with it, and the content type served back later is the one decided
 * here — never the one the browser sent. That matters more for media than for
 * models, because these are shown inline: a file that is really HTML must not
 * reach a browser labelled as something it will render.
 *
 * SVG is deliberately not accepted. It is an image format that can carry
 * script, and nobody needs vector art to explain a print.
 */
import { IMAGE_EXTENSIONS, MAX_UPLOAD_BYTES, VIDEO_EXTENSIONS, extensionOf, formatBytes } from "@/lib/upload-limits";

export type MediaRejection = "empty" | "too_large" | "bad_extension" | "not_media";

export const MEDIA_REJECTION_COPY: Record<MediaRejection, string> = {
  empty: "That file is empty.",
  too_large: `That file is over ${formatBytes(MAX_UPLOAD_BYTES)}.`,
  bad_extension: "Photos can be PNG, JPEG, WebP or GIF; videos MP4, MOV or WebM.",
  not_media: "That does not look like the photo or video its name says it is.",
};

export type MediaInspection =
  | { ok: true; kind: "image" | "video"; mimeType: string }
  | { ok: false; reason: MediaRejection };

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((byte, i) => b[i] === byte);

/** The real type, from the first bytes, with the extensions that may claim it. */
function sniff(bytes: Uint8Array): { mimeType: string; extensions: string[] } | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", extensions: [".png"] };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"] };
  }
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") {
    return { mimeType: "image/gif", extensions: [".gif"] };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extensions: [".webp"] };
  }
  // EBML header — Matroska, of which WebM is the profile browsers play.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mimeType: "video/webm", extensions: [".webm"] };
  }
  // ISO base media (MP4) and QuickTime share a box structure: a 4-byte size,
  // then a 4-byte type. MP4 always opens with `ftyp`; QuickTime usually does,
  // with the brand `qt  `, but older files open straight on a movie box.
  const box = ascii(bytes, 4, 8);
  if (box === "ftyp") {
    return ascii(bytes, 8, 12) === "qt  "
      ? { mimeType: "video/quicktime", extensions: [".mov"] }
      : { mimeType: "video/mp4", extensions: [".mp4", ".m4v", ".mov"] };
  }
  if (["moov", "mdat", "wide", "free", "skip"].includes(box)) {
    return { mimeType: "video/quicktime", extensions: [".mov"] };
  }
  return null;
}

export function inspectMedia(filename: string, bytes: Uint8Array): MediaInspection {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };

  const ext = extensionOf(filename);
  const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
  const isVideo = (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
  if (!isImage && !isVideo) return { ok: false, reason: "bad_extension" };

  const found = sniff(bytes);
  if (!found || !found.extensions.includes(ext)) return { ok: false, reason: "not_media" };

  return { ok: true, kind: isImage ? "image" : "video", mimeType: found.mimeType };
}
