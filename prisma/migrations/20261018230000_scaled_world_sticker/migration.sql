-- A 1:10,000 scale trip around the equator: 40,075,000 / 10,000 = 4,007.5 m.
-- Backfill the reachable goal while preserving existing awards and dates.
-- Match runtime totals: completed requests only; quantity is already in meters.
-- Historical completion times are unavailable, so award at rollout time.
-- Qualifying members receive the sticker without a retroactive notification.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'around-the-world:' || "uploaderId", "uploaderId", 'around-the-world', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" IS NOT NULL
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 4007.5
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
