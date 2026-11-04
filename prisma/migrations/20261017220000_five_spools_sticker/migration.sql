-- Match the runtime milestone: five 330 m spool equivalents, using only
-- recorded usage on completed requests. Quantity is already included in meters.
-- Completion dates are not recorded historically, so award at rollout time.
-- Existing qualifying members receive the sticker without a retroactive toast.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'five-spools:' || "uploaderId", "uploaderId", 'five-spools', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" > 0
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 1650
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
