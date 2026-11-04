import type { ReactNode } from "react";

/**
 * A printer cut-out with a smooth white die-cut rim baked into the image,
 * tucked behind a card so its top (the AMS and the lid) peeks over the edge.
 * Centred on a phone, off to the right once there is room. The card passed as `children`
 * covers the rest of the picture. With no `src` the card is rendered on its own.
 */
export function PrinterPeek({
  src,
  alt,
  children,
}: {
  src?: string;
  alt: string;
  children: ReactNode;
}) {
  if (!src) return <div>{children}</div>;
  return (
    <div className="relative pt-[158px]">
      {/* Cut off just under the card's top edge, so a short card never shows the printer's feet below it. */}
      <div className="absolute left-1/2 top-0 h-[176px] w-[272px] -translate-x-1/2 overflow-hidden sm:left-auto sm:right-[36px] sm:translate-x-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static sticker */}
        <img src={src} alt={alt} width={260} height={347} className="mx-auto h-[347px] w-[260px] max-w-none object-contain" />
      </div>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** Original Bambu Lab product photos with smooth white die-cut borders. */
export const PRINTER_PHOTOS: Record<string, string> = {
  /** Printer id, on the owner's hours card. */
  "p1s-combo": "/printers/p1s-combo-sticker.webp",
  /** Donation bin id. */
  "h2d-laser-40w": "/printers/h2d-sticker.webp",
};
