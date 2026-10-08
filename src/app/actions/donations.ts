"use server";

import { redirect } from "next/navigation";

import { requireAdmin, requireUser } from "@/lib/authz";
import {
  DonationProblem,
  decideDonation,
  pledge as makePledge,
  removeDonation,
  withdrawDonation,
} from "@/lib/donations";

/**
 * The donation-bin forms, as plain server actions.
 *
 * Adapters, like `src/app/actions/features.ts`: the rules live in
 * `src/lib/donations.ts`; this reads a `FormData`, calls the operation, and
 * turns the outcome into a redirect back to the bin with a toast or an error.
 * Everything works with JavaScript off.
 */

function back(params: Record<string, string>): never {
  redirect(`/bin?${new URLSearchParams(params).toString()}`);
}

async function run(op: () => Promise<string>): Promise<never> {
  let toast: string;
  try {
    toast = await op();
  } catch (error) {
    if (error instanceof DonationProblem) back({ error: error.message });
    throw error;
  }
  back({ toast });
}

export async function pledge(formData: FormData): Promise<void> {
  const user = await requireUser();
  await run(async () => {
    const done = await makePledge(user, {
      amount: formData.get("amount") ?? "",
      note: formData.get("note") ?? "",
    });
    if (user.role === "admin") return `${done.amount} is in the bin`;
    return done.claimed
      ? `${done.amount} found on Ko-fi · it is yours, and in the bin`
      : `${done.amount} logged · it counts once it shows up on Ko-fi`;
  });
}

export async function markReceived(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await run(async () => {
    const done = await decideDonation(admin, String(formData.get("id") ?? ""), true);
    return `${done.amount} from ${done.donorName} is in the bin`;
  });
}

export async function markNotReceived(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await run(async () => {
    const done = await decideDonation(admin, String(formData.get("id") ?? ""), false);
    return `${done.amount} from ${done.donorName} marked not found`;
  });
}

export async function removeGift(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await run(async () => {
    const done = await removeDonation(admin, String(formData.get("id") ?? ""));
    return `${done.amount} from ${done.from} taken out of the bin`;
  });
}

export async function withdrawPledge(formData: FormData): Promise<void> {
  const user = await requireUser();
  await run(async () => {
    const done = await withdrawDonation(user, String(formData.get("id") ?? ""));
    return `${done.amount} entry withdrawn`;
  });
}
