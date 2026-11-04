import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { relativeTime } from "@/lib/catalog";
import { bambuLink, syncIfStale } from "@/lib/bambu";
import { Button, Input } from "@/components/ui";
import { PRINTER_PHOTOS, PrinterPeek } from "@/components/printer-peek";

import {
  bambuCancelAction,
  bambuConnectAction,
  bambuSendCodeAction,
  bambuSyncAction,
  logHoursAction,
  removeReadingAction,
} from "./actions";
import { LocalTime } from "@/app/queue/local-time";
import { PrinterHoursRefresh } from "@/app/queue/printer-hours-refresh";
import { SyncAge } from "./sync-age";
import { PrinterHoursMenu } from "./printer-hours-menu";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** The per-week average looks back this far, so a quiet spring doesn't drag down a busy autumn. */
const AVERAGE_OVER_MS = 12 * WEEK_MS;
const RECENT = 6;
const ACTIVE_OUTCOMES = ["printing", "status 1", "status 4"];

const label = "m-0 font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3";

/**
 * The hour meter for each printer, on the Admin page. The owner reads the
 * total hours off the machine and logs them; with Bambu Lab connected, every
 * print synced since that reading is added on top, so the odometer keeps up
 * between readings. Below it: the prints themselves, with when and how long.
 */
export async function PrinterHours() {
  const [previousLink, jar, activeCount] = await Promise.all([
    bambuLink(),
    cookies(),
    // Include active jobs saved by older versions, which displayed raw status codes.
    db.printerPrint.count({ where: { outcome: { in: ACTIVE_OUTCOMES } } }),
  ]);
  await syncIfStale(previousLink, activeCount > 0);
  const [printers, totals, link] = await Promise.all([
    db.printer.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        readings: { orderBy: { createdAt: "desc" } },
        prints: { orderBy: { startedAt: "desc" }, take: 300 },
      },
    }),
    // Every synced print, not just the 300 listed, for the meter and print score.
    db.printerPrint.groupBy({ by: ["printerId", "outcome"], _sum: { seconds: true }, _count: { _all: true } }),
    bambuLink(),
  ]);
  if (printers.length === 0) return null;
  const hasActivePrints = printers.some((printer) =>
    printer.prints.some((print) => ACTIVE_OUTCOMES.includes(print.outcome)),
  );
  const pendingEmail = jar.get("ppp_bambu_email")?.value;

  return (
    <section className="mb-[26.4px] flex flex-col gap-[17.6px]">
      {link && hasActivePrints && <PrinterHoursRefresh />}
      <PrintScore
        successful={totals.filter((total) => total.outcome === "finished").reduce((sum, total) => sum + total._count._all, 0)}
        failed={totals.filter((total) => total.outcome === "failed").reduce((sum, total) => sum + total._count._all, 0)}
      />
      {printers.map((printer) => {
        const [latest, previous] = printer.readings;
        const prints = printer.prints;
        const oldest = prints[prints.length - 1];
        const outcomes = totals.filter((total) => total.printerId === printer.id);

        // Prints after the newest reading are not on it yet; with no reading, the history is all there is.
        const since = latest?.createdAt ?? new Date(0);
        const sinceReading = prints.filter((p) => p.startedAt >= since);
        const printedHours = latest
          ? sinceReading.reduce((sum, p) => sum + p.seconds, 0) / 3600
          : outcomes.reduce((sum, total) => sum + (total._sum.seconds ?? 0), 0) / 3600;
        const hours = (latest?.hours ?? 0) + printedHours;

        let perWeek: number | null = null;
        if (oldest) {
          const from = Math.max(oldest.startedAt.getTime(), Date.now() - AVERAGE_OVER_MS);
          const recent = prints.filter((p) => p.startedAt.getTime() >= from);
          const weeks = Math.max(1, (Date.now() - from) / WEEK_MS);
          perWeek = recent.reduce((sum, p) => sum + p.seconds, 0) / 3600 / weeks;
        } else if (latest && printer.readings.length > 1) {
          const first = printer.readings[printer.readings.length - 1];
          const span = latest.createdAt.getTime() - first.createdAt.getTime();
          if (span >= DAY_MS) perWeek = ((latest.hours - first.hours) / span) * WEEK_MS;
        }

        const summary = [
          latest && printedHours > 0 && `+${printedHours.toFixed(1)} h printed since you read it ${relativeTime(latest.createdAt)}`,
          latest && printedHours === 0 && previous && `+${(latest.hours - previous.hours).toFixed(1)} h since ${relativeTime(previous.createdAt)}`,
          !latest && oldest && `Counted from Bambu Lab since ${oldest.startedAt.toLocaleDateString("en", { month: "short", day: "numeric" })}. Log the total from the printer's screen to add the hours before that.`,
          perWeek !== null && `about ${perWeek.toFixed(1)} h a week`,
          !latest && !oldest && "Log the total from the printer's screen to start the meter.",
        ].filter(Boolean);

        return (
          <PrinterPeek key={printer.id} src={PRINTER_PHOTOS[printer.id]} alt={printer.name}>
            <article
              className="rounded-panel border-[3px] border-ink bg-aqua-wash shadow-stamp"
            >
              <div className="flex flex-wrap items-center justify-between gap-[8px] rounded-t-[calc(var(--radius-panel)_-_3px)] border-b-[3px] border-ink px-[22px] py-[11px]">
                <h2 className="m-0 font-display text-[20px] text-ink">{printer.name}</h2>
                <div className="ml-auto max-w-full text-right">
                  <div className="relative flex flex-wrap items-center justify-end gap-[8px]">
                  <PrinterHoursMenu syncAction={link ? bambuSyncAction : undefined}>
                    <form action={logHoursAction} className="flex flex-wrap items-end gap-[10px]">
                      <input type="hidden" name="printerId" value={printer.id} />
                      <label className="min-w-0 flex-[1_1_130px]">
                        <span className="mb-[6px] block font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2">
                          Total hours
                        </span>
                        <Input
                          name="hours"
                          inputMode="decimal"
                          required
                          placeholder={hours ? hours.toFixed(1) : "0"}
                          autoComplete="off"
                        />
                      </label>
                      <Button variant="secondary" type="submit">Log it</Button>
                    </form>
                  </PrinterHoursMenu>
                  {link ? <span className="font-mono text-[12px] text-ink-3">
                    - {link.lastSyncAt
                      ? <SyncAge iso={link.lastSyncAt.toISOString()} initialLabel={relativeTime(link.lastSyncAt)} />
                      : "not synced yet"}
                  </span> : <span className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
                    {latest ? `read ${relativeTime(latest.createdAt)}` : oldest ? "from Bambu Lab" : "no reading yet"}
                  </span>}
                  </div>
                  {link?.lastError && <p role="status" className="mb-0 mt-[6px] text-[12px] font-bold text-cherry-dk">{link.lastError}</p>}
                </div>
              </div>

              <div className="@container p-[22px]">
                <p className={`${label} mb-[8px]`}>Hours</p>
                <Odometer hours={hours} />
                <p className="m-0 mt-[10px] text-[14px] text-ink-2">{summary.join(" · ")}</p>
              </div>

              {prints.length > 0 && (
                <div className="py-[11px]">
                  <p className={`${label} mb-[6px] px-[22px]`}>Prints</p>
                  <PrintList prints={prints.slice(0, RECENT)} />
                  {prints.length > RECENT && (
                    <details className="mt-[4px]">
                      <summary className="cursor-pointer px-[22px] font-mono text-[12px] font-bold text-ink-2">
                        All {prints.length} prints
                      </summary>
                      <PrintList prints={prints.slice(RECENT)} />
                    </details>
                  )}
                </div>
              )}

              {printer.readings.length > 0 && (
                <div className="px-[22px] py-[11px]">
                  <p className={`${label} mb-[6px]`}>Your readings</p>
                  <ol className="m-0 list-none p-0">
                    {printer.readings.slice(0, 5).map((reading) => (
                      <li
                        key={reading.id}
                        className="flex flex-wrap items-baseline gap-x-[12px] py-[3px] font-mono text-[12px] text-ink-2"
                      >
                        <span className="w-[80px] font-bold text-ink">{reading.hours.toFixed(1)} h</span>
                        <span className="text-ink-3">
                          <LocalTime iso={reading.createdAt.toISOString()} format="date" />
                        </span>
                        <form action={removeReadingAction}>
                          <input type="hidden" name="readingId" value={reading.id} />
                          <button
                            type="submit"
                            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] font-bold text-ink-2 underline"
                          >
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          </PrinterPeek>
        );
      })}

      {!link && <BambuConnectPanel pendingEmail={pendingEmail} />}
    </section>
  );
}

/** Only known finished outcomes affect the score; active and unknown jobs do not. */
function PrintScore({ successful, failed }: { successful: number; failed: number }) {
  const attempts = successful + failed;
  const score = attempts > 0 ? (successful / attempts * 100).toFixed(1) + "%" : "—";
  return (
    <section aria-label="Print score" className="rounded-panel border-[3px] border-ink bg-porcelain p-[22px] shadow-stamp">
      <dl className="m-0 grid grid-cols-2 gap-x-[16px] gap-y-[14px] sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <dt className={label}>Print score</dt>
          <dd className="m-0 mt-[4px] flex flex-wrap items-baseline gap-x-[8px]">
            <span className="font-display text-[38px] leading-[1.1] text-ink">{score}</span>
            <span className="text-[12px] text-ink-2">{attempts > 0 ? "success rate" : "No finished prints yet"}</span>
          </dd>
        </div>
        <div>
          <dt className={label}>Successful</dt>
          <dd className="m-0 mt-[5px] font-mono text-[26px] font-bold leading-[1.2] text-ink">{successful.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt className={label}>Failed / cancelled</dt>
          <dd className={"m-0 mt-[5px] font-mono text-[26px] font-bold leading-[1.2] " + (failed > 0 ? "text-cherry-dk" : "text-ink")}>{failed.toLocaleString("en-US")} / {attempts.toLocaleString("en-US")}</dd>
          {attempts > 0 && <dd className="mb-0 ml-0 mt-[4px] text-[12px] text-ink-2">{(failed / attempts * 100).toFixed(1)}% of finished prints</dd>}
        </div>
      </dl>
      <p className="mb-0 mt-[12px] text-[12px] leading-[1.5] text-ink-2">
        All synced Bambu prints across all printers. Failed counts include cancellations; printing and unknown outcomes are excluded.
      </p>
    </section>
  );
}

type Print = { id: string; title: string; startedAt: Date; seconds: number; outcome: string };

function PrintList({ prints }: { prints: Print[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {prints.map((print) => {
        const outcome = ACTIVE_OUTCOMES.includes(print.outcome) ? "printing" : print.outcome;
        return (
          <li
            key={print.id}
            className="grid min-h-[40px] grid-cols-[64px_58px_minmax(0,1fr)] items-center gap-x-[10px] px-[22px] py-[8px] font-mono text-[12px] text-ink-2 odd:bg-porcelain even:bg-cream-2 sm:grid-cols-[92px_64px_58px_minmax(0,1fr)]"
          >
            <span className="hidden text-ink-3 sm:block">
              <LocalTime iso={print.startedAt.toISOString()} format="date" />
            </span>
            <span className="text-ink-3">
              <LocalTime iso={print.startedAt.toISOString()} format="time" />
            </span>
            <span className="text-right font-bold text-ink">
              {outcome === "printing" ? "…" : `${(print.seconds / 3600).toFixed(1)} h`}
            </span>
            <span className="truncate" title={print.title}>
              {print.title}
              {outcome !== "finished" && <span className="text-ink-3"> · {outcome}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Forms to connect the owner's account, shown only while disconnected. */
function BambuConnectPanel({ pendingEmail }: { pendingEmail?: string }) {
  const box = "rounded-panel border-[3px] border-ink bg-cream px-[22px] py-[14px]";
  const heading = "mb-[6px] block font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2";

  if (pendingEmail) {
    return (
      <div className={box}>
        <form action={bambuConnectAction} className="flex flex-wrap items-end gap-[10px]">
          <label className="flex-[0_1_180px]">
            <span className={heading}>Code from Bambu</span>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" />
          </label>
          <Button type="submit">Connect</Button>
        </form>
        <form action={bambuCancelAction} className="mt-[6px]">
          <p className="m-0 text-[13px] text-ink-3">
            Sent to {pendingEmail}.{" "}
            <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 font-bold text-ink-2 underline">
              Use another email
            </button>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className={box}>
      <form action={bambuSendCodeAction} className="flex flex-wrap items-end gap-[10px]">
        <label className="flex-[1_1_240px]">
          <span className={heading}>Connect Bambu Lab</span>
          <Input name="email" type="email" autoComplete="email" required placeholder="The email on your Bambu account" />
        </label>
        <Button variant="secondary" type="submit">
          Email me a code
        </Button>
      </form>
      <p className="m-0 mt-[6px] text-[13px] text-ink-3">
        Pulls every print sent through Bambu Cloud, with when it ran and for how long. Works with Google sign-in; no
        password needed.
      </p>
    </div>
  );
}

/**
 * Five whole-hour wheels and a tenth, like a car's mileage counter. The six
 * wheels share the width of the column they sit in (a container, so `cqw` is
 * that column), less the gaps and the decimal point, up to 56px each: they
 * fill a phone edge to edge and stop growing on a wide screen.
 */
function Odometer({ hours }: { hours: number }) {
  const [whole, tenth] = hours.toFixed(1).split(".");
  const wheels = whole.padStart(5, "0").split("");
  const wheel =
    "flex w-[min(56px,calc((100cqw_-_34px)/6))] items-center justify-center rounded-[6px] border-[3px] border-ink py-[4px] font-mono text-[min(46px,calc((100cqw_-_34px)/6*0.82))] font-bold";
  return (
    <div className="inline-flex items-stretch gap-[3px]" aria-label={`${hours.toFixed(1)} hours`}>
      {wheels.map((digit, i) => (
        <span key={i} aria-hidden className={`${wheel} bg-ink text-cream`}>
          {digit}
        </span>
      ))}
      <span
        aria-hidden
        className="mx-[2px] mb-[10px] h-[10px] w-[10px] self-end rounded-full bg-ink"
      />
      <span aria-hidden className={`${wheel} bg-sun text-ink`}>
        {tenth}
      </span>
    </div>
  );
}
