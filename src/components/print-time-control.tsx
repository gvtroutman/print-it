import type { StoryStatus } from "@prisma/client";
import { recordStoryPrintTime } from "@/app/actions/stories";

/** Record or correct the runtime for this completed ticket. */
export function PrintTimeControl({
  storyId,
  status,
  printHours,
  from,
  showValue = false,
}: {
  storyId: number;
  status: StoryStatus;
  printHours: string | null;
  from: string;
  showValue?: boolean;
}) {
  if (status !== "Delivery" && status !== "Done") return null;

  return (
    <div className="min-w-0 max-w-full">
      {showValue && (
        <p className="m-0 mb-[6px] text-[12px] text-ink-2">
          {printHours === null
            ? "Print time not recorded"
            : `Print time: ${Number(printHours).toLocaleString("en-US", { maximumFractionDigits: 3 })} h`}
        </p>
      )}
      <details className="min-w-0 max-w-full">
        <summary className="stamp inline-block cursor-pointer list-none rounded-chip border-[3px] border-ink bg-porcelain px-[15px] py-[8px] text-[14px] font-bold text-ink hover:bg-sun">
          {printHours === null ? "Record print time" : "Edit print time"}
        </summary>
        <form action={recordStoryPrintTime} className="mt-[8px] w-full max-w-[340px] rounded-card border-[3px] border-ink bg-cream-2 p-[11px]">
          <input type="hidden" name="id" value={storyId} />
          <input type="hidden" name="from" value={from} />
          <label htmlFor={`time-record-${storyId}`} className="block text-[13px] font-bold text-ink">Print time (hours)</label>
          <input id={`time-record-${storyId}`} type="number" name="printHours" min="0" max="1000000" step="0.001" defaultValue={printHours ?? ""} placeholder="Unknown" className="mt-[5px] w-full min-w-0 rounded-[8px] border-[3px] border-ink bg-porcelain px-[11px] py-[7px] text-[14px] text-ink" />
          <p className="mb-[8px] mt-[4px] text-[12px] leading-[1.4] text-ink-2">Time for this print, including all copies. 1.5 hours = 1 hour 30 minutes. Leave blank if unknown.</p>
          <button type="submit" className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-mint px-[15px] py-[7px] text-[13.5px] font-bold text-ink">Save print time</button>
        </form>
      </details>
    </div>
  );
}
