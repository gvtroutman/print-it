# Combined filament colors

The color chart offers **Solid, Clear, Gradient, Glitter, Multi Color, Silk,
Marble, Scented, and Glow** filters. Clear displays the existing translucency filter.
Scented and Glow match explicit labels in the color,
product or material name across all finishes. Rose and coffee color names alone
do not count as scented, and fluorescent colors alone do not count as glow.
These filters retain separate filament choices even when their hex colors match.
The chart selects recorded filaments from two open sources:
[filamentcolors.xyz](https://filamentcolors.xyz/) for measured printed swatches,
and [Open Filament Database](https://openfilamentdatabase.org/docs) for broader
brand, material and product coverage. Each entry retains its source identity,
original color name, brand, product, material family, translucency and source
or purchase link. The picker shows the brand/product and a **View on Amazon**
link to that product's listing.

The bundled `src/lib/filament-palette.json` snapshot was retrieved on 2026-10-12.
It records source URLs, source counts, Open Filament Database's version and
archive hash, and a SHA-256 over the normalized merged records. Source license
notices are retained in `src/lib/filament-palette.LICENSE`.

The initial approved brands are **ELEGOO, IEMAI,
Overture, Polymaker, SUNLU, eSUN, Pinball, JAYO, Cookiecad, 3DHoJor,
TINMORRY, AMOLEN, Bambu Lab, Voxelab, Creality, GIANTARM, Anycubic,
Flashforge, YOOPAI, and Eryone**. The migration saves them in the database;
the live picker and spool search use the admin's saved settings. Matching
ignores casing, spaces and punctuation.
Voxel Lab is accepted as an alias of Voxelab; Voxel PLA is a separate brand.
Flashforge 3D is included under Flashforge.
Only records with a direct Amazon product listing are offered in the shade
picker and spool search. Catalog Amazon short links are resolved during sync;
search pages, brand storefronts and non-Amazon links do not qualify. Listing
URLs retain their source product ASIN and omit tracking parameters. Source
URLs stay in the data for provenance. Colors without a listing are hidden.
The owner's shelf colors and existing ticket snapshots are retained.

Admins manage this at **Materials & colors → Manage brands & Amazon links**
(`/admin/catalog/brands`). Add or edit brands and their catalog aliases, and
turn brands on or off. Each brand can have exact product/color listings:
choose a bundled catalog color to supply or replace its Amazon link, or enter
a new material, product, color name and hex. Amazon short links are accepted
and resolved to a direct listing. Search pages and brand storefronts are refused.
Listings can be edited or turned off independently. These changes affect new
and repeat order forms, spool searches and submission validation without a code
change. Only the admin can read or submit these forms; writes are audited.

`filamentBrand` and `filamentListing` hold the settings. Admin listings have
reserved positive swatch ids above 1,000,000,000; old tickets retain their own
name, hex and purchase URL. Empty or disabled settings do not silently restore
the original brand list. The migration is required before running the updated app.
eSUN 3D is included under eSUN; Panchroma, Fiberon, PolyLite, PolyFlex,
PolyMide and PolySonic are included as Polymaker product lines. Other makers
are excluded before deduplication, nearest-color matching, search totals and
fallback decisions. The server also rejects a new spool selection from an
excluded brand or without an Amazon listing, including one submitted directly by id. The source snapshot,
owner's shelf colors, saved personal colors and existing ticket snapshots
are retained.
Pinball is approved but has no entries in the current bundled snapshot; its
colors will become available when a source lists them and the snapshot is refreshed.

The merge matches brand, material family/kind, exact normalized color name,
finish and translucency. A catalog record with an unambiguous measured match
uses the measured swatch instead. Conflicting measured hexes and uncertain
product-line matches stay separate. Brand spelling variants are normalized;
Prusa and Prusament share a key. Equal hex values use a measured representative
first, with source ordering breaking remaining ties deterministically.

ASA and ABS records (including filled variants and blends) are excluded from
the picker. The selected material and color type filter records before
deduplication, so a color shared by PLA and PETG keeps the correct material's
representative. Compatibility
follows the existing spool search's family/kind rules, including fibre-filled
materials and CoPE. Auto material offers the same six types across the approved
brands. An excluded or unknown material, or a type with no matching Amazon
listing, shows no recorded shades instead of borrowing another material's colors.

The **Library** tab shows one filamentcolors.xyz printed sample per row for
the owner's shelf colors. Identified products use their exact samples; other
colors use labeled similar material/finish references (or a labeled base color
when the finish has no sample). Unknown materials keep their saved preview.
These photos do not alter the saved shelf shade or the requested filament.
The **Store** tab shows labeled filament photo tiles ordered by color,
without a search field. Market tiles prefer their exact photographed printed
sample, then the linked product photo. Photos are displayed with their original
colors and proportions, without tinting, simulated finishes or tight client-side
crops. Images load lazily through authenticated image routes. An unavailable
photo shows **Photo unavailable**; solid filaments also have a small flat
**Approximate color** reference. Specialty filaments have no invented finish
fallback. Selecting a market
tile immediately selects its recorded filament identity; switching finishes or
opening the chart does not change the request.
Arrow keys, Home and End select and focus chart tiles. Translucent selections
retain 50% visual opacity in the request preview. Gradient and
Multi Color show individual named variants, retaining different filament
identities even when they share a base hex. The photo cards show their actual
sample or product rather than inventing effects from a representative hex.
The existing symbolic request swatches retain their saved styles.
Every type remains selectable when it has no eligible listings, with an empty
state that allows choosing another type. The current sources have no approved,
Amazon-linked Gradient variants; an admin can link one to make it available.
Saved shades retain their original selection when the chart opens.
Color picker labels and the selected color summary use title case.
The finish selector uses larger printed sample previews when a matching sample
is available. Its scrollbar is hidden; the row follows the pointer directly and
flicks coast with continuous deceleration, without snapping to category cells.
Browsing the row keeps the chosen
finish and filament; selecting a finish only filters the chart.
Member-facing names omit cooling notes such as `(w/ Fan)` and `(w/o Fan)`.
The source records and photo identities retain these sample details. New palette
saves and requests use the clean name; existing saved colors and request details
also display clean names without rewriting historical source data.
The preview, Auto request summary and submitted Auto request retain the source
name, finish and hex. `filamentColorId` lets the server resolve Auto selections
from the current configured records and snapshot their finish preview. A
specialty finish in a material-specific picker requests that exact spool to buy, rather
than substituting a solid shelf color with a similar hex. Open Filament Database
variants have stable source-derived positive swatch ids at or above 2,000,000,000;
sync verifies that these ids are unique and fit the database's integer range.
Shelf cards retain the owner's catalog names and colors;
opening the picker does not replace an existing selection.

Members can save or unsave the selected recorded shade, or a solid shelf color,
with the bookmark button. In **Store**, an artist's palette icon appears
once at least one color is saved. The saved-color drawer stays closed until the
icon is clicked and closes again when leaving that tab. Saved colors are loaded
from the member's account on new orders and repeat orders. Selecting an entry
reuses its exact hex and opacity through the form's usual material matching.
The drawer also lets members unsave individual colors. Unsaving an entry changes
only the palette; it does not change the current
selection or old requests. Repeated saves do not create duplicate entries.
The palette's reads and writes are scoped to the signed-in member, including
when the printer owner uses it. `/api/palette` lists and saves colors;
`DELETE /api/palette/{id}` removes one.

Only available, published measured records and active FFF catalog variants
with a valid representative hex are included. Gradients and coextrusions retain
their source traits as color types. Discontinued variants are excluded.
Catalog hex values are the
recorded manufacturer values; the measured source has priority only for
supported matches, not for unrelated products that happen to have similar hues.

Run `npm run sync:colors` to refresh both sources. It downloads their full public
listings, validates completeness and source identities, and writes the snapshot
only after both downloads succeed. The picker works without a live source
request. Commit refreshed data with the application.

`npm run verify:colors` checks provenance, merge precedence and ambiguity,
source/product identities, exact shade membership, material filtering, greys,
all six type filters, identical-hex finishes, empty types, approved brands and aliases, direct Amazon URLs,
short-link resolution, purchase-link inheritance, and request validation.
`npm run verify:brands` checks both spool search sources and direct-id rejection
using isolated fixtures without a live database or network, including new brands,
custom listings, setting changes and empty settings. `npm run verify:admin-filaments`
exercises real admin actions, member/Origin rejection, source and custom links,
search updates, order snapshots and audit events; use a development/test database.
Pass `-- --browser` to include responsive layout and catalog-color selection checks.
Source names fit the 80-character
request limit without truncation.
