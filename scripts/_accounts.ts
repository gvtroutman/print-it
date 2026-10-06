/**
 * Test-identity plumbing shared by the verification suites.
 *
 * There is no sign-in left to drive. A person is whoever `ppp.who` says they
 * are, and the printer owner is whoever holds a valid `ppp.owner`. Both are
 * HMACs over `APP_SECRET` (the owner one over `ADMIN_PASSWORD` too), minted by
 * `src/lib/identity-token.ts` — so the suites import that module and write the
 * same cookies the app's own `/hello` and `/owner` actions would.
 *
 * That only works if this process and the app container agree on both
 * secrets. `npm run env:container` copies them out of `.env.docker`; a
 * mismatch shows up as every request answering 401, or every owner page
 * bouncing to `/owner`, which is the hint to look here.
 *
 * The suites still go through the app for everything the cookies unlock. What
 * they skip is clicking a name on `/hello`, and the security probe covers that
 * door on its own.
 */
import { db } from "../src/lib/db";
import { OWNER_COOKIE, OWNER_TTL_SECONDS, WHO_COOKIE } from "../src/lib/identity-rules";
import { signOwner, signWho } from "../src/lib/identity-token";
import { initialsFor } from "../src/lib/tokens";

/** Anything with a cookie jar — every suite's Browser/Client qualifies. */
export type HttpClient = {
  jar: Map<string, string>;
};

/**
 * A client row, as `addName` on `/hello` would create it.
 *
 * `email` is optional and unique, and nothing in the app reads it any more —
 * suites pass one only because it is a convenient key to find their own rows
 * by, and to wipe them between runs.
 */
export function createClient(name: string, opts: { email?: string; initials?: string } = {}) {
  return db.user.create({
    data: {
      name,
      email: opts.email ?? null,
      initials: opts.initials ?? initialsFor(name),
      role: "client",
    },
  });
}

/** The cookie values, for callers that are not a jar (puppeteer, raw fetch). */
export const whoCookie = (userId: string) => ({ name: WHO_COOKIE, value: signWho(userId) });
export const ownerCookie = () => ({ name: OWNER_COOKIE, value: signOwner(OWNER_TTL_SECONDS) });

/** "I am this person" — what clicking their name on `/hello` leaves behind. */
export function pickName<T extends HttpClient>(client: T, userId: string): T {
  client.jar.set(WHO_COOKIE, signWho(userId));
  return client;
}

/**
 * What typing `ADMIN_PASSWORD` on `/owner` leaves behind.
 *
 * Throws if this process has no `ADMIN_PASSWORD`, rather than minting a
 * cookie the app would reject and letting every owner check fail somewhere
 * less obvious.
 */
export function unlockOwner<T extends HttpClient>(client: T): T {
  client.jar.set(OWNER_COOKIE, signOwner(OWNER_TTL_SECONDS));
  return client;
}

/**
 * The right cookie for a user row: the owner cookie for the admin, a name for
 * everyone else. The admin gets no `ppp.who` — a who cookie can only ever
 * resolve to a client, so it would be dead weight at best.
 */
export function actAs<T extends HttpClient>(client: T, user: { id: string; role: string }): T {
  return user.role === "admin" ? unlockOwner(client) : pickName(client, user.id);
}
