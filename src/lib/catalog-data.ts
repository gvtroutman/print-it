import "server-only";

import { db } from "@/lib/db";
import {
  ANY_COLOR,
  AUTO_MATERIAL,
  WHATEVER_HEX,
  WHATEVER_STYLE,
  type CatalogMaterialChoice,
  type ColorMode,
  type Wish,
} from "@/lib/catalog";
import { LibraryUnavailable, librarySwatch, swatchColour, swatchFits } from "@/lib/filament-library";

/** Only materials with at least one available colour can be requested. */
export async function availableCatalog(): Promise<CatalogMaterialChoice[]> {
  const materials = await db.catalogMaterial.findMany({
    where: { active: true, colors: { some: { active: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      strength: true,
      flex: true,
      heat: true,
      finish: true,
      outdoors: true,
      colors: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, hex: true, style: true, mode: true },
      },
    },
  });
  // The five marks are columns on the row; the chart wants them as one object.
  return materials.map(({ strength, flex, heat, finish, outdoors, ...material }) => ({
    ...material,
    ratings: { strength, flex, heat, finish, outdoors },
  }));
}

/**
 * Material labels that can appear in history filters. This includes retired
 * or renamed catalog entries whenever an existing story still snapshots the
 * old label.
 */
export async function knownMaterialNames(): Promise<string[]> {
  const [catalogMaterials, storyMaterials] = await Promise.all([
    db.catalogMaterial.findMany({ select: { name: true } }),
    db.story.findMany({ distinct: ["material"], select: { material: true } }),
  ]);

  return [...new Set([
    ...catalogMaterials.map(({ name }) => name),
    ...storyMaterials.map(({ material }) => material),
  ])].sort((a, b) => a.localeCompare(b));
}

/** Authoritative lookup used at submission time, not the browser's copy. */
export function availableSelection(material: string, colorName: string) {
  return db.catalogColor.findFirst({
    where: {
      active: true,
      name: colorName,
      material: { active: true, name: material },
    },
    select: { hex: true, style: true, mode: true },
  });
}

/** The spool a ticket asks the owner to buy, as the story row stores it. */
export type SpoolToBuy = {
  swatchId: number;
  swatchMaker: string;
  swatchType: string;
  swatchBuyUrl: string | null;
};

/** What a wish's colour comes to, ready to snapshot onto a ticket. */
export type Selection = {
  colorName: string;
  hex: string;
  style: string;
  mode: ColorMode;
  /** Null for a colour on the shelf. */
  toBuy: SpoolToBuy | null;
};

export type SelectionResult =
  | { ok: true; selection: Selection }
  /** `off`: not on the shelf. `misfit`: a swatch of another kind of filament. */
  | { ok: false; reason: "off" | "gone" | "misfit" | "unreachable" };

/**
 * A wish's material and colour, held to what can be had today: a shelf
 * colour from the catalogue, or a spool to buy from the filamentcolors.xyz
 * library (or SpoolmanDB). A spool to buy still needs its material on offer — the owner
 * prints the materials they print — and has to be that kind of filament.
 * Its name and colour come from the library, never from the form.
 */
export async function resolveSelection(
  wish: Pick<Wish, "material" | "colorName" | "swatchId"> & Partial<Pick<Wish, "colorHex">>,
): Promise<SelectionResult> {
  if (wish.material === AUTO_MATERIAL) return autoSelection(wish.colorName, wish.colorHex ?? null);
  if (wish.swatchId == null) {
    const found = await availableSelection(wish.material, wish.colorName);
    return found ? { ok: true, selection: { colorName: wish.colorName, ...found, toBuy: null } } : { ok: false, reason: "off" };
  }

  const material = await db.catalogMaterial.findFirst({
    where: { active: true, name: wish.material, colors: { some: { active: true } } },
    select: { name: true },
  });
  if (!material) return { ok: false, reason: "off" };

  let swatch;
  try {
    swatch = await librarySwatch(wish.swatchId);
  } catch (error) {
    if (error instanceof LibraryUnavailable) return { ok: false, reason: "unreachable" };
    throw error;
  }
  if (!swatch) return { ok: false, reason: "gone" };
  if (!swatchFits(material.name, swatch)) return { ok: false, reason: "misfit" };

  // The colour as photographed: what the requester saw when they picked it,
  // and what the 3D viewer should paint the model with.
  const hex = swatchColour(swatch);
  return {
    ok: true,
    selection: {
      colorName: swatch.name,
      hex,
      style: hex,
      mode: "solid",
      toBuy: {
        swatchId: swatch.id,
        swatchMaker: swatch.maker,
        swatchType: swatch.type,
        swatchBuyUrl: swatch.buyUrl,
      },
    },
  };
}

/**
 * An Auto wish's colour. The owner picks the filament, so the colour is not
 * held to one material's shelf: any colour, a shelf colour of any material
 * by name, or the requester's own by hex. A spool to buy is a kind of
 * filament, which Auto leaves open, so a swatch is not read.
 */
async function autoSelection(colorName: string, colorHex: string | null): Promise<SelectionResult> {
  if (colorName === "" || colorName === ANY_COLOR) {
    return { ok: true, selection: { colorName: ANY_COLOR, hex: WHATEVER_HEX, style: WHATEVER_STYLE, mode: "whatever", toBuy: null } };
  }
  const shelf = await db.catalogColor.findFirst({
    where: { active: true, name: colorName, material: { active: true } },
    orderBy: { material: { sortOrder: "asc" } },
    select: { hex: true, style: true, mode: true },
  });
  if (shelf) return { ok: true, selection: { colorName, ...shelf, toBuy: null } };
  if (colorHex) {
    const hex = colorHex.toLowerCase();
    return { ok: true, selection: { colorName, hex, style: hex, mode: "solid", toBuy: null } };
  }
  return { ok: false, reason: "off" };
}

/** What to tell the requester when `resolveSelection` says no. */
export const SELECTION_REFUSAL: Record<Exclude<SelectionResult, { ok: true }>["reason"], { status: number; message: string }> = {
  off: { status: 400, message: "That material and color combination is no longer available." },
  gone: { status: 409, message: "That spool is not in the spool library any more — pick another." },
  misfit: { status: 400, message: "That spool is a different kind of filament from the material picked." },
  unreachable: {
    status: 503,
    message: "The spool library cannot be reached right now. Pick a color on the shelf, or try again later.",
  },
};
