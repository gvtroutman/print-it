import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { record } from "@/lib/audit";
import { notify, printerName, printerOwner } from "@/lib/authz";
import type { Actor } from "@/lib/scope";
import { MIN_DONATION_CENTS, MIN_DONATION_LABEL } from "@/lib/donation-policy";

/**
 * The donation bin: the group chipping in for a machine.
 *
 * The money goes through the owner's Ko-fi page, outside the app, so nothing
 * here touches a card. Two ways a gift gets in, both landing in one table:
 *
 *   - Ko-fi's webhook (`receiveKofiGift`, behind /api/kofi). Received the
 *     moment it is paid. It belongs to a member when the Ko-fi email is
 *     theirs, or when it matches a legacy entry; otherwise it is recorded
 *     under the name it was given with.
 *   - The owner logs a gift the webhook missed. Received from the start, and
 *     recorded under the giver's name, like a webhook gift.
 *
 * Only received money counts toward the goal, so the bar never claims money
 * nobody has seen.
 *
 * Who gave what is the owner's business alone. Members see the totals;
 * the owner confirms Store access with the guest list's donation checkbox.
 *
 * Same shape as `features.ts`: a refusal leaves as a `DonationProblem` with a
 * sentence for a person, and the server action turns it into a toast.
 */

export class DonationProblem extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "DonationProblem";
  }
}

const problem = (status: number, message: string) => new DonationProblem(status, message);

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$3,499" for whole dollars, "$12.50" otherwise. */
export function formatCents(cents: number): string {
  return cents % 100 === 0 ? wholeMoney.format(cents / 100) : money.format(cents / 100);
}

function refresh() {
  revalidatePath("/bin");
  revalidatePath("/upload");
  revalidatePath("/story", "layout");
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The bin people are filling right now: the oldest one still open. */
export async function currentBin() {
  return db.donationBin.findFirst({
    where: { closedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Totals for a bin — safe to show anyone signed in, because they carry no
 * names. `received` counts toward the goal; `pledged` is promised and not yet
 * in hand.
 */
export async function binTotals(binId: string) {
  const groups = await db.donation.groupBy({
    by: ["status"],
    where: { binId, status: { in: ["Pledged", "Received"] } },
    _sum: { amountCents: true },
  });
  const sum = (status: "Pledged" | "Received") =>
    groups.find((g) => g.status === status)?._sum.amountCents ?? 0;

  // A member counts once however often they gave; an unclaimed gift counts by
  // the name it came with.
  const gifts = await db.donation.findMany({
    where: { binId, status: "Received" },
    select: { donorId: true, note: true },
  });
  const donors = new Set(gifts.map((g) => g.donorId ?? `name:${g.note.trim().toLowerCase()}`));

  return { received: sum("Received"), pledged: sum("Pledged"), donors: donors.size };
}

/** Every pledge in the bin, with who made it. The caller checks for admin. */
export function allDonations(binId: string) {
  return db.donation.findMany({
    where: { binId },
    orderBy: { createdAt: "desc" },
    include: { donor: { select: { name: true, initials: true } } },
  });
}

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

/** "50", "50.5", "$1,200.00" → cents. Anything else is refused. */
const AmountSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/^\$/, "").replace(/,/g, ""))
  .refine((raw) => /^\d{1,7}(\.\d{1,2})?$/.test(raw), "Enter an amount in dollars, like 50 or 12.50.")
  .transform((raw) => Math.round(Number(raw) * 100))
  .refine((cents) => cents >= MIN_DONATION_CENTS, `The smallest amount is ${MIN_DONATION_LABEL}.`);

const PledgeSchema = z.object({
  amount: AmountSchema,
  note: z.string().trim().max(280, "Keep the note under 280 characters.").default(""),
});

export async function pledge(actor: Actor, input: unknown) {
  if (actor.role !== "admin") throw problem(403, "Only the admin can log donations.");
  const parsed = PledgeSchema.safeParse(input);
  if (!parsed.success) {
    throw problem(400, parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const { amount, note } = parsed.data;

  const bin = await currentBin();
  if (!bin) throw problem(404, "The donation bin is closed.");
  // A typo guard rather than a policy: nobody means to pledge more than the
  // whole machine costs.
  if (amount > bin.goalCents) {
    throw problem(400, `That is more than the whole thing costs (${formatCents(bin.goalCents)}).`);
  }

  // The owner logs received money; Store confirmation is a separate setting.
  if (!note) throw problem(400, "Say who it was from.");
  const donation = await db.donation.create({
    data: {
      binId: bin.id,
      donorId: null,
      amountCents: amount,
      note,
      status: "Received",
      decidedAt: new Date(),
    },
  });
  await record({
    action: "donation.received",
    actor,
    subject: bin.title,
    detail: { donationId: donation.id, amountCents: amount, from: note },
  });
  refresh();
  return { amount: formatCents(amount) };
}

/**
 * The owner says the money arrived, or that it never will.
 *
 * Only a pledge still waiting can be decided, and the check is part of the
 * update so two clicks cannot both land.
 */
export async function decideDonation(admin: Actor, id: string, received: boolean) {
  const changed = await db.donation.updateMany({
    where: { id, status: "Pledged" },
    data: { status: received ? "Received" : "Declined", decidedAt: new Date() },
  });
  if (changed.count === 0) throw problem(409, "That pledge has already been dealt with.");

  const donation = await db.donation.findUniqueOrThrow({
    where: { id },
    include: { bin: { select: { title: true } }, donor: { select: { id: true, name: true } } },
  });
  const amount = formatCents(donation.amountCents);
  // Only a member's own entry is ever left waiting, so there is a donor; the
  // fallback is for the type, not for a case that happens.
  const donor = donation.donor ?? { id: admin.id, name: donation.note || "somebody" };

  if (donor.id !== admin.id) {
    await notify({
      recipientId: donor.id,
      text: received
        ? `${admin.name} got your ${amount} for the ${donation.bin.title}. Thank you!`
        : `${admin.name} could not find your ${amount} on Ko-fi. Ask them if that is a mistake.`,
    });
  }

  await record({
    action: received ? "donation.received" : "donation.declined",
    actor: admin,
    subject: donation.bin.title,
    detail: { donationId: id, amountCents: donation.amountCents, donor: donor.name },
  });

  refresh();
  return { amount, donorName: donor.name.split(" ")[0] ?? donor.name };
}

/**
 * The owner takes a received gift back out of the total: Ko-fi's test
 * payment, a refund, a gift logged twice. Kept in the ledger as not counted
 * rather than deleted, so the record of it stays.
 */
export async function removeDonation(admin: Actor, id: string) {
  const changed = await db.donation.updateMany({
    where: { id, status: "Received" },
    data: { status: "Declined", decidedAt: new Date() },
  });
  if (changed.count === 0) throw problem(409, "That gift is not in the bin any more.");

  const donation = await db.donation.findUniqueOrThrow({
    where: { id },
    include: { bin: { select: { title: true } }, donor: { select: { id: true, name: true } } },
  });
  const amount = formatCents(donation.amountCents);
  const from = donation.donor?.name ?? (donation.note || "somebody");

  if (donation.donor && donation.donor.id !== admin.id) {
    await notify({
      recipientId: donation.donor.id,
      text: `${admin.name} took your ${amount} out of the bin for the ${donation.bin.title}. Ask them if that is a mistake.`,
    });
  }

  await record({
    action: "donation.removed",
    actor: admin,
    subject: donation.bin.title,
    detail: {
      donationId: id,
      amountCents: donation.amountCents,
      from,
      kofiTransactionId: donation.kofiTransactionId,
    },
  });

  refresh();
  return { amount, from: from.split(" ")[0] ?? from };
}

// ---------------------------------------------------------------------------
// Ko-fi
// ---------------------------------------------------------------------------

/** A payment as Ko-fi reported it, already checked by `src/lib/kofi.ts`. */
export type KofiGift = {
  transactionId: string;
  amountCents: number;
  currency: string;
  fromName: string;
  email: string;
};

export type KofiOutcome = "duplicate" | "matched" | "added" | "no-bin" | "wrong-currency";

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * Put a Ko-fi payment in the bin.
 *
 * Safe to call again with the same payment: Ko-fi retries a delivery it did
 * not see answered, and the transaction id is unique, so the second call finds
 * the first and stops.
 *
 * Who it belongs to, in order: a member's waiting entry for the same amount,
 * logged from the account with this email or under this Ko-fi name, is the
 * same gift and is marked received; failing that, the member whose email is
 * the Ko-fi email gets a new received entry; failing that, it goes in
 * under the name it came with. Store access is confirmed separately by the
 * owner using the guest list's donation checkbox.
 */
export async function receiveKofiGift(gift: KofiGift): Promise<KofiOutcome> {
  const seen = await db.donation.findUnique({
    where: { kofiTransactionId: gift.transactionId },
    select: { id: true },
  });
  if (seen) return "duplicate";

  const [bin, owner] = await Promise.all([currentBin(), printerOwner()]);
  const from = gift.fromName || "Someone";

  // Not dropped silently: the owner hears about it and can log it by hand.
  if (!bin || gift.currency.toUpperCase() !== "USD") {
    const sum = `${(gift.amountCents / 100).toFixed(2)} ${gift.currency}`;
    if (owner) {
      await notify({
        recipientId: owner.id,
        text: !bin
          ? `Ko-fi: ${sum} from ${from}, but no donation bin is open.`
          : `Ko-fi: ${sum} from ${from} is not in dollars, so it was not added. Log it by hand.`,
      });
    }
    return !bin ? "no-bin" : "wrong-currency";
  }

  const amount = formatCents(gift.amountCents);
  const member = gift.email
    ? await db.user.findFirst({
        where: { email: { equals: gift.email, mode: "insensitive" } },
        select: { id: true, name: true },
      })
    : null;

  const sameGiver = [
    ...(member ? [{ donorId: member.id }] : []),
    ...(gift.fromName ? [{ note: { equals: gift.fromName, mode: "insensitive" as const } }] : []),
  ];
  const waiting =
    sameGiver.length > 0
      ? await db.donation.findFirst({
          where: { binId: bin.id, status: "Pledged", amountCents: gift.amountCents, OR: sameGiver },
          orderBy: { createdAt: "asc" },
          include: { donor: { select: { id: true, name: true } } },
        })
      : null;

  let outcome: KofiOutcome;
  let donationId: string;
  let donor: { id: string; name: string } | null;
  try {
    if (waiting) {
      const changed = await db.donation.updateMany({
        where: { id: waiting.id, status: "Pledged" },
        data: { status: "Received", decidedAt: new Date(), kofiTransactionId: gift.transactionId },
      });
      // The owner or the giver acted on it in the same instant. Start over
      // against what is there now.
      if (changed.count === 0) return receiveKofiGift(gift);
      outcome = "matched";
      donationId = waiting.id;
      donor = waiting.donor;
    } else {
      const created = await db.donation.create({
        data: {
          binId: bin.id,
          donorId: member?.id ?? null,
          amountCents: gift.amountCents,
          note: gift.fromName.slice(0, 280),
          status: "Received",
          decidedAt: new Date(),
          kofiTransactionId: gift.transactionId,
        },
      });
      outcome = "added";
      donationId = created.id;
      donor = member;
    }
  } catch (error) {
    // Two deliveries of one payment racing each other: the other one won.
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }

  if (donor && donor.id !== owner?.id) {
    await notify({
      recipientId: donor.id,
      text: `Your ${amount} came in on Ko-fi and is in the bin for the ${bin.title}. Thank you!`,
    });
  }
  if (owner) {
    await notify({
      recipientId: owner.id,
      text: donor
        ? `Ko-fi: ${amount} from ${donor.name} is in the bin.`
        : `Ko-fi: ${amount} from ${from} is in the bin. Confirm the member's donation on the guest list.`,
    });
  }

  await record({
    action: "donation.kofi_received",
    subject: bin.title,
    detail: {
      donationId,
      amountCents: gift.amountCents,
      kofiTransactionId: gift.transactionId,
      outcome,
      donor: donor?.name ?? null,
    },
  });

  refresh();
  return outcome;
}
