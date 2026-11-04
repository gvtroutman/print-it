"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Input, Label } from "@/components/ui";
import type { FilamentListingChoice } from "@/lib/filament-brands";
import type { FilamentImport } from "@/lib/amazon-product";
import { amazonListingUrl } from "@/lib/amazon-listing";
import type { FilamentPurchaseOption } from "@/lib/filament-purchases";
import { saveListingAction } from "./actions";

export type ListingSource = { id: string; name: string; type: string; product: string; hex: string; image?: string | null };
function SaveButton({ editing, reading }: { editing: boolean; reading: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="secondary" disabled={pending || reading}>{pending ? "Saving…" : editing ? "Save listing" : "Add listing"}</Button>;
}

type Field = "type" | "product" | "name" | "hex";
type Lookup = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; details: FilamentImport };
function canRead(url: string) {
  if (amazonListingUrl(url)) return true;
  try { const value = new URL(url); return value.protocol === "https:" && !value.username && !value.password && !value.port
    && ["amzn.to", "a.co", "amzn.eu", "amzn.asia"].includes(value.hostname) && value.pathname.length > 1; } catch { return false; }
}

export function ListingForm({ brandId, sources, listing, initialAmazonUrl = "" }: {
  brandId: string; sources: ListingSource[]; listing?: FilamentListingChoice; initialAmazonUrl?: string;
}) {
  const id = useId();
  const [sourceId, setSourceId] = useState(listing?.sourceId ?? "");
  const source = sources.find(source => source.id === sourceId);
  const sourceRef = useRef(sourceId); sourceRef.current = sourceId;
  const [amazonUrl, setAmazonUrl] = useState(listing?.amazonUrl ?? initialAmazonUrl);
  const [packageLabel, setPackageLabel] = useState(listing?.purchaseOptions?.find(option => option.url === listing.amazonUrl)?.label ?? "");
  const [packages, setPackages] = useState<FilamentPurchaseOption[]>(listing?.purchaseOptions?.filter(option => option.url !== listing.amazonUrl) ?? []);
  const editPackage = (index: number, field: keyof FilamentPurchaseOption, value: string) => setPackages(previous => previous.map((option, i) => i === index ? { ...option, [field]: value } : option));
  const urlRef = useRef(amazonUrl);
  const [fields, setFields] = useState<Record<Field, string>>({ type: listing?.type ?? "", product: listing?.product ?? "", name: listing?.name ?? "", hex: listing?.hex ?? "" });
  const dirty = useRef(new Set<Field>()); const imported = useRef(new Set<Field>());
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" }); const [retry, setRetry] = useState(0);
  const last = useRef(listing ? `${brandId}|${listing.amazonUrl}|0` : "");
  const previousUrl = useRef(amazonUrl);
  const edit = (field: Field, value: string) => { dirty.current.add(field); setFields(previous => ({ ...previous, [field]: value })); };
  useEffect(() => {
    const url = amazonUrl.trim(); const key = `${brandId}|${url}|${retry}`;
    if (last.current === key) return;
    if (previousUrl.current !== url) {
      const stale = new Set(imported.current);
      setFields(previous => Object.fromEntries(Object.entries(previous).map(([field, value]) => [field, stale.has(field as Field) && !dirty.current.has(field as Field) ? "" : value])) as Record<Field, string>);
      imported.current.clear(); previousUrl.current = url;
    }
    setLookup({ kind: "idle" });
    if (!canRead(url)) return;
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(async () => {
      setLookup({ kind: "loading" });
      try {
        const response = await fetch("/api/admin/filament-listings/lookup", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ brandId, amazonUrl: url }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
        const body = await response.json();
        if (!active || urlRef.current.trim() !== url) return;
        if (!response.ok) { setLookup({ kind: "error", message: body.error ?? "Couldn't read that listing. You can enter its details below." }); return; }
        const details = body as FilamentImport;
        if (!sourceRef.current) {
          const values = { type: details.type, product: details.title?.slice(0, 80), name: details.colorName, hex: details.hex };
          for (const field of Object.keys(values) as Field[]) if (values[field] && !dirty.current.has(field)) imported.current.add(field);
          setFields(previous => {
            const next = { ...previous };
            for (const field of Object.keys(values) as Field[]) if (values[field] && !dirty.current.has(field)) next[field] = values[field]!;
            return next;
          });
        }
        // Normalization must not trigger another lookup or clear the imported fields.
        urlRef.current = details.url; previousUrl.current = details.url; last.current = `${brandId}|${details.url}|${retry}`;
        setAmazonUrl(details.url); setLookup({ kind: "done", details });
      } catch {
        if (active) setLookup({ kind: "error", message: "Couldn't read that listing. Try again or enter its details below." });
      }
    }, 650);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [amazonUrl, brandId, retry]);
  return (
    <form action={saveListingAction} data-listing-form className="grid min-w-0 grid-cols-1 gap-[13px] sm:grid-cols-2">
      <input type="hidden" name="brandId" value={brandId} />
      {listing && <input type="hidden" name="listingId" value={listing.id} />}
      <input type="hidden" name="purchaseOptions" value={JSON.stringify(packages)} />
      <div className="min-w-0 sm:col-span-2"><Label htmlFor={`${id}-url`}>Exact Amazon listing</Label><Input id={`${id}-url`} name="amazonUrl" type="url" required maxLength={2048} value={amazonUrl} onChange={event => { urlRef.current = event.target.value; setAmazonUrl(event.target.value); }} placeholder="https://www.amazon.com/dp/…" /><p className="m-0 mt-[6px] text-[12px] leading-[1.4] text-ink-2">Paste a product/color link to fill available details. You can adjust them before saving.</p>
        <button type="button" data-pull-details disabled={!canRead(amazonUrl) || lookup.kind === "loading"} onClick={() => setRetry(value => value + 1)} className="mt-[8px] cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-ink-2 underline underline-offset-4 disabled:cursor-default disabled:opacity-50">{lookup.kind === "loading" ? "Reading listing…" : "Pull details"}</button>
        <div aria-live="polite" data-listing-lookup className="mt-[8px] text-[12px] leading-[1.4] text-ink-2">
          {lookup.kind === "error" && lookup.message}
          {lookup.kind === "done" && (lookup.details.status === "blocked" ? "Amazon blocked this lookup. Try again later or enter the details below."
            : lookup.details.status === "unavailable" ? "Amazon didn't provide readable details. Enter them below."
            : source ? "Listing read. Your selected catalog color keeps its recorded material and hex."
            : <>{dirty.current.has("type") ? "Your edited material was kept. " : lookup.details.type ? `Material: ${lookup.details.type}. ` : "Material wasn't identified; enter it below. "}
              {dirty.current.has("hex") ? "Your edited hex was kept." : lookup.details.hexSource === "image" ? "Hex estimated from the product image—confirm or adjust it before saving." : lookup.details.hexSource === "catalog" ? "Hex matched from the color catalog." : lookup.details.hexSource === "listing" ? "Hex supplied by the listing." : "No reliable hex found; enter it below."}</>)}
        </div>
      </div>
      <div className="min-w-0 sm:col-span-2"><Label htmlFor={`${id}-package`}>Package size (optional)</Label><Input id={`${id}-package`} name="packageLabel" maxLength={80} value={packageLabel} onChange={event => setPackageLabel(event.target.value)} placeholder="500 g roll, 250 g × 4 pack, 5 m pen refill…" /></div>
      <fieldset className="m-0 min-w-0 rounded-card border-2 border-ink/20 p-[12px] sm:col-span-2">
        <legend className="px-[5px] text-[13px] font-bold text-ink">Other package sizes</legend>
        <p className="m-0 mb-[12px] text-[12px] leading-[1.4] text-ink-2">Add smaller rolls or 1.75 mm pen refills of this same material, finish and color. The lowest checked total package price is used. Include the full pack count in the label.</p>
        {packages.map((option, index) => <div key={index} data-package-option className="mb-[12px] grid min-w-0 gap-[8px] rounded-card bg-cream p-[10px]">
          <div><Label htmlFor={`${id}-option-${index}-label`}>Package {index + 1} size</Label><Input id={`${id}-option-${index}-label`} required maxLength={80} value={option.label} onChange={event => editPackage(index, "label", event.target.value)} /></div>
          <div><Label htmlFor={`${id}-option-${index}-url`}>Exact Amazon package link</Label><Input id={`${id}-option-${index}-url`} required type="url" maxLength={512} value={option.url} placeholder="https://www.amazon.com/dp/…" onChange={event => editPackage(index, "url", event.target.value)} /></div>
          <button type="button" onClick={() => setPackages(previous => previous.filter((_, i) => i !== index))} className="justify-self-start cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-ink-2 underline">Remove package {index + 1}</button>
        </div>)}
        {packages.length < 7 && <div className="flex flex-wrap gap-[10px]">{["500 g roll", "250 g roll", "Pen refill", "Other size"].map(label => <button key={label} type="button" onClick={() => setPackages(previous => [...previous, { url: "", label }])} className="cursor-pointer rounded-[8px] border-2 border-ink bg-porcelain px-[8px] py-[6px] text-[12px] font-bold text-ink">+ {label}</button>)}</div>}
      </fieldset>
      <div className="min-w-0 sm:col-span-2">
        <Label htmlFor={`${id}-source`}>Product and color</Label>
        <select id={`${id}-source`} name="sourceId" value={sourceId} onChange={event => setSourceId(event.target.value)}
          className="min-h-[49px] w-full min-w-0 rounded-card border-[3px] border-ink bg-porcelain px-[10px] text-[14px] text-ink">
          <option value="">Enter a new product/color</option>
          {sources.map(source => <option key={source.id} value={source.id}>{source.product} · {source.name} · {source.hex}</option>)}
        </select>
        <p className="m-0 mt-[6px] text-[12px] leading-[1.4] text-ink-2">Choose an existing catalog color, or enter a product and color below.</p>
      </div>
      {source ? (
        <div className="flex min-w-0 items-center gap-[10px] rounded-card border-2 border-ink bg-cream p-[12px] sm:col-span-2">
          {source.image ? <img src={source.image} alt="Printed swatch" className="h-auto w-[120px] max-w-[40%] flex-none" />
            : <span aria-hidden className="h-[32px] w-[32px] flex-none rounded-[8px] border-2 border-ink" style={{ background: source.hex }} />}
          <span className="min-w-0 break-words text-[14px] text-ink">{source.name} · {source.type} · {source.hex}</span>
        </div>
      ) : (
        <>
          <div className="min-w-0"><Label htmlFor={`${id}-type`}>Material</Label><Input id={`${id}-type`} name="type" required maxLength={80} value={fields.type} onChange={event => edit("type", event.target.value)} placeholder="PLA, PETG, TPU…" /></div>
          <div className="min-w-0"><Label htmlFor={`${id}-product`}>Product</Label><Input id={`${id}-product`} name="product" required maxLength={80} value={fields.product} onChange={event => edit("product", event.target.value)} placeholder="PLA Basic" /></div>
          <div className="min-w-0"><Label htmlFor={`${id}-name`}>Color name</Label><Input id={`${id}-name`} name="name" required maxLength={80} value={fields.name} onChange={event => edit("name", event.target.value)} placeholder="Cherry red" /></div>
          <div className="min-w-0"><Label htmlFor={`${id}-hex`}>Color hex</Label><div className="flex min-w-0 items-center gap-[8px]"><Input id={`${id}-hex`} name="hex" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={fields.hex} onChange={event => edit("hex", event.target.value)} placeholder="#e4322f" className="min-w-0 flex-1" />{/^#[0-9a-f]{6}$/i.test(fields.hex) && <span aria-hidden className="h-[28px] w-[28px] flex-none rounded-[5px] border-2 border-ink" style={{ background: fields.hex }} />}</div></div>
        </>
      )}
      <div className="sm:col-span-2"><SaveButton editing={!!listing} reading={lookup.kind === "loading"} /></div>
    </form>
  );
}
