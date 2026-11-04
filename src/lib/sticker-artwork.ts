import stickers from "./sticker-artwork.json";

/** Stable filenames exported from the numbered layers of the Illustrator master. */
export const STICKER_ARTWORK = Object.fromEntries(stickers.map((sticker) => [sticker.key, {
  ...sticker,
  url: `/artwork/sticker-${sticker.key}.svg`,
}]));

export const STICKER_ARTWORK_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  stickers.map((sticker) => [`sticker-${sticker.key}.svg`, `stickers/${sticker.key}.svg`]),
);
