"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Notice } from "@/components/ui";
import { observePhoneInstallation } from "@/lib/phone-installation";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const PhoneApp = createContext<{
  prompt: InstallPrompt | null; installed: boolean | null; error: string; retry(): void;
  clearPrompt(): void;
}>({ prompt: null, installed: null, error: "", retry() {}, clearPrompt() {} });

export function PhoneAppProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const stopObserving = observePhoneInstallation(value => {
      setInstalled(value);
      if (value) setPrompt(null);
    });
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      stopObserving();
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!window.isSecureContext) {
      setError("Open the HTTPS website in Chrome to install Print It!.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setError("Open this page in Chrome on Android to install Print It!.");
      return;
    }
    setError("");
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => { if (active) setError("Phone setup could not finish. Check your connection and try again."); });
    return () => { active = false; };
  }, [attempt]);

  return <PhoneApp.Provider value={{ prompt, installed, error, retry: () => setAttempt(value => value + 1), clearPrompt: () => setPrompt(null) }}>
    {children}
  </PhoneApp.Provider>;
}

/** The server cannot know whether the current browser/device has installed the app. */
export function PhoneInstallAction({ children }: { children: ReactNode }) {
  return useContext(PhoneApp).installed === false ? children : null;
}

export function PhoneInstall() {
  const app = useContext(PhoneApp);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] shadow-stamp">
    <h2 className="m-0 mb-[12px] text-[26px] text-ink">Print It! on your home screen</h2>
    <p className="m-0 mb-[18px] text-[16px] leading-[1.5] text-ink-2">Send filament links straight from Amazon to your market catalog.</p>
    {app.installed === null ? <p role="status" className="m-0 text-[15px] text-ink-2">Checking this device…</p> : app.installed ? <Notice tone="good">Print It! is installed on this device.</Notice> : <>
      {app.prompt && !app.error && <Button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try {
          await app.prompt!.prompt();
          const choice = await app.prompt!.userChoice;
          app.clearPrompt();
          setMessage(choice.outcome === "accepted" ? "Installation started. Open Print It! from your home screen when it finishes." : "You can install later from Chrome’s menu.");
        } catch { setMessage("Use Chrome’s menu to install Print It!."); app.clearPrompt(); }
        finally { setBusy(false); }
      }}>{busy ? "Opening installation…" : "Install Print It!"}</Button>}
      <p className="m-0 mt-[14px] text-[15px] leading-[1.6] text-ink-2">On Android, open this website in <strong>Chrome</strong>. Tap <strong>⋮ → Add to home screen → Install</strong> (some versions show <strong>Install app</strong>). Choose Install when offered so Print It! appears in your Share menu.</p>
    </>}
    {app.error && <div className="mt-[16px]"><Notice tone="warn">{app.error}</Notice><button type="button" onClick={app.retry} className="mt-[10px] cursor-pointer border-0 bg-transparent p-0 text-[14px] font-bold text-ink underline">Retry phone setup</button></div>}
    {message && <p role="status" className="m-0 mt-[14px] text-[14px] text-ink-2">{message}</p>}
    <ol className="mb-0 mt-[24px] space-y-[12px] pl-[22px] text-[16px] leading-[1.5] text-ink-2">
      <li>Open the installed app and sign in as the printer owner. Use “Remember this device” to stay signed in on your phone.</li>
      <li>Find a filament product on Amazon. Tap <strong>Share → Print It!</strong> (look under More if needed).</li>
      <li>Choose its brand, check the material and color, then tap <strong>Add listing</strong>. Enabled listings appear in the market color picker and spool search.</li>
    </ol>
    <p className="mb-0 mt-[20px] text-[13px] leading-[1.5] text-ink-2">Adding filament needs an internet connection. You can also copy an Amazon link and paste it into Add Amazon filament.</p>
  </section>;
}
