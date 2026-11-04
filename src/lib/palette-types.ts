import { z } from "zod";
import { colorDisplayName } from "@/lib/filament-color-types";

export const PaletteColorSchema = z.object({
  name: z.string().trim().min(1).max(80).transform(colorDisplayName).refine(name => name.length > 0),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i).transform((hex) => hex.toLowerCase()),
  alpha: z.number().min(0).max(1).default(1),
}).strict();

export type PaletteColorInput = z.infer<typeof PaletteColorSchema>;
export type SavedPaletteColor = PaletteColorInput & { id: string };
