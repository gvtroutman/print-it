import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

/**
 * Storage for model files: a directory on disk.
 *
 * This used to be MinIO behind the S3 API, and the S3 part was never doing any
 * work. Every byte is already proxied through `/api/models/[id]` — the
 * deployment publishes no port for object storage, so a signed URL would point
 * at something the browser cannot reach — and the app only ever made six
 * calls: head/create bucket, put, get, delete, copy. Those are `stat`, `mkdir`,
 * a write, a read, `unlink` and `copyFile`.
 *
 * What the object store cost in exchange was a container, a credential pair, a
 * healthcheck, two AWS SDK packages, and eventually a supply-chain problem:
 * MinIO withdrew its community images and binaries, so the project ended up
 * mirroring and then compiling its own. For five people and one printer,
 * putting a few hundred megabytes of STL onto a disk the app already has
 * mounted, that was a lot of machinery to keep alive.
 *
 * Bytes still never touch the web root, and a file is still only reachable
 * through the ownership check in `authz.ts`. That did not change: the route was
 * always the gate, and the storage layer was never the thing enforcing it.
 */

/**
 * Where files live. The compose files mount the host's `$DATA_ROOT/uploads`
 * here.
 *
 * Deliberately NOT `$DATA_ROOT/models`: that is MinIO's own data directory, and
 * writing plain files into an object store's layout is how the only copy of
 * something gets lost. The migration in `scripts/export-storage.ts` refuses to
 * do it, and this refuses to be pointed there by default.
 */
const ROOT = resolve(process.env.MODELS_ROOT ?? "/uploads");

// Shared with scripts/export-storage.ts — see storage-layout.ts for why.
import { DIR_MODE, FILE_MODE } from "@/lib/storage-layout";

/**
 * Storage keys are generated, never derived from the uploaded filename.
 *
 * A key built from user input is how path traversal and object overwrites
 * happen. The display name lives in the database column instead.
 */
export function storageKeyFor(extension: string, folder: "models" | "media" = "models"): string {
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // Picked from a fixed list, so nothing the uploader typed reaches the path.
  const ext = STORED_EXTENSION[extension] ?? "bin";
  return `${folder}/${yyyymm}/${randomUUID()}.${ext}`;
}

const STORED_EXTENSION: Record<string, string> = {
  ".stl": "stl", ".3mf": "3mf", ".obj": "obj", ".ply": "ply", ".amf": "amf",
  ".step": "step", ".stp": "stp", ".glb": "glb", ".gltf": "gltf",
  ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".webp": "webp", ".gif": "gif",
  ".mp4": "mp4", ".m4v": "m4v", ".mov": "mov", ".webm": "webm",
};

/**
 * A key resolved under ROOT, or a refusal.
 *
 * Keys are generated UUIDs, so this should never fire — but the value arrives
 * from a database column and the cost of being wrong is reading or writing
 * outside the volume. Resolved and compared rather than prefix-matched,
 * because the question is what a path parser will do with the string, which is
 * the same reasoning `src/lib/safe-redirect.ts` sets out at length.
 */
function pathFor(key: string): string {
  const full = resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error(`storage key escapes the root: ${JSON.stringify(key)}`);
  }
  return full;
}

export async function ensureStorageRoot(): Promise<void> {
  await mkdir(ROOT, { recursive: true, mode: DIR_MODE });
}

/**
 * Write bytes so a crash can never leave a half file under the real name.
 *
 * S3 gave atomicity away for free: an object appeared whole or not at all. A
 * filesystem does not, and the database row created straight afterwards will
 * claim the file is complete — so temp file, fsync, rename, and fsync the
 * directory entry too, or the rename can outlive the contents and a power cut
 * leaves a correctly-named empty model.
 */
async function writeAtomically(finalPath: string, write: (tmp: string) => Promise<void>) {
  await mkdir(dirname(finalPath), { recursive: true, mode: DIR_MODE });
  const tmp = `${finalPath}.tmp-${randomUUID()}`;
  try {
    await write(tmp);
    const fh = await open(tmp, "r+");
    await fh.sync();
    await fh.close();
    await rename(tmp, finalPath);
    // Windows will not fsync a directory handle (EPERM), and NTFS journals the
    // rename itself, so there is nothing to make durable there. Production is
    // Linux in Docker, where this sync is the step that keeps the rename.
    if (process.platform !== "win32") {
      const dh = await open(dirname(finalPath), "r");
      try {
        await dh.sync();
      } finally {
        await dh.close();
      }
    }
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export async function putModel(key: string, bytes: Uint8Array): Promise<void> {
  await writeAtomically(pathFor(key), async (tmp) => {
    const fh = await open(tmp, "wx", FILE_MODE);
    try {
      await fh.writeFile(bytes);
    } finally {
      await fh.close();
    }
  });
}

/**
 * The bytes, as a stream, with the length the caller needs for a header.
 *
 * Null when there is nothing there — the caller decides what a missing file
 * means, and for a story row that names one it means something is wrong, not
 * that the ticket is gone.
 */
export async function openModel(key: string): Promise<{ stream: Readable; size: number } | null> {
  const size = await storedSize(key);
  if (size === null) return null;
  return { stream: createReadStream(pathFor(key)), size };
}

/** The length of a stored file, or null when there is nothing there. */
export async function storedSize(key: string): Promise<number | null> {
  try {
    const info = await stat(pathFor(key));
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Part of a stored file, `start` to `end` inclusive — what a `Range` request
 * asks for. A video element seeks by asking for the bytes at that point, and
 * Safari will not play a video at all from a server that cannot answer one.
 */
export function openStoredRange(key: string, start: number, end: number): Readable {
  return createReadStream(pathFor(key), { start, end });
}

/** Idempotent, like `DeleteObject` was: gone already is not an error. */
export async function deleteModel(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}

/**
 * Copy one stored file to a new key, for re-queueing a print without
 * re-uploading. The copy is independent: the two stories own separate files,
 * so withdrawing one never removes the other's.
 */
export async function copyModel(srcKey: string, destKey: string): Promise<void> {
  const src = pathFor(srcKey);
  await writeAtomically(pathFor(destKey), async (tmp) => {
    await copyFile(src, tmp);
  });
}

/**
 * Content types for models, by extension — safe to go by the name here
 * because the bytes were already checked against it. Photos and videos take
 * theirs from `inspectMedia`, which reads the bytes.
 */
export const MIME_FOR: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".ply": "application/octet-stream",
  ".amf": "application/octet-stream",
  ".step": "model/step",
  ".stp": "model/step",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};
