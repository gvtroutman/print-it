import "server-only";
import sharp from "sharp";

/** Decode and re-encode raster uploads. SVGs, animation and metadata never reach the browser. */
export async function brandLogoUpload(file: File): Promise<string> {
  if (file.size > 256 * 1024) throw new Error("Use a PNG, JPEG or WebP logo under 256 KB.");
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 4_000_000, animated: true });
    const metadata = await input.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported logo.");
    const bytes = await input.rotate().resize(256, 128, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (bytes.length > 64 * 1024) throw new Error("Logo is too large.");
    return `data:image/webp;base64,${bytes.toString("base64")}`;
  } catch { throw new Error("Use a valid, still PNG, JPEG or WebP logo under 256 KB."); }
}
