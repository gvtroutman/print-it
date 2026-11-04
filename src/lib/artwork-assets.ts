import { STICKER_ARTWORK_FILES } from "./sticker-artwork";

/** Public artwork backed by editable files in the mounted 1x folder. */
export const ARTWORK = {
  wordmarkArched: "/artwork/print-it-wordmark-arched.png",
  wordmarkStraight: "/artwork/print-it-wordmark-straight.png",
  star: "/artwork/print-it-star.png",
} as const;

/** Only these named images are public; the rest of the folder stays private. */
export const ARTWORK_FILES: Readonly<Record<string, string>> = {
  ...STICKER_ARTWORK_FILES,
  "print-it-wordmark-arched.png": "Asset 8.2.png",
  "print-it-wordmark-straight.png": "Asset 5.2.png",
  "print-it-star.png": "Asset 6.2.png",
};
