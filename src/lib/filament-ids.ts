// Spoolman ids are negative signed 32-bit hashes. Small positive ids belong
// to the measured library. Admin and bundled catalog listings have separate
// reserved positive ranges.
export const ADMIN_SWATCH_BASE = 1_000_000_000;
export const BUNDLED_SWATCH_BASE = 2_000_000_000;
export const adminSwatchId = (id: number) => ADMIN_SWATCH_BASE + id;
export const isAdminSwatch = (id: number) => id > ADMIN_SWATCH_BASE && id < BUNDLED_SWATCH_BASE;
export const isBundledSwatch = (id: number) => id >= BUNDLED_SWATCH_BASE;

/** Only an exact printed sample page identifies a swatch photo. */
export function printedSwatchId(pageUrl?: string | null): number | null {
  if (!pageUrl) return null;
  try {
    const url = new URL(pageUrl);
    const id = url.hostname === "filamentcolors.xyz" && url.protocol === "https:"
      ? Number(url.pathname.match(/^\/swatch\/([1-9]\d*)\/?$/)?.[1]) : NaN;
    return Number.isInteger(id) && id > 0 && id < ADMIN_SWATCH_BASE ? id : null;
  } catch { return null; }
}

/** Stable source-derived ids within PostgreSQL's signed integer range. */
export function recordedSwatchId(sourceId: string): number {
  if (sourceId.startsWith("fcx:")) return Number(sourceId.slice(4));
  if (sourceId.startsWith("admin:")) return adminSwatchId(Number(sourceId.slice(6)));
  let hash = 2166136262;
  for (const char of sourceId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return BUNDLED_SWATCH_BASE + hash % 147_483_647;
}
