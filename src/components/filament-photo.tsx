"use client";

import { useEffect, useRef, useState } from "react";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { filamentSampleImage } from "@/lib/filament-samples";
import { scannedFilamentImage } from "@/lib/filament-scanned-swatches";
import type { FilamentColor } from "@/lib/color-names";
import { filamentColorType, filamentMatchesColorFilter } from "@/lib/filament-color-types";
import { filamentGlowPhoto } from "@/lib/filament-glow-photos";

type PhotoColor = Pick<FilamentColor, "name" | "hex" | "type"> &
  Partial<Pick<FilamentColor, "maker" | "product" | "colorType" | "colors" | "translucent" | "amazonUrl" | "pageUrl">>;

type PhotoSource = { src: string; kind: "glow" | "sample" | "product" };

// Native image lazy loading reaches well past these small, nested scroll
// panels. Observe their clipped visibility so offscreen samples do not fill
// the server's photo-processing queue ahead of the colors being browsed.
const waitingPhotos = new Map<Element, () => void>();
let photoObserver: IntersectionObserver | null = null;
function observePhoto(element: Element, show: () => void) {
  const observer = photoObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const notify = waitingPhotos.get(entry.target);
      waitingPhotos.delete(entry.target);
      photoObserver?.unobserve(entry.target);
      notify?.();
    }
  }, { rootMargin: "120px" });
  waitingPhotos.set(element, show);
  observer.observe(element);
  return () => { waitingPhotos.delete(element); observer.unobserve(element); };
}

/** A source sample has an exact identity; a similar hex is never enough to borrow a photo. */
function photoSources(color: PhotoColor, image?: string | null, sampleOnly = false): PhotoSource[] {
  const glow = filamentGlowPhoto(color);
  const sample = scannedFilamentImage(color) ?? image ?? filamentSampleImage(color);
  const listing = amazonListingUrl(color.amazonUrl ?? color.pageUrl);
  return [
    ...(glow ? [{ src: glow, kind: "glow" as const }] : []),
    ...(sample ? [{ src: sample, kind: "sample" as const }] : []),
    ...(!sampleOnly && listing ? [{ src: `/api/amazon-products/image?listing=${encodeURIComponent(listing)}`, kind: "product" as const }] : []),
  ];
}

/** Glow colors show their verified manufacturer glow example before the daylight sample. */
export function FilamentPhoto({ color, className = "", image, bare = false, sampleOnly = false, retryKey = 0, onUnavailable }: { color: PhotoColor; className?: string; image?: string | null; bare?: boolean; sampleOnly?: boolean; retryKey?: number; onUnavailable?: () => void }) {
  const sources = photoSources(color, image, sampleOnly);
  return <Photo key={`${retryKey}:${sources.map(source => source.src).join("|")}`} color={color} sources={sources} className={className} bare={bare} onUnavailable={onUnavailable} />;
}

function Photo({ color, sources, className, bare, onUnavailable }: { color: PhotoColor; sources: PhotoSource[]; className: string; bare: boolean; onUnavailable?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver !== "function") { setVisible(true); return; }
    return observePhoto(ref.current, () => setVisible(true));
  }, []);
  const source = sources.find(source => !failed.includes(source.src));
  const ready = !!source && loaded === source.src;
  const glowing = filamentMatchesColorFilter(color, "Glow");
  const solid = !glowing && filamentColorType(color) === "Solid";
  const label = ready ? source.kind === "glow" ? "Manufacturer glow photo" : glowing ? "Daylight photo · glow photo unavailable" : "Filament photo"
    : source ? "Loading photo" : "Photo unavailable";
  return (
    <span ref={ref} aria-hidden={glowing ? undefined : true} role={glowing ? "img" : undefined} aria-label={glowing ? `${color.name}: ${label}` : undefined}
      data-filament-photo={ready ? source.kind : source ? "loading" : "unavailable"}
      title={label}
      className={`relative grid place-items-center ${bare ? "min-h-[40px] bg-transparent" : "aspect-[5/3] overflow-hidden rounded-[6px] border border-ink/10 bg-white"} ${className}`}>
      {!ready && <span className={`${bare && source ? "absolute inset-0 justify-center" : ""} flex flex-col items-center gap-[4px] p-[6px] text-center text-[10px] leading-tight text-ink-3`}>
        {!source && solid && <span className="h-[18px] w-[18px] rounded-[4px] border border-ink/20" style={{ background: color.hex }} />}
        <span>{source ? "Loading photo…" : "Photo unavailable"}</span>
        {!source && solid && <span>Approximate color</span>}
      </span>}
      {visible && source && <img key={source.src} src={source.src} alt="" loading="lazy" decoding="async"
        onLoad={() => setLoaded(source.src)}
        onError={() => {
          setFailed(previous => [...previous, source.src]);
          if (!sources.some(candidate => candidate.src !== source.src && !failed.includes(candidate.src))) onUnavailable?.();
        }}
        className={`${bare ? "block h-auto max-h-[140px] w-auto max-w-full drop-shadow-[0_4px_4px_#1b212640]" : "absolute inset-0 h-full w-full"} object-contain ${ready ? "" : "opacity-0"}`} />}
      {ready && glowing && <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 max-w-full -translate-x-1/2 rounded-full bg-ink px-[6px] py-[2px] text-center text-[9px] leading-tight text-white">
        {source.kind === "glow" ? "Glowing" : "Daylight"}
      </span>}
    </span>
  );
}
