import { inspectGltf } from "@/lib/gltf";
import { VIEWER_MAX_DECODED_BYTES } from "@/lib/upload-limits";

/** Check stored declarations before any loader can materialize their data. */
export async function gltfPreview(bytes: Uint8Array, format: "gltf" | "glb") {
  const checked = inspectGltf(bytes, format, VIEWER_MAX_DECODED_BYTES);
  if (!checked.ok) {
    throw new Error(checked.reason === "too_complex"
      ? "That model needs too much memory to preview. Download it to open in a slicer."
      : "That model could not be safely displayed. Download it to open in a slicer.");
  }
  const [{ GLTFLoader }, { AnimationClip, MeshStandardMaterial }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"), import("three"),
  ]);
  // The preview is static and uses the chosen filament colour. Do not decode
  // embedded textures or animation tracks that will never be displayed.
  const loader = new GLTFLoader().register(() => ({
    name: "print-it-static-material",
    loadMaterial: async () => new MeshStandardMaterial(),
    loadAnimation: async () => new AnimationClip("", 0, []),
  }));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return (await loader.parseAsync(buffer, "")).scene;
}
