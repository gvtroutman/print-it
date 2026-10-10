# Materials and colours

[← back to the README](../README.md)

The printer owner manages the choices shown on the request form at
`/admin/catalog`. A material is offered only when it is turned on and has at
least one active colour. Arrows set the order in which materials and colours
appear.

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

Each spool shows as the library's own photo of its printed swatch card,
with the swatch's colour underneath while it loads or if it fails. The photos
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
measured swatch, there is no photo (the tile shows the colour) and no buy
link, and the link to the spool is a web search, since SpoolmanDB has no page
per spool. The picker credits SpoolmanDB when any are shown. The shade filter
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
then shows a "Spool to buy" chip, with links to buy the spool and to see the
real swatch. It is otherwise an ordinary request. Printing it again
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
