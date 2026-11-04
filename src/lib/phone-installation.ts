export const PHONE_INSTALLED_KEY = "print-it:phone-installed";

type RelatedApp = { platform: string; url?: string; id?: string };
type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
};

/** Observe this device, never the signed-in account: another device still needs installation. */
export function observePhoneInstallation(onChange: (installed: boolean) => void) {
  const browser = navigator as InstallNavigator;
  const displays = ["standalone", "minimal-ui", "window-controls-overlay"]
    .map(mode => window.matchMedia(`(display-mode: ${mode})`));
  let active = true;
  let revision = 0;
  const runningInstalled = () => browser.standalone === true || displays.some(display => display.matches);

  function remembered() {
    try { return localStorage.getItem(PHONE_INSTALLED_KEY) === "true"; }
    catch { return false; }
  }
  function report(installed: boolean) {
    try {
      if (installed) localStorage.setItem(PHONE_INSTALLED_KEY, "true");
      else localStorage.removeItem(PHONE_INSTALLED_KEY);
    } catch { /* Detection still works when browser storage is unavailable. */ }
    onChange(installed);
  }
  function installed() {
    revision++;
    report(true);
  }
  function matches(value: string | undefined, path: string) {
    if (!value) return false;
    try { return new URL(value, window.location.origin).href === new URL(path, window.location.origin).href; }
    catch { return false; }
  }
  async function check() {
    const current = ++revision;
    if (runningInstalled()) { report(true); return; }
    // Keep local evidence on browsers that cannot query installed apps (including Safari).
    const previous = remembered();
    if (previous || typeof browser.getInstalledRelatedApps !== "function") onChange(previous);
    if (typeof browser.getInstalledRelatedApps !== "function") return;
    try {
      const apps = await browser.getInstalledRelatedApps();
      // An installation event or a newer check takes precedence over an older query.
      if (!active || current !== revision) return;
      report(apps.some(app => app.platform === "webapp" &&
        (matches(app.url, "/manifest.webmanifest") || matches(app.id, "/"))));
    } catch {
      if (active && current === revision) onChange(previous);
    }
  }
  function installAvailable() {
    revision++;
    // A new install offer also corrects remembered state after uninstalling.
    report(runningInstalled());
  }
  const onVisible = () => { if (document.visibilityState === "visible") void check(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === PHONE_INSTALLED_KEY || event.key === null) void check();
  };

  displays.forEach(display => display.addEventListener("change", check));
  window.addEventListener("appinstalled", installed);
  window.addEventListener("beforeinstallprompt", installAvailable);
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  void check();
  return () => {
    active = false;
    revision++;
    displays.forEach(display => display.removeEventListener("change", check));
    window.removeEventListener("appinstalled", installed);
    window.removeEventListener("beforeinstallprompt", installAvailable);
    window.removeEventListener("focus", check);
    window.removeEventListener("pageshow", check);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
