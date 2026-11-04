import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { FilamentSettings } from "@/lib/filament-brands";
import { customBrandLogoUrl } from "@/lib/filament-brand-logos";
import { savedPurchaseOptions } from "@/lib/filament-purchases";

/** Request-scoped only: admin changes take effect on the next read. */
export const filamentSettings = cache(async (): Promise<FilamentSettings> => {
  const brands = await db.filamentBrand.findMany({
    orderBy: { name: "asc" }, include: { listings: { orderBy: { id: "asc" } } },
  });
  return {
    brands: brands.map(({ id, name, aliases, active, logoData, updatedAt }) => ({ id, name, aliases, active,
      logoUrl: logoData ? customBrandLogoUrl(id, updatedAt) : null })),
    listings: brands.flatMap(brand => brand.listings.map(({ id, brandId, sourceId, name, type, product, hex, amazonUrl, active, purchaseOptions }) =>
      ({ id, brandId, sourceId, name, type, product, hex, amazonUrl, active, purchaseOptions: savedPurchaseOptions(purchaseOptions) }))),
  };
});
