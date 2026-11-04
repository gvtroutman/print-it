-- Everest's elevation above sea level, rounded to the nearest meter: 8,849 m.
-- Match runtime totals: Delivery and Done only; recorded meters include copies.
-- Historical completion times are unavailable, so award at rollout time.
-- Credit existing progress silently and preserve all earned dates on reruns.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'peak-performance:' || "uploaderId", "uploaderId", 'peak-performance', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" IS NOT NULL
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 8849
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
