"use client";

import { useState } from "react";
import { Button, Label } from "@/components/ui";
import { libraryScannedSwatches } from "@/lib/library-swatches";
import { scannedShelfSwatch } from "@/lib/filament-scanned-swatches";
import type { ColorMode } from "@/lib/catalog";
import { addScannedColorAction } from "./actions";

export function ScannedColorForm({ materialId, materialName, colors }: {
  materialId: string; materialName: string; colors: { name: string; mode: ColorMode }[];
}) {
  const scans = libraryScannedSwatches(materialName);
  const used = new Set(colors.map(color => scannedShelfSwatch(color.name, materialName, color.mode)?.id));
  const available = scans.filter(scan => !used.has(scan.id));
  const [selectedId, setSelectedId] = useState("");
  const selected = available.find(scan => scan.id === selectedId) ?? available[0];
  if (!scans.length) return null;

  return <form action={addScannedColorAction} data-add-scanned-color className="mt-[18px] min-w-0 rounded-card border-2 border-aqua bg-aqua-wash p-[12px]">
    <input type="hidden" name="materialId" value={materialId} />
    <Label htmlFor={`scan-${materialId}`}>Add a scanned swatch</Label>
    {selected ? <>
      <select id={`scan-${materialId}`} name="sourceId" value={selected.id} onChange={event => setSelectedId(event.target.value)}
        className="h-[49px] w-full min-w-0 rounded-card border-[3px] border-ink bg-porcelain px-[8px] text-[13px] text-ink">
        {available.map(scan => <option key={scan.id} value={scan.id}>{scan.maker} · {scan.product} · {scan.name}</option>)}
      </select>
      <img src={selected.image} alt={`${selected.maker} ${selected.product} ${selected.name} printed swatch`} width={480} height={128}
        className="my-[12px] block h-auto w-full max-w-[480px] drop-shadow-[0_4px_4px_#1b212640]" />
      {selected.discontinued && <p className="m-0 mb-[10px] text-[12px] text-ink-2">Discontinued filament · add if you still have it on hand.</p>}
      <Button type="submit" variant="secondary" className="px-[14px] py-[10px]">Add swatch to Library</Button>
    </> : <p className="m-0 text-[13px] text-ink-2">All compatible scans are already in this material’s Library. Turn a hidden swatch on to show it again.</p>}
  </form>;
}
