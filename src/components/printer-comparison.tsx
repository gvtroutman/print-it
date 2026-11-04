// Compare the community's P1S Combo with the exact donation campaign bundle.
// Specifications: https://us.store.bambulab.com/products/p1s
// Included H2D tools: https://blog.bambulab.com/bambu-lab-launches-h2d-to-rethink-personal-manufacturing/
const COMPARISON = [
  {
    capability: "Typical multicolor waste",
    current: "High: often 100–600g+ per print, depending on complexity. The single nozzle purges filament when changing colors.",
    proposed: "Very low for suitable two-color jobs: often under 10–20g for similar models, with one color in each nozzle. Additional AMS filament swaps can still create waste.",
  },
  {
    capability: "Multicolor print time",
    current: "Repeated unloading, reloading and purging can significantly lengthen total print time. With frequent color changes, a job can sometimes take around twice as long as a comparable H2D two-color print.",
    proposed: "Faster switching between two loaded nozzles can shorten total print time for similar two-color jobs. Extra AMS filament swaps still add time; savings depend on the model and settings.",
  },
  {
    capability: "Print size (W × D × H)",
    current: "256 × 256 × 256 mm",
    proposed: "300 × 320 × 325 mm with dual nozzles. Make bigger organizers, enclosures and prototypes in one piece.",
  },
  {
    capability: "Nozzles & material changes",
    current: "One nozzle. AMS unloads and reloads filament for each material or color change.",
    proposed: "Two nozzles for compatible material pairs, including dedicated support material.",
  },
  {
    capability: "Multicolor option",
    current: "Available with AMS when a project calls for it.",
    proposed: "Available with the included AMS 2 Pro when a project calls for it.",
  },
  {
    capability: "Maximum nozzle temperature",
    current: "300°C",
    proposed: "350°C for more demanding compatible filaments.",
  },
  {
    capability: "Print chamber",
    current: "Enclosed, without active heating.",
    proposed: "Actively heated up to 65°C for compatible engineering materials.",
  },
  {
    capability: "Laser engraving & cutting",
    current: "Not available.",
    proposed: "Included 40W laser for engraved gifts, signs and laser-compatible wood parts.",
  },
  {
    capability: "Blade cutting",
    current: "Not available.",
    proposed: "Included cutting module for paper, vinyl, stickers and stencils.",
  },
  {
    capability: "Pen drawing",
    current: "Not available.",
    proposed: "Included pen holder for line art, lettering and technical drawings.",
  },
];

export function PrinterComparison() {
  return (
    <section
      aria-labelledby="printer-comparison"
      className="mt-[26.4px] overflow-hidden rounded-panel border-[3px] border-ink bg-porcelain shadow-stamp"
    >
      <div className="p-[17.6px] sm:p-[22px]">
        <h2 id="printer-comparison" className="m-0 font-display text-[24px] text-ink">
          Current printer vs. what we’re funding
        </h2>
        <p className="m-0 mt-[6px] text-[14.5px] leading-[1.5] text-ink-2 text-pretty">
          The P1S Combo can print in multiple colors, but its single nozzle produces
          high purge waste during color changes. <strong className="font-bold text-ink">One complex
          multicolor print can waste half a 1kg roll of filament — around 500g.</strong>{" "}
          The H2D’s two nozzles can reduce that waste for two-color or two-material
          jobs, helping more of our filament go into community prints.
        </p>
        <p className="m-0 mt-[8px] text-[14.5px] leading-[1.5] text-ink-2 text-pretty">
          Those same unload, reload and purge cycles also add time. On jobs with
          frequent color changes, the P1S can take significantly longer — sometimes
          around twice as long as a comparable H2D two-color print. Faster nozzle
          switching helps community projects finish sooner.
        </p>
      </div>

      <table role="table" className="block w-full table-fixed border-collapse text-left text-[14px] leading-[1.5] text-ink-2 sm:table">
        <caption className="sr-only">
          Community capabilities: current Bambu Lab P1S Combo compared with the proposed
          Bambu Lab H2D Laser Full Combo (40W).
        </caption>
        <colgroup className="hidden sm:table-column-group">
          <col className="w-[28%]" />
          <col className="w-[36%]" />
          <col className="w-[36%]" />
        </colgroup>
        <thead role="rowgroup" className="sr-only sm:not-sr-only">
          <tr role="row" className="border-y-2 border-ink">
            <th role="columnheader" scope="col" className="bg-cream-2 px-[8px] py-[13.2px] align-top font-display text-[14px] text-ink sm:px-[17.6px] sm:text-[17px]">
              Capability
            </th>
            <th role="columnheader" scope="col" className="bg-cream-2 px-[8px] py-[13.2px] align-top text-ink sm:px-[17.6px]">
              <span className="mb-[4px] block font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
                Available now
              </span>
              <span className="block font-display text-[14px] font-normal leading-[1.3] sm:text-[17px]">
                Bambu Lab P1S Combo
              </span>
            </th>
            <th role="columnheader" scope="col" className="bg-mint-wash px-[8px] py-[13.2px] align-top text-ink sm:px-[17.6px]">
              <span className="mb-[4px] block font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
                Funding goal
              </span>
              <span className="block font-display text-[14px] font-normal leading-[1.3] sm:text-[17px]">
                Bambu Lab H2D Laser Full Combo (40W)
              </span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="block sm:table-row-group">
          {COMPARISON.map((row) => (
            <tr role="row" key={row.capability} className="grid grid-cols-2 border-b border-rule last:border-b-0 sm:table-row">
              <th role="rowheader" scope="row" className="col-span-2 block break-words border-b border-rule bg-cream-2 px-[13.2px] py-[8.8px] align-top font-bold text-ink sm:table-cell sm:border-b-0 sm:bg-transparent sm:px-[17.6px] sm:py-[13.2px]">
                {row.capability}
              </th>
              <td role="cell" className="block break-words px-[13.2px] py-[13.2px] align-top sm:table-cell sm:px-[17.6px]">
                <span aria-hidden="true" className="mb-[6px] block font-mono text-[11px] font-bold uppercase text-ink sm:hidden">
                  P1S · current
                </span>
                {row.current === "Not available." ? (
                  <span className="inline-flex align-middle">
                    <span className="sr-only">{row.current}</span>
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="h-[28px] w-[28px] text-ink"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 8l8 8m0-8-8 8" />
                    </svg>
                  </span>
                ) : (
                  row.current
                )}
              </td>
              <td role="cell" className="block break-words bg-mint-wash px-[13.2px] py-[13.2px] align-top sm:table-cell sm:px-[17.6px]">
                <span aria-hidden="true" className="mb-[6px] block font-mono text-[11px] font-bold uppercase text-ink sm:hidden">
                  H2D · goal
                </span>
                {row.proposed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="m-0 border-t-2 border-dashed border-rule px-[17.6px] py-[13.2px] text-[12px] leading-[1.5] text-ink-2 sm:px-[22px]">
        Waste figures and print-time comparisons are estimates, not guarantees or
        manufacturer specifications. Actual results depend on the model, number of
        color changes, filament assignment and slicer settings.
      </p>

      <p className="m-0 px-[17.6px] pb-[13.2px] text-[12px] leading-[1.5] text-ink-2 sm:px-[22px]">
        Manufacturer details:{" "}
        <a href="https://us.store.bambulab.com/products/p1s" target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2 hover:text-cherry-dk">
          P1S specifications ↗
        </a>
        {" · "}
        <a href="https://eu.store.bambulab.com/products/h2d" target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2 hover:text-cherry-dk">
          H2D specifications & included tools ↗
        </a>
      </p>
    </section>
  );
}
