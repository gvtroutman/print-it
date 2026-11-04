import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { storyRef, BOARD } from "@/lib/scope";
import { requireAdmin } from "@/lib/authz";
import { quantityText } from "@/lib/catalog";
import { bambuLink, syncIfStale } from "@/lib/bambu";
import { completedJobHours, isActiveJob, pipelineStage, preparationBlockers } from "@/lib/print-pipeline";
import { AppHeader } from "@/components/app-header";
import { OrderTimestamp } from "@/components/order-timestamp";
import { AdminActions } from "@/components/admin-actions";
import { BambuStudioButton } from "@/components/bambu-studio-button";
import { Kicker, Notice, SpoolToBuyChip } from "@/components/ui";
import { Toast } from "@/components/toast";
import { FilamentSpool } from "@/components/color-swatch";
import { PipelineBoard, type PipelineTicket } from "./pipeline-board";
import { PrinterHoursRefresh } from "./printer-hours-refresh";

export const dynamic = "force-dynamic";
const include = { uploader: { select: { name: true, initials: true } }, printJobs: { orderBy: { startedAt: "desc" as const } } } satisfies Prisma.StoryInclude;
type Ticket = Prisma.StoryGetPayload<{ include: typeof include }>;

function QueueTicket({ story, userId }: { story: Ticket; userId: string }) {
  const blockers = preparationBlockers(story);
  const failed = story.printJobs.filter(j => j.outcome === "failed").length;
  const active = story.printJobs.filter(j => isActiveJob(j.outcome)).length;
  const finished = story.printJobs.filter(j => j.outcome === "finished").length;
  const hours = completedJobHours(story.printJobs);
  return <article className="rounded-card border-2 border-ink bg-porcelain p-[13px] shadow-stamp">
    <div className="mb-[9px] flex flex-wrap items-center justify-between gap-[6px]">
      <Link href={`/story/${story.id}`} className="font-mono text-[11px] font-bold tracking-[0.05em] text-ink-3 hover:text-cherry-dk">{storyRef(story.id)}</Link>
    </div>
    <Link href={`/story/${story.id}`} className="block break-words font-display text-[20px] leading-[1.15] text-ink hover:text-cherry-dk">{story.title}</Link>
    <p className="mb-[11px] mt-[5px] text-[12px] text-ink-3">{story.uploader.name} · <OrderTimestamp iso={story.createdAt.toISOString()} /></p>
    <div className="flex items-center gap-[9px] border-y border-rule py-[10px]">
      <FilamentSpool mode={story.colorMode} style={story.colorStyle ?? story.colorHex} className="h-[33px] w-[24px] flex-none" />
      <p className="m-0 min-w-0 text-[12px] leading-[1.6] text-ink"><strong>{quantityText(story.quantity)}</strong> · {story.material}<br />{story.colorName}</p>
    </div>
    <p className="my-[10px] break-all text-[11px] text-ink-3">{story.filename ?? "No model yet"}</p>
    {story.swatchId !== null && <div className="mb-[9px]"><SpoolToBuyChip /></div>}
    {blockers.length > 0 && <p className="mb-[10px] mt-0 rounded-[8px] bg-sun-wash px-[9px] py-[7px] text-[12px] font-bold text-ink">{blockers.join(" · ")}{story.flagReason ? `: ${story.flagReason}` : ""}</p>}
    {story.printJobs.length > 0 && <div className="mb-[11px] rounded-[8px] bg-aqua-wash px-[9px] py-[8px] text-[12px] leading-[1.6] text-ink">
      <strong>Bambu</strong> · {[active ? `${active} printing` : "", finished ? `${finished} finished` : "", failed ? `${failed} failed / cancelled` : ""].filter(Boolean).join(" · ") || "Outcome pending"}
      {hours !== null && <span className="block">{hours} actual hours · {story.status === "Printing" ? "Check the print before pickup" : "Successful jobs"}</span>}
    </div>}
    {story.filename && <div className="mb-[12px]"><BambuStudioButton storyId={story.id} userId={userId} filename={story.filename} compact /></div>}
    <AdminActions storyId={story.id} status={story.status} flagged={story.flagged} flagReason={story.flagReason} prepared={Boolean(story.preparedAt)} hasModel={Boolean(story.storageKey && story.filename)} filamentMeters={story.filamentMeters?.toString() ?? null} printHours={story.printHours?.toString() ?? null} from="/queue" compact />
    <Link href={`/story/${story.id}`} className="mt-[12px] block text-[12px] font-bold text-ink-2 underline underline-offset-2">{story.status === "Requested" ? "Review ticket & conversation →" : "Ticket & Bambu jobs →"}</Link>
  </article>;
}

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ toast?: string; error?: string }> }) {
  const [{ toast, error }, admin, link] = await Promise.all([searchParams, requireAdmin(), bambuLink()]);
  const working = await db.story.count({ where: { status: { in: ["Accepted", "Printing"] } } });
  await syncIfStale(link, working > 0);
  const [stories, completed] = await Promise.all([
    db.story.findMany({ where: { status: { in: [...BOARD] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include }),
    db.story.count({ where: { status: "Done" } }),
  ]);
  const tickets: PipelineTicket[] = stories.flatMap(story => {
    const stage = pipelineStage(story);
    return stage ? [{ id: story.id, stage, search: [storyRef(story.id), story.title, story.filename, story.uploader.name, story.material, story.colorName].filter(Boolean).join(" "), blocked: preparationBlockers(story).length > 0 || story.printJobs.some(j => j.outcome === "failed"), card: <QueueTicket story={story} userId={admin.id} /> }] : [];
  });
  const ready = tickets.filter(t => t.stage === "ready").length;
  const printing = tickets.filter(t => t.stage === "printing").length;
  return <>
    <AppHeader user={admin} active="/queue" />
    <main className="mx-auto w-full max-w-[1660px] px-[18px] pb-[80px] pt-[32px] sm:px-[26px]">
      {link && <PrinterHoursRefresh />}
      <div className="mb-[24px] flex flex-wrap items-end justify-between gap-[18px]">
        <div><Kicker>Printer view · ticket pipeline</Kicker><h1 className="m-0 mb-[9px] text-[42px] leading-[1] text-ink">Print Queue</h1><p className="m-0 text-[15px] text-ink-2">From request to pickup, with the model and print jobs in one place.</p></div>
        <div className="flex flex-wrap gap-[8px] text-[12px] font-bold text-ink"><span className="rounded-chip border-2 border-ink bg-mint px-[12px] py-[8px]">{ready} ready</span><span className="rounded-chip border-2 border-ink bg-aqua px-[12px] py-[8px]">{printing} printing</span><Link href="/history" className="rounded-chip border-2 border-ink bg-porcelain px-[12px] py-[8px] hover:bg-sun">{completed} completed · History ↗</Link></div>
      </div>
      {error && <div className="mb-[20px]"><Notice tone="warn">{error}</Notice></div>}
      <PipelineBoard tickets={tickets} />
      <div className="mt-[24px] flex flex-wrap items-center justify-between gap-[10px] rounded-panel border-2 border-ink bg-cream-2 px-[16px] py-[13px] text-[12px] text-ink-2"><span>Oldest request first in each column.</span><Link href="/bambu-studio" className="font-bold underline underline-offset-2">Set up Bambu Studio handoff ↗</Link></div>
    </main>
    {toast && <Toast>{toast}</Toast>}
  </>;
}
