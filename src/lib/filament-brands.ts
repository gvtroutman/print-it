import type { FilamentPurchaseOption } from "@/lib/filament-purchases";

/** Initial brands for migration and isolated previews. Live settings come from the database. */
export const FILAMENT_BRANDS = [
  { name: "ELEGOO", aliases: [] },
  { name: "IEMAI", aliases: [] },
  { name: "Justmaker", aliases: [] },
  { name: "Overture", aliases: [] },
  // Open Filament Database sometimes files Polymaker's product lines as makers.
  { name: "Polymaker", aliases: ["Panchroma", "Fiberon", "PolyLite", "PolyFlex", "PolyMide", "PolySonic"] },
  { name: "SUNLU", aliases: [] },
  { name: "eSUN", aliases: ["eSUN 3D"] },
  { name: "Pinball", aliases: [] },
  { name: "JAYO", aliases: [] },
  { name: "Cookiecad", aliases: [] },
  { name: "3DHoJor", aliases: [] },
  { name: "TINMORRY", aliases: [] },
  { name: "AMOLEN", aliases: [] },
  { name: "Bambu Lab", aliases: [] },
  { name: "Voxelab", aliases: ["Voxel Lab"] },
  { name: "Creality", aliases: [] },
  { name: "GIANTARM", aliases: [] },
  { name: "Anycubic", aliases: [] },
  { name: "Flashforge", aliases: ["Flashforge 3D"] },
  { name: "YOOPAI", aliases: [] },
  { name: "Eryone", aliases: [] },
  { name: "Geeetech", aliases: [] },
  { name: "HATCHBOX", aliases: [] },
  { name: "Protopasta", aliases: [] },
  { name: "Prusament", aliases: [] },
  { name: "colorFabb", aliases: [] },
  { name: "MatterHackers", aliases: [] },
] as const;

export const filamentBrandKey = (maker: string) => maker.toLowerCase().replace(/[^a-z0-9]/g, "");
export type FilamentBrandChoice = { id?: string; name: string; aliases: readonly string[]; active?: boolean; logoUrl?: string | null };
export type FilamentListingChoice = {
  id: number; brandId: string; sourceId: string | null; name: string; type: string;
  product: string; hex: string; amazonUrl: string; active: boolean;
  purchaseOptions?: FilamentPurchaseOption[];
};
export type FilamentSettings = { brands: readonly FilamentBrandChoice[]; listings: readonly FilamentListingChoice[] };
export const DEFAULT_FILAMENT_SETTINGS: FilamentSettings = { brands: FILAMENT_BRANDS, listings: [] };

export function matchingFilamentBrand(maker: string, brands: readonly FilamentBrandChoice[]) {
  const key = filamentBrandKey(maker);
  return brands.find(brand => brand.active !== false && [brand.name, ...brand.aliases].some(name => filamentBrandKey(name) === key));
}

/** Exact normalized names only: an unrelated maker must not match a substring. */
export const buyableFilamentBrand = (maker: string, brands: readonly FilamentBrandChoice[] = FILAMENT_BRANDS): boolean => !!matchingFilamentBrand(maker, brands);
