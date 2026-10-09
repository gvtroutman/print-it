"use client";

import { useState } from "react";

import type { SwatchChoice } from "@/lib/catalog";

/**
 * A library swatch as filamentcolors.xyz photographed it: the printed card,
 * served through this app (`swatchImagePath`). The swatch's colour sits
 * underneath, so the tile is the right colour while the photo loads, and is
 * all that shows when there is no photo or it fails. The card is about 3:1;
 * size the tile with a width on `className`.
 */
export function SwatchPhoto({
  swatch,
  className = "",
}: {
  swatch: Pick<SwatchChoice, "image" | "hex">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden
      className={`block aspect-[288/89] overflow-hidden rounded-[6px] border-2 border-ink ${className}`}
      style={{ background: swatch.hex }}
    >
      {swatch.image && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={swatch.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="block h-full w-full object-cover"
        />
      )}
    </span>
  );
}
