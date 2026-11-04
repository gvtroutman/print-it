"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { record } from "@/lib/audit";
import { filamentBrandKey, matchingFilamentBrand } from "@/lib/filament-brands";
import { SOURCE_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { brandLogoUpload } from "@/lib/brand-logo-upload";
import { customBrandLogoUrl } from "@/lib/filament-brand-logos";
import { resolveAmazonListing } from "../../../../../scripts/lib/resolve-amazon-listing";
import { PurchaseOptionsSchema, filamentPurchaseOptions } from "@/lib/filament-purchases";

const Name = z.string().trim().min(1).max(80).transform(value => value.replace(/\s+/g, " "));
const Listing = z.object({ name: Name, type: Name, product: Name,
  hex: z.string().regex(/^#[0-9a-f]{6}$/i).transform(value => value.toLowerCase()) });
const Id = z.coerce.number().int().positive().max(1_147_483_646);

function back(id: string, kind: "toast" | "error", message: string): never {
  redirect(`/admin/catalog/brands?brand=${encodeURIComponent(id)}&${kind}=${encodeURIComponent(message)}`);
}
function refresh() {
  revalidatePath("/admin/catalog/brands");
  revalidatePath("/admin/catalog");
  revalidatePath("/upload");
  revalidatePath("/story/[id]/again", "page");
}

export type EditableBrand = { id: string; name: string; aliases: string[]; logoUrl: string | null; hasCustomLogo: boolean };
export type BrandEditState = { brand: EditableBrand; error?: string; saved?: boolean };
type BrandField = "name" | "aliases" | "logo";
class BrandInputError extends Error {}
function invalidBrand(message: string): never { throw new BrandInputError(message); }

async function persistBrand(formData: FormData, field?: BrandField) {
  const admin = await requireAdmin();
  const id = String(formData.get("brandId") ?? "");
  if (field && !id) invalidBrand("Choose an existing brand first.");
  const logo = formData.get("logo");
  let logoData: string | null | undefined = (!field || field === "logo") && formData.get("removeLogo") === "on" ? null : undefined;
  if ((!field || field === "logo") && logo instanceof File && logo.size) {
    try { logoData = await brandLogoUpload(logo); }
    catch (error) { invalidBrand(error instanceof Error ? error.message : "That logo could not be read."); }
  }
  let saved;
  try {
    saved = await db.$transaction(async tx => {
      const brands = await tx.filamentBrand.findMany();
      const current = brands.find(brand => brand.id === id);
      if (id && !current) invalidBrand("That brand is no longer available.");
      // Inline edits change one field, preserving other settings even in another tab.
      const parsed = Name.safeParse(field && field !== "name" ? current?.name : formData.get("name"));
      if (!parsed.success || !filamentBrandKey(parsed.data)) invalidBrand("Give the brand a name between 1 and 80 characters containing a letter or number.");
      const aliases = field && field !== "aliases" ? current!.aliases
        : String(formData.get("aliases") ?? "").split(/[,\n]/).map(value => value.trim()).filter(Boolean);
      if (aliases.length > 20 || aliases.some(alias => !Name.safeParse(alias).success || !filamentBrandKey(alias)))
        invalidBrand("Use up to 20 aliases, separated by commas, each between 1 and 80 characters.");
      const keys = [parsed.data, ...aliases].map(filamentBrandKey);
      if (new Set(keys).size !== keys.length) invalidBrand("Each brand name and alias must be distinct; spelling and punctuation variants already match automatically.");
      if (brands.some(brand => brand.id !== id && [brand.name, ...brand.aliases].some(name => keys.includes(filamentBrandKey(name)))))
        invalidBrand("That brand name or alias already belongs to another brand.");
      const data = { name: parsed.data, key: filamentBrandKey(parsed.data), aliases, ...(logoData !== undefined ? { logoData } : {}) };
      return id ? tx.filamentBrand.update({ where: { id }, data }) : tx.filamentBrand.create({ data });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))
      invalidBrand("Brand settings changed while saving, or that name is already used. Refresh and try again.");
    throw error;
  }
  await record({ action: id ? "catalog.brand_updated" : "catalog.brand_added", actor: admin, subject: saved.id, detail: { name: saved.name, aliases: saved.aliases, logoChanged: logoData !== undefined } });
  refresh();
  return saved;
}

export async function saveBrandAction(formData: FormData): Promise<void> {
  let saved;
  try { saved = await persistBrand(formData); }
  catch (error) {
    if (error instanceof BrandInputError) back(String(formData.get("brandId") ?? ""), "error", error.message);
    throw error;
  }
  back(saved.id, "toast", `${saved.name} saved.`);
}

export async function updateBrandAction(previous: BrandEditState, formData: FormData): Promise<BrandEditState> {
  const field = formData.get("field");
  if (field !== "name" && field !== "aliases" && field !== "logo") {
    await requireAdmin();
    return { brand: previous.brand, error: "Choose a brand setting to edit." };
  }
  try {
    const brand = await persistBrand(formData, field);
    return { saved: true, brand: { id: brand.id, name: brand.name, aliases: brand.aliases,
      logoUrl: brand.logoData ? customBrandLogoUrl(brand.id, brand.updatedAt) : null, hasCustomLogo: Boolean(brand.logoData) } };
  } catch (error) {
    if (error instanceof BrandInputError) return { brand: previous.brand, error: error.message };
    throw error;
  }
}

export async function toggleBrandAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("brandId") ?? "");
  const brand = await db.filamentBrand.findUnique({ where: { id } });
  if (!brand) back(id, "error", "That brand is no longer available.");
  await db.filamentBrand.update({ where: { id }, data: { active: !brand.active } });
  await record({ action: "catalog.brand_availability_changed", actor: admin, subject: id, detail: { active: !brand.active } });
  refresh();
  back(id, "toast", `${brand.name} ${brand.active ? "hidden from" : "enabled in"} the picker.`);
}

export async function saveListingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const brand = await db.filamentBrand.findUnique({ where: { id: brandId } });
  if (!brand) back(brandId, "error", "Choose an existing brand first.");
  const sourceId = String(formData.get("sourceId") ?? "").trim() || null;
  const source = sourceId ? SOURCE_FILAMENT_COLORS.find(color => color.id === sourceId) : null;
  if (sourceId && (!source || source.translucent || !matchingFilamentBrand(source.maker, [{ ...brand, active: true }])))
    back(brandId, "error", "Choose a solid catalog color belonging to this brand.");
  const values = source ? { name: source.name, type: source.type, product: source.product, hex: source.hex }
    : Object.fromEntries(["name", "type", "product", "hex"].map(key => [key, formData.get(key)]));
  const parsed = Listing.safeParse(values);
  if (!parsed.success) back(brandId, "error", "Supply a product, material, color name and valid six-digit hex color.");
  const rawUrl = String(formData.get("amazonUrl") ?? "").trim();
  if (rawUrl.length > 2048) back(brandId, "error", "That Amazon URL is too long.");
  const amazonUrl = await resolveAmazonListing(rawUrl);
  if (!amazonUrl) back(brandId, "error", "Use an exact Amazon product listing, not a search page or brand storefront.");
  let packages: unknown;
  try { packages = JSON.parse(String(formData.get("purchaseOptions") ?? "[]")); }
  catch { back(brandId, "error", "Supply valid package sizes and exact Amazon links."); }
  const options = PurchaseOptionsSchema.safeParse(packages);
  if (!options.success) back(brandId, "error", "Give each package a size label and an exact Amazon link (up to seven alternatives).");
  const packageLabel = String(formData.get("packageLabel") ?? "").trim();
  if (packageLabel.length > 80) back(brandId, "error", "Keep the package size label under 80 characters.");
  if (options.data.some(option => new URL(option.url).hostname !== new URL(amazonUrl).hostname))
    back(brandId, "error", "Use the same Amazon marketplace for all package sizes so their prices can be compared.");
  if (new Set([amazonUrl, ...options.data.map(option => option.url)]).size !== options.data.length + 1 || options.data.length > 7)
    back(brandId, "error", "Use distinct links for up to seven alternative package sizes.");
  const purchaseOptions = filamentPurchaseOptions(amazonUrl, [...(packageLabel ? [{ url: amazonUrl, label: packageLabel }] : []), ...options.data]);
  const rawId = formData.get("listingId");
  const listingId = rawId ? Id.safeParse(rawId) : null;
  if (listingId && !listingId.success) back(brandId, "error", "That listing is no longer available.");
  const held = listingId?.success ? await db.filamentListing.findFirst({ where: { id: listingId.data, brandId } }) : null;
  if (listingId?.success && !held) back(brandId, "error", "That listing does not belong to this brand.");
  let saved;
  try {
    const data = { ...parsed.data, brandId, sourceId, amazonUrl, purchaseOptions };
    saved = held ? await db.filamentListing.update({ where: { id: held.id }, data }) : await db.filamentListing.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      back(brandId, "error", "This catalog color already has an admin listing. Edit its existing entry.");
    throw error;
  }
  await record({ action: "catalog.listing_saved", actor: admin, subject: String(saved.id), detail: { brand: brand.name, name: saved.name, amazonUrl } });
  refresh();
  back(brandId, "toast", `${saved.product} · ${saved.name} listing saved.`);
}

export async function toggleListingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const parsed = Id.safeParse(formData.get("listingId"));
  if (!parsed.success) back(brandId, "error", "That listing is no longer available.");
  const listing = await db.filamentListing.findFirst({ where: { id: parsed.data, brandId } });
  if (!listing) back(brandId, "error", "That listing does not belong to this brand.");
  await db.filamentListing.update({ where: { id: listing.id }, data: { active: !listing.active } });
  await record({ action: "catalog.listing_availability_changed", actor: admin, subject: String(listing.id), detail: { active: !listing.active } });
  refresh();
  back(brandId, "toast", `${listing.name} ${listing.active ? "hidden" : "enabled"}.`);
}
