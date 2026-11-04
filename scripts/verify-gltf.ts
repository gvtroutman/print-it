/** Bounded glTF/GLB declarations and the real loader; no server or network. */
import assert from "node:assert/strict";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { inspectGltf } from "../src/lib/gltf";
import { gltfPreview } from "../src/lib/gltf-preview";
import { inspectModel } from "../src/lib/models";
import { MAX_GLTF_ELEMENTS, MAX_TRIANGLES, VIEWER_MAX_DECODED_BYTES } from "../src/lib/upload-limits";

const localFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith("data:")) throw new Error("Network disabled in glTF checks");
  return localFetch(input, init);
};
// Three's FileLoader reports progress through the browser event constructor.
Object.assign(globalThis, { ProgressEvent: class extends Event {
  constructor(type: string, init: ProgressEventInit) { super(type); Object.assign(this, init); }
} });
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function glb(json: unknown) {
  const text = bytes(json);
  const out = new Uint8Array(20 + Math.ceil(text.length / 4) * 4).fill(0x20);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, out.length - 20, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  return out;
}
const fixture = (count = 3) => ({
  asset: { version: "2.0" },
  accessors: [
    { componentType: 5126, type: "VEC3", count, min: [0, 0, 0], max: [1, 1, 1] },
    { componentType: 5123, type: "SCALAR", count: 3 },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
});
function refused(json: unknown, reason: string, budget?: number) {
  const inspected = inspectGltf(bytes(json), "gltf", budget);
  assert.equal(inspected.ok, false);
  assert.equal(!inspected.ok && inspected.reason, reason);
}
const accepted = fixture();
assert.equal(inspectGltf(bytes(accepted), "gltf").ok, true);
const scene = (await new GLTFLoader().parseAsync(bytes(accepted).buffer as ArrayBuffer, "")).scene;
const mesh = scene.children[0] as import("three").Mesh;
assert.equal(mesh.geometry.getAttribute("position").count, 3, "Valid zero-filled accessors are retained");
assert.equal(inspectModel("valid.glb", glb(accepted)).ok, true);
assert.equal((await gltfPreview(glb(accepted), "glb")).children.length, 1);
refused(fixture(1_000_000_000), "too_complex");
assert.deepEqual(inspectModel("hostile.gltf", bytes(fixture(1_000_000_000))), { ok: false, reason: "too_complex" });
assert.deepEqual(inspectModel("hostile.glb", glb(fixture(1_000_000_000))), { ok: false, reason: "too_complex" });
for (const count of [-1, 1.5, "100", null, 1e309]) {
  refused({ ...fixture(), accessors: [{ ...fixture().accessors[0], count }] }, "corrupt");
}
const aboveTriangleCap = fixture(3 * (MAX_TRIANGLES + 1));
aboveTriangleCap.meshes[0]!.primitives[0]!.indices = undefined as unknown as number;
refused(aboveTriangleCap, "too_complex");
const indexed = fixture(Math.floor(MAX_GLTF_ELEMENTS / 4));
refused(indexed, "too_complex", VIEWER_MAX_DECODED_BYTES);
assert.equal(inspectGltf(bytes(indexed), "gltf").ok, true, "Server accepts a bounded large array; viewer has a smaller budget");
await assert.rejects(gltfPreview(bytes(indexed), "gltf"), /too much memory to preview/);
const aggregate = fixture();
aggregate.accessors = Array.from({ length: 9 }, (_, i) => ({ ...aggregate.accessors[0]!, count: 1_000_000, type: i === 0 ? "VEC3" : "VEC4" }));
refused(aggregate, "too_complex");
refused({ ...fixture(), accessors: [null, fixture().accessors[0]] }, "corrupt");
refused({ ...fixture(), meshes: [{ primitives: [{ attributes: { POSITION: 999 } }] }] }, "corrupt");
refused({ ...fixture(), buffers: [{ byteLength: 36, uri: "https://outside.example/mesh.bin" }] }, "external_refs");
refused({ ...fixture(), buffers: [{ byteLength: 36, uri: "data:application/octet-stream;base64,AAAA" }] }, "corrupt");

// Real interleaved and sparse data remain legal; validate ranges before loading.
const data = new Uint8Array(52);
data[48] = 1;
const backed = {
  ...fixture(),
  buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${Buffer.from(data).toString("base64")}` }],
  bufferViews: [{ buffer: 0, byteLength: 48, byteStride: 16 }, { buffer: 0, byteOffset: 48, byteLength: 1 }, { buffer: 0, byteLength: 12 }],
  accessors: [{ ...fixture().accessors[0]!, bufferView: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
};
assert.equal(inspectGltf(bytes(backed), "gltf").ok, true);
await new GLTFLoader().parseAsync(bytes(backed).buffer as ArrayBuffer, "");
refused({ ...backed, accessors: [{ ...backed.accessors[0], count: 4 }] }, "corrupt");
refused({ ...backed, bufferViews: [{ ...backed.bufferViews[0], byteLength: 53 }] }, "corrupt");
const sparse = { ...backed, accessors: [{ ...fixture().accessors[0]!, sparse: { count: 1, indices: { bufferView: 1, componentType: 5121 }, values: { bufferView: 2 } } }] };
assert.equal(inspectGltf(bytes(sparse), "gltf").ok, true);
await new GLTFLoader().parseAsync(bytes(sparse).buffer as ArrayBuffer, "");
refused({ ...sparse, accessors: [{ ...sparse.accessors[0], sparse: { ...sparse.accessors[0]!.sparse, count: 4 } }] }, "corrupt");

const repeated = { ...fixture(), nodes: [{ mesh: 0 }, { mesh: 0 }], scenes: [{ nodes: [0, 1] }] };
assert.equal(inspectGltf(bytes(repeated), "gltf").ok, true);
refused({ ...fixture(), nodes: [{ children: [0] }] }, "corrupt");
const expansion = { ...fixture(), nodes: Array.from({ length: 28 }, (_, i) => i === 0 ? { mesh: 0 } : { children: [i - 1, i - 1] }), scenes: [{ nodes: [27] }] };
refused(expansion, "too_complex");
const staticMaterial = {
  ...fixture(),
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  textures: [{ source: 0 }], images: [{ uri: "data:image/png;base64,AAAA" }],
};
const preview = await gltfPreview(bytes(staticMaterial), "gltf");
assert.equal((preview.children[0] as import("three").Mesh).geometry.getAttribute("position").count, 3);
refused({ ...fixture(), skins: [{ joints: [999] }] }, "corrupt");
console.info("PASS glTF counts, aggregate arrays, viewer memory, backing ranges, sparse data and scene instances are bounded");
