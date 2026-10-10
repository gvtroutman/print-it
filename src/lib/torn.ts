/**
 * Classes for a list drawn as a torn-off receipt (`.torn` in globals.css):
 * torn along the top, and along the bottom too once the list is long enough
 * that both ends will not fit on one screen. About six ticket rows fill a
 * laptop screen.
 */
export function tornClass(rows: number) {
  return rows > 6 ? "torn torn-both" : "torn";
}
