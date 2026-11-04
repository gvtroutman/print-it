import React from "react";
import { type HOLIDAY_BADGES, type MEMBER_BADGES } from "@/lib/badge-catalog";
import { STICKER_ARTWORK } from "@/lib/sticker-artwork";

type StickerProps = { className?: string };

/** Keep the existing SVG sizing/filter hooks; artwork comes from the live master exports. */
function LinkedSticker({ stickerKey, className = "" }: StickerProps & { stickerKey: string }) {
  const artwork = STICKER_ARTWORK[Object.hasOwn(STICKER_ARTWORK, stickerKey) ? stickerKey : "first-print"];
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${artwork.width} ${artwork.height}`} className={className} fill="none">
      <image href={artwork.url} width={artwork.width} height={artwork.height} />
    </svg>
  );
}

export function BadgeSticker({ badgeKey, className }: StickerProps & { badgeKey: (typeof MEMBER_BADGES)[number]["key"] }) {
  return <LinkedSticker stickerKey={badgeKey} className={className} />;
}

export function HolidaySticker({ holiday, className }: StickerProps & { holiday: (typeof HOLIDAY_BADGES)[keyof typeof HOLIDAY_BADGES] }) {
  return <LinkedSticker stickerKey={holiday} className={className} />;
}

export function FirstRequestSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="first-request" className={className} />;
}

export function ThreePrintsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="three-prints" className={className} />;
}

export function FiveSpoolsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="five-spools" className={className} />;
}

export function EightPrintsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="eight-prints" className={className} />;
}

export function TenPrintsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="ten-prints" className={className} />;
}

export function MakingTracksSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="making-tracks" className={className} />;
}

export function FirstPrintSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="first-print" className={className} />;
}

export function TwoSpoolsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="two-spools" className={className} />;
}

export function FivePrintsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="five-prints" className={className} />;
}

export function PeakPerformanceSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="peak-performance" className={className} />;
}

export function HundredPrintsSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="hundred-prints" className={className} />;
}

export function MaterialExplorerSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="material-explorer" className={className} />;
}

export function DailyFiberSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="daily-fiber" className={className} />;
}

export function StopAndSmellSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="stop-and-smell-the-filament" className={className} />;
}

export function LoveOfMyLifeSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="love-of-my-life" className={className} />;
}

export function RoyGBivSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="roy-g-biv" className={className} />;
}

export function FlyingSpaghettiMonsterSticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="flying-spaghetti-monster" className={className} />;
}

export function MemberAnniversarySticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="member-anniversary" className={className} />;
}

export function MysterySticker({ className }: StickerProps) {
  return <LinkedSticker stickerKey="mystery" className={className} />;
}
