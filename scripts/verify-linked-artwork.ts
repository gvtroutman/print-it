import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GET } from "../src/app/artwork/[name]/route";
import { ARTWORK, ARTWORK_FILES } from "../src/lib/artwork-assets";

const root = await mkdtemp(join(tmpdir(), "print-it-artwork-"));
const previousRoot = process.env.ARTWORK_ROOT;
const request = (name: string) => GET(new Request(`http://localhost/artwork/${encodeURIComponent(name)}`), {
  params: Promise.resolve({ name }),
});

try {
  delete process.env.ARTWORK_ROOT;
  assert.equal(Object.keys(ARTWORK).length, 3, "The existing brand artwork mappings remain available");
  for (const name of Object.keys(ARTWORK_FILES)) {
    const response = await request(name);
    assert.equal(response.status, 200, "Every bundled image works without a mount");
    assert.equal(response.headers.get("Content-Type"), name.endsWith(".svg") ? "image/svg+xml" : "image/png");
    assert.match(response.headers.get("Cache-Control")!, /no-store/);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    if (name.endsWith(".svg")) assert.match(response.headers.get("Content-Security-Policy")!, /sandbox/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(join("public", name)));
  }

  process.env.ARTWORK_ROOT = root;
  const first = await readFile("public/print-it-star.png");
  const edited = await readFile("public/print-it-wordmark-straight.png");
  for (const [name, source] of Object.entries(ARTWORK_FILES)) {
    const path = join(root, source);
    await mkdir(dirname(path), { recursive: true });
    const originalBytes = name.endsWith(".svg") ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>') : first;
    const editedBytes = name.endsWith(".svg") ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="20"/></svg>') : edited;
    await writeFile(path, originalBytes);
    assert.deepEqual(Buffer.from(await (await request(name)).arrayBuffer()), originalBytes);
    await writeFile(`${path}.new`, editedBytes);
    await rename(`${path}.new`, path);
    const response = await request(name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), editedBytes, "The same URL reads a saved replacement immediately");
    assert.match(response.headers.get("Cache-Control")!, /no-store/);
    await rm(path);
    assert.deepEqual(Buffer.from(await (await request(name)).arrayBuffer()), await readFile(join("public", name)),
      "A missing export falls back to its own bundled image");
  }

  await writeFile(join(root, "private.png"), edited);
  for (const name of ["private.png", "../private.png", "Asset 6.2.png", "constructor", "__proto__", "sticker-unknown.svg", "sync-status.json", "stickers/first-print.svg"]) {
    const response = await request(name);
    assert.equal(response.status, 404, "Only mapped image names are public");
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  process.env.ARTWORK_ROOT = join(root, "missing-directory");
  assert.deepEqual(Buffer.from(await (await request("print-it-star.png")).arrayBuffer()), first);
  console.log("Linked artwork passed: all brand/sticker mappings, live replacements, SVG/PNG content types, cache headers, missing-file fallbacks, and unmapped-file isolation.");
} finally {
  if (previousRoot === undefined) delete process.env.ARTWORK_ROOT;
  else process.env.ARTWORK_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
}
