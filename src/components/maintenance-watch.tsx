"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Move already-open member tabs to the notice, and reopen when repairs finish. */
export function MaintenanceWatch({ paused = false, message }: { paused?: boolean; message?: string }) {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const response = await fetch("/api/maintenance", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const status = await response.json();
        if (typeof status.enabled !== "boolean") return;
        if (status.enabled !== paused) window.location.replace(status.enabled ? "/maintenance" : "/");
        else if (paused && status.message !== message) router.refresh();
      } catch { /* A connection failure must not look like the printer reopened. */ }
      finally { busy = false; }
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [paused, message, router]);
  return null;
}
