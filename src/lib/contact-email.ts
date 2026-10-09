/**
 * A member does not need an email address.
 *
 * Better Auth still needs every account to carry one — `user.email` is
 * required and unique in its core schema, and `createUser` lower-cases it on
 * the way in — so an account opened from an invitation that has no address is
 * given a placeholder: stable, unique to that invitation, and under a reserved
 * top-level domain that can never resolve (RFC 6761 §6.4). Nothing can be
 * delivered to it and nobody can register it. Better Auth's own anonymous
 * plugin does the same thing for the same reason.
 *
 * Anything that would show somebody an address or mail one goes through
 * `contactEmail`, which turns the placeholder back into "none".
 *
 * No imports: client components read this too.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "members.placeholder.invalid";

/**
 * The account address for an invitation that carries no email. Keyed on the
 * invite id, so it is reproducible — the gate in src/lib/auth.ts recomputes
 * it to check that the sign-up body is the one the invitation decided on.
 */
export function placeholderEmailFor(inviteId: string): string {
  return `member-${inviteId.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** The address a person can actually be reached at, or null when there is none. */
export function contactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return isPlaceholderEmail(email) ? null : email;
}
