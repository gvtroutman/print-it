-- Approximate equatorial circumference: 40,075 km, recorded in meters.
-- Match runtime totals: completed requests only; quantity is already in meters.
-- Historical completion times are unavailable, so award at rollout time.
-- Qualifying members receive the sticker without a retroactive notification.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'around-the-world:' || "uploaderId", "uploaderId", 'around-the-world', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" IS NOT NULL
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 40075000
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
