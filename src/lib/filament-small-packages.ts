import { filamentBrandKey } from "@/lib/filament-brands";
import { filamentPurchaseOptions } from "@/lib/filament-purchases";
import type { FilamentColor } from "@/lib/filament-palette-data";

// Exact US listings checked 2026-10-12. Each URL buys the WHOLE bundle.
// Evidence and included colors: docs/filament-buying.md. No fixed prices are stored.
export function withSmallFilamentPackages(color: FilamentColor): FilamentColor {
  if (filamentBrandKey(color.maker) !== "sunlu") return color;
  const product = color.product.toLowerCase().trim();
  const name = color.name.toLowerCase().trim();
  const options = [...(color.purchaseOptions ?? [])];
  if (product === "pla" && ["black", "white", "grey", "gray", "transparent", "red", "blue", "klein blue", "orange", "sunny orange", "green"].includes(name))
    options.push({ url: "https://www.amazon.com/dp/B09TR9FXBL", label: "250 g spools · 8-color pack (2 kg total)" });
  if (["pla matte", "matte pla"].includes(product) && name === "white")
    options.push({ url: "https://www.amazon.com/dp/B0FC6HQ42G", label: "500 g refills · 4 white rolls (2 kg total)" });
  if (options.length === (color.purchaseOptions?.length ?? 0)) return color;
  const amazonUrl = color.amazonUrl ?? options[0]!.url;
  return { ...color, amazonUrl, purchaseOptions: filamentPurchaseOptions(amazonUrl, options) };
}
