"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/catalog";

/** Keep the last-sync age current without triggering another cloud sync. */
export function SyncAge({ iso, initialLabel }: { iso: string; initialLabel: string }) {
  const [age, setAge] = useState(initialLabel);

  useEffect(() => {
    const update = () => setAge(relativeTime(new Date(iso)));
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [iso]);

  return <time dateTime={iso}>{age}</time>;
}
