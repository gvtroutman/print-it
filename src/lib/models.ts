/**
 * Validation and measurement of uploaded model files.
 *
 * The handoff asks for extension and magic-byte validation, a size cap, and a
 * parse pass that fills in the displayed meta. Everything here runs on the
 * server against the bytes that actually arrived — a filename is a claim, not
 * evidence.
 *
 * The numbers themselves live in `upload-limits.ts`, because the upload form
 * needs the same ones and cannot import this module without dragging `fflate`
 * into the browser bundle.
 */
import { unzipSync } from "fflate";

import {
  ACCEPTED_EXTENSIONS,
  MAX_INFLATED_BYTES,
  MAX_TRIANGLES,
  MAX_UPLOAD_BYTES,
  MODEL_FORMATS_TEXT,
  extensionOf,
  formatBytes,
} from "@/lib/upload-limits";

/** Re-exported so existing callers keep one import to reach for. */
export { ACCEPTED_EXTENSIONS, extensionOf, formatBytes };
export const MAX_BYTES = MAX_UPLOAD_BYTES;

export type ModelFormat = "stl" | "3mf" | "obj" | "ply" | "amf" | "step" | "glb" | "gltf";

export type Rejection =
  | "empty"
  | "too_large"
  | "bad_extension"
  | "not_a_model"
  | "corrupt"
  | "no_geometry"
  | "external_refs";

export const REJECTION_COPY: Record<Rejection, string> = {
  empty: "That file is empty.",
  too_large: `That file is over ${formatBytes(MAX_UPLOAD_BYTES)}.`,
  bad_extension: `3D models can be ${MODEL_FORMATS_TEXT}.`,
  not_a_model:
    "That does not look like the 3D format its name says it is.",
  corrupt: "That file is damaged — it could not be read all the way through.",
  no_geometry: "There is no geometry in that file.",
  external_refs:
    "That .gltf points at other files kept next to it. Export it as a single .glb and send that.",
};

export type Measured = {
  format: ModelFormat;
  /** Null where the format does not carry triangles (STEP is solids). */
  triangles: number | null;
  /**
   * Bounding box in millimetres, or null where it cannot be measured honestly:
   * STEP needs a CAD kernel to know its extent, and glTF is in metres placed by
   * a tree of transforms. "Dimensions unknown" beats a wrong number.
   */
  size: { x: number; y: number; z: number } | null;
  /** "78 × 40 × 22 mm" */
  dims: string | null;
};

export type Inspection =
  | ({ ok: true } & Measured)
  | { ok: false; reason: Rejection };

// ---------------------------------------------------------------------------
// Sniffing
// ---------------------------------------------------------------------------

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

const startsWith = (b: Uint8Array, sig: number[]) =>
  sig.every((byte, i) => b[i] === byte);

/**
 * A binary STL has no magic number, so it is identified structurally: an
 * 80-byte header, a uint32 triangle count, then exactly 50 bytes per
 * triangle. If the arithmetic lands on the file length, it is a binary STL
 * and nothing else plausibly is.
 *
 * This check has to come first, because binary STLs written by some tools
 * begin with the ASCII word "solid" in their header and would otherwise be
 * mistaken for the text format.
 */
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (count > MAX_TRIANGLES) return false;
  return bytes.length === 84 + count * 50;
}

function isAsciiStl(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .trimStart()
    .toLowerCase();
  // Both markers required: "solid" alone is too weak a signal.
  return head.startsWith("solid") && head.includes("facet normal");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Box = { min: [number, number, number]; max: [number, number, number] };

const emptyBox = (): Box => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

function expand(box: Box, x: number, y: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  const p = [x, y, z] as const;
  for (let i = 0; i < 3; i++) {
    if (p[i]! < box.min[i]!) box.min[i] = p[i]!;
    if (p[i]! > box.max[i]!) box.max[i] = p[i]!;
  }
}

function measureBinaryStl(bytes: Uint8Array): { box: Box; triangles: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true);
  const box = emptyBox();
  let offset = 84;
  for (let t = 0; t < triangles; t++) {
    // Skip the 12-byte normal; only the three vertices bound the mesh.
    for (let v = 0; v < 3; v++) {
      const base = offset + 12 + v * 12;
      expand(
        box,
        view.getFloat32(base, true),
        view.getFloat32(base + 4, true),
        view.getFloat32(base + 8, true),
      );
    }
    offset += 50;
  }
  return { box, triangles };
}

function measureAsciiStl(bytes: Uint8Array): { box: Box; triangles: number } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const box = emptyBox();
  let vertices = 0;
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    expand(box, parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!));
    vertices++;
  }
  return { box, triangles: Math.floor(vertices / 3) };
}

/** 3MF declares its unit on the <model> element; everything becomes mm. */
const UNIT_TO_MM: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

// --- 3MF geometry, honouring the transform tree ------------------------------
//
// A 3MF's real size is not the raw union of its vertices. Objects carry their
// coordinates in a local space and are placed by a transform on the `<build>`
// `<item>` (and, in the production extension, by a transform on each
// `<component>`). Cura is the case that makes this non-optional: it stores the
// mesh in a scaled-down space and puts the true size in the item matrix, so
// reading the raw vertices reports a box of a fraction of a millimetre — a
// model that measured "0 × 0 × 0 mm". Applying the transforms is what turns
// that back into the real dimensions.
//
// Matrices are row-major 4×4 in the row-vector convention (a point is p·M, so
// translation lives in the last row) — the same convention the 3MF `transform`
// attribute uses.

type Mat = number[]; // length 16
const IDENTITY_MAT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A 3MF `transform="m00 m01 m02 m10 … m30 m31 m32"` (12 values) → 4×4. */
function parseTransform(s: string | undefined): Mat {
  if (!s) return IDENTITY_MAT;
  const n = s.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((v) => !Number.isFinite(v))) return IDENTITY_MAT;
  const [a, b, c, d, e, f, g, h, i, j, k, l] = n as number[];
  return [a!, b!, c!, 0, d!, e!, f!, 0, g!, h!, i!, 0, j!, k!, l!, 1];
}

/** Child-then-parent for row vectors: the point p·A·B, i.e. standard A·B. */
function matMul(a: Mat, b: Mat): Mat {
  const out = new Array(16).fill(0) as Mat;
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k]! * b[k * 4 + col]!;
      out[r * 4 + col] = sum;
    }
  }
  return out;
}

type Obj3mf = {
  /** Flat x,y,z triples in the part's local space. */
  verts: number[];
  components: { objectid: string; path: string | null; tf: Mat }[];
};

type Part3mf = {
  /** Multiply a local coordinate by this to reach millimetres. */
  unitScale: number;
  objects: Map<string, Obj3mf>;
  buildItems: { objectid: string; tf: Mat }[];
};

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

/** Zip member names have no leading slash; a 3MF `p:path` usually does. */
const normalizePart = (p: string): string => p.replace(/^\/+/, "").toLowerCase();

function parsePart(xml: string): Part3mf {
  const unit = /<model[^>]*\bunit\s*=\s*"([^"]+)"/i.exec(xml)?.[1]?.toLowerCase();
  const unitScale = UNIT_TO_MM[unit ?? "millimeter"] ?? 1;

  const objects = new Map<string, Obj3mf>();
  // Objects do not nest, so a non-greedy body match is safe. Self-closing
  // objects carry no geometry and are simply skipped.
  const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let om: RegExpExecArray | null;
  while ((om = objRe.exec(xml)) !== null) {
    const id = attr(om[1]!, "id");
    if (id === undefined) continue;
    const body = om[2]!;

    const verts: number[] = [];
    const vertexTag = /<vertex\b[^>]*\/?>/g;
    let vt: RegExpExecArray | null;
    while ((vt = vertexTag.exec(body)) !== null) {
      const s = vt[0];
      // Attribute order is not fixed by the spec, so match each separately.
      const x = /\bx\s*=\s*"(-?[\d.eE+-]+)"/.exec(s)?.[1];
      const y = /\by\s*=\s*"(-?[\d.eE+-]+)"/.exec(s)?.[1];
      const z = /\bz\s*=\s*"(-?[\d.eE+-]+)"/.exec(s)?.[1];
      if (x === undefined || y === undefined || z === undefined) continue;
      verts.push(parseFloat(x), parseFloat(y), parseFloat(z));
    }

    const components: Obj3mf["components"] = [];
    const compTag = /<component\b[^>]*\/?>/g;
    let ct: RegExpExecArray | null;
    while ((ct = compTag.exec(body)) !== null) {
      const objectid = attr(ct[0], "objectid");
      if (objectid === undefined) continue;
      // The path attribute is namespaced (`p:path`); match it prefix-agnostically.
      const path = /\b[\w]*:?path\s*=\s*"([^"]+)"/i.exec(ct[0])?.[1] ?? null;
      components.push({ objectid, path, tf: parseTransform(attr(ct[0], "transform")) });
    }

    objects.set(id, { verts, components });
  }

  const buildItems: Part3mf["buildItems"] = [];
  const buildBlock = /<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(xml)?.[1] ?? "";
  const itemTag = /<item\b[^>]*\/?>/g;
  let it: RegExpExecArray | null;
  while ((it = itemTag.exec(buildBlock)) !== null) {
    const objectid = attr(it[0], "objectid");
    if (objectid === undefined) continue;
    buildItems.push({ objectid, tf: parseTransform(attr(it[0], "transform")) });
  }

  return { unitScale, objects, buildItems };
}

function measure3mf(bytes: Uint8Array): { box: Box; triangles: number } | null {
  let files: Record<string, Uint8Array>;
  try {
    let inflated = 0;
    files = unzipSync(bytes, {
      filter: (file) => {
        // EVERY model part, not only `3dmodel.model`. The 3MF production
        // extension (Bambu, OrcaSlicer multi-object plates, several CAD
        // exporters) puts each object's geometry in its own
        // `3D/Objects/*.model` and leaves the root part merely referencing
        // them — so reading the root alone finds no geometry and the whole
        // file was being refused. Some exporters also name the root part
        // something other than `3dmodel.model`. Reading any `*.model` covers
        // both. Nothing is ever written from these names (storage keys are
        // generated), so an odd or traversal-shaped member name is harmless.
        if (!/\.model$/i.test(file.name)) return false;
        inflated += file.originalSize ?? 0;
        if (inflated > MAX_INFLATED_BYTES) {
          throw new Error("archive inflates to an implausible size");
        }
        return true;
      },
    });
  } catch {
    return null;
  }

  const parts = new Map<string, Part3mf>();
  let triangles = 0;
  for (const name of Object.keys(files)) {
    if (!/\.model$/i.test(name)) continue;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(files[name]!);
    parts.set(name.toLowerCase(), parsePart(xml));
    triangles += (xml.match(/<triangle\b/g) ?? []).length;
  }
  if (parts.size === 0) return null;

  const box = emptyBox();
  let placed = 0;

  // Walk from each build item down through components, composing transforms and
  // expanding the box with every mesh vertex in its final placed position. A
  // visited set (keyed by part+object at a given depth) plus a depth cap guards
  // against a malformed file whose components reference each other in a cycle.
  const walk = (partKey: string, objectId: string, m: Mat, depth: number) => {
    if (depth > 50) return;
    const part = parts.get(partKey);
    const obj = part?.objects.get(objectId);
    if (!part || !obj) return;

    const s = part.unitScale;
    for (let i = 0; i + 2 < obj.verts.length; i += 3) {
      const x = obj.verts[i]!, y = obj.verts[i + 1]!, z = obj.verts[i + 2]!;
      expand(
        box,
        (x * m[0]! + y * m[4]! + z * m[8]! + m[12]!) * s,
        (x * m[1]! + y * m[5]! + z * m[9]! + m[13]!) * s,
        (x * m[2]! + y * m[6]! + z * m[10]! + m[14]!) * s,
      );
      placed++;
    }
    for (const c of obj.components) {
      const childKey = c.path ? normalizePart(c.path) : partKey;
      walk(childKey, c.objectid, matMul(c.tf, m), depth + 1);
    }
  };

  // The root part is the one that carries the build. Fall back to any part with
  // items, then — for a file that omits <build> entirely — to placing every
  // object at identity so such a file is still measured rather than refused.
  const roots = [...parts].filter(([, p]) => p.buildItems.length > 0);
  if (roots.length > 0) {
    for (const [key, part] of roots) {
      for (const item of part.buildItems) walk(key, item.objectid, item.tf, 0);
    }
  } else {
    for (const [key, part] of parts) {
      for (const id of part.objects.keys()) walk(key, id, IDENTITY_MAT, 0);
    }
  }

  // Last resort: if the transform walk placed nothing (an object graph we could
  // not resolve — an unusual production layout, say), fall back to the raw
  // union of every vertex so a printable file is still accepted, only with a
  // looser box. Acceptance must never regress on account of the maths above.
  if (placed === 0) {
    for (const part of parts.values()) {
      for (const obj of part.objects.values()) {
        for (let i = 0; i + 2 < obj.verts.length; i += 3) {
          expand(box, obj.verts[i]! * part.unitScale, obj.verts[i + 1]! * part.unitScale, obj.verts[i + 2]! * part.unitScale);
          placed++;
        }
      }
    }
  }

  return placed > 0 ? { box, triangles } : null;
}

// --- OBJ ---------------------------------------------------------------------
//
// Wavefront OBJ is text: `v x y z` lines for vertices, `f a b c …` for faces,
// in whatever unit the exporter liked — slicers read it as millimetres, and so
// does this. A face of n corners is n − 2 triangles once a slicer fans it.

function measureObj(bytes: Uint8Array): { box: Box; triangles: number } | null {
  // A Wavefront file is text throughout; a NUL near the start means it is not.
  if (bytes.subarray(0, 8192).includes(0)) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const box = emptyBox();
  let triangles = 0;
  const line = /^[ \t]*(v|f)[ \t]+([^\r\n]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = line.exec(text)) !== null) {
    const fields = m[2]!.trim().split(/\s+/);
    if (m[1] === "v") {
      expand(box, parseFloat(fields[0]!), parseFloat(fields[1]!), parseFloat(fields[2]!));
    } else if (fields.length >= 3) {
      triangles += fields.length - 2;
      if (triangles > MAX_TRIANGLES) throw new Error("implausibly many faces");
    }
  }
  return { box, triangles };
}

// --- PLY ---------------------------------------------------------------------
//
// An ASCII header naming each element and its properties, then the elements in
// that order, as text or packed binary. The vertex element's x/y/z bound the
// mesh; the face element's count is its size. A PLY with no faces is a point
// cloud — a scan, not something a slicer can print — and is refused.

type PlyProp = { name: string; type: string; list?: { count: string; item: string } };
type PlyElement = { name: string; count: number; props: PlyProp[] };

function plyRead(view: DataView, offset: number, type: string, le: boolean): [number, number] {
  switch (type) {
    case "char": case "int8": return [view.getInt8(offset), 1];
    case "uchar": case "uint8": return [view.getUint8(offset), 1];
    case "short": case "int16": return [view.getInt16(offset, le), 2];
    case "ushort": case "uint16": return [view.getUint16(offset, le), 2];
    case "int": case "int32": return [view.getInt32(offset, le), 4];
    case "uint": case "uint32": return [view.getUint32(offset, le), 4];
    case "float": case "float32": return [view.getFloat32(offset, le), 4];
    case "double": case "float64": return [view.getFloat64(offset, le), 8];
  }
  throw new Error(`unknown PLY type ${type}`);
}

function measurePly(bytes: Uint8Array): { box: Box; triangles: number } | null {
  // latin1 so that header characters and bytes line up one to one.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
  const end = head.indexOf("end_header");
  if (!/^ply\r?\n/.test(head) || end < 0) return null;
  let bodyStart = end + "end_header".length;
  if (head[bodyStart] === "\r") bodyStart++;
  if (head[bodyStart] === "\n") bodyStart++;

  let format = "";
  const elements: PlyElement[] = [];
  for (const raw of head.slice(0, end).split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === "format") format = parts[1] ?? "";
    else if (parts[0] === "element") {
      elements.push({ name: parts[1] ?? "", count: Number(parts[2]), props: [] });
    } else if (parts[0] === "property") {
      const element = elements[elements.length - 1];
      if (!element) return null;
      element.props.push(
        parts[1] === "list"
          ? { name: parts[4] ?? "", type: "list", list: { count: parts[2] ?? "", item: parts[3] ?? "" } }
          : { name: parts[2] ?? "", type: parts[1] ?? "" },
      );
    }
  }

  const vertex = elements.find((e) => e.name === "vertex");
  const face = elements.find((e) => e.name === "face");
  if (!vertex || !Number.isInteger(vertex.count) || vertex.count < 0) return null;
  const triangles = face && Number.isInteger(face.count) && face.count > 0 ? face.count : 0;
  if (triangles > MAX_TRIANGLES) throw new Error("implausibly many faces");
  const axes = ["x", "y", "z"].map((axis) => vertex.props.findIndex((p) => p.name === axis));
  if (axes.some((i) => i < 0)) return null;

  const box = emptyBox();
  const point = [0, 0, 0];

  if (format === "ascii") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(bodyStart));
    let pos = 0;
    const nextLine = () => {
      if (pos >= text.length) throw new Error("PLY body ends early");
      const nl = text.indexOf("\n", pos);
      const row = text.slice(pos, nl < 0 ? text.length : nl);
      pos = nl < 0 ? text.length : nl + 1;
      return row;
    };
    // One instance per line, so whatever precedes the vertices is skipped by
    // counting lines.
    for (const element of elements) {
      if (element === vertex) break;
      for (let i = 0; i < element.count; i++) nextLine();
    }
    for (let i = 0; i < vertex.count; i++) {
      const fields = nextLine().trim().split(/\s+/);
      expand(box, parseFloat(fields[axes[0]!]!), parseFloat(fields[axes[1]!]!), parseFloat(fields[axes[2]!]!));
    }
    return { box, triangles };
  }

  if (format !== "binary_little_endian" && format !== "binary_big_endian") return null;
  const le = format === "binary_little_endian";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // A read past the end throws a RangeError, which the caller reports as a
  // damaged file — so a header that claims more than the body holds is safe.
  let offset = bodyStart;
  for (const element of elements) {
    const isVertex = element === vertex;
    // Nothing to read means nothing to skip — and no loop over a count the
    // header made up.
    if (element.props.length === 0) continue;
    for (let i = 0; i < element.count; i++) {
      element.props.forEach((prop, p) => {
        if (prop.list) {
          const [n, size] = plyRead(view, offset, prop.list.count, le);
          offset += size;
          for (let j = 0; j < n; j++) offset += plyRead(view, offset, prop.list.item, le)[1];
          return;
        }
        const [value, size] = plyRead(view, offset, prop.type, le);
        offset += size;
        if (isVertex) {
          const axis = axes.indexOf(p);
          if (axis >= 0) point[axis] = value;
        }
      });
      if (isVertex) expand(box, point[0]!, point[1]!, point[2]!);
    }
    if (isVertex) break;
  }
  return { box, triangles };
}

// --- AMF ---------------------------------------------------------------------
//
// XML, optionally zipped, with a unit on the root element like 3MF. Measured
// as the union of its vertices; constellations (instanced placements) are
// rare in practice and are not walked, so such a file measures loosely.

function amfXml(bytes: Uint8Array): string | null {
  const isAmf = (xml: string) => /<amf\b/i.test(xml.slice(0, 4096));
  if (startsWith(bytes, ZIP_MAGIC)) {
    let files: Record<string, Uint8Array>;
    try {
      let inflated = 0;
      files = unzipSync(bytes, {
        filter: (file) => {
          inflated += file.originalSize ?? 0;
          if (inflated > MAX_INFLATED_BYTES) throw new Error("archive inflates to an implausible size");
          return true;
        },
      });
    } catch {
      return null;
    }
    for (const data of Object.values(files)) {
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(data);
      if (isAmf(xml)) return xml;
    }
    return null;
  }
  const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return isAmf(xml) ? xml : null;
}

function measureAmf(xml: string): { box: Box; triangles: number } {
  const unit = /<amf\b[^>]*\bunit\s*=\s*"([^"]+)"/i.exec(xml)?.[1]?.toLowerCase();
  const scale = UNIT_TO_MM[unit ?? "millimeter"] ?? 1;
  const box = emptyBox();
  const coords = /<coordinates>([\s\S]*?)<\/coordinates>/gi;
  let m: RegExpExecArray | null;
  while ((m = coords.exec(xml)) !== null) {
    const axis = (name: string) => parseFloat(new RegExp(`<${name}>\\s*([^<]+)</${name}>`, "i").exec(m![1]!)?.[1] ?? "");
    expand(box, axis("x") * scale, axis("y") * scale, axis("z") * scale);
  }
  let triangles = 0;
  const tri = /<triangle\b/gi;
  while (tri.exec(xml) !== null) triangles++;
  return { box, triangles };
}

// --- STEP --------------------------------------------------------------------
//
// ISO 10303-21 exchange files open with their own name. Measuring one means
// tessellating B-rep solids, which takes a CAD kernel, so it is only
// recognised here — the slicer that opens it does the rest.

function isStep(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 1024))
    .replace(/^﻿/, "")
    .trimStart();
  return head.startsWith("ISO-10303-21");
}

// --- glTF / GLB --------------------------------------------------------------
//
// glTF is JSON describing meshes, with the geometry in buffers; GLB is the same
// JSON and one buffer packed into a single binary. Only self-contained files
// are accepted: a .gltf that names buffers or textures by relative path is one
// file of several, and the rest did not come with it.

type GltfJson = {
  asset?: { version?: unknown };
  meshes?: unknown;
  accessors?: unknown;
  buffers?: unknown;
  images?: unknown;
};

const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"

function gltfJsonFromGlb(bytes: Uint8Array): GltfJson | null {
  if (bytes.length < 20 || !startsWith(bytes, GLB_MAGIC)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) return null;
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK || 20 + chunkLength > bytes.length) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(bytes.subarray(20, 20 + chunkLength))) as GltfJson;
  } catch {
    return null;
  }
}

function gltfJsonFromText(bytes: Uint8Array): GltfJson | null {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
  if (!text.trimStart().startsWith("{")) return null;
  try {
    return JSON.parse(text) as GltfJson;
  } catch {
    return null;
  }
}

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];

function checkGltf(json: GltfJson): { triangles: number } | "external_refs" | null {
  if (typeof json !== "object" || json === null) return null;
  if (String(json.asset?.version ?? "").split(".")[0] !== "2") return null;

  const external = (uri: unknown) => typeof uri === "string" && !uri.startsWith("data:");
  if (list(json.buffers).some((b) => external(b.uri)) || list(json.images).some((i) => external(i.uri))) {
    return "external_refs";
  }

  const accessors = list(json.accessors);
  let triangles = 0;
  for (const mesh of list(json.meshes)) {
    for (const primitive of list(mesh.primitives)) {
      const mode = typeof primitive.mode === "number" ? primitive.mode : 4;
      // Points and lines (modes 0–3) are not surfaces anything can print.
      if (mode < 4) continue;
      const attributes = (primitive.attributes ?? {}) as Record<string, unknown>;
      const index = typeof primitive.indices === "number" ? primitive.indices : attributes.POSITION;
      const count = typeof index === "number" ? Number(accessors[index]?.count ?? 0) : 0;
      triangles += mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
    }
  }
  return { triangles };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/*
 * There is deliberately no print-time estimate here.
 *
 * A figure derived from the bounding box is a guess dressed as a measurement:
 * it cannot know infill, layer height, wall count or the printer's speeds,
 * and it is worst on exactly the models people care about — hollow parts and
 * lattices. The handoff's definition of done says nothing should claim to
 * know what the printer is doing, and a number someone might plan their
 * afternoon around is the kind of claim it is warning about.
 *
 * So the app shows only what it actually measured: dimensions and file size.
 *
 * To add a real one, shell out to `prusa-slicer --export-gcode` after upload
 * (in a background job — slicing takes seconds) and read
 * `; estimated printing time` out of the G-code. That number is worth
 * showing; this one was not.
 */

const round = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Inspect an uploaded file. Extension, size and content must all agree before
 * anything is stored.
 */
export function inspectModel(filename: string, bytes: Uint8Array): Inspection {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_BYTES) return { ok: false, reason: "too_large" };

  const ext = extensionOf(filename);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: "bad_extension" };
  }

  let format: ModelFormat;
  let measured: { box: Box; triangles: number } | null;

  try {
    switch (ext) {
      case ".stl":
      case ".3mf": {
        if (isBinaryStl(bytes)) {
          format = "stl";
          measured = measureBinaryStl(bytes);
        } else if (isAsciiStl(bytes)) {
          format = "stl";
          measured = measureAsciiStl(bytes);
        } else if (startsWith(bytes, ZIP_MAGIC)) {
          format = "3mf";
          measured = measure3mf(bytes);
          if (!measured) return { ok: false, reason: "not_a_model" };
        } else {
          return { ok: false, reason: "not_a_model" };
        }
        // The name has to agree with the bytes: a .3mf that is really an STL
        // is a sign something is wrong, even if both are printable.
        if ((ext === ".stl") !== (format === "stl")) {
          return { ok: false, reason: "not_a_model" };
        }
        break;
      }
      case ".obj":
        format = "obj";
        measured = measureObj(bytes);
        if (!measured) return { ok: false, reason: "not_a_model" };
        break;
      case ".ply":
        format = "ply";
        measured = measurePly(bytes);
        if (!measured) return { ok: false, reason: "not_a_model" };
        break;
      case ".amf": {
        format = "amf";
        const xml = amfXml(bytes);
        if (!xml) return { ok: false, reason: "not_a_model" };
        measured = measureAmf(xml);
        break;
      }
      case ".step":
      case ".stp":
        if (!isStep(bytes)) return { ok: false, reason: "not_a_model" };
        return { ok: true, format: "step", triangles: null, size: null, dims: null };
      case ".glb":
      case ".gltf": {
        const json = ext === ".glb" ? gltfJsonFromGlb(bytes) : gltfJsonFromText(bytes);
        const checked = json ? checkGltf(json) : null;
        if (!checked) return { ok: false, reason: "not_a_model" };
        if (checked === "external_refs") return { ok: false, reason: "external_refs" };
        if (checked.triangles === 0) return { ok: false, reason: "no_geometry" };
        return { ok: true, format: ext === ".glb" ? "glb" : "gltf", triangles: checked.triangles, size: null, dims: null };
      }
      default:
        return { ok: false, reason: "bad_extension" };
    }
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  if (!measured || measured.triangles === 0) {
    return { ok: false, reason: "no_geometry" };
  }
  if (!Number.isFinite(measured.box.min[0])) {
    return { ok: false, reason: "no_geometry" };
  }

  const size = {
    x: round(measured.box.max[0]! - measured.box.min[0]!),
    y: round(measured.box.max[1]! - measured.box.min[1]!),
    z: round(measured.box.max[2]! - measured.box.min[2]!),
  };

  return {
    ok: true,
    format,
    triangles: measured.triangles,
    size,
    dims: `${Math.round(size.x)} × ${Math.round(size.y)} × ${Math.round(size.z)} mm`,
  };
}

/**
 * A filename safe to store and echo back. The original never builds a storage
 * path — see `storageKeyFor` in storage.ts — but it is shown in the UI, so
 * strip anything path-like or controlish first.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "model";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    // Control characters, plus the set that is path-significant or
    // reserved on Windows. Spaces, unicode and digits are kept, so a
    // person's filename still looks like their filename.
    .replace(/[\u0000-\u001f\u007f<>:"|?*\\/]/g, "")
    .trim();
  return (cleaned || "model").slice(0, 120);
}
