import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Button, Input, Kicker, Label, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { matchingFilamentBrand } from "@/lib/filament-brands";
import { BrandLogo } from "@/components/brand-logo";
import { customBrandLogoUrl } from "@/lib/filament-brand-logos";
import { SOURCE_FILAMENT_COLORS } from "@/lib/filament-settings-data";
import { ListingForm } from "./listing-form";
import { saveBrandAction } from "./actions";
import { BrandEditor } from "./brand-editor";
import { ListingsTable } from "./listings-table";
import { savedPurchaseOptions } from "@/lib/filament-purchases";
import { SCANNED_FILAMENT_COLORS } from "@/lib/filament-scanned-swatches";
import { filamentSampleImage } from "@/lib/filament-samples";

export const dynamic = "force-dynamic";

export default async function BrandsPage({ searchParams }: {
  searchParams: Promise<{ brand?: string; toast?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const [params, brands] = await Promise.all([searchParams, db.filamentBrand.findMany({
    orderBy: { name: "asc" }, include: { listings: { orderBy: [{ active: "desc" }, { product: "asc" }, { name: "asc" }] } },
  })]);
  const displayBrands = brands.map(brand => ({ ...brand, logoUrl: brand.logoData ? customBrandLogoUrl(brand.id, brand.updatedAt) : null }));
  const selected = displayBrands.find(brand => brand.id === params.brand) ?? displayBrands[0];
  const scans = selected ? SCANNED_FILAMENT_COLORS.filter(color => matchingFilamentBrand(color.maker, [{ ...selected, active: true }])) : [];
  const sources = selected ? SOURCE_FILAMENT_COLORS.filter(color => !color.translucent && matchingFilamentBrand(color.maker, [{ ...selected, active: true }]))
    .sort((a, b) => a.product.localeCompare(b.product) || a.name.localeCompare(b.name))
    .map(color => ({ id: color.id, name: color.name, type: color.type, product: color.product, hex: color.hex,
      image: color.source === "scan" ? filamentSampleImage(color) : null })) : [];

  return <>
    <AppHeader user={admin} active="/admin/catalog" />
    <main className="mx-auto w-full max-w-[1180px] px-[26px] pb-[80px] pt-[35px]">
      <Kicker>Admin · filament to buy</Kicker>
      <h1 className="m-0 mb-[13px] text-[40px] leading-[1.05] text-ink sm:text-[46px]">Brands &amp; Amazon links</h1>
      <p className="m-0 mb-[18px] max-w-[760px] text-[16px] leading-[1.5] text-ink-2">Choose the brands you buy, then add exact Amazon listings for their products and colors. Enabled brands and listings appear in the color picker and spool search.</p>
      <Link href="/admin/catalog" className="mb-[22px] inline-block font-mono text-[12px] font-bold text-ink-2 underline underline-offset-4">← Library colors &amp; materials</Link>
      <div className="mb-[22px] flex flex-wrap gap-[16px] text-[14px] font-bold text-ink-2">
        <Link href="/share-filament" className="underline underline-offset-4">Add a link from your phone</Link>
        <Link href="/install" className="underline underline-offset-4">Install Print It!</Link>
      </div>
      {params.toast && <div className="mb-[18px]"><Notice tone="good">{params.toast}</Notice></div>}
      {params.error && <div className="mb-[18px]"><Notice tone="warn">{params.error}</Notice></div>}
      <form action={saveBrandAction} className="mb-[24px] grid min-w-0 grid-cols-1 items-end gap-[13px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[20px] shadow-stamp sm:grid-cols-2">
        <div className="min-w-0"><Label htmlFor="new-brand">Add a brand</Label><Input id="new-brand" name="name" required maxLength={80} placeholder="Filament brand" /></div>
        <div className="min-w-0"><Label htmlFor="new-aliases">Catalog aliases (optional)</Label><Input id="new-aliases" name="aliases" placeholder="Other names, separated by commas" /></div>
        <div className="min-w-0"><Label htmlFor="new-logo">Brand logo (optional)</Label><input id="new-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="w-full min-w-0 text-[12px] text-ink-2" /><p className="m-0 mt-[5px] text-[11px] text-ink-3">PNG, JPEG or WebP · under 256 KB</p></div>
        <Button type="submit" variant="secondary">Add brand</Button>
      </form>
      <div className="grid min-w-0 grid-cols-1 gap-[22px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Filament brands" className="min-w-0 rounded-panel border-[3px] border-ink bg-cream-2 p-[13px]">
          <h2 className="m-0 mb-[12px] text-[18px] text-ink">Your brands</h2>
          <div className="grid grid-cols-1 gap-[6px] sm:grid-cols-2 lg:grid-cols-1">
            {displayBrands.map(brand => <Link key={brand.id} href={`/admin/catalog/brands?brand=${encodeURIComponent(brand.id)}`} aria-current={brand.id === selected?.id ? "page" : undefined}
              className={`flex min-w-0 items-center justify-between gap-[8px] rounded-card border-2 px-[10px] py-[9px] text-[13px] font-bold ${brand.id === selected?.id ? "border-ink bg-sun text-ink" : "border-transparent bg-porcelain text-ink-2 hover:border-ink"}`}>
              <BrandLogo brand={{ name: brand.name, logoUrl: brand.logoUrl }} /><span className="min-w-0 flex-1 break-words">{brand.name}</span><span className="flex-none font-mono text-[10px]">{brand.active ? "On" : "Off"}</span>
            </Link>)}
          </div>
        </nav>
        {selected ? <div key={selected.id} className="min-w-0 space-y-[22px]">
          <BrandEditor brand={{ id: selected.id, name: selected.name, aliases: selected.aliases, logoUrl: selected.logoUrl, hasCustomLogo: Boolean(selected.logoData) }} active={selected.active} />
          {scans.length > 0 && <section className="min-w-0 rounded-panel border-[3px] border-ink bg-cream-2 p-[20px]">
            <h2 className="m-0 mb-[14px] text-[22px] text-ink">Your scanned swatches</h2>
            <div className="grid min-w-0 gap-[16px] sm:grid-cols-2">
              {scans.map(scan => <figure key={scan.id} className="m-0 min-w-0">
                <img src={scan.pageUrl} alt={`${scan.maker} ${scan.product} ${scan.name} printed swatch`} width={480} height={128} className="mb-[8px] block h-auto w-full drop-shadow-[0_4px_4px_#1b212640]" />
                <figcaption className="text-[13px] leading-[1.5] text-ink">
                  <span className="font-bold">{scan.product} · {scan.name}</span>
                  {scan.discontinued && <span className="ml-[6px] rounded-chip bg-cream px-[6px] py-[2px] text-[11px] text-ink-2">Discontinued · reference only</span>}
                </figcaption>
              </figure>)}
            </div>
          </section>}
          <section className="min-w-0 rounded-panel border-[3px] border-ink bg-aqua-wash p-[20px] shadow-stamp">
            <h2 className="m-0 mb-[16px] text-[22px] text-ink">Add a listing</h2>
            <ListingForm key={selected.listings.length} brandId={selected.id} sources={sources} />
          </section>
          <section className="min-w-0">
            <h2 className="m-0 mb-[10px] text-[22px] text-ink">Existing listings</h2>
            <p className="m-0 mb-[14px] text-[12px] leading-[1.5] text-ink-2">Images and prices are pulled from each saved Amazon link. Prices may change; confirm the selected color, pack size and final price on Amazon. If a lookup is blocked, the purchase link remains available.</p>
            <ListingsTable brandId={selected.id} sources={sources} listings={selected.listings.map(listing => ({ ...listing, purchaseOptions: savedPurchaseOptions(listing.purchaseOptions) }))} />
          </section>
        </div> : <Notice tone="warn">Add a brand to start managing its product and color listings.</Notice>}
      </div>
    </main>
  </>;
}
