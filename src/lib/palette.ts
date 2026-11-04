import "server-only";

import { db } from "@/lib/db";
import { PaletteColorSchema, type SavedPaletteColor } from "@/lib/palette-types";
import type { Actor } from "@/lib/scope";
import { StoryProblem } from "@/lib/stories";
import { colorDisplayName } from "@/lib/filament-color-types";

const FIELDS = { id: true, name: true, hex: true, alpha: true } as const;
const displayColor = (color: SavedPaletteColor): SavedPaletteColor => ({ ...color, name: colorDisplayName(color.name) });

export async function listPalette(actor: Pick<Actor, "id">): Promise<SavedPaletteColor[]> {
  const colors = await db.savedColor.findMany({
    where: { userId: actor.id },
    select: FIELDS,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return colors.map(displayColor);
}

export async function savePaletteColor(actor: Pick<Actor, "id">, input: unknown): Promise<SavedPaletteColor> {
  const parsed = PaletteColorSchema.safeParse(input);
  if (!parsed.success) throw new StoryProblem(400, "Choose a color with a name, a six-digit hex value and opacity from 0 to 1.");
  const { name, hex, alpha } = parsed.data;
  // The unique key also makes concurrent or repeated saves idempotent.
  const color = await db.savedColor.upsert({
    where: { userId_hex_alpha: { userId: actor.id, hex, alpha } },
    create: { userId: actor.id, name, hex, alpha },
    update: {},
    select: FIELDS,
  });
  return displayColor(color);
}

export async function removePaletteColor(actor: Pick<Actor, "id">, id: string): Promise<number> {
  // An owner's palette is private too: admin status grants no access here.
  const { count } = await db.savedColor.deleteMany({ where: { id, userId: actor.id } });
  return count;
}
