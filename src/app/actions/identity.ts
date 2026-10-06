"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { record } from "@/lib/audit";
import { printerOwner } from "@/lib/authz";
import { clientIpFrom, ipSource } from "@/lib/client-ip";
import { forgetWho, lockOwner, rememberWho, unlockOwner } from "@/lib/identity";
import { NAME_MAX } from "@/lib/identity-rules";
import { adminPassword, isAdminPassword } from "@/lib/identity-token";
import { safeRedirect } from "@/lib/safe-redirect";
import { initialsFor } from "@/lib/tokens";

/**
 * Saying who you are, and unlocking the owner pages.
 *
 * Plain form actions that finish in a redirect, so `/hello` and `/owner` work
 * without any client-side JavaScript. Problems come back as `?error=` on the
 * same page.
 */

function back(page: string, next: string, error: string): never {
  redirect(`${page}?error=${error}&next=${encodeURIComponent(next)}`);
}

/** Pick an existing name from the list on `/hello`. */
export async function pickName(formData: FormData): Promise<void> {
  const next = safeRedirect(formData.get("next"));
  const id = String(formData.get("userId") ?? "");

  const user = await db.user.findFirst({ where: { id, role: "client" } });
  if (!user) back("/hello", next, "unknown");

  await rememberWho(user.id);
  await record({ action: "name.picked", actor: user, subject: user.name });
  redirect(next);
}

/**
 * Add a name that is not on the list yet. Typing a name that already exists
 * (in any case) picks that person rather than making a twin.
 */
export async function addName(formData: FormData): Promise<void> {
  const next = safeRedirect(formData.get("next"));
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");

  if (!name || name.length > NAME_MAX) back("/hello", next, "name");

  const owner = await printerOwner();
  if (owner && owner.name.toLowerCase() === name.toLowerCase()) back("/hello", next, "owner");

  const existing = await db.user.findFirst({
    where: { role: "client", name: { equals: name, mode: "insensitive" } },
  });

  const user =
    existing ??
    (await db.user.create({ data: { name, initials: initialsFor(name), role: "client" } }));

  await rememberWho(user.id);
  await record({
    action: existing ? "name.picked" : "name.added",
    actor: user,
    subject: user.name,
  });
  redirect(next);
}

/** "Not you?" — forget the name on this device and go back to the list. */
export async function forgetMe(): Promise<void> {
  await forgetWho();
  await lockOwner();
  redirect("/hello");
}

// ---------------------------------------------------------------------------
// The owner pages
// ---------------------------------------------------------------------------

/**
 * Wrong guesses allowed per address per minute. In memory, which is enough
 * for one container: it only has to make guessing `ADMIN_PASSWORD` slow.
 *
 * With no trusted client address (`TRUST_PROXY_HEADERS` unset) everyone
 * shares one counter, so somebody guessing can keep the owner waiting a
 * minute. That is the better failure than no limit at all.
 */
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; since: number }>();

function tooManyFailures(key: string): boolean {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.since > 60_000) return false;
  return entry.count >= MAX_FAILURES;
}

function noteFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.since > 60_000) {
    failures.set(key, { count: 1, since: Date.now() });
  } else {
    entry.count += 1;
  }
}

export async function unlockOwnerPages(formData: FormData): Promise<void> {
  const next = safeRedirect(formData.get("next"), "/queue");
  const password = String(formData.get("password") ?? "");

  if (!adminPassword()) back("/owner", next, "unset");

  const key = clientIpFrom(await headers(), ipSource()) ?? "everyone";
  if (tooManyFailures(key)) back("/owner", next, "slow");

  const owner = await printerOwner();
  if (!owner) back("/owner", next, "noowner");

  if (!isAdminPassword(password)) {
    noteFailure(key);
    await record({ action: "owner.unlock_refused", subject: owner.name });
    back("/owner", next, "wrong");
  }

  failures.delete(key);
  await unlockOwner();
  await record({ action: "owner.unlocked", actor: owner, subject: owner.name });
  redirect(next);
}

export async function lockOwnerPages(): Promise<void> {
  const owner = await printerOwner();
  await lockOwner();
  if (owner) await record({ action: "owner.locked", actor: owner, subject: owner.name });
  redirect("/hello");
}
