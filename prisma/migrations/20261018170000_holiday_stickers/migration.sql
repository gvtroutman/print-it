-- Request dates are stored as UTC timestamps without a timezone. Match the
-- Eastern calendar used by holiday-calendar.ts, including daylight saving.
-- Credit the first qualifying request, silently, without repeating old awards.
WITH local_requests AS (
  SELECT "id", "uploaderId", "createdAt",
         ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date AS holiday_date
  FROM "story"
), qualifying AS (
  SELECT *, CASE
    WHEN to_char(holiday_date, 'MM-DD') = '01-01' THEN 'new-years-day'
    WHEN to_char(holiday_date, 'MM-DD') = '02-14' THEN 'valentines-day'
    WHEN to_char(holiday_date, 'MM-DD') = '03-17' THEN 'st-patricks-day'
    WHEN to_char(holiday_date, 'MM-DD') = '07-04' THEN 'independence-day'
    WHEN to_char(holiday_date, 'MM-DD') = '10-31' THEN 'halloween'
    WHEN EXTRACT(MONTH FROM holiday_date) = 11
      AND EXTRACT(DAY FROM holiday_date) BETWEEN 22 AND 28
      AND EXTRACT(ISODOW FROM holiday_date) = 4 THEN 'thanksgiving'
    WHEN to_char(holiday_date, 'MM-DD') = '12-25' THEN 'christmas'
  END AS badge_key
  FROM local_requests
), first_requests AS (
  SELECT DISTINCT ON ("uploaderId", badge_key) *
  FROM qualifying WHERE badge_key IS NOT NULL
  ORDER BY "uploaderId", badge_key, "createdAt", "id"
)
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'holiday:' || badge_key || ':' || "uploaderId", "uploaderId", badge_key, "createdAt", "id"
FROM first_requests
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
