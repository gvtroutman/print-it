import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button, Kicker, Label, Notice } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { sharedFilamentUrl } from "@/lib/shared-filament";
import { matchingFilamentBrand } from "@/lib/filament-brands";
import { SOURCE_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { savedPurchaseOptions } from "@/lib/filament-purchases";
import { ListingForm } from "@/app/admin/catalog/brands/listing-form";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
export default async function ShareFilamentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const url = sharedFilamentUrl({ url: value("url"), text: value("text"), title: value("title") }) ?? "";
  const query = new URLSearchParams();
  // Keep the link through an expired session as well as a first-time sign-in.
  if (url) query.set("url", url);
  if (value("brand").length <= 80 && value("brand")) query.set("brand", value("brand"));
  const admin = await requireUser(`/share-filament${query.size ? `?${query}` : ""}`);
  if (admin.role !== "admin") notFound();
  const brands = await db.filamentBrand.findMany({ orderBy: { name: "asc" } });
  const selected = brands.find(brand => brand.id === value("brand"));
  const existing = selected && url ? await db.filamentListing.findFirst({ where: { brandId: selected.id, amazonUrl: url } }) : null;
  const sources = selected ? SOURCE_FILAMENT_COLORS.filter(color => !color.translucent && matchingFilamentBrand(color.maker, [{ ...selected, active: true }]))
    .sort((a, b) => a.product.localeCompare(b.product) || a.name.localeCompare(b.name))
    .map(({ id, name, type, product, hex }) => ({ id, name, type, product, hex })) : [];
  const received = !!(value("url") || value("text") || value("title"));

  return <>
    <AppHeader user={admin} active="/admin/catalog" />
    <main className="mx-auto w-full max-w-[760px] px-[22px] pb-[80px] pt-[35px]">
      <Kicker>Filament on the market</Kicker>
      <h1 className="m-0 mb-[14px] text-[38px] leading-[1.1] text-ink">Add Amazon filament</h1>
      <p className="m-0 mb-[22px] text-[16px] leading-[1.5] text-ink-2">Save your filament finds to the market catalog. Choose the brand, then check the listing’s material, color and package size before saving.</p>
      {received && !url && <div className="mb-[18px]"><Notice tone="warn">No Amazon product link was found. Choose a brand, then paste an exact listing or Amazon short link below.</Notice></div>}
      {url && <div className="mb-[18px] rounded-card border-2 border-ink bg-cream-2 p-[14px]"><span className="block text-[12px] font-bold text-ink-2">Received from Amazon</span><p data-shared-url className="mb-0 mt-[6px] break-all text-[14px] text-ink">{url}</p></div>}
      {brands.length ? <>
        <form action="/share-filament" method="get" className="mb-[22px] rounded-panel border-[3px] border-ink bg-porcelain p-[20px]">
          {url && <input type="hidden" name="url" value={url} />}
          <Label htmlFor="share-brand">Filament brand</Label>
          <select id="share-brand" name="brand" required defaultValue={selected?.id ?? ""} className="mb-[14px] min-h-[49px] w-full min-w-0 rounded-card border-[3px] border-ink bg-porcelain px-[10px] text-[16px] text-ink">
            <option value="" disabled>Choose a brand</option>
            {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}{brand.active ? "" : " (hidden)"}</option>)}
          </select>
          <Button type="submit" variant="secondary">{selected ? "Change brand" : "Continue"}</Button>
          <Link href="/admin/catalog/brands" className="ml-[14px] text-[13px] font-bold text-ink-2 underline">Add a new brand</Link>
        </form>
        {selected && <section className="rounded-panel border-[3px] border-ink bg-aqua-wash p-[20px] shadow-stamp">
          <h2 className="m-0 mb-[16px] break-words text-[24px] text-ink">{selected.name} · {existing ? "Edit saved listing" : "New listing"}</h2>
          {!selected.active && <div className="mb-[16px]"><Notice tone="warn">This brand is hidden. Enable it in Brands &amp; Amazon links to show its listings in the market picker.</Notice></div>}
          {existing && <div className="mb-[16px]"><Notice tone="good">This link is already saved for this brand. You can update its details below.</Notice></div>}
          <ListingForm key={`${selected.id}|${url}`} brandId={selected.id} sources={sources} initialAmazonUrl={url}
            listing={existing ? { ...existing, purchaseOptions: savedPurchaseOptions(existing.purchaseOptions) } : undefined} />
        </section>}
      </> : <Notice tone="warn">Add a filament brand first in <Link href="/admin/catalog/brands" className="font-bold underline">Brands &amp; Amazon links</Link>, then return here to save your find.</Notice>}
      <div className="mt-[24px] flex flex-wrap gap-[18px] text-[14px] font-bold text-ink-2">
        <Link href="/install" className="underline underline-offset-4">Install on Android</Link>
        <Link href="/admin/catalog/brands" className="underline underline-offset-4">Brands &amp; Amazon links</Link>
      </div>
    </main>
  </>;
}
