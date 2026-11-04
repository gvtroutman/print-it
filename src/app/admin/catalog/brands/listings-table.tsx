"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { AmazonProductImage, FilamentPurchase, useFilamentPurchase } from "@/components/amazon-product";
import type { FilamentListingChoice } from "@/lib/filament-brands";
import { ListingForm, type ListingSource } from "./listing-form";
import { toggleListingAction } from "./actions";

function ListingRow({ listing, onEdit }: { listing: FilamentListingChoice; onEdit: () => void }) {
  const purchase = useFilamentPurchase(listing.amazonUrl, listing.purchaseOptions);
  const product = purchase.loading ? null : purchase.product;
  return <tr data-admin-listing className={`border-t-2 border-ink/20 ${listing.active ? "bg-porcelain" : "bg-cream-2"}`}>
    <td className="p-[12px] align-top">
      <div className="flex items-start gap-[8px]"><span aria-hidden className="mt-[2px] h-[24px] w-[24px] flex-none rounded-[5px] border-2 border-ink" style={{ background: listing.hex }} />
        <div className="min-w-0"><p className="m-0 break-words font-bold">{listing.name}</p><p className="m-0 mt-[3px] break-words text-[12px] text-ink-2">{listing.product} · {listing.type}</p><p className="m-0 mt-[3px] font-mono text-[10px] text-ink-3">{listing.hex}</p>
        </div>
      </div>
    </td>
    <td className="p-[12px] align-top"><AmazonProductImage product={product} name={`${listing.product} · ${listing.name}`} hex={listing.hex} /></td>
    <td className="p-[12px] align-top"><FilamentPurchase url={listing.amazonUrl} options={listing.purchaseOptions} details className="text-[12px]" /></td>
    <td className="p-[12px] align-top"><div className="flex flex-col items-start gap-[8px]">
      <span className="font-mono text-[10px] font-bold text-ink-2">{listing.active ? "Enabled" : "Off"}</span>
      <button type="button" onClick={onEdit} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-ink-2 underline underline-offset-4">Edit listing</button>
      <form action={toggleListingAction}><input type="hidden" name="brandId" value={listing.brandId} /><input type="hidden" name="listingId" value={listing.id} /><Button type="submit" variant="secondary">{listing.active ? "Turn listing off" : "Turn listing on"}</Button></form>
    </div></td>
  </tr>;
}

export function ListingsTable({ brandId, sources, listings }: { brandId: string; sources: ListingSource[]; listings: FilamentListingChoice[] }) {
  const [editing, setEditing] = useState<number | null>(null);
  const listing = listings.find(listing => listing.id === editing);
  return <>
    <div tabIndex={0} role="region" aria-label="Existing product and color listings" className="max-w-full overflow-x-auto rounded-card border-[3px] border-ink focus-visible:outline-offset-4">
      <table className="w-full min-w-[630px] table-fixed border-collapse text-left text-[14px] text-ink">
        <caption className="sr-only">Existing listings with colors, Amazon images, automatic prices and edit controls</caption>
        <thead className="bg-cream-2 text-[11px] uppercase tracking-[0.04em]"><tr>
          <th scope="col" className="w-[34%] p-[12px]">Product / color</th><th scope="col" className="w-[17%] p-[12px]">Amazon image</th><th scope="col" className="w-[25%] p-[12px]">Amazon price</th><th scope="col" className="w-[24%] p-[12px]">Manage</th>
        </tr></thead>
        <tbody>{listings.length ? listings.map(listing => <ListingRow key={listing.id} listing={listing} onEdit={() => setEditing(listing.id)} />)
          : <tr><td colSpan={4} className="bg-porcelain p-[18px] text-[13px] text-ink-2">No admin listings yet. Add an exact Amazon listing above. Catalog-supplied links still appear in the picker.</td></tr>}</tbody>
      </table>
    </div>
    {listing && <section key={listing.id} className="mt-[16px] min-w-0 rounded-panel border-[3px] border-ink bg-cream-2 p-[18px]">
      <div className="mb-[14px] flex items-start justify-between gap-[12px]"><h3 className="m-0 break-words text-[20px] text-ink">Edit {listing.product} · {listing.name}</h3><button type="button" onClick={() => setEditing(null)} className="flex-none cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-ink-2 underline">Close</button></div>
      <ListingForm brandId={brandId} sources={sources} listing={listing} />
    </section>}
  </>;
}
