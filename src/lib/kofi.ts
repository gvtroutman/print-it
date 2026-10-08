import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { KofiGift } from "@/lib/donations";

/**
 * Ko-fi's webhook, taken apart.
 *
 * Ko-fi posts `application/x-www-form-urlencoded` with one field, `data`,
 * whose value is a JSON object. Inside it is `verification_token`, the secret
 * shown on Ko-fi's webhook settings page — the only thing that says a request
 * came from Ko-fi rather than from anybody who found the URL. It lives in
 * `KOFI_VERIFICATION_TOKEN`; while that is unset the endpoint does not exist.
 *
 * Nothing here touches the database. `parseKofiDelivery` turns a body into a
 * verdict, and the route hands a gift on to `receiveKofiGift`.
 */

/** Is the webhook switched on in this deployment? */
export function kofiConnected(): boolean {
  return Boolean(process.env.KOFI_VERIFICATION_TOKEN?.trim());
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time, and the same length whatever was sent. */
function tokenMatches(sent: string, expected: string): boolean {
  return timingSafeEqual(digest(sent), digest(expected));
}

/**
 * Gifts towards the bin. A shop order or a commission is somebody buying
 * something, not chipping in, so those are acknowledged and left out.
 */
const COUNTED_TYPES = new Set(["Donation", "Subscription"]);

const PayloadSchema = z.object({
  verification_token: z.string(),
  type: z.string(),
  kofi_transaction_id: z.string().trim().min(1).max(200),
  amount: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/),
  currency: z.string().trim().min(1).max(10),
  from_name: z.string().nullish(),
  email: z.string().nullish(),
});

export type KofiDelivery =
  | { kind: "off" }
  | { kind: "malformed" }
  | { kind: "forged" }
  | { kind: "ignored"; type: string }
  | { kind: "gift"; gift: KofiGift };

export function parseKofiDelivery(data: FormDataEntryValue | null): KofiDelivery {
  const expected = process.env.KOFI_VERIFICATION_TOKEN?.trim();
  if (!expected) return { kind: "off" };
  if (typeof data !== "string") return { kind: "malformed" };

  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return { kind: "malformed" };
  }

  // The token first, before the shape: a stranger learns nothing about what a
  // valid payload looks like from which refusal they get.
  const token = (json as { verification_token?: unknown } | null)?.verification_token;
  if (typeof token !== "string" || !tokenMatches(token, expected)) return { kind: "forged" };

  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) return { kind: "malformed" };
  const p = parsed.data;

  if (!COUNTED_TYPES.has(p.type)) return { kind: "ignored", type: p.type };

  return {
    kind: "gift",
    gift: {
      transactionId: p.kofi_transaction_id,
      amountCents: Math.round(Number(p.amount) * 100),
      currency: p.currency,
      fromName: (p.from_name ?? "").trim().slice(0, 280),
      email: (p.email ?? "").trim(),
    },
  };
}
