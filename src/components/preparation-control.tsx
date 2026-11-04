import { prepareTicket } from "@/app/actions/ticket-pipeline";

export function PreparationControl({ storyId, prepared, blocked, from }: { storyId: number; prepared: boolean; blocked: boolean; from: string }) {
  if (prepared) return <form action={prepareTicket}>
    <input type="hidden" name="id" value={storyId} /><input type="hidden" name="from" value={from} /><input type="hidden" name="ready" value="false" />
    <button className="cursor-pointer text-[12px] font-bold text-ink-2 underline underline-offset-2">Return to preparation</button>
  </form>;
  if (blocked) return <p className="m-0 text-[12px] text-ink-2">Resolve the blockers before marking ready.</p>;
  return <details>
    <summary className="stamp inline-block cursor-pointer list-none rounded-chip border-[3px] border-ink bg-mint px-[13px] py-[7px] text-[13px] font-bold text-ink hover:bg-mint-wash">Mark ready</summary>
    <form action={prepareTicket} className="mt-[8px] flex flex-col gap-[9px] rounded-card border-2 border-ink bg-mint-wash p-[12px]">
      <input type="hidden" name="id" value={storyId} /><input type="hidden" name="from" value={from} /><input type="hidden" name="ready" value="true" />
      {[
        ["modelChecked", "Model checked; orientation and supports reviewed"],
        ["materialChecked", "Requested filament is available and assigned"],
        ["sliceChecked", "Slice checked; all requested copies accounted for"],
      ].map(([name, text]) => <label key={name} className="flex items-start gap-[8px] text-[12px] leading-[1.5] text-ink">
        <input type="checkbox" name={name} required className="mt-[3px] shrink-0 accent-ink" />{text}
      </label>)}
      <button className="cursor-pointer rounded-chip border-2 border-ink bg-mint px-[11px] py-[6px] text-[12px] font-bold text-ink">Confirm preparation</button>
    </form>
  </details>;
}
