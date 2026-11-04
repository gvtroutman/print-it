-- Two 330 m spool equivalents, matching the completed-print milestone.
-- Recorded meters already include quantity. Award existing qualifying members
-- at rollout time because historical completion dates are not recorded.
-- Backfill the sticker silently, without retroactive notifications.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'two-spools:' || "uploaderId", "uploaderId", 'two-spools', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" > 0
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 660
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
