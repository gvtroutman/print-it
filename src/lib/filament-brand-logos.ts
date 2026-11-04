import sources from "../../public/filament-brands/sources.json";
import { filamentBrandKey } from "@/lib/filament-brands";

export function filamentBrandLogo(brand: { name: string; logoUrl?: string | null }): string | null {
  if (brand.logoUrl) return brand.logoUrl;
  const key = filamentBrandKey(brand.name);
  return Object.hasOwn(sources.logos, key) ? `/filament-brands/${key}.webp` : null;
}

export const customBrandLogoUrl = (id: string, updatedAt: Date) =>
  `/api/filament-brands/${encodeURIComponent(id)}/logo?v=${updatedAt.getTime()}`;
