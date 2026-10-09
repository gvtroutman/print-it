import { Button } from "@/components/ui";
import { TOP_MARK, TRAITS, asMark, builtInTraits, traitsFor, type OwnerRatings } from "@/lib/filament-traits";
import { rateMaterialAction } from "./actions";

/**
 * The stickers the upload form's comparison chart gives this material, one
 * mark per trait. The built-in filament table fills them in from the name,
 * so most materials need nothing here; the owner overrules a mark trait by
 * trait for the odd case — a brand's unusually stiff TPU, or a material the
 * table has never heard of — and "Built-in" hands a trait back to the table.
 * Click the summary to edit, as with the description above it.
 */
export function EditMaterialRatings({
  id,
  name,
  ratings,
}: {
  id: string;
  name: string;
  ratings: OwnerRatings;
}) {
  const builtIn = builtInTraits(name);
  const shown = traitsFor(name, ratings);
  const own = TRAITS.filter(({ key }) => asMark(ratings[key]) !== null);
  const marks = shown
    ? TRAITS.map(({ key, label }) => {
        const mark = shown.ratings[key];
        return `${label} ${mark === null ? "–" : `${mark}/${TOP_MARK}`}${asMark(ratings[key]) === null ? "" : "*"}`;
      }).join(" · ")
    : "";
  // One string, not adjacent JSX expressions: the server would put a comment
  // node between those, and the verify script reads this page as text.
  const heading = shown?.family
    ? `Charted as ${shown.family}${own.length > 0 ? ` with ${own.length} of your own*` : ""}`
    : "Charted with your marks";
  const selectClass = "h-[40px] w-full rounded-card border-[3px] border-ink bg-porcelain px-[8px] font-mono text-[12px] font-bold uppercase text-ink";

  return (
    <details className="group mb-[17.6px]">
      <summary
        className="cursor-pointer list-none rounded-[4px] font-mono text-[11.5px] uppercase leading-[1.6] text-ink-3 underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-aqua focus-visible:decoration-aqua [&::-webkit-details-marker]:hidden"
        aria-label={`Edit the chart ratings of ${name}`}
      >
        {shown ? (
          <>
            <span className="text-ink-2">{heading}</span>
            {" · "}
            {marks}
          </>
        ) : (
          "Not on the order form's chart yet — the name matches no filament the chart knows. Add ratings"
        )}
      </summary>
      <form action={rateMaterialAction} className="mt-[8px] flex flex-wrap items-end gap-[8.8px]">
        <input type="hidden" name="id" value={id} />
        {TRAITS.map(({ key, label, blurb }) => (
          <div key={key} className="w-[118px]">
            <label
              htmlFor={`${key}-${id}`}
              title={blurb}
              className="mb-[6px] block font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2"
            >
              {label}
            </label>
            <select id={`${key}-${id}`} name={key} defaultValue={asMark(ratings[key]) ?? ""} className={selectClass}>
              {/* One string: adjacent JSX text nodes get a comment between them on the server. */}
              <option value="">{`Built-in (${builtIn ? builtIn.ratings[key] : "none"})`}</option>
              {Array.from({ length: TOP_MARK }, (_, i) => i + 1).map((mark) => (
                <option key={mark} value={mark}>{mark}</option>
              ))}
            </select>
          </div>
        ))}
        <Button type="submit" variant="ghost" className="px-[10px] py-[7px]">Save</Button>
      </form>
    </details>
  );
}
