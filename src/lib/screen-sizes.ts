/** Shared, finite page groups. Private IDs, invitation tokens and queries never leave the browser. */
export const SCREEN_PAGES = [
  "/", "/upload", "/me", "/member", "/member/badge-preview", "/queue", "/history", "/frr", "/frr/new", "/frr/queue", "/bin",
  "/signin", "/welcome", "/install", "/add-device", "/add-member", "/bambu-studio",
  "/stickers", "/docs", "/reauth", "/set-password", "/share-filament",
  "/admin/audit", "/admin/catalog", "/admin/invites", "/admin/prints", "/admin/screens",
  "/story/:id", "/story/:id/again", "/frr/:id", "/invite/:token", "/device/:token",
] as const;

export type ScreenPage = (typeof SCREEN_PAGES)[number];
export const SCREEN_RETENTION_DAYS = 30;

export function screenPage(pathname: string): ScreenPage | null {
  const path = pathname.split(/[?#]/, 1)[0]!.replace(/\/$/, "") || "/";
  if ((SCREEN_PAGES as readonly string[]).includes(path)) return path as ScreenPage;
  if (/^\/story\/[^/]+\/again$/.test(path)) return "/story/:id/again";
  const groups = { story: "/story/:id", frr: "/frr/:id", invite: "/invite/:token", device: "/device/:token" } as const;
  for (const prefix of ["story", "frr", "invite", "device"] as const) {
    if (new RegExp(`^/${prefix}/[^/]+$`).test(path)) {
      return groups[prefix];
    }
  }
  // Catalogue detail routes share one group; no colour names or identifiers are saved.
  if (path.startsWith("/admin/catalog/")) return "/admin/catalog";
  return null;
}

/** Coarse estimates only. In particular, iPadOS can advertise itself as macOS. */
export function screenEnvironment(userAgent: string, touch: boolean) {
  const ua = userAgent.slice(0, 512);
  const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch);
  const android = /Android/i.test(ua);
  const tablet = /iPad|Tablet/i.test(ua) || (ios && !/iPhone|iPod/i.test(ua)) ||
    (android && !/Mobile/i.test(ua));
  const device = tablet ? "Tablet" : /Mobile|iPhone|iPod/i.test(ua) ? "Phone" : "Desktop";
  const os = ios ? "iOS / iPadOS" : android ? "Android" : /CrOS/i.test(ua) ? "ChromeOS" :
    /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "macOS" :
      /Linux/i.test(ua) ? "Linux" : "Other";
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? "Edge" : /OPR\/|OPiOS\//i.test(ua) ? "Opera" :
    /SamsungBrowser\//i.test(ua) ? "Samsung Internet" : /Firefox\/|FxiOS\//i.test(ua) ? "Firefox" :
      /Chrome\/|CriOS\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "Other";
  return { device, browser, os };
}

export function screenDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Inclusive calendar-day window, shared by report filters and retention. */
export function screenSince(days: number, now = new Date()): Date {
  return new Date(screenDay(now).getTime() - (days - 1) * 86_400_000);
}

export function screenShare(count: number, total: number): string {
  return total ? `${(count / total * 100).toFixed(1)}%` : "0%";
}
