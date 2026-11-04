-- A member's own join-date anniversary, after at least one calendar year.
-- UTC timestamps are interpreted on the same Eastern calendar as live awards.
-- Adding years clamps February 29 to February 28 in non-leap years.
WITH member_dates AS (
  SELECT s."id", s."uploaderId", s."createdAt",
         (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date AS request_date,
         (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date AS join_date
  FROM "story" s JOIN "user" u ON u."id" = s."uploaderId"
), anniversary_requests AS (
  SELECT * FROM member_dates
  WHERE EXTRACT(YEAR FROM request_date) > EXTRACT(YEAR FROM join_date)
    AND (join_date + make_interval(years => EXTRACT(YEAR FROM request_date)::int - EXTRACT(YEAR FROM join_date)::int))::date = request_date
)
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT DISTINCT ON ("uploaderId")
       'anniversary:' || "uploaderId", "uploaderId", 'member-anniversary', "createdAt", "id"
FROM anniversary_requests
ORDER BY "uploaderId", "createdAt", "id"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
