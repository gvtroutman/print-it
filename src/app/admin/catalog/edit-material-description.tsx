import { Button } from "@/components/ui";
import { MAX_MATERIAL_DESCRIPTION } from "@/lib/catalog";
import { describeMaterialAction } from "./actions";

/**
 * What the material is, as the upload form shows it under the material picker.
 * Click the text to edit it; an empty description shows nothing there.
 */
export function EditMaterialDescription({
  id,
  name,
  description,
}: {
  id: string;
  name: string;
  description: string;
}) {
  return (
    <details className="group mb-[17.6px]">
      <summary
        className={`cursor-pointer list-none rounded-[4px] text-[14px] leading-[1.45] underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-aqua focus-visible:decoration-aqua [&::-webkit-details-marker]:hidden ${
          description ? "text-ink-2" : "font-mono text-[11.5px] uppercase text-ink-3"
        }`}
        aria-label={`Edit the description of ${name}`}
      >
        {description || "Add a description for the order form"}
      </summary>
      <form action={describeMaterialAction} className="mt-[8px] flex flex-col items-start gap-[6px]">
        <input type="hidden" name="id" value={id} />
        <textarea
          name="description"
          defaultValue={description}
          rows={3}
          maxLength={MAX_MATERIAL_DESCRIPTION}
          placeholder="Tough and a little bendy. Good for hooks and brackets."
          aria-label={`Description of ${name}`}
          className="w-full rounded-card border-[3px] border-ink bg-porcelain px-[15px] py-[12px] text-[15px] leading-[1.45] text-ink placeholder:text-ink-3"
        />
        <Button type="submit" variant="ghost" className="px-[10px] py-[7px]">Save</Button>
      </form>
    </details>
  );
}
