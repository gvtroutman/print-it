"use client";

/**
 * A date in the reader's own time zone. The server runs in UTC, so a print
 * that started at 10 in the morning would otherwise read as 2 in the afternoon.
 */
export function LocalTime({ iso, format }: { iso: string; format: "date" | "time" | "datetime" }) {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions =
    format === "date"
      ? { month: "short", day: "numeric", year: "numeric" }
      : format === "time"
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {date.toLocaleString("en", options)}
    </time>
  );
}
