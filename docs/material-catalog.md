# Materials and colours

[← back to the README](../README.md)

The printer owner manages the choices shown on the request form at
`/admin/catalog`. A material is offered only when it is turned on and has at
least one active colour. Arrows set the order in which materials and colours
appear.

**Library** displays one photographed printed swatch per row, using the same
filamentcolors.xyz image route as Store. An exact saved product reference uses
its identified sample: Bambu Green is sample 1970, Funfetti is 1924, and Space
Grey is 516. Otherwise the closest photographed color of the same filament family
and finish is labeled **Similar color reference**, with the sample's name,
maker and material. Filled filaments can use their plain base family as a
color reference; if the finish has no samples, a solid sample is labeled **Similar base
color only**. Unknown materials keep their saved preview. Shelf samples do
not require an enabled Store brand or an Amazon buying link.
The owner's **CoPE Blue**, **CoPE White**, PLA **Orange**, and PLA **Blue gradient**
shelf entries use the supplied scans before considering a similar library
photo. Orange uses Panchroma Satin PLA and Blue gradient uses 3D HoJor Glacier.
These explicit shelf bindings are recorded in
`public/filament-swatches/sources.json` and preserve the saved preview hex and
style; they do not offer the discontinued Satin filament for purchase.
Migration `20261013230000_add_cope_white_shelf` adds **CoPE White** as a separate
active color under **CoPE**, using the supplied white scan and its `#efebec`
preview. The existing PETG **White** entry remains on the shelf. Reapplying the
migration does not create duplicate CoPE White entries.
The October 14 scan adds four more distinct shelf choices: **IEMAI White**
and **IEMAI Black** under PETG, plus **Justmaker Bronze (Silk)** and
**Bambu Lab Green** under PLA. Migration
`20261014210000_add_scanned_filament_shelf` adds these choices and the Justmaker
brand; existing colors remain available. All four photos use the owner's
scans, with exact brand, material and finish matching rather than nearby colors.
The saved name, hex and style still determine the requested shelf filament;
the reference photo does not replace them. The admin preview shows the saved style.
Store's **Composite** finish groups filled filaments, including metal, wood,
carbon fiber and glass fiber. Proto-pasta's photographed brass, bronze, copper,
iron and steel composites appear here. These are real fillers, unlike ordinary
metallic color names. Composites keep separate product choices even when they
share a base hex, and saved colors retain the finish.
When Auto combines the shelves, colors with the same name and different shades
remain separate choices, labeled with their material. Auto requests send the
chosen shade with its name so an earlier material's color cannot replace it.
Each color's optional **Filament product link** accepts an exact Amazon
product/color link or Amazon share link as a reference; a uniquely identified
printed sample for that product supplies the Library photo.

The owner's supplied product references are saved with these matched Library
swatches by migration `20261012220000_match_shelf_filament_colors`:

| Library color | Filament reference | Saved swatch |
| --- | --- | --- |
| PLA Green | [Bambu Lab Bambu Green 10501](https://www.amazon.com/dp/B0F68ZJ1F1) | Solid `#00ae42`, Bambu's published color |
| TPU Black | [Geeetech TPU 95A Black](https://www.amazon.com/dp/B09Q8RR6KD) | Solid `#000000`, the listed Geeetech color |
| PLA Blue gradient | [3DHoJor Glacier](https://www.amazon.com/dp/B0D5M58Y3Q) | Cyan `#35b8d9` → ice blue `#99dfea` → white `#effbfc` |
| PLA Funfetti | [Cookiecad clear PLA with rainbow glitter](https://www.amazon.com/dp/B0BRTJLMCR) | Rainbow sprinkles over warm clear `#dfdfd3` |
| TPU Pink | [Overture High Speed TPU 95A Pink](https://www.amazon.com/dp/B0BN8WPKD7) | Solid `#f092b3`, the listed High Speed TPU color |
| PETG Space grey | [Overture PETG Space Gray](https://www.amazon.com/dp/B07PGXY9Z3) | Solid `#80817e`, measured printed sample |
| PETG-GF Blue | [TINMORRY PETG-GF Frosted Blue](https://www.amazon.com/dp/B0DPSRL347) | Solid `#114d94`, estimated from the exact product image |

The single-color references come from the bundled filament palette; Bambu's
[official PLA Basic color table](https://store.bblcdn.eu/s8/default/903b60b06ac142e9b1b49ad53cfa4c82/Bambu_PLA_Basic_Hex_Code.pdf)
confirms Green, and [printed swatch 516](https://filamentcolors.xyz/swatch/516/)
provides Space grey. Glacier uses the existing cyan/ice-blue/white approximation
in `filament-color-types.ts`. Funfetti uses the palette's clear PLA base with
the saved sprinkle pattern. The Frosted Blue estimate uses
`estimateFilamentPhotoHex` on the listing's
[selected product image](https://m.media-amazon.com/images/I/715zjH33bHL._AC_SX679_.jpg).
These swatches are screen approximations; the gradient and clear/glitter base
are illustrative styles. They remain editable in Materials & colors.

Turning an entry off is temporary. Removing it deletes the catalogue row; when
a material is removed, its colour rows go with it. Neither operation changes
an existing ticket because every request snapshots its material label, colour
label, representative hex, rendered swatch, and swatch mode when submitted.

## Chart ratings

The request form first asks what the print should be good at, from four
shelves: Pretty finish, Strong, Heat & outdoors and Bendy. A material sits on
the shelf where it scores its best mark (heat and outdoors count as one), or
on every shelf it ties on, so PETG is both Strong and Heat & outdoors; a
material with no marks sits on all four. The material dropdown then offers
only that shelf, and until one is picked the form shows the shelf's materials
side by side, rated 1 to 5 on strength, bendiness, heat, finish and
outdoors. The marks come from a built-in table of filament families in
`src/lib/filament-traits.ts`, matched by name: "PLA", "Silk PLA" and "PLA-CF"
all land on PLA, and a carbon- or glass-fibre variant gets a bump. A name the
table does not know shows dashes.

The owner can overrule any mark from `/admin/catalog`: under the material's
description, "Charted as …" opens five selects, one per trait, each defaulting
to the built-in mark. A mark the owner sets wins for that trait only; the rest
keep following the table, and "Built-in" hands a trait back. Each change is an
audit event, and `GET /api/catalog` reports the marks the chart shows.

## Swatch types

- **Solid** takes one colour.
- **Gradient** takes a start and end colour.
- **Whatever** takes no colour input. It renders as a rainbow with a question
  mark and keeps that behavior even if its display name is changed.

The mode is stored separately from the editable colour name. No particular
spelling has hidden behavior.

## Validation

The request form is only a convenience. At submission time the server looks up
the posted material and colour together and accepts them only when both rows
are still active and related. A stale or hand-written form therefore cannot
request a combination the owner no longer offers.

Printing an old request again goes through the same lookup, because it is a
new request: if the material or colour has been taken off the shelf since, the
re-queue is refused and says so, and the old ticket is left as it was.

`GET /api/catalog` returns the same list the form is drawn from, for clients of
the JSON API — see [the API](api.md).

## Spools the owner can get

Under a material's shelf colours, the request form offers "Not on the shelf?
Find a spool … can get". It searches the [filamentcolors.xyz](https://filamentcolors.xyz/)
swatch library for that kind of filament, by words (colour, maker, type) and
by colour: a grid laid out like a phone's colour picker, where tapping a cell
lists the spools that look closest to it first (ΔE in CIE L\*a\*b\*). Spools that
look nothing like it are left out, unless fewer than 12 are near, in which case
the 12 closest show. Hue counts most, and a spool duller than the cell is
forgiven half of that dullness.

Both the color picker and this search are limited to the admin's enabled
brands and catalog aliases, and require
a direct Amazon product listing. Unapproved brands and unlisted spools do
not count toward results or the fallback threshold, and a new request
cannot select one by submitting its spool id directly. See
[Combined filament colors](color-names.md) for the current list.

Use **Manage brands & Amazon links** on the Materials & colors page to add
brands and exact Amazon listings per product/color. A listing can use an existing
catalog color or a new material, product, color name and hex. Admin-supplied
listings appear alongside the source libraries and work even if those libraries
are unavailable. Turning off a brand or listing removes it from new choices;
existing tickets keep their saved details.

The colour compared is measured by the app, not taken from the library. The
hex the library lists is darker and duller than its own photos, and off in hue
for some blues, so a grid sorted by it showed photos that did not match the
cell. Instead the server reads each swatch's thumbnail once and takes the
per-channel median of the card's thick section. After the library loads, all
~2,300 are measured in the background (about 45 seconds; the listed hex stands
in until then). The results are kept in `cache/filament-colours.json` on the
uploads volume (`MODELS_ROOT`), so a redeploy only measures new swatches. The
measured colour is also what a ticket snapshots as its hex.

The kind of filament is matched with the filament table in `src/lib/filament-traits.ts`:
a "Silk PLA" material offers any PLA swatch (silk ones first), "PLA-CF" only
fibre-filled PLA, and a name the table does not know has to appear in the
swatch's type ("Wood" finds "PLA Wood"). PCTG, CoPE and CPE are charted as
PETG (they are co-polyester), but each is a filament of its own to the spool
search: a "PCTG" material offers only PCTG spools, never PETG ones, and a
"PETG" material no PCTG, CoPE or CPE. Neither library lists a CoPE spool yet,
so that search comes back empty.

Each spool prefers the library's own photo of its printed swatch card,
then its linked product photo. Missing photos show **Photo unavailable**,
with a small approximate color reference for solid filaments only. The photos
come through `/api/filament-library/{id}/image`, which fetches only from the
library's media path, so `img-src` stays at `'self'`. It takes the library's
full-size photo (100–400 KB, 2740 × 2056), trims off the white table, crops it
to the card's shape at 480 px wide (about 8 KB) with `sharp`, three at a time
so a page of results cannot exhaust the ZimaBoard's memory, and keeps up to
1,000 in memory. If that fails it serves the library's small thumbnail.

The browser never calls that site. The server (`src/lib/filament-library.ts`)
sweeps the whole library into memory, about 25 pages and 30 seconds, when the
upload page first loads, and keeps it for a day. A failed refresh keeps the old
copy; with no copy at all, picking a spool is refused with 503 and the shelf
still works.

### SpoolmanDB, where filamentcolors.xyz falls short

When filamentcolors.xyz finds fewer than 12 spools for a search, or cannot be
reached, the search also takes in [SpoolmanDB](https://github.com/Donkie/SpoolmanDB)
(MIT): the makers' own listings, about 70 brands and 4,700 colours, which
reaches brands and engineering materials filamentcolors.xyz has not swatched.
The server fetches its one ~5 MB `filaments.json` from GitHub Pages and keeps
it for a day (`src/lib/spoolman-library.ts`). A spool filamentcolors.xyz already
has under the same maker, kind of filament and colour name is left out, and filamentcolors.xyz's
spools still come first unless a colour was picked, when the closest come first.

These spools are weaker evidence. The colour is the hex the maker lists, not a
measured swatch, so the tile uses its linked product photo when available. A spool is
offered only when its exact maker, type and color name match a single
Amazon listing in the bundled catalog. The picker credits SpoolmanDB when
any are shown. The shade filter
works on them through a colour rule tuned to how filamentcolors.xyz files its
own swatches (it agrees nine times in ten). Each colour is listed once, not
per spool size, and multi-colour spools are left out.

Their ids are negative, so `swatchId` alone says which library a ticket's spool
came from: a hash of the maker, material, finish and colour name, stable
across refreshes so printing a ticket again finds the same spool.

The form sends only the swatch's id. At submission the server reads it back
from its copy, checks the material is still on offer and is the swatch's kind
of filament, and snapshots the name, hex, maker, type and buy link onto the
ticket (`swatchId`, `swatchMaker`, `swatchType`, `swatchBuyUrl`). The ticket
then shows a "Spool to buy" chip and a **View on Amazon** product link.
It is otherwise an ordinary request. Printing it again
asks for the same spool, checked against the library as it is that day.

## What "whatever" paints

A ticket carries two colours: `colorStyle`, the swatch as drawn, and
`colorHex`, one representative colour for the places that need exactly one —
the 3D viewer and the tallies on the audit page. For a "whatever" entry the
swatch is the rainbow and the representative colour is a neutral grey
(`#b6bcc2`), because the filament is by definition not chosen yet.

## Rolling back

`Story.material` used to be a Postgres enum and is now text. The enum type is
deliberately left in the database, unused: the previous image's client casts
every insert to it, and the deploy wizard rolls back to that image when a
deploy fails its health check. Without the type, a rolled-back deployment
renders every page and refuses every upload. It can be dropped once no
deployment can roll back past this release.

`npm run verify:catalog` drives the real admin forms and upload endpoint. It is
destructive and should only target a development database; the suite restores
the default catalogue before it exits.
