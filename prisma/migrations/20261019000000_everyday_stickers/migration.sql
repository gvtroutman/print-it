-- Everyday milestones credit existing members without retroactive notifications.
-- Lifetime submissions include withdrawn requests. A missing source stays NULL.
-- Historical completion times are unavailable, so backfill dates use rollout time.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'first-request:' || u."id", u."id", 'first-request', CURRENT_TIMESTAMP,
       (SELECT s."id" FROM "story" s WHERE s."uploaderId" = u."id" ORDER BY s."createdAt", s."id" LIMIT 1)
FROM "user" u
WHERE u."printSubmissionCount" >= 1
ON CONFLICT ("userId", "badgeKey") DO NOTHING;

-- Delivery and Done are completed prints; quantity never multiplies the count.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT goals."key" || ':' || s."uploaderId", s."uploaderId", goals."key", CURRENT_TIMESTAMP,
       (array_agg(s."id" ORDER BY s."updatedAt" DESC, s."id" DESC))[1]
FROM "story" s
CROSS JOIN (VALUES ('three-prints', 3), ('five-prints', 5), ('ten-prints', 10)) AS goals("key", "target")
WHERE s."status" IN ('Delivery', 'Done')
GROUP BY s."uploaderId", goals."key", goals."target"
HAVING COUNT(*) >= goals."target"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;

-- Stored meters already include all copies. Unknown usage adds no meters.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'making-tracks:' || "uploaderId", "uploaderId", 'making-tracks', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done') AND "filamentMeters" IS NOT NULL
GROUP BY "uploaderId"
HAVING SUM("filamentMeters") >= 50
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
