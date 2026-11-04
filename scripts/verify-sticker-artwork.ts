import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config as middlewareConfig } from "../src/middleware";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BadgeSticker, FirstPrintSticker, HolidaySticker, MysterySticker } from "../src/components/badge-sticker";
import { HOLIDAY_BADGES, MEMBER_BADGES } from "../src/lib/badge-catalog";
import { STICKER_ARTWORK, STICKER_ARTWORK_FILES } from "../src/lib/sticker-artwork";
import manifest from "../src/lib/sticker-artwork.json";

assert.deepEqual(Object.keys(STICKER_ARTWORK).sort(), [...MEMBER_BADGES.map((badge) => badge.key), "mystery"].sort());
assert.equal(new Set(manifest.map((sticker) => sticker.layer)).size, manifest.length);
for (const sticker of manifest) {
  const artwork = STICKER_ARTWORK[sticker.key];
  assert.equal(STICKER_ARTWORK_FILES[artwork.url.split("/").at(-1)!], `stickers/${sticker.key}.svg`);
  assert.equal(unstable_doesMiddlewareMatch({ config: middlewareConfig, url: `https://print.example.test${artwork.url}` }), false,
    "Anonymous SVG requests reach the allowlisted artwork handler rather than the sign-in redirect");
  const svg = await readFile(`public/sticker-${sticker.key}.svg`, "utf8");
  assert.match(svg, /<svg\b/);
  assert.match(svg, /<path\b/);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|(?:href|xlink:href)="https?:/i);
  const component = sticker.key === "mystery"
    ? React.createElement(MysterySticker, { className: "locked-art" })
    : React.createElement(BadgeSticker, { badgeKey: sticker.key as (typeof MEMBER_BADGES)[number]["key"], className: "locked-art" });
  const html = renderToStaticMarkup(component);
  assert.match(html, /aria-hidden="true"/);
  assert.ok(html.includes(`viewBox="0 0 ${sticker.width} ${sticker.height}"`));
  assert.match(html, /class="locked-art"/);
  assert.ok(html.includes(`href="${artwork.url}"`));
}
assert.equal(renderToStaticMarkup(React.createElement(FirstPrintSticker, {})), renderToStaticMarkup(React.createElement(BadgeSticker, { badgeKey: "first-print" })));
assert.equal(renderToStaticMarkup(React.createElement(HolidaySticker, { holiday: HOLIDAY_BADGES.birthday })), renderToStaticMarkup(React.createElement(BadgeSticker, { badgeKey: HOLIDAY_BADGES.birthday })));
assert.equal(unstable_doesMiddlewareMatch({ config: middlewareConfig, url: "https://print.example.test/board" }), true);
assert.equal(unstable_doesMiddlewareMatch({ config: middlewareConfig, url: "https://print.example.test/member/card" }), true);
console.log("Sticker artwork passed: complete catalog and mystery mappings, vector fallbacks, live URLs, tall artwork proportions, legacy exports, and existing SVG styling hooks.");
