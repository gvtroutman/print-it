import { requireUser, printerName } from "@/lib/authz";
import { relativeTime } from "@/lib/catalog";
import {
  allDonations,
  binTotals,
  currentBin,
  formatCents,
} from "@/lib/donations";
import { kofiConnected } from "@/lib/kofi";
import {
  markNotReceived,
  markReceived,
  pledge,
  removeGift,
} from "@/app/actions/donations";
import { AppHeader } from "@/components/app-header";
import { Button, Input, Kicker, Label, Notice } from "@/components/ui";
import { Toast } from "@/components/toast";
import { PRINTER_PHOTOS, PrinterPeek } from "@/components/printer-peek";
import { PrinterComparison } from "@/components/printer-comparison";
import { CommunityBenefits } from "@/components/community-benefits";
import { hasStoreAccess } from "@/lib/store-access";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * The donation bin.
 *
 * Everyone signed in sees the goal and how full the bin is. The money itself
 * goes through Ko-fi, and with the webhook switched on it arrives here by
 * itself. The owner can log a gift the webhook missed and manage the ledger.
 * Members see the totals; donation confirmation for Store is managed by the
 * owner from the guest list.
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
  const [owner, bin, storeAccess] = await Promise.all([printerName(), currentBin(), hasStoreAccess(user)]);
  const isAdmin = user.role === "admin";
  const connected = kofiConnected();

  if (!bin) {
    return (
      <>
        <AppHeader user={user} active="/bin" />
        <main className="mx-auto w-full max-w-[780px] px-[16px] pb-[80px] pt-[35.2px] sm:px-[26.4px]">
          <Kicker>Donate</Kicker>
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

  const [totals, everyone] = await Promise.all([
    binTotals(bin.id),
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
        <PrinterPeek src={PRINTER_PHOTOS[bin.id]} alt={bin.title}>
          <section className="overflow-hidden rounded-panel border-[3px] border-ink bg-cream-2 shadow-stamp-lg">
            <div className="p-[17.6px] sm:p-[26.4px]">
              <div className="mb-[17.6px] flex flex-col gap-[17.6px] sm:flex-row sm:items-start sm:justify-between">
                <h1 className="m-0 min-w-0 text-[30px] leading-[1] text-ink sm:flex-1 sm:text-[40px]">
                  {bin.title}
                  {bin.url && (
                    <a
                      href={bin.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`View ${bin.title} in the shop (opens in a new tab)`}
                      title="View in the shop"
                      className="ml-[8px] inline-flex h-[36px] w-[36px] items-center justify-center rounded-chip align-middle text-ink-2 transition-colors hover:bg-cream-3 hover:text-cherry-dk sm:h-[40px] sm:w-[40px]"
                    >
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        viewBox="0 0 24 24"
                        className="h-[24px] w-[24px] sm:h-[28px] sm:w-[28px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </a>
                  )}
                </h1>
                {(!full || !storeAccess) && bin.payUrl && (
                  <a
                    href={bin.payUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="stamp shrink-0 self-center cursor-pointer whitespace-nowrap rounded-chip border-[3px] border-ink bg-cherry-dk px-[28px] py-[14px] font-display text-[18px] text-cream hover:bg-cherry sm:self-start"
                  >
                    Give on Ko-fi ↗
                  </a>
                )}
              </div>
              <div>
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

              {full && (
                <p className="m-0 mt-[13.2px] max-w-[620px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
                  The bin is full — thank you. {owner} can order it.
                </p>
              )}
            </div>
          </section>
        </PrinterPeek>

        {bin.id === "h2d-laser-40w" && <CommunityBenefits />}

        {bin.id === "h2d-laser-40w" && <PrinterComparison />}

        {error && (
          <div className="mt-[22px]">
            <Notice tone="warn">{error}</Notice>
          </div>
        )}

        {isAdmin && !full && (
          <form
            action={pledge}
            className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[17.6px] shadow-stamp sm:p-[22px]"
          >
            <h2 className="m-0 mb-[4px] font-display text-[22px] text-ink">
              {connected ? "Log a gift Ko-fi did not send" : "Log a Ko-fi gift"}
            </h2>
            <p className="m-0 mb-[17.6px] text-[14.5px] text-ink-2">
              {connected
                ? "Ko-fi gifts arrive on their own. This is for one that did not. It goes straight in the bin."
                : "For money that came in on Ko-fi. It goes straight in the bin."}
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
                  Who it was from
                </Label>
                <Input
                  id="note"
                  name="note"
                  required
                  maxLength={280}
                  placeholder="Sam, via Ko-fi"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-[17.6px]">
              <Button type="submit">Add it to the bin</Button>
            </div>
          </form>
        )}

        {isAdmin && (
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

            <p className="mt-[17.6px] text-[14.5px] text-ink-2">
              To confirm a member has donated and unlock their Store access, tick{" "}
              <strong>Donated</strong> on <Link href="/admin/invites" className="font-bold underline underline-offset-2">the guest list</Link>.
            </p>

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
        )}
      </main>

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
