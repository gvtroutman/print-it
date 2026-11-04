import starArtwork from "../../public/print-it-star.png";
import { ARTWORK } from "@/lib/artwork-assets";

/** The supplied star artwork, used only as a decorative sticker accent. */
export function StarFlare({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small, shared static artwork
    <img
      src={ARTWORK.star}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={Math.round((size * starArtwork.height) / starArtwork.width)}
      className={`pointer-events-none block h-auto shrink-0 select-none ${className}`}
    />
  );
}
