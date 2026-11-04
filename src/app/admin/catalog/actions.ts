"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { record } from "@/lib/audit";
import { AUTO_MATERIAL, COLOR_MODES, MAX_MATERIAL_DESCRIPTION, WHATEVER_HEX, WHATEVER_STYLE, funfettiStyle } from "@/lib/catalog";
import { TOP_MARK, TRAITS, asMark, type OwnerRatings } from "@/lib/filament-traits";
import { resolveAmazonListing } from "../../../../scripts/lib/resolve-amazon-listing";
import { libraryScannedSwatches } from "@/lib/library-swatches";

const Name = z.string().trim().min(1).max(40).transform((value) => value.replace(/\s+/g, " "));
/** One paragraph: line breaks and runs of spaces fold to single spaces. */
const Description = z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().max(MAX_MATERIAL_DESCRIPTION));
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toLowerCase());
/** One chart mark from the ratings form: blank hands the trait back to the built-in table. */
const OwnMark = z.string().trim().transform((value, ctx) => {
  if (value === "") return null;
  const mark = asMark(Number(value));
  if (mark === null) {
    ctx.addIssue({ code: "custom", message: `A mark is a whole number from 1 to ${TOP_MARK}.` });
    return z.NEVER;
  }
  return mark;
});
const Direction = z.enum(["up", "down"]);
const Mode = z.enum(COLOR_MODES);

async function colorInput(formData: FormData) {
  const parsedName = Name.safeParse(formData.get("name"));
  if (!parsedName.success) back("error", "Give the color a name between 1 and 40 characters.");
  const name = parsedName.data;
  const parsedMode = Mode.safeParse(formData.get("mode"));
  if (!parsedMode.success) back("error", "Choose a valid swatch type.");
  const mode = parsedMode.data;
  const parsedHex = mode === "whatever" ? null : Hex.safeParse(formData.get("hex"));
  const parsedHexVia = mode !== "gradient" ? null : Hex.safeParse(formData.get("hexVia"));
  const parsedHexTo = mode !== "gradient" ? null : Hex.safeParse(formData.get("hexTo"));
  if (parsedHex && !parsedHex.success) back("error", "Choose a valid color.");
  if (parsedHexVia && !parsedHexVia.success) back("error", "Choose a valid middle gradient color.");
  if (parsedHexTo && !parsedHexTo.success) back("error", "Choose a valid last gradient color.");
  const hex = mode === "whatever" ? WHATEVER_HEX : parsedHex!.data;
  const style = mode === "whatever"
    ? WHATEVER_STYLE
    : mode === "gradient"
      ? `linear-gradient(135deg, ${hex}, ${parsedHexVia!.data}, ${parsedHexTo!.data})`
      : mode === "funfetti"
        ? funfettiStyle(hex)
        : hex;
  // An older open form has no link field; preserve its saved link on edit.
  let amazonUrl: string | null | undefined;
  if (formData.has("amazonUrl")) {
    const raw = String(formData.get("amazonUrl") ?? "").trim();
    if (raw.length > 2048) back("error", "The filament product link must be at most 2048 characters.");
    amazonUrl = mode === "whatever" || !raw ? null : await resolveAmazonListing(raw);
    if (mode !== "whatever" && raw && !amazonUrl) back("error", "Use an exact Amazon product/color link for the filament, or leave it blank.");
  }
  return { name, hex, style, mode, amazonUrl };
}

function back(kind: "toast" | "error", message: string): never {
  redirect(`/admin/catalog?${kind}=${encodeURIComponent(message)}`);
}

function duplicate(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function refreshColors() {
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
}

export async function addScannedColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const materialId = String(formData.get("materialId") ?? "");
  const material = await db.catalogMaterial.findUnique({
    where: { id: materialId }, include: { colors: { select: { sortOrder: true } } },
  });
  if (!material) back("error", "That material no longer exists.");
  const scan = libraryScannedSwatches(material.name).find(scan => scan.id === formData.get("sourceId"));
  if (!scan) back("error", "Choose a scanned swatch compatible with this material.");
  const { name, hex, style, mode } = scan;
  try {
    await db.catalogColor.create({ data: { materialId, name, hex, style, mode,
      sortOrder: material.colors.reduce((max, color) => Math.max(max, color.sortOrder), -1) + 1 } });
  } catch (error) {
    if (duplicate(error)) back("error", `${material.name} already has a color named ${name}.`);
    throw error;
  }
  await record({ action: "catalog.color_added", actor: admin, subject: `${material.name} · ${name}`,
    detail: { sourceId: scan.id, hex, style, mode } });
  refreshColors();
  back("toast", `${name} added to the ${material.name} Library.`);
}

const OrderedIds = z.array(z.string().min(1).max(100)).max(2000);

export async function reorderColorsAction(formData: FormData): Promise<{ error?: string; saved?: boolean }> {
  const admin = await requireAdmin();
  let ids: string[], previousIds: string[];
  try {
    ids = OrderedIds.parse(JSON.parse(String(formData.get("ids") ?? "")));
    previousIds = OrderedIds.parse(JSON.parse(String(formData.get("previousIds") ?? "")));
  } catch { return { error: "Supply a valid swatch order." }; }
  if (new Set(ids).size !== ids.length || new Set(previousIds).size !== previousIds.length)
    return { error: "Each swatch must appear exactly once." };
  const materialId = String(formData.get("materialId") ?? "");
  const stale = "The Library changed while you were editing. Refresh and try again.";
  let result: { error: string } | { name: string };
  try {
    result = await db.$transaction(async tx => {
      const material = await tx.catalogMaterial.findUnique({ where: { id: materialId },
        include: { colors: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } } } });
      if (!material) return { error: "That material no longer exists." };
      const current = material.colors.map(color => color.id);
      if (current.length !== ids.length || current.length !== previousIds.length
        || current.some((id, index) => id !== previousIds[index]) || ids.some(id => !current.includes(id)))
        return { error: stale };
      for (const [sortOrder, id] of ids.entries())
        await tx.catalogColor.update({ where: { id }, data: { sortOrder } });
      return { name: material.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { error: stale };
    throw error;
  }
  if ("error" in result) return result;
  await record({ action: "catalog.color_reordered", actor: admin, subject: result.name, detail: { ids } });
  refreshColors();
  return { saved: true };
}

export async function addMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = Name.safeParse(formData.get("name"));
  if (!parsed.success) back("error", "Material names must be between 1 and 40 characters.");
  if (parsed.data.toLowerCase() === AUTO_MATERIAL.toLowerCase()) back("error", `${AUTO_MATERIAL} is taken: it is what a request says to leave the filament to you.`);

  const last = await db.catalogMaterial.aggregate({ _max: { sortOrder: true } });
  try {
    await db.catalogMaterial.create({
      data: { name: parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
  } catch (error) {
    if (duplicate(error)) back("error", `${parsed.data} is already in the catalog.`);
    throw error;
  }
  await record({ action: "catalog.material_added", actor: admin, subject: parsed.data });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", `${parsed.data} added. Give it at least one color to offer it.`);
}

export async function toggleMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const material = await db.catalogMaterial.findUnique({ where: { id } });
  if (!material) back("error", "That material no longer exists.");
  const updated = await db.catalogMaterial.update({
    where: { id },
    data: { active: !material.active },
  });
  await record({
    action: "catalog.material_availability_changed",
    actor: admin,
    subject: material.name,
    detail: { active: updated.active },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", `${material.name} is now ${updated.active ? "available" : "unavailable"}.`);
}

export async function editMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsedName = Name.safeParse(formData.get("name"));
  if (!parsedName.success) back("error", "Material names must be between 1 and 40 characters.");
  if (parsedName.data.toLowerCase() === AUTO_MATERIAL.toLowerCase()) back("error", `${AUTO_MATERIAL} is taken: it is what a request says to leave the filament to you.`);
  const material = await db.catalogMaterial.findUnique({ where: { id }, select: { name: true } });
  if (!material) back("error", "That material no longer exists.");
  try {
    await db.catalogMaterial.update({ where: { id }, data: { name: parsedName.data } });
  } catch (error) {
    if (duplicate(error)) back("error", `${parsedName.data} is already in the catalog.`);
    throw error;
  }
  await record({
    action: "catalog.material_updated",
    actor: admin,
    subject: parsedName.data,
    detail: { previousName: material.name },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", `${material.name} renamed to ${parsedName.data}.`);
}

export async function describeMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = Description.safeParse(formData.get("description") ?? "");
  if (!parsed.success) back("error", `Keep the description under ${MAX_MATERIAL_DESCRIPTION} characters.`);
  const material = await db.catalogMaterial.findUnique({ where: { id }, select: { name: true } });
  if (!material) back("error", "That material no longer exists.");
  await db.catalogMaterial.update({ where: { id }, data: { description: parsed.data } });
  await record({
    action: "catalog.material_updated",
    actor: admin,
    subject: material.name,
    detail: { description: parsed.data },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", parsed.data ? `${material.name}'s description saved.` : `${material.name}'s description removed.`);
}

export async function rateMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const marks: Partial<OwnerRatings> = {};
  for (const { key, label } of TRAITS) {
    const parsed = OwnMark.safeParse(formData.get(key) ?? "");
    if (!parsed.success) back("error", `${label} must be a whole number from 1 to ${TOP_MARK}, or left to the built-in table.`);
    marks[key] = parsed.data;
  }
  const material = await db.catalogMaterial.findUnique({ where: { id }, select: { name: true } });
  if (!material) back("error", "That material no longer exists.");
  await db.catalogMaterial.update({ where: { id }, data: marks });
  await record({
    action: "catalog.material_updated",
    actor: admin,
    subject: material.name,
    // One entry per trait so the audit page prints "heat: 2" and "flex: built-in".
    detail: Object.fromEntries(TRAITS.map(({ key }) => [key, marks[key] ?? "built-in"])),
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  const own = TRAITS.filter(({ key }) => marks[key] !== null).length;
  back("toast", own
    ? `${material.name}'s chart ratings saved: ${own} of your own, the rest from the built-in table.`
    : `${material.name} is back on the built-in chart ratings.`);
}

export async function removeMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const material = await db.catalogMaterial.findUnique({
    where: { id },
    select: { name: true, _count: { select: { colors: true } } },
  });
  if (!material) back("error", "That material no longer exists.");
  await db.catalogMaterial.delete({ where: { id } });
  await record({
    action: "catalog.material_removed",
    actor: admin,
    subject: material.name,
    detail: { colorsRemoved: material._count.colors },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", `${material.name} and its colors were removed. Old tickets are unchanged.`);
}

export async function moveMaterialAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsedDirection = Direction.safeParse(formData.get("direction"));
  if (!parsedDirection.success) back("error", "Choose a valid direction.");

  const materials = await db.catalogMaterial.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const from = materials.findIndex((material) => material.id === id);
  if (from < 0) back("error", "That material no longer exists.");
  const to = parsedDirection.data === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= materials.length) back("error", "That material is already at the end of the list.");
  [materials[from], materials[to]] = [materials[to], materials[from]];
  await db.$transaction(
    materials.map((material, sortOrder) => db.catalogMaterial.update({
      where: { id: material.id },
      data: { sortOrder },
    })),
  );
  await record({
    action: "catalog.material_reordered",
    actor: admin,
    subject: materials[to].name,
    detail: { direction: parsedDirection.data, position: to + 1 },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  back("toast", `${materials[to].name} moved ${parsedDirection.data}.`);
}

export async function addColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const materialId = String(formData.get("materialId") ?? "");
  const { name, hex, style, mode, amazonUrl } = await colorInput(formData);

  const material = await db.catalogMaterial.findUnique({
    where: { id: materialId },
    include: { colors: { select: { sortOrder: true } } },
  });
  if (!material) back("error", "That material no longer exists.");
  const sortOrder = material.colors.reduce((max, color) => Math.max(max, color.sortOrder), -1) + 1;
  try {
    await db.catalogColor.create({
      data: { materialId, name, hex, style, mode, amazonUrl, sortOrder },
    });
  } catch (error) {
    if (duplicate(error)) back("error", `${material.name} already has a color named ${name}.`);
    throw error;
  }
  await record({
    action: "catalog.color_added",
    actor: admin,
    subject: `${material.name} · ${name}`,
    detail: { hex, style, mode, amazonUrl },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
  back("toast", `${name} added to ${material.name}.`);
}

export async function editColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { name, hex, style, mode, amazonUrl } = await colorInput(formData);
  const color = await db.catalogColor.findUnique({
    where: { id },
    include: { material: { select: { name: true } } },
  });
  if (!color) back("error", "That color no longer exists.");
  try {
    await db.catalogColor.update({ where: { id }, data: { name, hex, style, mode, amazonUrl } });
  } catch (error) {
    if (duplicate(error)) back("error", `${color.material.name} already has a color named ${name}.`);
    throw error;
  }
  await record({
    action: "catalog.color_updated",
    actor: admin,
    subject: `${color.material.name} · ${name}`,
    detail: { previousName: color.name, previousStyle: color.style, previousMode: color.mode, previousAmazonUrl: color.amazonUrl, hex, style, mode, amazonUrl },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
  back("toast", `${name} updated for ${color.material.name}.`);
}

export async function toggleColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const color = await db.catalogColor.findUnique({
    where: { id },
    include: { material: { select: { name: true } } },
  });
  if (!color) back("error", "That color no longer exists.");
  const updated = await db.catalogColor.update({
    where: { id },
    data: { active: !color.active },
  });
  await record({
    action: "catalog.color_availability_changed",
    actor: admin,
    subject: `${color.material.name} · ${color.name}`,
    detail: { active: updated.active, hex: color.hex },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
  back("toast", `${color.name} is now ${updated.active ? "available" : "unavailable"} for ${color.material.name}.`);
}

export async function removeColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const color = await db.catalogColor.findUnique({
    where: { id },
    include: { material: { select: { name: true } } },
  });
  if (!color) back("error", "That color no longer exists.");
  await db.catalogColor.delete({ where: { id } });
  await record({
    action: "catalog.color_removed",
    actor: admin,
    subject: `${color.material.name} · ${color.name}`,
    detail: { hex: color.hex, style: color.style },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
  back("toast", `${color.name} was removed from ${color.material.name}. Old tickets are unchanged.`);
}

export async function moveColorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsedDirection = Direction.safeParse(formData.get("direction"));
  if (!parsedDirection.success) back("error", "Choose a valid direction.");

  const selected = await db.catalogColor.findUnique({
    where: { id },
    select: { materialId: true, material: { select: { name: true } } },
  });
  if (!selected) back("error", "That color no longer exists.");
  const colors = await db.catalogColor.findMany({
    where: { materialId: selected.materialId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const from = colors.findIndex((color) => color.id === id);
  const to = parsedDirection.data === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= colors.length) back("error", "That color is already at the end of the list.");
  [colors[from], colors[to]] = [colors[to], colors[from]];
  await db.$transaction(
    colors.map((color, sortOrder) => db.catalogColor.update({
      where: { id: color.id },
      data: { sortOrder },
    })),
  );
  await record({
    action: "catalog.color_reordered",
    actor: admin,
    subject: `${selected.material.name} · ${colors[to].name}`,
    detail: { direction: parsedDirection.data, position: to + 1 },
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
  back("toast", `${colors[to].name} moved ${parsedDirection.data} for ${selected.material.name}.`);
}
