"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { screenPage } from "@/lib/screen-sizes";

/** One observation per page navigation, never per render, resize or polling request. */
export function ScreenSizeTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const page = pathname && screenPage(pathname);
    const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!page || navigator.doNotTrack === "1" || privacy.globalPrivacyControl) return;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width < 100 || height < 100 || width > 10000 || height > 10000) return;
      sent = true;
      void fetch("/api/screen-sizes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        keepalive: true,
        body: JSON.stringify({ page, width, height, touch: navigator.maxTouchPoints > 1 }),
      }).catch(() => {});
    };
    // Deferring also keeps React's development effect replay from counting twice.
    const timer = window.setTimeout(send, 100);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [pathname]);
  return null;
}
