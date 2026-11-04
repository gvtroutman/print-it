"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keep a visible meter up to date until Bambu reports that its active jobs have ended. */
export function PrinterHoursRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
