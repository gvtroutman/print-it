import sources from "../../public/filament-glow/sources.json";
import { filamentMatchesColorFilter } from "@/lib/filament-color-types";
import { printedSwatchId } from "@/lib/filament-ids";

type GlowColor = { name: string; type: string; maker?: string; product?: string; pageUrl?: string | null };
const photos = new Map(sources.photos.map(photo => [photo.sampleId, photo]));
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Manufacturer glow examples verified for this exact sample, never a nearby daylight hex. */
export function filamentGlowPhoto(color: GlowColor): string | null {
  if (!filamentMatchesColorFilter(color, "Glow")) return null;
  const id = printedSwatchId(color.pageUrl);
  const photo = id === null ? undefined : photos.get(id);
  if (!photo || !color.maker || key(color.maker) !== key(photo.maker) || key(color.type) !== key(photo.type)) return null;
  return `/filament-glow/${photo.file}`;
}
