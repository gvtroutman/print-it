import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { relativeTime } from "@/lib/catalog";
import { bambuLink, syncIfStale } from "@/lib/bambu";
import { Button, Input } from "@/components/ui";
import { PRINTER_PHOTOS, PrinterPeek } from "@/components/printer-peek";

import {
  bambuCancelAction,
  bambuConnectAction,
  bambuDisconnectAction,
  bambuSendCodeAction,
  bambuSyncAction,
  logHoursAction,
  removeReadingAction,
} from "./actions";
import { LocalTime } from "./local-time";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** The per-week average looks back this far, so a quiet spring doesn't drag down a busy autumn. */
const AVERAGE_OVER_MS = 12 * WEEK_MS;
const RECENT = 6;

const label = "m-0 font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3";

/**
 * The hour meter for each printer, on the owner's home. The owner reads the
 * total hours off the machine and logs them; with Bambu Lab connected, every
 * print synced since that reading is added on top, so the odometer keeps up
 * between readings. Below it: the prints themselves, with when and how long.
 */
export async function PrinterHours() {
  const [printers, totals, link, jar] = await Promise.all([
    db.printer.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        readings: { orderBy: { createdAt: "desc" } },
        prints: { orderBy: { startedAt: "desc" }, take: 300 },
      },
    }),
    // Every synced print, not just the 300 listed, for a meter with no reading under it.
    db.printerPrint.groupBy({ by: ["printerId"], _sum: { seconds: true } }),
    bambuLink(),
    cookies(),
  ]);
  if (printers.length === 0) return null;
  syncIfStale(link);
  const pendingEmail = jar.get("ppp_bambu_email")?.value;

  return (
    <section className="mb-[26.4px] flex flex-col gap-[17.6px]">
      {printers.map((printer) => {
        const [latest, previous] = printer.readings;
        const prints = printer.prints;
        const oldest = prints[prints.length - 1];

        // Prints after the newest reading are not on it yet; with no reading, the history is all there is.
        const since = latest?.createdAt ?? new Date(0);
        const sinceReading = prints.filter((p) => p.startedAt >= since);
        const printedHours = latest
          ? sinceReading.reduce((sum, p) => sum + p.seconds, 0) / 3600
          : (totals.find((t) => t.printerId === printer.id)?._sum.seconds ?? 0) / 3600;
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
              className="overflow-hidden rounded-panel border-[3px] border-ink bg-aqua-wash shadow-stamp"
            >
              <div className="layers flex flex-wrap items-baseline justify-between gap-[8px] border-b-[3px] border-ink px-[22px] py-[11px]">
                <h2 className="m-0 font-display text-[20px] text-ink">{printer.name}</h2>
                <span className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
                  {latest ? `read ${relativeTime(latest.createdAt)}` : oldest ? "from Bambu Lab" : "no reading yet"}
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-[22px] p-[22px]">
                <div className="@container flex-[1_1_260px]">
                  <p className={`${label} mb-[8px]`}>Hours</p>
                  <Odometer hours={hours} />
                  <p className="m-0 mt-[10px] text-[14px] text-ink-2">{summary.join(" · ")}</p>
                </div>

                <form action={logHoursAction} className="flex flex-[1_1_320px] flex-wrap items-end gap-[10px]">
                  <input type="hidden" name="printerId" value={printer.id} />
                  <label className="flex-[0_1_130px]">
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
                  <Button variant="secondary" type="submit">
                    Log it
                  </Button>
                </form>
              </div>

              {prints.length > 0 && (
                <div className="border-t-2 border-dashed border-rule px-[22px] py-[11px]">
                  <p className={`${label} mb-[6px]`}>Prints</p>
                  <PrintList prints={prints.slice(0, RECENT)} />
                  {prints.length > RECENT && (
                    <details className="mt-[4px]">
                      <summary className="cursor-pointer font-mono text-[12px] font-bold text-ink-2">
                        All {prints.length} prints
                      </summary>
                      <PrintList prints={prints.slice(RECENT)} />
                    </details>
                  )}
                </div>
              )}

              {printer.readings.length > 0 && (
                <div className="border-t-2 border-dashed border-rule px-[22px] py-[11px]">
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

      <BambuPanel link={link} pendingEmail={pendingEmail} />
    </section>
  );
}

type Print = { id: string; title: string; startedAt: Date; seconds: number; outcome: string };

function PrintList({ prints }: { prints: Print[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {prints.map((print) => (
        <li
          key={print.id}
          className="grid grid-cols-[92px_64px_58px_minmax(0,1fr)] gap-x-[10px] py-[3px] font-mono text-[12px] text-ink-2"
        >
          <span className="text-ink-3">
            <LocalTime iso={print.startedAt.toISOString()} format="date" />
          </span>
          <span className="text-ink-3">
            <LocalTime iso={print.startedAt.toISOString()} format="time" />
          </span>
          <span className="text-right font-bold text-ink">
            {print.outcome === "printing" ? "…" : `${(print.seconds / 3600).toFixed(1)} h`}
          </span>
          <span className="truncate" title={print.title}>
            {print.title}
            {print.outcome !== "finished" && <span className="text-ink-3"> · {print.outcome}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Connect, sync or let go of the owner's Bambu Lab account. */
function BambuPanel({
  link,
  pendingEmail,
}: {
  link: Awaited<ReturnType<typeof bambuLink>>;
  pendingEmail?: string;
}) {
  const box = "rounded-panel border-[3px] border-ink bg-cream px-[22px] py-[14px]";
  const heading = "mb-[6px] block font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-ink-2";

  if (link) {
    return (
      <div className={`${box} flex flex-wrap items-center justify-between gap-[10px]`}>
        <p className="m-0 text-[14px] text-ink-2">
          Synced from Bambu Lab ({link.email})
          {link.lastSyncAt ? ` · ${relativeTime(link.lastSyncAt)}` : " · not yet"}
          {link.lastError && <span className="block font-bold text-cherry-dk">{link.lastError}</span>}
        </p>
        <div className="flex gap-[8px]">
          <form action={bambuSyncAction}>
            <Button variant="secondary" type="submit">
              Sync now
            </Button>
          </form>
          <form action={bambuDisconnectAction}>
            <Button variant="ghost" type="submit">
              Disconnect
            </Button>
          </form>
        </div>
      </div>
    );
  }

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
 * Five whole-hour flaps and a tenth, like a split-flap board; the tenth's flap
 * carries its own decimal point and is 12px wider to fit it. The flaps share
 * the width of the column they sit in (a container, so `cqw` is that column),
 * less the gaps and that extra 12px, up to 56px each: they fill a phone edge
 * to edge and stop growing on a wide screen.
 */
function Odometer({ hours }: { hours: number }) {
  const [whole, tenth] = hours.toFixed(1).split(".");
  const wheels = whole.padStart(5, "0").split("");
  return (
    <div className="inline-flex items-stretch gap-[3px]" aria-label={`${hours.toFixed(1)} hours`}>
      {wheels.map((digit, i) => (
        <Flap key={i} digit={digit} className="w-[min(56px,calc((100cqw_-_34px)/6))] bg-ink text-cream" />
      ))}
      <Flap
        digit={`.${tenth}`}
        className="w-[min(68px,calc((100cqw_-_34px)/6_+_12px))] bg-sun tracking-[-0.12em] text-ink"
      />
    </div>
  );
}

/** One split-flap card: a lighter top half, the seam through the digit, a hinge pin at each end. */
function Flap({ digit, className }: { digit: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`relative flex items-center justify-center overflow-hidden rounded-[6px] border-[3px] border-ink py-[4px] font-mono text-[min(46px,calc((100cqw_-_34px)/6*0.82))] font-bold ${className}`}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
      <span className="relative">{digit}</span>
      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-ink" />
      <span className="absolute left-0 top-1/2 h-[6px] w-[3px] -translate-y-1/2 rounded-r-[1px] bg-ink-3" />
      <span className="absolute right-0 top-1/2 h-[6px] w-[3px] -translate-y-1/2 rounded-l-[1px] bg-ink-3" />
    </span>
  );
}
