/**
 * The two cookies that say who is at the keyboard.
 *
 * There are no accounts and no passwords for the office. Somebody picks their
 * name from a list (or adds it) and `ppp.who` remembers the choice. The
 * printer owner additionally unlocks the owner pages with `ADMIN_PASSWORD`,
 * and `ppp.owner` remembers that for the rest of the browser session.
 *
 * Its own module, with no Node imports, because `src/middleware.ts` runs on
 * the edge runtime and only needs to know the names.
 */

/** "I am this person." Long-lived: picking your name once per device is enough. */
export const WHO_COOKIE = "ppp.who";
export const WHO_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * "The owner pages are unlocked." A browser-session cookie whose value also
 * carries its own expiry, so a browser that is never closed does not keep it
 * forever.
 */
export const OWNER_COOKIE = "ppp.owner";
export const OWNER_TTL_SECONDS = 60 * 60 * 12;

/** Names are free text, but not a paragraph. */
export const NAME_MAX = 40;
