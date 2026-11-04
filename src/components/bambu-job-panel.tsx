import { db } from "@/lib/db";
import { bambuLink, syncIfStale } from "@/lib/bambu";
import { completedJobHours, isActiveJob, jobMentionsTicket } from "@/lib/print-pipeline";
import { importTicketRuntime, linkBambuJob } from "@/app/actions/ticket-pipeline";
import { PrinterHoursRefresh } from "@/app/queue/printer-hours-refresh";
import { LocalTime } from "@/app/queue/local-time";
import type { StoryStatus } from "@prisma/client";

export async function BambuJobPanel({ storyId, status }: { storyId: number; status: StoryStatus }) {
  let link = await bambuLink();
  await syncIfStale(link, status === "Accepted" || status === "Printing");
  link = await bambuLink();
  const [jobs, recent, matching] = await Promise.all([
    db.printerPrint.findMany({ where: { storyId }, orderBy: { startedAt: "desc" }, include: { printer: { select: { name: true } } } }),
    db.printerPrint.findMany({ where: { storyId: null }, orderBy: { startedAt: "desc" }, take: 40, include: { printer: { select: { name: true } } } }),
    db.printerPrint.findMany({ where: { storyId: null, title: { contains: `PI-${storyId}`, mode: "insensitive" } }, orderBy: { startedAt: "desc" }, take: 20, include: { printer: { select: { name: true } } } }),
  ]);
  const candidates = [...new Map([...matching.filter(j => jobMentionsTicket(j.title, storyId)), ...recent].map(j => [j.id, j])).values()];
  const hours = completedJobHours(jobs);
  const from = `/story/${storyId}`;
  const canLink = status !== "Requested" && status !== "Declined";
  return <section aria-label="Bambu print jobs" className="mt-[18px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[17px]">
    {link && <PrinterHoursRefresh />}
    <h2 className="m-0 text-[24px] text-ink">Bambu print jobs</h2>
    {link?.lastError && <p role="status" className="rounded-[8px] border-2 border-ink bg-sun-wash p-[9px] text-[12px] text-ink">History could not refresh: {link.lastError} Displayed jobs reflect the last successful sync.</p>}
    <p className="mb-[12px] mt-[6px] text-[13px] leading-[1.5] text-ink-2">Link each plate or retry to this ticket. Save the project with PI-{storyId} in its name to make it easier to find.</p>
    {!jobs.length && <p className="text-[13px] text-ink-2">No print jobs linked yet.</p>}
    {jobs.map(job => <div key={job.id} className="mb-[10px] rounded-card border-2 border-ink bg-porcelain p-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <strong className="break-words text-[14px] text-ink">{job.title}</strong>
        <span className={`rounded-chip px-[8px] py-[3px] text-[11px] font-bold ${job.outcome === "finished" ? "bg-mint" : job.outcome === "failed" ? "bg-cherry-wash" : "bg-sun"}`}>{isActiveJob(job.outcome) ? "Printing" : job.outcome === "finished" ? "Finished · check print" : job.outcome === "failed" ? "Failed / cancelled" : job.outcome}</span>
      </div>
      <p className="mb-[6px] mt-[5px] text-[12px] text-ink-2">{job.printer.name} · <LocalTime iso={job.startedAt.toISOString()} format="datetime" /> · {job.endedAt && job.seconds > 0 ? `${(job.seconds / 3600).toFixed(3)} actual hours` : "Runtime pending"}</p>
      <p className="mb-[6px] mt-0 text-[11px] text-ink-3">Synced <LocalTime iso={job.syncedAt.toISOString()} format="datetime" /></p>
      <form action={linkBambuJob}><input type="hidden" name="id" value={storyId} /><input type="hidden" name="from" value={from} /><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="link" value="false" /><button className="cursor-pointer text-[11px] font-bold text-ink-2 underline underline-offset-2">Unlink job</button></form>
    </div>)}
    {canLink && candidates.length > 0 && <form action={linkBambuJob} className="mt-[12px] flex flex-wrap items-end gap-[8px]">
      <input type="hidden" name="id" value={storyId} /><input type="hidden" name="from" value={from} /><input type="hidden" name="link" value="true" />
      <label className="min-w-0 flex-[1_1_240px] text-[12px] font-bold text-ink">Choose a synced job
        <select name="jobId" required defaultValue="" className="mt-[5px] w-full rounded-[8px] border-2 border-ink bg-porcelain px-[8px] py-[7px] text-[12px]">
          <option value="" disabled>Select a print…</option>
          {candidates.map(j => <option key={j.id} value={j.id}>{jobMentionsTicket(j.title, storyId) ? "Suggested · " : ""}{j.title} · {j.printer.name} · {j.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {j.outcome} · #{j.id}</option>)}
        </select>
      </label><button className="cursor-pointer rounded-chip border-[3px] border-ink bg-aqua px-[12px] py-[7px] text-[13px] font-bold text-ink">Link job</button>
    </form>}
    {!canLink && <p className="text-[12px] text-ink-2">Accept the ticket before linking jobs.</p>}
    {canLink && !candidates.length && <p className="text-[12px] text-ink-2">No unlinked jobs available. Connect or refresh Bambu history on the queue.</p>}
    {(status === "Delivery" || status === "Done") && hours !== null && <form action={importTicketRuntime} className="mt-[14px]">
      <input type="hidden" name="id" value={storyId} /><input type="hidden" name="from" value={from} />
      <button className="cursor-pointer rounded-chip border-[3px] border-ink bg-mint px-[12px] py-[7px] text-[13px] font-bold text-ink">Import {hours} actual hours</button>
      <p className="mb-0 mt-[6px] text-[12px] text-ink-2">Replaces the recorded print time with the total from successful linked jobs. Check that every copy is represented. Filament meters are recorded separately.</p>
    </form>}
    <p className="mb-0 mt-[12px] text-[11px] text-ink-3">{link ? "Bambu history refreshes while this page is visible." : "Bambu account is not connected. Connect it on the queue to sync history."} Synced outcomes do not change the ticket stage.</p>
  </section>;
}
