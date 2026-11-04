/** Calendar, earning and collection checks need no database or server timezone. */
import assert from "node:assert/strict";
import { holidayBadgesForDate, HOLIDAY_BADGES, PRINT_IT_BIRTHDAY } from "../src/lib/holiday-calendar";
import { meetsBadgeGoal, MEMBER_BADGES, visibleMemberBadges, LOVE_OF_MY_LIFE_BADGE } from "../src/lib/badge-catalog";
import { earnedCardFlairs } from "../src/lib/card-flair";

const holidays = MEMBER_BADGES.filter((badge) => badge.goal.kind === "holiday");
assert.equal(holidays.length, 9);
assert.deepEqual(PRINT_IT_BIRTHDAY, { year: 2026, month: 10, day: 6 });
assert.equal(new Set(MEMBER_BADGES.map((badge) => badge.key)).size, MEMBER_BADGES.length);
const progress = { submissions: 0, fiberSubmissions: 0, requestedMaterialIds: [], availableMaterials: [] };
const fixedWindows = [
  [1, 1, HOLIDAY_BADGES.newYear],
  [2, 14, HOLIDAY_BADGES.valentine],
  [3, 17, HOLIDAY_BADGES.stPatrick],
  [7, 4, HOLIDAY_BADGES.independence],
  [10, 6, HOLIDAY_BADGES.birthday],
  [10, 31, HOLIDAY_BADGES.halloween],
  [12, 3, HOLIDAY_BADGES.printingDay],
  [12, 25, HOLIDAY_BADGES.christmas],
] as const;
const sameKeys = (actual: readonly string[], expected: readonly string[], message: string) =>
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
const visibleHolidays = (date: Date, earned: readonly string[] = []) =>
  visibleMemberBadges(earned, date).filter((badge) => badge.goal.kind === "holiday").map((badge) => badge.key);
const localHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" });
function midnight(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 5));
  return new Date(date.getTime() - Number(localHour.format(date)) * 3_600_000);
}

let days = 0;
for (let year = 2024; year <= 2036; year++) {
  // Independently find the fourth Thursday, including years with a fifth one.
  const thursdays = Array.from({ length: 30 }, (_, index) => index + 1)
    .filter((day) => new Date(Date.UTC(year, 10, day, 12)).getUTCDay() === 4);
  const windows = [...fixedWindows, [11, thursdays[3]!, HOLIDAY_BADGES.thanksgiving] as const];
  for (let month = 1; month <= 12; month++) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(Date.UTC(year, month - 1, day, 17));
      const visible = windows.filter(([m, end, key]) => m === month && day <= end &&
        (key !== HOLIDAY_BADGES.birthday || year > 2026 || (year === 2026 && day === 6)))
        .map(([, , key]) => key);
      const expected = visible.filter((key) => key !== HOLIDAY_BADGES.printingDay || day === 3);
      const label = `${year}-${month}-${day}`;
      sameKeys(holidayBadgesForDate(date), expected, `Award windows: ${label}`);
      sameKeys(visibleHolidays(date), visible, `Visible unearned stickers: ${label}`);
      for (const badge of holidays) {
        assert.equal(meetsBadgeGoal(badge, { ...progress, submittedAt: date }), expected.some((key) => key === badge.key), `Goal: ${badge.key} ${label}`);
      }
      days++;
    }
  }
  for (const [month, endDay, key] of windows) {
    if (key === HOLIDAY_BADGES.birthday && year < 2026) continue;
    const previewStart = midnight(year, month, key === HOLIDAY_BADGES.birthday && year === 2026 ? 6 : 1);
    const start = key === HOLIDAY_BADGES.printingDay ? midnight(year, month, 3) : previewStart;
    const end = midnight(year, month, endDay + 1);
    for (const [date, expected] of [
      [new Date(start.getTime() - 1), false],
      [start, true],
      [new Date(end.getTime() - 1), true],
      [end, false],
    ] as const) {
      assert.equal(holidayBadgesForDate(date).includes(key), expected, `${key}: Eastern boundary ${date.toISOString()}`);
      assert.equal(visibleHolidays(date).includes(key), date >= previewStart && date < end, `${key}: preview boundaries`);
    }
  }
}

const october = new Date("2026-10-19T12:00:00Z");
sameKeys(visibleHolidays(october), [HOLIDAY_BADGES.halloween], "Only Halloween is still available in mid-October");
sameKeys(visibleHolidays(new Date("2026-11-01T03:59:59.999Z")), [HOLIDAY_BADGES.halloween], "Halloween lasts through October 31 Eastern");
sameKeys(visibleHolidays(new Date("2026-11-01T04:00:00Z")), [HOLIDAY_BADGES.thanksgiving], "November immediately rotates to Thanksgiving");
sameKeys(visibleHolidays(new Date("2026-12-01T05:00:00Z")), [HOLIDAY_BADGES.printingDay, HOLIDAY_BADGES.christmas], "December windows overlap");
for (const year of [2026, 2027, 2032]) {
  for (const [date, expected] of [
    [`${year}-12-01T05:00:00Z`, false],
    [`${year}-12-03T04:59:59.999Z`, false],
    [`${year}-12-03T05:00:00Z`, true],
    [`${year}-12-04T04:59:59.999Z`, true],
    [`${year}-12-04T05:00:00Z`, false],
  ] as const) assert.equal(holidayBadgesForDate(new Date(date)).includes(HOLIDAY_BADGES.printingDay), expected, "3D Day is earned only on December 3 Eastern");
}
sameKeys(visibleHolidays(new Date("2027-10-01T04:00:00Z")), [HOLIDAY_BADGES.birthday, HOLIDAY_BADGES.halloween], "Future birthdays overlap Halloween");
sameKeys(visibleHolidays(october, [HOLIDAY_BADGES.christmas]), [HOLIDAY_BADGES.halloween, HOLIDAY_BADGES.christmas], "Earned seasonal stickers stay visible outside their month");
sameKeys(visibleHolidays(october, [HOLIDAY_BADGES.halloween]), [HOLIDAY_BADGES.halloween], "An active collected sticker appears once");
sameKeys(visibleHolidays(new Date("2026-04-01T12:00:00Z")), [], "No unearned seasonal stickers in an empty month");
const ordinary = MEMBER_BADGES.filter((badge) => badge.goal.kind !== "holiday" && badge.goal.kind !== "gift");
sameKeys(visibleMemberBadges([], october).filter((badge) => badge.goal.kind !== "holiday").map((badge) => badge.key), ordinary.map((badge) => badge.key), "Everyday stickers and mystery placeholders stay available");
assert.equal(visibleMemberBadges([], october).some((badge) => badge.key === LOVE_OF_MY_LIFE_BADGE), false);
assert.equal(visibleMemberBadges([LOVE_OF_MY_LIFE_BADGE], october).some((badge) => badge.key === LOVE_OF_MY_LIFE_BADGE), true, "Gifts stay recipient-only");
sameKeys(earnedCardFlairs([HOLIDAY_BADGES.christmas]).map((flair) => flair.key), [HOLIDAY_BADGES.christmas], "Collected seasonal stickers remain selectable on the member card");
for (const badge of holidays) {
  assert.equal(meetsBadgeGoal(badge, progress), false, "No request timestamp means no seasonal award");
  assert.equal(meetsBadgeGoal(badge, { ...progress, submittedAt: new Date(NaN) }), false);
  assert.ok(badge.requirement.includes("Eastern time"));
}
assert.deepEqual(holidayBadgesForDate(new Date(NaN)), []);
assert.deepEqual(holidayBadgesForDate(new Date(Infinity)), []);
console.log(`Seasonal checks passed: ${days} dates in 2024–2036; all nine windows; December 3-only 3D Day with early preview; Eastern midnight and daylight saving; Thanksgiving; founding date; overlapping awards; collection rotation; permanent earned stickers, gifts and card flair.`);
