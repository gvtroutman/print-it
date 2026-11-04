import { AppHeader } from "@/components/app-header";
import Link from "next/link";
import { Button, Input, Kicker, Label, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { RemoveMaterialButton } from "./remove-material-button";
import { RemoveColorButton } from "./remove-color-button";
import { AddColorForm } from "./add-color-form";
import { EditMaterialInline } from "./edit-material-inline";
import { EditMaterialDescription } from "./edit-material-description";
import { EditMaterialRatings } from "./edit-material-ratings";
import { EditColorInline } from "./edit-color-inline";
import { ScannedColorForm } from "./scanned-color-form";
import { LibraryColorList } from "./library-color-list";
import { shelfColorSample } from "@/lib/shelf-colors";
import { filamentSettings } from "@/lib/filament-settings";
import { FilamentPhoto } from "@/components/filament-photo";
import {
  addMaterialAction,
  moveColorAction,
  moveMaterialAction,
  toggleColorAction,
  toggleMaterialAction,
} from "./actions";

export const dynamic = "force-dynamic";

function OrderButtons({
  id,
  name,
  first,
  last,
  action,
}: {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const buttonClass = "flex h-[28px] w-[28px] items-center justify-center rounded-chip border-2 border-ink bg-porcelain font-mono text-[14px] font-bold text-ink hover:bg-aqua disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-porcelain";
  return (
    <div className="flex flex-none gap-[4px]" aria-label={`Order ${name}`}>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={first} aria-label={`Move ${name} up`} title="Move up" className={buttonClass}>↑</button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={last} aria-label={`Move ${name} down`} title="Move down" className={buttonClass}>↓</button>
      </form>
    </div>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string; error?: string }>;
}) {
  const [admin, params, materials, settings] = await Promise.all([
    requireAdmin(),
    searchParams,
    db.catalogMaterial.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { colors: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    }),
    filamentSettings(),
  ]);

  return (
    <>
      <AppHeader user={admin} active="/admin/catalog" />
      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <Kicker>Admin · Library</Kicker>
        <h1 className="m-0 mb-[13.2px] text-[38px] leading-[1.05] text-ink sm:text-[46px]">Library colors &amp; materials</h1>
        <p className="m-0 mb-[22px] max-w-[680px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
          Control the swatches shown in the Library tab when placing an order. Add a scanned swatch or create a color, remove swatches, and drag or use the arrows to set their order. Turn a swatch off to hide it temporarily. “Any color” always appears first.
        </p>

        {params.toast && <div className="mb-[17.6px] max-w-[780px]"><Notice tone="good">{params.toast}</Notice></div>}
        {params.error && <div className="mb-[17.6px] max-w-[780px]"><Notice tone="warn">{params.error}</Notice></div>}
        <Link href="/admin/catalog/brands" className="stamp mb-[22px] inline-block rounded-chip border-[3px] border-ink bg-sun px-[16px] py-[10px] font-mono text-[12px] font-bold text-ink hover:bg-aqua">Manage brands &amp; Amazon links →</Link>

        <form action={addMaterialAction} className="mb-[26.4px] flex max-w-[680px] flex-wrap items-end gap-[13.2px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] shadow-stamp">
          <div className="min-w-0 flex-1 basis-[220px]">
            <Label htmlFor="material-name">Add a material</Label>
            <Input id="material-name" name="name" required maxLength={40} placeholder="ASA" />
          </div>
          <Button type="submit" variant="secondary">Add material</Button>
        </form>

        {/* `grid-cols-1` and `min-w-0`, not a bare `grid`: an implicit track is as
            wide as its widest content, and a gradient's CSS string is one long
            unbreakable line — it pushed every panel off the side of a phone. */}
        <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-2">
          {materials.map((material, materialIndex) => (
            <section key={material.id} className={`min-w-0 rounded-panel border-[3px] border-ink p-[22px] shadow-stamp ${material.active ? "bg-porcelain" : "bg-cream-2"}`}>
              <div className="mb-[17.6px] flex flex-wrap items-center gap-[11px]">
                <EditMaterialInline id={material.id} name={material.name} />
                <OrderButtons
                  id={material.id}
                  name={material.name}
                  first={materialIndex === 0}
                  last={materialIndex === materials.length - 1}
                  action={moveMaterialAction}
                />
                <span className={`rounded-chip border-2 border-ink px-[10px] py-[2px] font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] ${material.active ? "bg-mint text-ink" : "bg-cream-3 text-ink-2"}`}>
                  {material.active ? "Available" : "Off shelf"}
                </span>
                <form action={toggleMaterialAction}>
                  <input type="hidden" name="id" value={material.id} />
                  <button type="submit" className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-sun px-[13px] py-[5px] font-mono text-[11px] font-bold uppercase text-ink hover:bg-aqua">
                    Turn {material.active ? "off" : "on"}
                  </button>
                </form>
                <RemoveMaterialButton id={material.id} name={material.name} />
              </div>

              <EditMaterialDescription id={material.id} name={material.name} description={material.description} />
              <EditMaterialRatings
                id={material.id}
                name={material.name}
                ratings={{
                  strength: material.strength,
                  flex: material.flex,
                  heat: material.heat,
                  finish: material.finish,
                  outdoors: material.outdoors,
                }}
              />

              <h3 className="mb-[10px] text-[20px] text-ink">Library swatches</h3>
              <LibraryColorList materialId={material.id} items={material.colors.map((color, colorIndex) => {
                const sample = shelfColorSample(color, material.name, settings);
                return { id: color.id, name: color.name, content: <>
                    {sample && <div className="w-full min-w-0">
                      <FilamentPhoto color={sample.color} bare sampleOnly className="mx-auto w-full max-w-[320px]" />
                      <p className="m-0 mt-[5px] text-center text-[11px] text-ink-2">{sample.exact ? "" : sample.baseColorOnly ? "Similar base color · " : "Similar color · "}{sample.color.maker} · {sample.color.product}</p>
                    </div>}
                    <EditColorInline
                      id={color.id}
                      name={color.name}
                      hex={color.hex}
                      colorStyle={color.style}
                      colorMode={color.mode}
                      materialName={material.name}
                      amazonUrl={color.amazonUrl}
                    />
                    <OrderButtons
                      id={color.id}
                      name={`${color.name} for ${material.name}`}
                      first={colorIndex === 0}
                      last={colorIndex === material.colors.length - 1}
                      action={moveColorAction}
                    />
                    <form action={toggleColorAction}>
                      <input type="hidden" name="id" value={color.id} />
                      <button type="submit" aria-label={`${color.active ? "Hide" : "Show"} ${color.name} for ${material.name}`} className={`cursor-pointer rounded-chip border-2 border-ink px-[10px] py-[4px] font-mono text-[10.5px] font-bold uppercase ${color.active ? "bg-mint text-ink" : "bg-cream-3 text-ink-2"}`}>
                        {color.active ? "Visible" : "Hidden"}
                      </button>
                    </form>
                    <RemoveColorButton id={color.id} name={color.name} materialName={material.name} />
                  </> };
              })} />
              {material.colors.length === 0 && <p className="font-mono text-[11.5px] uppercase text-ink-3">No swatches yet. Add one to offer this material in Library.</p>}

              <ScannedColorForm materialId={material.id} materialName={material.name} colors={material.colors} />
              <AddColorForm materialId={material.id} />
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
