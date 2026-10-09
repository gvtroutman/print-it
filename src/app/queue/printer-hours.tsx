import { db } from "@/lib/db";
import { relativeTime } from "@/lib/catalog";
import { Button, Input } from "@/components/ui";

import { logHoursAction } from "./actions";

const WEEK_MS = 7 * 86_400_000;

/**
 * The hour meter for each printer, on the owner's home. The owner reads the
 * total hours off the machine and logs them; the card shows the newest
 * reading as an odometer, what it gained since the one before, and how many
 * hours a week it runs on average.
 */
export async function PrinterHours() {
  const printers = await db.printer.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { readings: { orderBy: { createdAt: "desc" } } },
  });
  if (printers.length === 0) return null;

  return (
    <section className="mb-[26.4px] flex flex-col gap-[17.6px]">
      {printers.map((printer) => {
        const [latest, previous] = printer.readings;
        const first = printer.readings[printer.readings.length - 1];
        const span = latest && first ? latest.createdAt.getTime() - first.createdAt.getTime() : 0;
        const perWeek = latest && first && span >= 86_400_000 ? ((latest.hours - first.hours) / span) * WEEK_MS : null;

        return (
          <article
            key={printer.id}
            className="overflow-hidden rounded-panel border-[3px] border-ink bg-aqua-wash shadow-stamp"
          >
            <div className="layers flex flex-wrap items-baseline justify-between gap-[8px] border-b-[3px] border-ink px-[22px] py-[11px]">
              <h2 className="m-0 font-display text-[20px] text-ink">{printer.name}</h2>
              <span className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
                {latest ? `read ${relativeTime(latest.createdAt)}` : "no reading yet"}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-[22px] p-[22px]">
              <div className="flex-[1_1_260px]">
                <p className="m-0 mb-[8px] font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
                  Hours on the clock
                </p>
                <Odometer hours={latest?.hours ?? 0} />
                <p className="m-0 mt-[10px] text-[14px] text-ink-2">
                  {[
                    latest && previous && `+${(latest.hours - previous.hours).toFixed(1)} h since ${relativeTime(previous.createdAt)}`,
                    perWeek !== null && `about ${perWeek.toFixed(1)} h a week`,
                    !latest && "Log the total from the printer's screen to start the meter.",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
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
                    placeholder={latest ? String(latest.hours) : "0"}
                    autoComplete="off"
                  />
                </label>
                <Button variant="secondary" type="submit">
                  Log it
                </Button>
              </form>
            </div>

            {printer.readings.length > 1 && (
              <ol className="m-0 list-none border-t-2 border-dashed border-rule p-0 px-[22px] py-[11px]">
                {printer.readings.slice(0, 5).map((reading) => (
                  <li
                    key={reading.id}
                    className="flex flex-wrap gap-x-[12px] py-[3px] font-mono text-[12px] text-ink-2"
                  >
                    <span className="w-[80px] font-bold text-ink">{reading.hours.toFixed(1)} h</span>
                    <span className="text-ink-3">
                      {reading.createdAt.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                    </span>                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </section>
  );
}

/** Five whole-hour wheels and a tenth, like a car's mileage counter. */
function Odometer({ hours }: { hours: number }) {
  const [whole, tenth] = hours.toFixed(1).split(".");
  const wheels = whole.padStart(5, "0").split("");
  return (
    <div className="inline-flex items-stretch gap-[3px]" aria-label={`${hours.toFixed(1)} hours`}>
      {wheels.map((digit, i) => (
        <span
          key={i}
          aria-hidden
          className="flex w-[34px] items-center justify-center rounded-[6px] border-[3px] border-ink bg-ink py-[4px] font-mono text-[28px] font-bold text-cream"
        >
          {digit}
        </span>
      ))}
      <span
        aria-hidden
        className="ml-[2px] flex w-[34px] items-center justify-center rounded-[6px] border-[3px] border-ink bg-sun py-[4px] font-mono text-[28px] font-bold text-ink"
      >
        {tenth}
      </span>
      <span aria-hidden className="ml-[8px] self-end font-display text-[20px] text-ink">
        h
      </span>
    </div>
  );
}
