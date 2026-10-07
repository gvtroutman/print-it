/**
 * Checks the upload validator against generated fixtures, including files
 * built specifically to get past it.
 *
 *   npm run verify:models
 *
 * No server and no database — this exercises `src/lib/models.ts` directly, so
 * it runs in under a second and can sit in a pre-commit hook.
 */
import { zipSync, zlibSync } from "fflate";
import {
  inspectModel,
  formatBytes,
  safeFilename,
  MAX_BYTES,
  type Rejection,
} from "../src/lib/models";
import { inspectMedia } from "../src/lib/media";
import { parseLink, parseLinks, displayLink } from "../src/lib/links";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail: string | null = "") {
  console.info(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
  ok ? passed++ : failures.push(name);
}
const section = (t: string) => console.info(`\n── ${t} ${"─".repeat(Math.max(0, 52 - t.length))}`);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The 12 triangles of an axis-aligned box from the origin to (x, y, z). */
function boxTriangles(x: number, y: number, z: number): number[][] {
  const p = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], // bottom
    [4, 6, 5], [4, 7, 6], // top
    [0, 4, 5], [0, 5, 1], // front
    [1, 5, 6], [1, 6, 2], // right
    [2, 6, 7], [2, 7, 3], // back
    [3, 7, 4], [3, 4, 0], // left
  ];
  return faces.map((f) => f.flatMap((i) => p[i]!));
}

function binaryStl(x: number, y: number, z: number, header = "generated"): Uint8Array {
  const tris = boxTriangles(x, y, z);
  const buf = new Uint8Array(84 + tris.length * 50);
  const view = new DataView(buf.buffer);
  new TextEncoder().encodeInto(header, buf.subarray(0, 80));
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const t of tris) {
    // normal left at 0,0,0 — slicers recompute it anyway
    for (let i = 0; i < 9; i++) view.setFloat32(off + 12 + i * 4, t[i]!, true);
    off += 50;
  }
  return buf;
}

function asciiStl(x: number, y: number, z: number): Uint8Array {
  const tris = boxTriangles(x, y, z);
  let s = "solid generated\n";
  for (const t of tris) {
    s += "  facet normal 0 0 0\n    outer loop\n";
    for (let v = 0; v < 3; v++) {
      s += `      vertex ${t[v * 3]} ${t[v * 3 + 1]} ${t[v * 3 + 2]}\n`;
    }
    s += "    endloop\n  endfacet\n";
  }
  return new TextEncoder().encode(s + "endsolid generated\n");
}

function threeMf(x: number, y: number, z: number, unit = "millimeter"): Uint8Array {
  const p = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
  ];
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="${unit}" xml:lang="en-US">\n<resources><object id="1" type="model"><mesh>\n<vertices>\n` +
    p.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join("\n") +
    `\n</vertices>\n<triangles>\n` +
    boxTriangles(1, 1, 1).map((_, i) => `<triangle v1="0" v2="1" v3="2" i="${i}"/>`).join("\n") +
    `\n</triangles>\n</mesh></object></resources>\n</model>`;
  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode(`<?xml version="1.0"?><Types/>`),
    "3D/3dmodel.model": new TextEncoder().encode(model),
  });
}

/**
 * A 3MF in the shape the *production extension* emits: the root part carries no
 * geometry of its own, only a component that references a mesh in a separate
 * `3D/Objects/*.model` part. Bambu Studio, OrcaSlicer multi-object plates and
 * several CAD exporters write this — and it was being refused because the
 * validator read only the root part. Regression guard for that bug.
 */
function threeMfProduction(x: number, y: number, z: number): Uint8Array {
  const p = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
  ];
  const objectPart =
    `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter">\n<resources>` +
    `<object id="2" type="model"><mesh><vertices>` +
    p.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join("") +
    `</vertices><triangles>` +
    boxTriangles(1, 1, 1).map(() => `<triangle v1="0" v2="1" v3="2"/>`).join("") +
    `</triangles></mesh></object></resources>\n</model>`;
  const root =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">\n` +
    `<resources><object id="1" type="model"><components>` +
    `<component objectid="2" p:path="/3D/Objects/object_1.model"/>` +
    `</components></object></resources><build><item objectid="1"/></build>\n</model>`;
  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode(`<?xml version="1.0"?><Types/>`),
    "3D/3dmodel.model": new TextEncoder().encode(root),
    "3D/Objects/object_1.model": new TextEncoder().encode(objectPart),
  });
}

/**
 * A 3MF in the shape Cura writes: the mesh is stored in a scaled-down local
 * space and the real size lives in the `<build>` `<item>` transform. Reading
 * the raw vertices reports a box a thousandth of the true size — the bug that
 * showed real models as "0 × 0 × 0 mm". The item here scales by 1000, so a
 * mesh spanning `dim/1000` locally must come back as `dim` millimetres.
 */
function threeMfScaled(x: number, y: number, z: number): Uint8Array {
  const s = 1000;
  const p = [
    [0, 0, 0], [x / s, 0, 0], [x / s, y / s, 0], [0, y / s, 0],
    [0, 0, z / s], [x / s, 0, z / s], [x / s, y / s, z / s], [0, y / s, z / s],
  ];
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter">\n<resources>` +
    `<object id="1" type="model"><mesh><vertices>` +
    p.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join("") +
    `</vertices><triangles>` +
    boxTriangles(1, 1, 1).map(() => `<triangle v1="0" v2="1" v3="2"/>`).join("") +
    `</triangles></mesh></object></resources>` +
    `<build><item objectid="1" transform="${s} 0 0 0 ${s} 0 0 0 ${s} 0 0 0"/></build>\n</model>`;
  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode(`<?xml version="1.0"?><Types/>`),
    "3D/3dmodel.model": new TextEncoder().encode(model),
  });
}

const ok = (r: ReturnType<typeof inspectModel>) => (r.ok ? r : null);
const why = (r: ReturnType<typeof inspectModel>): Rejection | "accepted" =>
  r.ok ? "accepted" : r.reason;

// ---------------------------------------------------------------------------

section("legitimate files are measured correctly");

const bin = inspectModel("hook.stl", binaryStl(78, 40, 22));
check("binary STL accepted", bin.ok, why(bin));
check("binary STL dimensions match the mesh", ok(bin)?.dims === "78 × 40 × 22 mm", ok(bin)?.dims);
check("binary STL triangle count is right", ok(bin)?.triangles === 12, String(ok(bin)?.triangles));

const asc = inspectModel("hook.stl", asciiStl(120, 18, 12));
check("ASCII STL accepted", asc.ok, why(asc));
check("ASCII STL dimensions match the mesh", ok(asc)?.dims === "120 × 18 × 12 mm", ok(asc)?.dims);

const mf = inspectModel("sign.3mf", threeMf(160, 60, 8));
check("3MF accepted", mf.ok, why(mf));
check("3MF dimensions match the mesh", ok(mf)?.dims === "160 × 60 × 8 mm", ok(mf)?.dims);

const inches = inspectModel("sign.3mf", threeMf(1, 2, 4, "inch"));
check("3MF unit attribute is honoured (inch -> mm)",
      ok(inches)?.dims === "25 × 51 × 102 mm", ok(inches)?.dims);

const microns = inspectModel("tiny.3mf", threeMf(10000, 20000, 5000, "micron"));
check("3MF micron unit is honoured", ok(microns)?.dims === "10 × 20 × 5 mm", ok(microns)?.dims);

// The bug this guards: a production-extension 3MF (geometry in a separate
// component part) was refused because only the root part was read.
const prod = inspectModel("plate.3mf", threeMfProduction(30, 20, 10));
check("3MF production extension accepted (geometry in a component part)", prod.ok, why(prod));
check("its dimensions come from the referenced part",
      ok(prod)?.dims === "30 × 20 × 10 mm", ok(prod)?.dims);

// The bug this guards: a Cura-style 3MF measured 0 × 0 × 0 because the size
// lived in the build item's transform, which was not applied.
const scaled = inspectModel("cura.3mf", threeMfScaled(30, 20, 10));
check("3MF build-item transform is applied (not 0 × 0 × 0)",
      ok(scaled)?.dims === "30 × 20 × 10 mm", ok(scaled)?.dims);

// A binary STL whose 80-byte header begins with the word "solid" — the classic
// way a naive sniffer misreads the format.
const trap = inspectModel("trap.stl", binaryStl(30, 30, 30, "solid but actually binary"));
check("a binary STL with a 'solid' header is not mistaken for ASCII",
      ok(trap)?.dims === "30 × 30 × 30 mm", ok(trap)?.dims);

section("hostile and malformed files are refused");

const cases: Array<[string, string, Uint8Array, Rejection]> = [
  ["an empty file", "x.stl", new Uint8Array(0), "empty"],
  ["a PDF renamed to .stl", "invoice.stl",
    new TextEncoder().encode("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n1 0 obj"), "not_a_model"],
  ["an ELF binary renamed to .stl", "payload.stl",
    new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, ...new Array(200).fill(0)]), "not_a_model"],
  ["an HTML file renamed to .stl", "page.stl",
    new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>"), "not_a_model"],
  ["a .exe", "tool.exe", binaryStl(10, 10, 10), "bad_extension"],
  ["no extension at all", "model", binaryStl(10, 10, 10), "bad_extension"],
  ["a zip that is not a 3MF", "archive.3mf",
    zipSync({ "readme.txt": new TextEncoder().encode("nothing here") }), "not_a_model"],
  ["a 3MF whose model part has no vertices", "hollow.3mf",
    zipSync({ "3D/3dmodel.model": new TextEncoder().encode('<?xml version="1.0"?><model/>') }),
    "not_a_model"],
];

for (const [label, name, bytes, expected] of cases) {
  const r = inspectModel(name, bytes);
  check(`${label} is refused`, !r.ok && r.reason === expected, `got "${why(r)}", expected "${expected}"`);
}

// An STL that lies about its triangle count: the structural size check is what
// catches this, since 84 + count*50 will not equal the real length.
const liar = binaryStl(20, 20, 20);
new DataView(liar.buffer).setUint32(80, 5_000_000, true);
const liarResult = inspectModel("liar.stl", liar);
check("an STL lying about its triangle count is refused",
      !liarResult.ok && liarResult.reason === "not_a_model", why(liarResult));

// Extension and content must agree even when both are printable formats.
const mismatch = inspectModel("mislabelled.3mf", binaryStl(20, 20, 20));
check("an STL renamed to .3mf is refused", !mismatch.ok, why(mismatch));
const mismatch2 = inspectModel("mislabelled.stl", threeMf(20, 20, 20));
check("a 3MF renamed to .stl is refused", !mismatch2.ok, why(mismatch2));

// Path traversal via the archive member name must not reach the filesystem —
// nothing is ever written from the archive, but the member must not be picked
// up as the model part either.
const traversal = zipSync({
  "../../../../etc/3dmodel.model": new TextEncoder().encode('<?xml version="1.0"?><model/>'),
});
const traversalResult = inspectModel("evil.3mf", traversal);
check("a 3MF with a traversal path in its member name is refused",
      !traversalResult.ok, why(traversalResult));

section("resource limits hold");

const oversize = new Uint8Array(MAX_BYTES + 1);
oversize.set([0x50, 0x4b, 0x03, 0x04]);
const big = inspectModel("huge.stl", oversize);
check("a file over 50 MB is refused before parsing",
      !big.ok && big.reason === "too_large", why(big));

// A zip bomb: a small archive that inflates enormously. The guard has to fire
// on the declared uncompressed size, before the bytes are actually inflated.
const bombPayload = new Uint8Array(400 * 1024 * 1024);
const bomb = zipSync({ "3D/3dmodel.model": zlibSync(bombPayload, { level: 9 }) });
const t0 = Date.now();
const bombResult = inspectModel("bomb.3mf", bomb);
const elapsed = Date.now() - t0;
check("a zip bomb is refused", !bombResult.ok, why(bombResult));
check("and refused quickly, without inflating it", elapsed < 4000, `took ${elapsed}ms`);

section("the other 3D formats are recognised and measured");

/** The eight corners and six quads of the box from the origin to (x, y, z). */
const corners = (x: number, y: number, z: number) => [
  [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
  [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
];
const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const text = (s: string) => new TextEncoder().encode(s);

function obj(x: number, y: number, z: number): Uint8Array {
  return text(
    "# generated\no box\n" +
      corners(x, y, z).map((p) => `v ${p.join(" ")}`).join("\n") +
      "\nvn 0 0 1\nvt 0 0\n" +
      quads.map((q) => `f ${q.map((i) => `${i + 1}/1/1`).join(" ")}`).join("\n") + "\n",
  );
}

function plyAscii(x: number, y: number, z: number): Uint8Array {
  const c = corners(x, y, z);
  return text(
    `ply\nformat ascii 1.0\ncomment generated\nelement vertex ${c.length}\n` +
      "property float x\nproperty float y\nproperty float z\n" +
      `element face ${quads.length}\nproperty list uchar int vertex_indices\nend_header\n` +
      c.map((p) => p.join(" ")).join("\n") + "\n" +
      quads.map((q) => `4 ${q.join(" ")}`).join("\n") + "\n",
  );
}

function plyBinary(x: number, y: number, z: number): Uint8Array {
  const c = corners(x, y, z);
  // An element *before* the vertices, with a list in it, so the walker has to
  // skip something variable-length to find them.
  const header = text(
    "ply\nformat binary_little_endian 1.0\nelement material 1\nproperty list uchar uchar name\n" +
      `element vertex ${c.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\n` +
      `element face ${quads.length}\nproperty list uchar int vertex_indices\nend_header\n`,
  );
  const body = new Uint8Array(1 + 3 + c.length * 13 + quads.length * 17);
  const v = new DataView(body.buffer);
  let o = 0;
  v.setUint8(o, 3); o += 1; body.set([65, 66, 67], o); o += 3;
  for (const p of c) {
    for (const n of p) { v.setFloat32(o, n, true); o += 4; }
    v.setUint8(o, 200); o += 1;
  }
  for (const q of quads) {
    v.setUint8(o, 4); o += 1;
    for (const i of q) { v.setInt32(o, i, true); o += 4; }
  }
  const out = new Uint8Array(header.length + body.length);
  out.set(header);
  out.set(body, header.length);
  return out;
}

/** A binary PLY cut off part way through its vertices. */
function truncatedPly(): Uint8Array {
  const full = plyBinary(10, 10, 10);
  const bodyStart = new TextDecoder("latin1").decode(full).indexOf("end_header\n") + "end_header\n".length;
  return full.subarray(0, bodyStart + 4 + 13 * 3);
}

function amf(x: number, y: number, z: number, unit = "millimeter"): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<amf unit="${unit}"><object id="0"><mesh><vertices>` +
    corners(x, y, z).map((p) => `<vertex><coordinates><x>${p[0]}</x><y>${p[1]}</y><z>${p[2]}</z></coordinates></vertex>`).join("") +
    "</vertices><volume>" +
    boxTriangles(1, 1, 1).map(() => "<triangle><v1>0</v1><v2>1</v2><v3>2</v3></triangle>").join("") +
    "</volume></mesh></object></amf>"
  );
}

function gltfJson(bufferUri?: string, byteLength = 36) {
  return {
    asset: { version: "2.0" },
    buffers: [{ byteLength, ...(bufferUri ? { uri: bufferUri } : {}) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  };
}

function glb(): Uint8Array {
  const pad = (b: Uint8Array, fill: number) => {
    const out = new Uint8Array(Math.ceil(b.length / 4) * 4).fill(fill);
    out.set(b);
    return out;
  };
  const json = pad(text(JSON.stringify(gltfJson())), 0x20);
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set(text("glTF"), 0);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, json.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  v.setUint32(20 + json.length, bin.length, true);
  v.setUint32(24 + json.length, 0x004e4942, true);
  out.set(bin, 28 + json.length);
  return out;
}

const formats: Array<[string, string, Uint8Array, string | null]> = [
  ["OBJ", "bracket.obj", obj(40, 30, 12), "40 × 30 × 12 mm"],
  ["ASCII PLY", "scan.ply", plyAscii(25, 50, 75), "25 × 50 × 75 mm"],
  ["binary PLY (with an element before the vertices)", "scan.ply", plyBinary(60, 20, 10), "60 × 20 × 10 mm"],
  ["AMF", "part.amf", text(amf(70, 35, 5)), "70 × 35 × 5 mm"],
  ["AMF in inches", "part.amf", text(amf(1, 2, 3, "inch")), "25 × 51 × 76 mm"],
  ["zipped AMF", "part.amf", zipSync({ "part.amf": text(amf(15, 15, 15)) }), "15 × 15 × 15 mm"],
  ["STEP (accepted, not measured)", "housing.step", text("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"), null],
  ["STP", "housing.stp", text("﻿ISO-10303-21;\nHEADER;\n"), null],
  ["GLB (accepted, not measured)", "scan.glb", glb(), null],
  ["self-contained glTF", "scan.gltf",
    text(JSON.stringify(gltfJson(`data:application/octet-stream;base64,${Buffer.from(new Float32Array(9).buffer).toString("base64")}`))), null],
];
for (const [label, name, bytes, dims] of formats) {
  const r = inspectModel(name, bytes);
  check(`${label} accepted`, r.ok, why(r));
  check(`${label} dimensions ${dims ?? "left unknown"}`, ok(r)?.dims === dims, String(ok(r)?.dims));
}

const formatRefusals: Array<[string, string, Uint8Array, Rejection]> = [
  ["a binary file named .obj", "x.obj", binaryStl(10, 10, 10), "not_a_model"],
  ["an OBJ with vertices but no faces", "points.obj", text("v 0 0 0\nv 1 1 1\nv 2 0 1\n"), "no_geometry"],
  ["a PLY point cloud (no faces)", "cloud.ply",
    text("ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n"), "no_geometry"],
  ["a PLY whose header promises more than its body", "short.ply", truncatedPly(), "corrupt"],
  ["an HTML file named .step", "x.step", text("<!DOCTYPE html><script>alert(1)</script>"), "not_a_model"],
  ["a glTF that points at a .bin beside it", "scan.gltf", text(JSON.stringify(gltfJson("scan.bin"))), "external_refs"],
  ["a glTF 1.0 file", "old.gltf", text(JSON.stringify({ ...gltfJson(), asset: { version: "1.0" } })), "not_a_model"],
  ["a GLB whose length header lies", "bad.glb", glb().subarray(0, 40), "not_a_model"],
  ["an STL renamed to .glb", "x.glb", binaryStl(10, 10, 10), "not_a_model"],
];
for (const [label, name, bytes, expected] of formatRefusals) {
  const r = inspectModel(name, bytes);
  check(`${label} is refused`, !r.ok && r.reason === expected, `got "${why(r)}", expected "${expected}"`);
}

section("photos and videos are checked by their bytes");

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const webp = text("RIFF\0\0\0\0WEBPVP8 ");
const mp4 = new Uint8Array([0, 0, 0, 24, ...text("ftypisom"), 0, 0, 2, 0]);
const mov = new Uint8Array([0, 0, 0, 20, ...text("ftypqt  "), 0, 0, 2, 0]);
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86]);

const mediaOk: Array<[string, Uint8Array, string]> = [
  ["photo.png", png, "image/png"],
  ["photo.jpg", jpeg, "image/jpeg"],
  ["photo.JPEG", jpeg, "image/jpeg"],
  ["photo.webp", webp, "image/webp"],
  ["clip.mp4", mp4, "video/mp4"],
  ["clip.mov", mov, "video/quicktime"],
  ["clip.webm", webm, "video/webm"],
];
for (const [name, bytes, mime] of mediaOk) {
  const r = inspectMedia(name, bytes);
  check(`${name} accepted as ${mime}`, r.ok && r.mimeType === mime, r.ok ? r.mimeType : r.reason);
}
const mediaRefused: Array<[string, string, Uint8Array, string]> = [
  ["a PNG named .jpg", "photo.jpg", png, "not_media"],
  ["HTML named .png", "photo.png", text("<html><script>alert(1)</script>"), "not_media"],
  ["an SVG", "logo.svg", text("<svg onload=alert(1)>"), "bad_extension"],
  ["a QuickTime file named .mp4", "clip.mp4", mov, "not_media"],
  ["an empty photo", "photo.png", new Uint8Array(0), "empty"],
];
for (const [label, name, bytes, expected] of mediaRefused) {
  const r = inspectMedia(name, bytes);
  check(`${label} is refused`, !r.ok && r.reason === expected, r.ok ? "accepted" : r.reason);
}

section("links");

check("a bare domain becomes https", (parseLink("printables.com/model/1") as { href?: string }).href === "https://printables.com/model/1");
check("javascript: is refused", !parseLink("javascript:alert(1)").ok);
check("data: is refused", !parseLink("data:text/html,<script>alert(1)</script>").ok);
check("credentials are dropped", (parseLink("https://user:pw@example.com/x") as { href?: string }).href === "https://example.com/x");
check("repeats collapse", parseLinks(["https://a.example/x", "https://a.example/x"]).length === 1);
check("a stored javascript: link never renders", displayLink("javascript:alert(1)") === null);
check("display label is host and path", displayLink("https://www.youtube.com/watch?v=abc")?.label === "youtube.com/watch");

section("presentation helpers");

check("byte formatting", formatBytes(2_517_000) === "2.4 MB", formatBytes(2_517_000));
// No print-time estimate is produced at all — the module must not grow one
// back by accident, since a guessed duration is exactly what the handoff's
// definition of done rules out.
check("nothing infers a print time",
      !Object.keys(inspectModel("x.stl", binaryStl(10, 10, 10)) as object).includes("estimate"));
check("filename traversal is stripped",
      safeFilename("../../etc/passwd.stl") === "passwd.stl");
check("unicode filenames survive",
      safeFilename("rapport été (v2).stl") === "rapport été (v2).stl");

console.info(
  `\n${passed} checks passed, ${failures.length} failed` +
    (failures.length ? `:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exitCode = failures.length ? 1 : 0;
