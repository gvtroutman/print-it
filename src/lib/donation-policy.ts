/** The donation minimum shown to members and accepted for admin ledger entries. */
export const MIN_DONATION_CENTS = 100;
export const MIN_DONATION_LABEL = `$${MIN_DONATION_CENTS / 100}`;
export const STORE_ACCESS_REQUIRED = `Donate ${MIN_DONATION_LABEL} or more to unlock Store. The admin will confirm your donation.`;

/** Both the Auto color chart and a specific spool come from Store. */
export function isStoreSelection(wish: { swatchId?: number | null; filamentColorId?: string | null }): boolean {
  return wish.swatchId != null || Boolean(wish.filamentColorId);
}
