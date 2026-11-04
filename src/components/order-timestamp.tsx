"use client";

import { useEffect, useState } from "react";

/** Show the full order date in the reader's time zone, with a stable UTC fallback. */
export function OrderTimestamp({ iso }: { iso: string }) {
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <time dateTime={iso} title={iso}>
      {new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
      })}
    </time>
  );
}
