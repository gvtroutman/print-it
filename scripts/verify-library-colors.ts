import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { Prisma } from "@prisma/client";
import { libraryScannedSwatches } from "../src/lib/library-swatches";
import { shelfColorSample, shelfColors } from "../src/lib/shelf-colors";
import type { CatalogColorChoice } from "../src/lib/catalog";

// Run the real catalog actions against isolated state, without a live account/database.
type Color = CatalogColorChoice & { materialId: string; sortOrder: number; active: boolean };
const materials = [{ id: "pla", name: "PLA", active: true }, { id: "petg", name: "PETG", active: true }];
let colors: Color[] = ["Blue", "Red", "Green"].map((name, sortOrder) => ({
  id: name.toLowerCase(), name, hex: "#123456", style: "#123456", mode: "solid", active: true, materialId: "pla", sortOrder,
}));
let serial = 0, failTransaction = false;
const state = { admin: true, events: [] as { action: string }[], paths: [] as string[] };
Reflect.set(globalThis, "libraryColorTest", state);
const ordered = (materialId: string) => colors.filter(color => color.materialId === materialId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
const memory = {
  catalogMaterial: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const material = materials.find(material => material.id === where.id);
      return material ? { ...material, colors: ordered(material.id) } : null;
    },
    findMany: async () => materials.filter(material => material.active && ordered(material.id).some(color => color.active))
      .map(material => ({ ...material, colors: ordered(material.id).filter(color => color.active) })),
  },
  catalogColor: {
    create: async ({ data }: { data: Omit<Color, "id" | "active"> }) => {
      if (colors.some(color => color.materialId === data.materialId && color.name === data.name))
        throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" });
      const color: Color = { ...data, id: `added-${++serial}`, active: true }; colors.push(color); return color;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Color> }) => {
      const color = colors.find(color => color.id === where.id); assert.ok(color); Object.assign(color, data); return color;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const color = colors.find(color => color.id === where.id);
      return color ? { ...color, material: materials.find(material => material.id === color.materialId) } : null;
    },
    delete: async ({ where }: { where: { id: string } }) => { colors = colors.filter(color => color.id !== where.id); },
  },
  $transaction: async (callback: (tx: unknown) => unknown) => {
    if (failTransaction) throw new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "test" });
    return callback(memory);
  },
};
Reflect.set(globalThis, "prisma", memory);
const stubs: Record<string, string> = {
  "/src/lib/authz.ts": 'export async function requireAdmin() { if (!globalThis.libraryColorTest.admin) throw new Error("ADMIN_REQUIRED"); return { id: "owner", role: "admin" }; }',
  "/src/lib/audit.ts": "export async function record(event) { globalThis.libraryColorTest.events.push(event); }",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = specifier === "next/cache" ? "export function revalidatePath(path) { globalThis.libraryColorTest.paths.push(path); }"
      : specifier === "next/navigation" ? 'export function redirect(path) { throw new Error("REDIRECT:" + path); }' : undefined;
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    const stub = Object.entries(stubs).find(([suffix]) => new URL(resolved.url).pathname.endsWith(suffix));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(stub[1])}`, shortCircuit: true } : resolved;
  },
});

const { addScannedColorAction, addColorAction, reorderColorsAction, removeColorAction, toggleColorAction } = await import("../src/app/admin/catalog/actions");
const { availableCatalog } = await import("../src/lib/catalog-data");
const form = (values: Record<string, string>) => {
  const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data;
};
const redirected = (action: Promise<void>, kind = "toast") => assert.rejects(action, (error: unknown) =>
  error instanceof Error && error.message.startsWith("REDIRECT:") && error.message.includes(`?${kind}=`));
const reorder = (ids: string[], previousIds = ordered("pla").map(color => color.id), materialId = "pla") =>
  form({ materialId, ids: JSON.stringify(ids), previousIds: JSON.stringify(previousIds) });

for (const material of ["PLA", "PETG", "CoPE", "Silk PLA", "Satin PLA", "TPU", "PLA-CF"]) {
  for (const scan of libraryScannedSwatches(material)) {
    const sample = shelfColorSample({ ...scan, id: "new" }, material, { brands: [], listings: [] });
    assert.equal(sample?.color.id, scan.id, "Adding a scan must display that exact scan in Library");
    assert.equal(sample?.exact, true);
  }
}
assert.deepEqual(libraryScannedSwatches("TPU"), []);
assert.ok(libraryScannedSwatches("PLA").some(scan => scan.discontinued), "On-hand discontinued filament remains available to add");

state.admin = false;
for (const action of [addScannedColorAction, addColorAction, reorderColorsAction, removeColorAction, toggleColorAction])
  await assert.rejects(action(new FormData()), /ADMIN_REQUIRED/);
assert.equal(colors.length, 3); assert.equal(state.events.length, 0);
state.admin = true;

const before = JSON.stringify(colors);
for (const data of [form({}), reorder(["blue", "blue", "red"]), reorder(["red", "blue"]),
  reorder(["red", "blue", "foreign"]), reorder(["green", "red", "blue"], ["red", "blue", "green"]),
  reorder(["green", "red", "blue"], ["blue", "red", "green"], "missing")]) {
  assert.ok((await reorderColorsAction(data)).error);
  assert.equal(JSON.stringify(colors), before, "Invalid or stale orders must leave all colors untouched");
}
assert.deepEqual(await reorderColorsAction(reorder(["green", "blue", "red"])), { saved: true });
assert.deepEqual(shelfColors((await availableCatalog())[0]!.colors).map(color => color.id), ["green", "blue", "red"],
  "The order loaded by both new and repeat request forms must match admin");
assert.ok(state.paths.includes("/story/[id]/again"));
failTransaction = true;
assert.ok((await reorderColorsAction(reorder(["red", "blue", "green"]))).error);
assert.deepEqual(ordered("pla").map(color => color.id), ["green", "blue", "red"]);
failTransaction = false;

const glacier = libraryScannedSwatches("PLA").find(scan => scan.id.endsWith("blue-glacier"))!;
assert.ok(glacier);
await redirected(addScannedColorAction(form({ materialId: "petg", sourceId: glacier.id })), "error");
assert.equal(colors.length, 3, "A forged incompatible material must not add the scan");
await redirected(addScannedColorAction(form({ materialId: "pla", sourceId: glacier.id, name: "Forged name", hex: "#000000" })));
const added = colors.find(color => color.id.startsWith("added-"))!;
assert.equal(added.name, glacier.name); assert.equal(added.hex, glacier.hex); assert.equal(added.mode, "gradient");
assert.equal(ordered("pla").at(-1)?.id, added.id, "New swatches append to the saved order");
await redirected(addScannedColorAction(form({ materialId: "pla", sourceId: glacier.id })), "error");
assert.equal(colors.length, 4, "Duplicate additions must not create another color");
await redirected(toggleColorAction(form({ id: added.id })));
assert.ok(!(await availableCatalog())[0]!.colors.some(color => color.id === added.id), "Hidden colors leave Library");
await redirected(toggleColorAction(form({ id: added.id })));
assert.ok((await availableCatalog())[0]!.colors.some(color => color.id === added.id));
await redirected(removeColorAction(form({ id: added.id })));
assert.equal(colors.length, 3);
await redirected(addColorAction(form({ materialId: "petg", name: "Custom violet", mode: "solid", hex: "#AA33CC", amazonUrl: "" })));
assert.equal(colors.at(-1)?.hex, "#aa33cc", "Custom swatches remain supported alongside scans");
assert.ok(state.events.some(event => event.action === "catalog.color_added"));
assert.ok(state.events.some(event => event.action === "catalog.color_removed"));
assert.ok(state.events.some(event => event.action === "catalog.color_reordered"));
console.info("Library colors passed: admin-only actions, exact compatible scans, custom additions, duplicate/stale/foreign rejection, serialized ordering, request-form reads, hide/show, removal, revalidation and audit events.");
