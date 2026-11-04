/** One shared calendar for request-based holiday stickers, regardless of server timezone. */
export const HOLIDAY_TIME_ZONE = "America/New_York";

// Our first Print It! change: bc97e1c, October 6, 2026 (Eastern time).
export const PRINT_IT_BIRTHDAY = { year: 2026, month: 10, day: 6 } as const;

export const HOLIDAY_BADGES = {
  newYear: "new-years-day",
  valentine: "valentines-day",
  stPatrick: "st-patricks-day",
  independence: "independence-day",
  birthday: "print-it-birthday",
  halloween: "halloween",
  thanksgiving: "thanksgiving",
  printingDay: "3d-printing-day",
  christmas: "christmas",
} as const;

export type HolidayBadgeKey = (typeof HOLIDAY_BADGES)[keyof typeof HOLIDAY_BADGES];

const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: HOLIDAY_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
});

/** Seasonal stickers open on the first of their month and close after the holiday.
 * 3D Day previews from December 1 but is earned only on December 3.
 * Return every active key because seasonal windows can overlap.
 */
export function holidayBadgesForDate(date: Date, purpose: "award" | "preview" = "award"): HolidayBadgeKey[] {
  if (!Number.isFinite(date.getTime())) return [];
  const parts = calendar.formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const windows = [
    { key: HOLIDAY_BADGES.newYear, month: 1, lastDay: 1 },
    { key: HOLIDAY_BADGES.valentine, month: 2, lastDay: 14 },
    { key: HOLIDAY_BADGES.stPatrick, month: 3, lastDay: 17 },
    { key: HOLIDAY_BADGES.independence, month: 7, lastDay: 4 },
    { key: HOLIDAY_BADGES.birthday, month: PRINT_IT_BIRTHDAY.month, lastDay: PRINT_IT_BIRTHDAY.day },
    { key: HOLIDAY_BADGES.halloween, month: 10, lastDay: 31 },
    // The fourth Thursday falls between November 22 and November 28.
    { key: HOLIDAY_BADGES.thanksgiving, month: 11, lastDay: 22 + (4 - new Date(Date.UTC(year, 10, 1)).getUTCDay() + 7) % 7 },
    { key: HOLIDAY_BADGES.printingDay, month: 12, lastDay: 3 },
    { key: HOLIDAY_BADGES.christmas, month: 12, lastDay: 25 },
  ];
  return windows.filter((window) => {
    if (window.month !== month || day > window.lastDay) return false;
    if (window.key === HOLIDAY_BADGES.printingDay && purpose === "award" && day !== 3) return false;
    // The founding year's birthday cannot be earned before Print It! existed.
    return window.key !== HOLIDAY_BADGES.birthday || year > PRINT_IT_BIRTHDAY.year ||
      (year === PRINT_IT_BIRTHDAY.year && day >= PRINT_IT_BIRTHDAY.day);
  }).map((window) => window.key);
}

/** The member's own anniversary starts after a full calendar year.
 * February 29 anniversaries fall on February 28 in non-leap years.
 */
export function isMemberAnniversary(joinedAt: Date, submittedAt: Date): boolean {
  if (!Number.isFinite(joinedAt.getTime()) || !Number.isFinite(submittedAt.getTime())) return false;
  const joined = calendar.formatToParts(joinedAt);
  const submitted = calendar.formatToParts(submittedAt);
  const part = (parts: Intl.DateTimeFormatPart[], type: "year" | "month" | "day") =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const year = part(submitted, "year");
  if (year <= part(joined, "year")) return false;
  const month = part(joined, "month");
  let day = part(joined, "day");
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2 && day === 29 && !leapYear) day = 28;
  return part(submitted, "month") === month && part(submitted, "day") === day;
}
