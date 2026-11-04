import Link from "next/link";
import styles from "./profile-stats.module.css";

import { db } from "@/lib/db";
import { requireUser, storyScope } from "@/lib/authz";
import { storyRef } from "@/lib/scope";
import { formatBytes } from "@/lib/models";
import { AUTO_MATERIAL } from "@/lib/catalog";
import { AppHeader } from "@/components/app-header";
import { OrderTimestamp } from "@/components/order-timestamp";
import { StatusChip } from "@/components/ui";
import { FilamentSpool } from "@/components/color-swatch";
import { Toast } from "@/components/toast";
import { PrintTimeControl } from "@/components/print-time-control";

import type { StoryStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * What counts as printed: it came off the plate, whether or not it has been
 * handed over yet. Named rather than repeated as a literal pair, because the
 * last time the flow was reordered these three call sites had to be found by
 * grep.
 */
const PRINTED: StoryStatus[] = ["Delivery", "Done"];


/**
 * The orders page. Handoff §6.
 *
 * Everything on this page is scoped by `storyScope`: a client
 * counts and lists only their own tickets, the printer owner sees the group.
 * The handoff calls this out explicitly, and it is the easiest place to leak
 * — a stat is still a fact about someone else's data.
 *
 * Declined tickets are listed here too: the whole history belongs here,
 * including the parts that did not happen.
 */

type Card = { value: string; label: string; skin: string };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string; error?: string }>;
}) {
  const [{ toast, error }, user] = await Promise.all([searchParams, requireUser("/me")]);
  const isAdmin = user.role === "admin";
  const scope = storyScope(user);

  const [stories, finished, favourite, waiting, totals] = await Promise.all([
    db.story.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      include: { uploader: { select: { name: true, initials: true } } },
    }),
    db.story.count({ where: { AND: [scope, { status: { in: PRINTED } }] } }),
    db.story.groupBy({
      by: ["material"],
      // Auto delegates the material choice; it is not a member's material preference.
      where: { AND: [scope, { material: { not: AUTO_MATERIAL } }] },
      _count: { material: true },
      orderBy: { _count: { material: "desc" } },
      take: 1,
    }),
    db.story.count({ where: { AND: [scope, { status: "Requested" }] } }),
    db.story.aggregate({
      where: { AND: [scope, { status: { in: PRINTED } }] },
      _sum: { fileSize: true, printHours: true, filamentMeters: true },
      _count: { printHours: true, filamentMeters: true },
    }),
  ]);

  const usual = favourite[0]?.material ?? "—";

  // Completed orders count once, including all copies. Unknown measurements
  // remain unknown.
  const usageValue = (value: number | undefined, recorded: number, unit: string) =>
    finished > 0 && recorded === 0 ? "—" : `${(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;
  const cards: Card[] = isAdmin
    ? [
        { value: String(finished), label: "Printed for the group", skin: "bg-aqua" },
        { value: String(waiting), label: "Waiting on you", skin: "bg-sun" },
        { value: formatBytes(totals._sum.fileSize ?? 0), label: "Geometry off the plate", skin: "bg-cream-2" },
      ]
    : [
        { value: String(stories.length), label: "Requests made", skin: "bg-aqua" },
        { value: usual, label: "Your usual material", skin: "bg-cream-2" },
      ];
  cards.push(
    {
      value: usageValue(totals._sum.printHours?.toNumber(), totals._count.printHours, "h"),
      label: "Print time accrued",
      skin: "bg-sun-wash",
    },
    {
      value: usageValue(totals._sum.filamentMeters?.toNumber(), totals._count.filamentMeters, "m"),
      label: "Filament used",
      skin: "bg-aqua-wash",
    },
  );

  return (
    <>
      <AppHeader user={user} active="/me" />

      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <h1 className={`m-0 mb-[35.2px] text-[38px] leading-[1] text-ink ${isAdmin ? "" : "text-center"}`}>
          {isAdmin ? "All orders" : "My orders"}
        </h1>

        <div className={isAdmin ? "mb-[35.2px] grid gap-[13.2px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))]" : styles.board}>
          {cards.map((c) => (
            <div
              key={c.label}
              className={isAdmin ? `min-w-0 rounded-panel border-[3px] border-ink ${c.skin} p-[13.2px] shadow-stamp sm:p-[17.6px]` : styles.note}
            >
              <p className="m-0 break-words font-display text-[24px] leading-[1] text-ink sm:text-[36px]">
                {c.value}
              </p>
              <p className="m-0 mt-[8px] font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink">
                {c.label}
              </p>
            </div>
          ))}
        </div>

        {isAdmin && (
          <h2 className="m-0 mb-[13.2px] font-display text-[26px] text-ink">
            Everything the group has sent you
          </h2>
        )}

        <div className="order-receipt">
          <div aria-hidden="true" className="order-receipt-plate order-receipt-plate-back" />
          <div className="order-receipt-feed">
            {/* Carry the final row's fill through the torn border. */}
            <div className={`order-receipt-paper overflow-hidden border-[3px] border-ink ${stories.at(-1)?.status === "Declined" ? "bg-cream-2" : "bg-porcelain"}`}>
              {stories.length > 0 && <div aria-hidden="true" className="order-receipt-leader" />}
              {stories.length === 0 ? (
                <p className="m-0 p-[22px] font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3">
                  {isAdmin ? "Nobody has sent you anything yet." : "No orders yet."}
                </p>
              ) : (
                stories.map((story, i) => (
                  <div
                    key={story.id}
                    className={`flex flex-wrap items-center gap-[15px] p-[15px] ${
                      i < stories.length - 1 ? "border-b-2 border-dashed border-rule" : ""
                    } ${story.status === "Declined" ? "bg-cream-2" : "bg-porcelain"}`}
                  >
                    <FilamentSpool
                      mode={story.colorMode}
                      style={story.colorStyle ?? story.colorHex}
                      className="h-[40px] w-[28px] flex-none"
                    />
                    <div className="min-w-[180px] flex-[1_1_240px]">
                      <Link
                        href={`/story/${story.id}`}
                        className="block font-display text-[17px] leading-[1.2] text-ink hover:text-cherry-dk"
                      >
                        {story.title}
                      </Link>
                      <p className="m-0 mt-[3px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
                        {storyRef(story.id)} · {story.filename ?? "no model yet"}
                        {isAdmin ? ` · ${story.uploader.name}` : ""} ·{" "}
                        <OrderTimestamp iso={story.createdAt.toISOString()} />
                      </p>
                    </div>
                    <StatusChip status={story.status} />
                    {isAdmin && (
                      <PrintTimeControl storyId={story.id} status={story.status} printHours={story.printHours?.toString() ?? null} from="/me" showValue />
                    )}
                    {story.flagged && (
                      <span className="rounded-chip border-2 border-ink bg-cherry px-[9px] py-[2px] font-mono text-[10.5px] font-bold uppercase text-ink">
                        needs a look
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <div aria-hidden="true" className="order-receipt-plate order-receipt-plate-front" />
        </div>
      </main>

      {/* A withdrawal lands here, since its ticket no longer exists. */}
      {toast && <Toast>{toast}</Toast>}
      {error && <Toast>{error}</Toast>}
    </>
  );
}
