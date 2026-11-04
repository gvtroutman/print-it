import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(await readFile("src/lib/phone-installation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const key = "print-it:phone-installed";
type RelatedApp = { platform: string; url?: string; id?: string };

function fixture(options: {
  mode?: string; ios?: boolean; remembered?: boolean; blockedStorage?: boolean;
  query?: () => Promise<RelatedApp[]>;
} = {}) {
  class Display extends EventTarget {
    constructor(public matches: boolean) { super(); }
  }
  const displays = new Map<string, Display>();
  const storage = new Map<string, string>(options.remembered ? [[key, "true"]] : []);
  const window = Object.assign(new EventTarget(), {
    location: { origin: "https://print.test" },
    matchMedia(query: string) {
      const display = new Display(query === `(display-mode: ${options.mode})`);
      displays.set(query, display);
      return display;
    },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const exports = {} as { observePhoneInstallation(fn: (installed: boolean) => void): () => void };
  vm.runInNewContext(code, {
    exports, URL, window, document,
    navigator: { standalone: options.ios, getInstalledRelatedApps: options.query },
    localStorage: {
      getItem(name: string) { if (options.blockedStorage) throw new Error("blocked"); return storage.get(name) ?? null; },
      setItem(name: string, value: string) { if (options.blockedStorage) throw new Error("blocked"); storage.set(name, value); },
      removeItem(name: string) { if (options.blockedStorage) throw new Error("blocked"); storage.delete(name); },
    },
  });
  const states: boolean[] = [];
  const stop = exports.observePhoneInstallation(value => states.push(value));
  return { window, document, displays, storage, states, stop, get installed() { return states.at(-1); } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

const fresh = fixture();
assert.equal(fresh.installed, false, "a new device still gets installation instructions");
for (const mode of ["standalone", "minimal-ui", "window-controls-overlay"]) {
  const app = fixture({ mode });
  assert.equal(app.installed, true, `${mode} launches are installed`);
  assert.equal(app.storage.get(key), "true");
  app.stop();
}
assert.equal(fixture({ ios: true }).installed, true, "iOS home-screen launches are recognized");
assert.equal(fixture({ mode: "fullscreen" }).installed, false, "fullscreen in a browser is not proof of installation");
assert.equal(fixture({ remembered: true }).installed, true, "installation survives an ordinary browser visit");
assert.equal(fixture().installed, false, "installation is not shared across devices/accounts");

const query = fixture({ query: async () => [{ platform: "webapp", url: "https://print.test/manifest.webmanifest" }] });
assert.equal(query.installed, undefined, "do not flash an install offer while querying this device");
await settle();
assert.equal(query.installed, true, "an already-installed Android app is detected from a browser tab");
for (const app of [
  { platform: "webapp", id: "https://print.test/" },
  { platform: "webapp", url: "/manifest.webmanifest" },
]) {
  const related = fixture({ query: async () => [app] });
  await settle();
  assert.equal(related.installed, true);
}
for (const app of [
  { platform: "play", id: "unrelated.app" },
  { platform: "webapp", url: "https://other.test/manifest.webmanifest", id: "https://other.test/" },
  { platform: "webapp", url: "/another.webmanifest", id: "/another-app" },
  { platform: "webapp", url: "https://[invalid" },
]) {
  const unrelated = fixture({ query: async () => [app] });
  await settle();
  assert.equal(unrelated.installed, false, "other installed apps do not hide our install action");
}
const removed = fixture({ remembered: true, query: async () => [] });
await settle();
assert.equal(removed.installed, false, "a browser uninstall check clears stale evidence");
assert.equal(removed.storage.has(key), false);
for (const remembered of [true, false]) {
  const failed = fixture({ remembered, query: async () => { throw new Error("unsupported"); } });
  await settle();
  assert.equal(failed.installed, remembered, "optional API failures fall back to local evidence");
}
const blocked = fixture({ ios: true, blockedStorage: true });
assert.equal(blocked.installed, true, "storage restrictions do not break detection");
assert.equal(fixture({ blockedStorage: true }).installed, false);

fresh.window.dispatchEvent(new Event("appinstalled"));
assert.equal(fresh.installed, true, "installing updates the current page immediately");
assert.equal(fresh.storage.get(key), "true");
fresh.window.dispatchEvent(new Event("focus"));
assert.equal(fresh.installed, true, "returning to the browser keeps installation evidence");
fresh.window.dispatchEvent(new Event("beforeinstallprompt"));
assert.equal(fresh.installed, false, "a new install offer resets evidence after uninstalling");
assert.equal(fresh.storage.has(key), false);
const display = fresh.displays.get("(display-mode: standalone)")!;
display.matches = true;
display.dispatchEvent(new Event("change"));
assert.equal(fresh.installed, true, "opening an installed app updates detection");

let resolve!: (apps: RelatedApp[]) => void;
const racing = fixture({ query: () => new Promise(done => { resolve = done; }) });
racing.window.dispatchEvent(new Event("appinstalled"));
resolve([]);
await settle();
assert.equal(racing.installed, true, "a stale query cannot undo a fresh installation event");
const closed = fixture({ query: () => new Promise(done => { resolve = done; }) });
closed.stop();
resolve([{ platform: "webapp", id: "/" }]);
await settle();
assert.equal(closed.states.length, 0, "an unmounted provider ignores pending query results");

let calls = 0;
const refresh = fixture({ query: async () => { calls++; return []; } });
await settle();
for (const event of ["focus", "pageshow"]) refresh.window.dispatchEvent(new Event(event));
refresh.document.dispatchEvent(new Event("visibilitychange"));
assert.equal(calls, 4, "resume events recheck installation on this device");
refresh.document.visibilityState = "hidden";
refresh.document.dispatchEvent(new Event("visibilitychange"));
assert.equal(calls, 4, "hidden documents do not trigger a check");
refresh.stop();
await settle();
const count = refresh.states.length;
for (const event of ["focus", "pageshow", "appinstalled", "beforeinstallprompt"]) refresh.window.dispatchEvent(new Event(event));
assert.equal(refresh.states.length, count, "cleanup removes installation listeners");

console.log("Phone installation checks passed: installed sessions, iOS, Android queries, device-local evidence, uninstall, API/storage failures, resume and event races.");
