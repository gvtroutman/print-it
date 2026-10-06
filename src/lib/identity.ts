import "server-only";
import { cookies } from "next/headers";

import {
  OWNER_COOKIE,
  OWNER_TTL_SECONDS,
  WHO_COOKIE,
  WHO_MAX_AGE_SECONDS,
} from "@/lib/identity-rules";
import { readOwner, readWho, signOwner, signWho } from "@/lib/identity-token";
import { enabledSources } from "@/lib/import-source";
import { isBuildPhase } from "@/lib/runtime";

/**
 * Reading and writing the identity cookies. Writing only works inside a
 * server action or a route handler — Next forbids it during a page render.
 */

/** Public origin of the app. Cookies are marked Secure when it is https. */
export function appUrl(path = "/"): string {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}

const secure = () => appUrl().startsWith("https://");

/** localhost is never a real deployment, whatever NODE_ENV happens to say. */
const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/$/i.test(appUrl());

// Configuration is refused here because this is the module every request
// loads. A misspelt IMPORT_SOURCES throws by name on the first request instead
// of quietly meaning "off" — see `enabledSources`.
if (!isBuildPhase) enabledSources();

if (process.env.NODE_ENV === "production" && !isBuildPhase) {
  if (!process.env.APP_SECRET) {
    throw new Error("APP_SECRET is required in production.");
  }
  if (!secure() && !isLoopback) {
    throw new Error(
      `APP_URL must be an https:// URL in production (got "${process.env.APP_URL}"). ` +
        "The owner password is posted to this origin and the identity cookies " +
        "carry the Secure flag; neither is safe over plain HTTP.",
    );
  }
}

const base = () =>
  ({ httpOnly: true, sameSite: "lax", path: "/", secure: secure() }) as const;

/** The user id the browser says it is, if the cookie is one this app wrote. */
export async function whoId(): Promise<string | null> {
  return readWho((await cookies()).get(WHO_COOKIE)?.value);
}

export async function ownerUnlocked(): Promise<boolean> {
  return readOwner((await cookies()).get(OWNER_COOKIE)?.value);
}

export async function rememberWho(userId: string): Promise<void> {
  (await cookies()).set({
    ...base(),
    name: WHO_COOKIE,
    value: signWho(userId),
    maxAge: WHO_MAX_AGE_SECONDS,
  });
}

export async function forgetWho(): Promise<void> {
  (await cookies()).delete({ ...base(), name: WHO_COOKIE });
}

/** No `maxAge`: the cookie dies with the browser session, or after its own TTL. */
export async function unlockOwner(): Promise<void> {
  (await cookies()).set({
    ...base(),
    name: OWNER_COOKIE,
    value: signOwner(OWNER_TTL_SECONDS),
  });
}

export async function lockOwner(): Promise<void> {
  (await cookies()).delete({ ...base(), name: OWNER_COOKIE });
}
