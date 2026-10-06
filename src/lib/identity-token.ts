// No `server-only` guard here, deliberately: the verification suites import
// this module under tsx to mint the same cookies the app does, and that
// package only resolves inside a Next build.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed values for the `ppp.who` and `ppp.owner` cookies.
 *
 * Signing does not make a name a credential — anyone can pick any name on
 * `/hello`, and that is the point of having no sign-in. What it does is keep
 * the cookie to the values this app wrote: a hand-edited `ppp.who` cannot
 * name the printer owner's row, and `ppp.owner` cannot be produced at all
 * without `ADMIN_PASSWORD`.
 */

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value) {
    // Loud rather than a guessable fallback. A constant default here would
    // mean anybody who read the source could forge the owner cookie.
    throw new Error("APP_SECRET is required. Generate one with: openssl rand -base64 32");
  }
  return value;
}

function mac(message: string): string {
  return createHmac("sha256", secret()).update(message).digest("base64url");
}

function same(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** `ppp.who` = `<userId>.<mac>`. */
export function signWho(userId: string): string {
  return `${userId}.${mac(`who:${userId}`)}`;
}

/** The user id a `ppp.who` value names, or null if it was not written here. */
export function readWho(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  return same(value.slice(dot + 1), mac(`who:${userId}`)) ? userId : null;
}

/** The configured owner password, or null when the owner pages are disabled. */
export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length > 0 ? value : null;
}

/**
 * The password goes into the MAC as a digest, so changing `ADMIN_PASSWORD`
 * invalidates every owner cookie already handed out.
 */
function ownerMessage(expiresAt: number, password: string): string {
  const digest = createHash("sha256").update(password).digest("hex");
  return `owner:${expiresAt}:${digest}`;
}

/** `ppp.owner` = `<expiresAtMs>.<mac>`. */
export function signOwner(ttlSeconds: number): string {
  const password = adminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD is not set.");
  const expiresAt = Date.now() + ttlSeconds * 1000;
  return `${expiresAt}.${mac(ownerMessage(expiresAt, password))}`;
}

export function readOwner(value: string | undefined): boolean {
  const password = adminPassword();
  if (!value || !password) return false;
  const dot = value.indexOf(".");
  const expiresAt = Number(value.slice(0, dot));
  if (dot <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;
  return same(value.slice(dot + 1), mac(ownerMessage(expiresAt, password)));
}

/** Constant-time check of a typed password against `ADMIN_PASSWORD`. */
export function isAdminPassword(attempt: string): boolean {
  const password = adminPassword();
  if (!password) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(attempt), hash(password));
}
