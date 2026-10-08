import { requireUser, printerName } from "@/lib/authz";
import { relativeTime } from "@/lib/catalog";
import {
  allDonations,
  binTotals,
  currentBin,
  formatCents,
  myDonations,
} from "@/lib/donations";
import { kofiConnected } from "@/lib/kofi";
import {
  markNotReceived,
  markReceived,
  pledge,
  removeGift,
  withdrawPledge,
} from "@/app/actions/donations";
import { AppHeader } from "@/components/app-header";
import { Button, Input, Kicker, Label, Notice } from "@/components/ui";
import { Toast } from "@/components/toast";

export const dynamic = "force-dynamic";

/**
 * The donation bin.
 *
 * Everyone signed in sees the goal and how full the bin is. The money itself
 * goes through Ko-fi, and with the webhook switched on it arrives here by
 * itself; the form is for claiming a gift made under another email, or for
 * logging one by hand when the webhook is off. A member sees their own
 * entries; the printer owner sees everybody's, and confirms what the webhook
 * did not. Totals carry no names, so showing them to all is safe; the
 * per-person list is queried only for the owner.
 */
const STATUS: Record<string, { chip: string; label: string }> = {
  Pledged: { chip: "bg-sun", label: "Waiting" },
  Received: { chip: "bg-mint", label: "Received" },
  // Never arrived, or taken back out by the owner. Either way, not in the total.
  Declined: { chip: "bg-cream-3 text-ink-2", label: "Not counted" },
};

function Chip({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.Pledged!;
  return (
    <span
      className={`inline-block flex-none rounded-chip border-2 border-ink px-[11px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink ${s.chip}`}
    >
      {s.label}
    </span>
  );
}

const smallButton =
  "stamp cursor-pointer rounded-chip border-[3px] border-ink px-[15px] py-[6px] font-mono text-[11.5px] font-bold uppercase";

export default async function DonationBinPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string; error?: string }>;
}) {
  const [{ toast, error }, user] = await Promise.all([searchParams, requireUser("/bin")]);
  const [owner, bin] = await Promise.all([printerName(), currentBin()]);
  const isAdmin = user.role === "admin";
  const connected = kofiConnected();

  if (!bin) {
    return (
      <>
        <AppHeader user={user} active="/bin" />
        <main className="mx-auto w-full max-w-[780px] px-[16px] pb-[80px] pt-[35.2px] sm:px-[26.4px]">
          <Kicker>Donation bin</Kicker>
          <h1 className="m-0 mt-[6px] font-display text-[30px] leading-[1.05] text-ink">
            Nothing to chip in for
          </h1>
          <p className="m-0 mt-[8px] text-[15px] text-ink-2">
            The bin is closed. {owner} will open a new one when there is something to save up for.
          </p>
        </main>
      </>
    );
  }

  const [totals, mine, everyone] = await Promise.all([
    binTotals(bin.id),
    myDonations(user, bin.id),
    isAdmin ? allDonations(bin.id) : Promise.resolve([]),
  ]);

  const percent = Math.min(100, Math.floor((totals.received / bin.goalCents) * 100));
  const pledgedPercent = Math.min(
    100 - percent,
    Math.floor((totals.pledged / bin.goalCents) * 100),
  );
  const left = Math.max(0, bin.goalCents - totals.received);
  const full = left === 0;

  const waiting = everyone.filter((d) => d.status === "Pledged");
  const decided = everyone.filter((d) => d.status !== "Pledged");

  return (
    <>
      <AppHeader user={user} active="/bin" />

      <main className="mx-auto w-full max-w-[880px] px-[16px] pb-[80px] pt-[26.4px] sm:px-[26.4px] sm:pt-[35.2px]">
        {/* The jar. */}
        <section className="overflow-hidden rounded-panel border-[3px] border-ink bg-cream-2 shadow-stamp-lg">
          <div className="p-[17.6px] sm:p-[26.4px]">
            <Kicker>Donation bin · chipping in together</Kicker>
            <h1 className="m-0 mb-[11px] text-[30px] leading-[1] text-ink sm:text-[40px]">
              {bin.title}
            </h1>
            <p className="m-0 max-w-[620px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
              {full
                ? `The bin is full — thank you. ${owner} can order it.`
                : connected
                  ? "Saving up for it together. Give on Ko-fi and it lands in the bin by itself."
                  : `Saving up for it together. Give on Ko-fi, then log it here so ${owner} can match it up — it counts once they see it come in.`}
              {bin.url && (
                <>
                  {" "}
                  <a
                    href={bin.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-bold text-ink underline underline-offset-2 hover:text-cherry-dk"
                  >
                    See it in the shop ↗
                  </a>
                </>
              )}
            </p>

            <div className="mt-[22px]">
              <div className="mb-[8px] flex flex-wrap items-baseline justify-between gap-[8px]">
                <span className="font-display text-[28px] leading-none text-ink sm:text-[34px]">
                  {formatCents(totals.received)}
                  <span className="ml-[8px] font-mono text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">
                    of {formatCents(bin.goalCents)}
                  </span>
                </span>
                <span className="font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2">
                  {full ? "Goal reached" : `${formatCents(left)} to go`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Money received toward the goal"
                aria-valuemin={0}
                aria-valuemax={bin.goalCents / 100}
                aria-valuenow={totals.received / 100}
                aria-valuetext={`${formatCents(totals.received)} of ${formatCents(bin.goalCents)}`}
                className="flex h-[30px] overflow-hidden rounded-chip border-[3px] border-ink bg-porcelain"
              >
                <div className="h-full bg-mint" style={{ width: `${percent}%` }} />
                {/* Promised but not yet in hand: drawn, but hatched apart from
                    the money that is really there. */}
                <div
                  className="h-full bg-sun-wash bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-sun)_6px_9px)]"
                  style={{ width: `${pledgedPercent}%` }}
                />
              </div>
              <p className="m-0 mt-[8px] font-mono text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
                {percent}% received · {totals.donors}{" "}
                {totals.donors === 1 ? "person has" : "people have"} chipped in
                {totals.pledged > 0 && ` · ${formatCents(totals.pledged)} waiting to be matched`}
              </p>
            </div>

            {!full && bin.payUrl && (
              <a
                href={bin.payUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="stamp mt-[22px] inline-block cursor-pointer rounded-chip border-[3px] border-ink bg-cherry-dk px-[28px] py-[14px] font-display text-[18px] text-cream hover:bg-cherry"
              >
                Give on Ko-fi ↗
              </a>
            )}
          </div>
        </section>

        {error && (
          <div className="mt-[22px]">
            <Notice tone="warn">{error}</Notice>
          </div>
        )}

        {!full && (
          <form
            action={pledge}
            className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[17.6px] shadow-stamp sm:p-[22px]"
          >
            <h2 className="m-0 mb-[4px] font-display text-[22px] text-ink">
              {isAdmin
                ? connected
                  ? "Log a gift Ko-fi did not send"
                  : "Log a Ko-fi gift"
                : connected
                  ? "Gave under another email? Claim it"
                  : "Gave on Ko-fi? Log it"}
            </h2>
            <p className="m-0 mb-[17.6px] text-[14.5px] text-ink-2">
              {isAdmin
                ? connected
                  ? "Ko-fi gifts arrive on their own. This is for one that did not. It goes straight in the bin."
                  : "For money that came in on Ko-fi from somebody who has not logged it here. It goes straight in the bin."
                : connected
                  ? "Nothing is charged here. A gift from the email you use here is yours by itself. Gave under another one? Say how much and the name you gave it under, and it becomes yours."
                  : `Nothing is charged here. Say what you gave and the name you gave it under, and ${owner} marks it received once it shows up on Ko-fi.`}
            </p>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[17.6px]">
              <div>
                <Label htmlFor="amount">Amount (USD)</Label>
                <Input
                  id="amount"
                  name="amount"
                  required
                  inputMode="decimal"
                  pattern="\$?[0-9,]+(\.[0-9]{1,2})?"
                  placeholder="50"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="note">
                  {isAdmin ? "Who it was from" : connected ? "Name on Ko-fi" : "Name on Ko-fi (optional)"}
                </Label>
                <Input
                  id="note"
                  name="note"
                  required={isAdmin || connected}
                  maxLength={280}
                  placeholder={isAdmin ? "Sam, via Ko-fi" : "Ayla B."}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-[17.6px]">
              <Button type="submit">{isAdmin ? "Add it to the bin" : connected ? "Claim it" : "Log it"}</Button>
            </div>
          </form>
        )}

        {isAdmin ? (
          <>
            <div className="mt-[26.4px]">
              {connected ? (
                <Notice tone="good">
                  The Ko-fi webhook is on: gifts land here as they are paid, on the member whose
                  email or Ko-fi name they match.
                </Notice>
              ) : (
                <Notice tone="info">
                  The Ko-fi webhook is off, so gifts only count once you confirm them here. To
                  switch it on, set <code>KOFI_VERIFICATION_TOKEN</code> and point Ko-fi at{" "}
                  <code>/api/kofi</code> on this site.
                </Notice>
              )}
            </div>

            <h2 className="mb-[13.2px] mt-[35.2px] font-display text-[26px] text-ink">
              Waiting on you
            </h2>
            <div className="rounded-panel border-[3px] border-ink bg-porcelain px-[17.6px] pb-[8.8px] pt-[4.4px] shadow-stamp sm:px-[22px]">
              {waiting.length === 0 && (
                <p className="py-[17.6px] font-mono text-[12px] uppercase text-ink-3">
                  Nothing waiting. Every logged gift has been matched.
                </p>
              )}
              {waiting.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center gap-[13.2px] border-b-2 border-dashed border-rule py-[15px] last:border-b-0"
                >
                  <div className="min-w-[180px] flex-[1_1_240px]">
                    <div className="font-display text-[17px] text-ink">
                      {d.donor?.name ?? d.note} · {formatCents(d.amountCents)}
                    </div>
                    <div className="mt-[2px] text-[13px] text-ink-3">
                      {d.note ? <>as “{d.note}” · </> : "no Ko-fi name given · "}
                      {relativeTime(d.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-[8.8px]">
                    <form action={markReceived}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className={`${smallButton} bg-mint text-ink hover:bg-mint-wash`}>
                        Found it
                      </button>
                    </form>
                    <form action={markNotReceived}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className={`${smallButton} bg-cherry-wash text-cherry-dk hover:bg-cherry hover:text-cream`}
                      >
                        Not on Ko-fi
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            {decided.length > 0 && (
              <>
                <h2 className="mb-[13.2px] mt-[35.2px] font-display text-[22px] text-ink">
                  The ledger
                </h2>
                <div className="rounded-panel border-[3px] border-ink bg-porcelain px-[17.6px] pb-[8.8px] pt-[4.4px] shadow-stamp sm:px-[22px]">
                  {decided.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center gap-[13.2px] border-b-2 border-dashed border-rule py-[13.2px] last:border-b-0"
                    >
                      <div className="min-w-[180px] flex-[1_1_240px]">
                        <div className="text-[15px] font-bold text-ink">
                          {d.donor?.name ?? "Unclaimed"} · {formatCents(d.amountCents)}
                        </div>
                        <div className="mt-[2px] text-[13px] text-ink-3">
                          {d.note && <>“{d.note}” · </>}
                          {d.kofiTransactionId ? "from Ko-fi · " : ""}
                          {relativeTime(d.decidedAt ?? d.createdAt)}
                        </div>
                      </div>
                      <Chip status={d.status} />
                      {d.status === "Received" && (
                        <form action={removeGift}>
                          <input type="hidden" name="id" value={d.id} />
                          <button
                            type="submit"
                            className={`${smallButton} bg-cherry-wash text-cherry-dk hover:bg-cherry hover:text-cream`}
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          mine.length > 0 && (
            <>
              <h2 className="mb-[13.2px] mt-[35.2px] font-display text-[26px] text-ink">
                What you have put in
              </h2>
              <div className="rounded-panel border-[3px] border-ink bg-porcelain px-[17.6px] pb-[8.8px] pt-[4.4px] shadow-stamp sm:px-[22px]">
                {mine.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-[13.2px] border-b-2 border-dashed border-rule py-[15px] last:border-b-0"
                  >
                    <div className="min-w-[160px] flex-[1_1_220px]">
                      <div className="font-display text-[17px] text-ink">
                        {formatCents(d.amountCents)}
                      </div>
                      <div className="mt-[2px] text-[13px] text-ink-3">
                        {d.note && <>as “{d.note}” · </>}
                        {relativeTime(d.createdAt)}
                      </div>
                    </div>
                    <Chip status={d.status} />
                    {d.status === "Pledged" && (
                      <form action={withdrawPledge}>
                        <input type="hidden" name="id" value={d.id} />
                        <button
                          type="submit"
                          className={`${smallButton} bg-cherry-wash text-cherry-dk hover:bg-cherry hover:text-cream`}
                        >
                          Withdraw
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </main>

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
