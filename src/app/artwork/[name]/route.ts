import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ARTWORK_FILES } from "@/lib/artwork-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read on every request so saving the source file needs no build or restart. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const source = Object.hasOwn(ARTWORK_FILES, name) ? ARTWORK_FILES[name] : undefined;
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  if (!source) return new Response(null, { status: 404, headers });

  let bytes: Uint8Array<ArrayBuffer> | undefined;
  if (process.env.ARTWORK_ROOT) {
    try {
      bytes = new Uint8Array(await readFile(join(process.env.ARTWORK_ROOT, source)));
    } catch (error) {
      // An export may briefly disappear while its editor replaces it.
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  bytes ??= new Uint8Array(await readFile(join(process.cwd(), "public", name)));

  return new Response(bytes, { headers: {
    ...headers,
    "Content-Type": name.endsWith(".svg") ? "image/svg+xml" : "image/png",
    ...(name.endsWith(".svg") ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
  } });
}
