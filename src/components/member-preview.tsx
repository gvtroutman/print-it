import { endPreviewAction, startPreviewAction } from "@/app/actions/preview";

/**
 * The printer owner's way in to the member view, and back out.
 *
 * Plain server-action forms, so both work before hydration and with
 * JavaScript off — the same as the admin panel, and what `verify:queue`
 * drives.
 */

/** For the owner's account menu. */
export function StartPreview() {
  return (
    <form action={startPreviewAction}>
      <button
        type="submit"
        className="cursor-pointer border-0 bg-transparent p-0 font-bold text-[14px] text-cherry-dk underline underline-offset-2 hover:text-cherry"
      >
        Preview as a member →
      </button>
      <p className="m-0 mt-[2px] font-mono text-[11.5px] text-ink-3">
        Your own account, with the screens and limits everyone else has.
      </p>
    </form>
  );
}

/**
 * Under the header for as long as the preview lasts. Not dismissible: the
 * owner is looking at a version of the app with their own controls missing,
 * and the way back should never be more than one click away.
 */
export function PreviewBanner() {
  return (
    <div data-previewing="true" className="border-b-[3px] border-ink bg-sun">
      <form
        action={endPreviewAction}
        className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-[13.2px] px-[26.4px] py-[11px]"
      >
        <p className="m-0 flex-1 text-[14.5px] leading-[1.4] text-ink">
          <strong className="font-display text-[15px]">Previewing as a member.</strong>{" "}
          This is what an invited member sees. Anything you do here, you do as
          one, under your own name.
        </p>
        <button
          type="submit"
          className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-ink px-[17.6px] py-[7px] text-[13.5px] font-bold text-cream hover:bg-ink-2"
        >
          Back to the owner view
        </button>
      </form>
    </div>
  );
}
