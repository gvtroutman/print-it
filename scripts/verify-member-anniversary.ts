/** Personal calendar rules, including Eastern dates and leap-day membership. */
import assert from "node:assert/strict";
import { isMemberAnniversary } from "../src/lib/holiday-calendar";
import { MEMBER_ANNIVERSARY_BADGE, MEMBER_BADGES, HOLIDAY_BADGES, meetsBadgeGoal } from "../src/lib/badge-catalog";

const badge = MEMBER_BADGES.find((entry) => entry.key === MEMBER_ANNIVERSARY_BADGE)!;
assert.ok(badge);
const progress = { submissions: 0, fiberSubmissions: 0, requestedMaterialIds: [], availableMaterials: [] };
const joinedAt = new Date("2026-04-01T03:30:00Z"); // March 31 in Eastern time.
const start = new Date("2027-03-31T04:00:00Z");
assert.equal(isMemberAnniversary(joinedAt, new Date("2026-03-31T12:00:00Z")), false, "Joining day is not the first anniversary");
assert.equal(isMemberAnniversary(joinedAt, new Date(start.getTime() - 1)), false);
assert.equal(isMemberAnniversary(joinedAt, start), true, "Local anniversary begins at midnight, regardless of join hour");
assert.equal(isMemberAnniversary(joinedAt, new Date("2027-04-01T03:59:59.999Z")), true);
assert.equal(isMemberAnniversary(joinedAt, new Date("2027-04-01T04:00:00Z")), false);
assert.equal(isMemberAnniversary(joinedAt, new Date("2028-03-31T12:00:00Z")), true, "Later anniversaries also qualify");
assert.equal(isMemberAnniversary(new Date("2026-04-01T12:00:00Z"), start), false, "Different join dates remain personal");
assert.equal(isMemberAnniversary(new Date("2028-03-31T12:00:00Z"), start), false, "A future join date cannot qualify");

const leapMember = new Date("2024-02-29T17:00:00Z");
for (const [date, expected] of [
  ["2024-02-29T17:00:00Z", false],
  ["2025-02-28T04:59:59.999Z", false],
  ["2025-02-28T05:00:00Z", true],
  ["2025-03-01T04:59:59.999Z", true],
  ["2025-03-01T05:00:00Z", false],
  ["2028-02-28T17:00:00Z", false],
  ["2028-02-29T17:00:00Z", true],
  ["2100-02-28T17:00:00Z", true],
] as const) assert.equal(isMemberAnniversary(leapMember, new Date(date)), expected, date);
assert.equal(isMemberAnniversary(new Date("1996-02-29T12:00:00Z"), new Date("2000-02-28T12:00:00Z")), false);
assert.equal(isMemberAnniversary(new Date("1996-02-29T12:00:00Z"), new Date("2000-02-29T12:00:00Z")), true);

const winterJoin = new Date("2026-01-01T04:30:00Z"); // December 31, 2025 locally.
assert.equal(isMemberAnniversary(winterJoin, new Date("2026-12-31T05:00:00Z")), true);
assert.equal(isMemberAnniversary(winterJoin, new Date("2027-01-01T04:59:59.999Z")), true);
assert.equal(isMemberAnniversary(winterJoin, new Date("2027-01-01T05:00:00Z")), false);
for (const invalid of [new Date(NaN), new Date(Infinity)]) {
  assert.equal(isMemberAnniversary(invalid, start), false);
  assert.equal(isMemberAnniversary(joinedAt, invalid), false);
}
assert.equal(meetsBadgeGoal(badge, progress), false);
assert.equal(meetsBadgeGoal(badge, { ...progress, joinedAt }), false);
assert.equal(meetsBadgeGoal(badge, { ...progress, submittedAt: start }), false);
assert.equal(meetsBadgeGoal(badge, { ...progress, joinedAt, submittedAt: start }), true);
const overlapping = { ...progress, joinedAt: new Date("2025-01-01T17:00:00Z"), submittedAt: new Date("2026-01-01T17:00:00Z") };
assert.equal(meetsBadgeGoal(badge, overlapping), true);
assert.equal(meetsBadgeGoal(MEMBER_BADGES.find((entry) => entry.key === HOLIDAY_BADGES.newYear)!, overlapping), true, "A personal anniversary and a holiday can both be earned");
console.log("Member anniversary passed: one full calendar year, personal join dates, Eastern midnight boundaries, daylight saving, later years, February 29 and century rules, invalid dates and independent holiday awards.");
