import "server-only";
import { amazonProducts } from "@/lib/amazon-products";
import { filamentPurchaseOptions, lowestFilamentPurchase, type FilamentPurchaseOption } from "@/lib/filament-purchases";

/** Snapshot the same lowest checked package used by the picker onto new tickets. */
export async function cheapestFilamentListing(url: string | null, options?: readonly FilamentPurchaseOption[]): Promise<string | null> {
  const choices = filamentPurchaseOptions(url, options);
  if (choices.length < 2) return choices[0]?.url ?? null;
  return lowestFilamentPurchase(choices, await amazonProducts(choices.map(choice => choice.url))).option?.url ?? url;
}
