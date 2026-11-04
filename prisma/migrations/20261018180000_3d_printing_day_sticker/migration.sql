-- December 3 (3D): credit each member's first National 3D Printing Day
-- request using the same Eastern calendar as live awards. Keep existing
-- stickers and dates, and backfill without retroactive notifications.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT DISTINCT ON ("uploaderId")
       'holiday:3d-printing-day:' || "uploaderId", "uploaderId", '3d-printing-day', "createdAt", "id"
FROM "story"
WHERE to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'MM-DD') = '12-03'
ORDER BY "uploaderId", "createdAt", "id"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
