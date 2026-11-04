import {
  MAX_GLTF_DECODED_BYTES, MAX_GLTF_ELEMENTS, MAX_GLTF_OBJECTS, MAX_TRIANGLES,
} from "@/lib/upload-limits";

type ObjectDef = Record<string, unknown>;
type Failure = "not_a_model" | "corrupt" | "external_refs" | "too_complex" | "no_geometry";
export type GltfInspection = { ok: true; triangles: number; decodedBytes: number } | { ok: false; reason: Failure };
class InvalidGltf extends Error {
  constructor(readonly reason: Failure) { super(reason); }
}
function refuse(reason: Failure): never { throw new InvalidGltf(reason); }
const object = (value: unknown): ObjectDef =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectDef : refuse("corrupt");
const integer = (value: unknown, min = 0): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : refuse("corrupt");
const optionalOffset = (value: unknown) => value === undefined ? 0 : integer(value);
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Inspect JSON/chunks as bytes; never allocate the arrays they declare. */
function document(bytes: Uint8Array, format: "gltf" | "glb") {
  if (format === "gltf") {
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
    if (!text.trimStart().startsWith("{")) refuse("not_a_model");
    return { json: object(JSON.parse(text)), binaryBytes: null as number | null };
  }
  if (bytes.length < 20) refuse("not_a_model");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) {
    refuse("not_a_model");
  }
  let json: ObjectDef | null = null;
  let binaryBytes: number | null = null;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) refuse("corrupt");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const end = offset + 8 + length;
    if (length % 4 !== 0 || end > bytes.length) refuse("corrupt");
    if (offset === 12 && type !== 0x4e4f534a) refuse("not_a_model");
    if (type === 0x4e4f534a) {
      if (json !== null) refuse("corrupt");
      json = object(JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, end))));
    } else if (type === 0x004e4942) {
      if (binaryBytes !== null) refuse("corrupt");
      binaryBytes = length;
    }
    offset = end;
  }
  return { json: json ?? refuse("not_a_model"), binaryBytes };
}

function dataBytes(uri: unknown): number {
  if (typeof uri !== "string") refuse("corrupt");
  if (!uri.startsWith("data:")) refuse("external_refs");
  const comma = uri.indexOf(",");
  if (comma < 0) refuse("corrupt");
  const encoded = uri.slice(comma + 1);
  if (!uri.slice(0, comma).endsWith(";base64")) {
    let size = 0;
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] === "%") {
        if (!/^[0-9a-f]{2}$/i.test(encoded.slice(i + 1, i + 3))) refuse("corrupt");
        i += 2;
        size++;
      } else {
        const point = encoded.codePointAt(i)!;
        size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        if (point > 0xffff) i++;
      }
    }
    return size;
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) refuse("corrupt");
  return encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

/** Shared server and viewer preflight, including old files already on disk. */
export function inspectGltf(bytes: Uint8Array, format: "gltf" | "glb", maxDecodedBytes = MAX_GLTF_DECODED_BYTES): GltfInspection {
  try {
    const { json, binaryBytes } = document(bytes, format);
    if (object(json.asset).version !== "2.0") return { ok: false, reason: "not_a_model" };
    let objects = 0;
    let decodedBytes = 0;
    let elements = 0;
    const charge = (count: number) => {
      decodedBytes += count;
      if (!Number.isSafeInteger(decodedBytes) || decodedBytes > maxDecodedBytes) refuse("too_complex");
    };
    const array = (value: unknown): unknown[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value)) refuse("corrupt");
      objects += value.length;
      if (objects > MAX_GLTF_OBJECTS) refuse("too_complex");
      return value;
    };
    const defs = (value: unknown) => array(value).map(object);
    const ref = <T>(values: T[], index: unknown): T => values[integer(index)] ?? refuse("corrupt");

    const buffers = defs(json.buffers).map((b, index) => {
      const size = integer(b.byteLength, 1);
      charge(size);
      if (b.uri !== undefined) {
        if (dataBytes(b.uri) !== size) refuse("corrupt");
      } else if (format !== "glb" || index !== 0 || binaryBytes === null || size > binaryBytes || binaryBytes - size > 3) {
        refuse("corrupt");
      }
      return size;
    });
    const views = defs(json.bufferViews).map(v => {
      const size = integer(v.byteLength, 1);
      const offset = optionalOffset(v.byteOffset);
      if (offset + size > ref(buffers, v.buffer)) refuse("corrupt");
      const stride = v.byteStride === undefined ? null : integer(v.byteStride, 4);
      if (stride !== null && (stride > 252 || stride % 4 !== 0)) refuse("corrupt");
      // GLTFLoader slices each view, including overlapping views of a buffer.
      charge(size);
      return { size, offset, stride };
    });
    const range = (viewIndex: unknown, offset: number, count: number, itemBytes: number, componentBytes: number) => {
      const view = ref(views, viewIndex);
      const stride = view.stride ?? itemBytes;
      if (stride < itemBytes || stride % componentBytes !== 0 || offset % componentBytes !== 0 ||
          (view.offset + offset) % componentBytes !== 0 || offset + (count - 1) * stride + itemBytes > view.size) {
        refuse("corrupt");
      }
    };
    const accessors = defs(json.accessors).map(a => {
      const count = integer(a.count, 1);
      const type = typeof a.type === "string" ? a.type : "";
      const components = Object.hasOwn(COMPONENTS, type) ? COMPONENTS[type]! : refuse("corrupt");
      const componentType = integer(a.componentType);
      const componentBytes = COMPONENT_BYTES[componentType] ?? refuse("corrupt");
      elements += count * components;
      if (!Number.isSafeInteger(elements) || elements > MAX_GLTF_ELEMENTS) refuse("too_complex");
      const size = count * components * componentBytes;
      // Sparse and interleaved arrays can require a second materialized copy.
      charge(2 * size);
      const matrix = type.startsWith("MAT") ? Number(type.at(-1)) : 0;
      const itemBytes = matrix ? matrix * Math.ceil(matrix * componentBytes / 4) * 4 : components * componentBytes;
      if (a.bufferView !== undefined) {
        range(a.bufferView, optionalOffset(a.byteOffset), count, itemBytes, componentBytes);
      } else if (a.byteOffset !== undefined) {
        refuse("corrupt");
      }
      if (a.sparse !== undefined) {
        const sparse = object(a.sparse);
        const sparseCount = integer(sparse.count, 1);
        if (sparseCount > count) refuse("corrupt");
        const indices = object(sparse.indices);
        const indexType = integer(indices.componentType);
        if (![5121, 5123, 5125].includes(indexType)) refuse("corrupt");
        range(indices.bufferView, optionalOffset(indices.byteOffset), sparseCount, COMPONENT_BYTES[indexType]!, COMPONENT_BYTES[indexType]!);
        const values = object(sparse.values);
        range(values.bufferView, optionalOffset(values.byteOffset), sparseCount, itemBytes, componentBytes);
      }
      return { count, type, componentType, size };
    });
    for (const image of defs(json.images)) {
      if (image.uri !== undefined) charge(dataBytes(image.uri));
      else ref(views, image.bufferView);
    }

    let triangles = 0;
    let primitiveWork = 0;
    const meshes = defs(json.meshes).map(mesh => {
      let meshTriangles = 0;
      for (const p of defs(mesh.primitives)) {
        const attributes = object(p.attributes);
        const position = ref(accessors, attributes.POSITION);
        if (position.type !== "VEC3") refuse("corrupt");
        for (const index of Object.values(attributes)) {
          if (ref(accessors, index).count !== position.count) refuse("corrupt");
        }
        const targets = defs(p.targets);
        for (const target of targets) {
          for (const index of Object.values(target)) {
            if (ref(accessors, index).count !== position.count) refuse("corrupt");
          }
        }
        const mode = p.mode === undefined ? 4 : integer(p.mode);
        if (mode > 6) refuse("corrupt");
        let count = position.count;
        if (p.indices !== undefined) {
          const indices = ref(accessors, p.indices);
          if (indices.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices.componentType)) refuse("corrupt");
          count = indices.count;
        }
        const faces = mode === 4 ? Math.floor(count / 3) : mode >= 5 ? Math.max(0, count - 2) : 0;
        meshTriangles += faces;
        triangles += faces;
        primitiveWork += position.count * (1 + targets.length);
        // Reused accessor data can still be cloned for different geometries.
        charge(position.size * (1 + targets.length));
        if (triangles > MAX_TRIANGLES || primitiveWork > MAX_GLTF_ELEMENTS) refuse("too_complex");
      }
      return meshTriangles;
    });
    if (triangles === 0) return { ok: false, reason: "no_geometry" };

    // Bound scene instances as well as the unique meshes. Memoization keeps a
    // repeated child graph from becoming an exponential validation walk.
    const nodes = defs(json.nodes);
    for (const skin of defs(json.skins)) {
      const joints = array(skin.joints);
      if (joints.length === 0) refuse("corrupt");
      for (const joint of joints) ref(nodes, joint);
      charge(joints.length * 16 * 8 * 2);
      if (skin.inverseBindMatrices !== undefined) {
        const matrices = ref(accessors, skin.inverseBindMatrices);
        if (matrices.type !== "MAT4" || matrices.count < joints.length) refuse("corrupt");
      }
    }
    const visiting = new Set<number>();
    const costs = new Map<number, { faces: number; visits: number }>();
    const cost = (index: number, depth = 0): { faces: number; visits: number } => {
      if (depth > 128) refuse("too_complex");
      if (visiting.has(index)) refuse("corrupt");
      const known = costs.get(index);
      if (known) return known;
      const node = ref(nodes, index);
      visiting.add(index);
      let faces = node.mesh === undefined ? 0 : ref(meshes, node.mesh);
      let visits = 1;
      const instancing = node.extensions === undefined ? undefined : object(node.extensions).EXT_mesh_gpu_instancing;
      if (instancing !== undefined) {
        const counts = Object.values(object(object(instancing).attributes)).map(i => ref(accessors, i).count);
        if (!counts.length || !counts.every(n => n === counts[0])) refuse("corrupt");
        faces *= counts[0]!;
        charge(counts[0]! * 16 * 4);
      }
      for (const child of array(node.children)) {
        const childCost = cost(integer(child), depth + 1);
        faces += childCost.faces;
        visits += childCost.visits;
        if (faces > MAX_TRIANGLES || visits > MAX_GLTF_OBJECTS) refuse("too_complex");
      }
      if (faces > MAX_TRIANGLES) refuse("too_complex");
      visiting.delete(index);
      const result = { faces, visits };
      costs.set(index, result);
      return result;
    };
    for (let i = 0; i < nodes.length; i++) cost(i);
    let sceneFaces = 0;
    let sceneVisits = 0;
    for (const scene of defs(json.scenes)) {
      for (const root of array(scene.nodes)) {
        const result = cost(integer(root));
        sceneFaces += result.faces;
        sceneVisits += result.visits;
        if (sceneFaces > MAX_TRIANGLES || sceneVisits > MAX_GLTF_OBJECTS) refuse("too_complex");
      }
    }
    charge(sceneVisits * 16 * 4);
    return { ok: true, triangles, decodedBytes };
  } catch (error) {
    return { ok: false, reason: error instanceof InvalidGltf ? error.reason : "corrupt" };
  }
}
