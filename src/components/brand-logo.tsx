"use client";

import { useState } from "react";
import { filamentBrandLogo } from "@/lib/filament-brand-logos";

/** The adjacent text supplies the accessible brand name; the mark is decorative. */
export function BrandLogo({ brand, className = "h-[34px] w-[56px]" }: {
  brand: { name: string; logoUrl?: string | null }; className?: string;
}) {
  const url = filamentBrandLogo(brand);
  const [failed, setFailed] = useState<string | null>(null);
  const initials = brand.name.split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
  return <span aria-hidden className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-[6px] border border-ink/15 bg-white p-[4px] ${className}`}>
    {url && failed !== url
      ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(url)} />
      : <span className="font-mono text-[12px] font-bold text-ink-2">{initials}</span>}
  </span>;
}
