import { MEMBER_BADGES } from "@/lib/badge-catalog";

/** Card flair uses the same stickers and stable keys as the member collection. */
export const CARD_FLAIRS = MEMBER_BADGES.map((badge) => ({ key: badge.key, label: badge.name }));

export type CardFlairKey = (typeof MEMBER_BADGES)[number]["key"];

export function isCardFlair(value: unknown): value is CardFlairKey {
  return typeof value === "string" && CARD_FLAIRS.some((flair) => flair.key === value);
}

export function earnedCardFlairs(earnedKeys: readonly string[]) {
  const earned = new Set(earnedKeys);
  return CARD_FLAIRS.filter((flair) => earned.has(flair.key));
}
