ALTER TABLE "user" ADD COLUMN "printSubmissionCount" INTEGER NOT NULL DEFAULT 0;

-- Reconstruct lifetime submissions from saved requests and the append-only
-- audit trail, which also remembers withdrawn requests and reprints. A saved
-- request and its audit entry count once, using the original submission date.
WITH submissions AS (
    SELECT "uploaderId" AS "userId", "id" AS "storyId", "createdAt" AS "submittedAt"
    FROM "story"
    UNION ALL
    SELECT "actorId", substring("subject" from 4)::integer, "at"
    FROM "auditEvent"
    WHERE "action" IN ('story.created', 'story.requeued')
      AND "actorId" IS NOT NULL
      AND "subject" ~ '^PI-[0-9]{1,9}$'
), distinct_submissions AS (
    SELECT "userId", "storyId", MIN("submittedAt") AS "submittedAt"
    FROM submissions
    GROUP BY "userId", "storyId"
), ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "submittedAt", "storyId") AS number
    FROM distinct_submissions
), totals AS (
    SELECT "userId", COUNT(*)::integer AS count FROM distinct_submissions GROUP BY "userId"
), updated AS (
    UPDATE "user" SET "printSubmissionCount" = totals.count
    FROM totals WHERE "user"."id" = totals."userId"
)
-- Backfill the achievement silently on the hundredth submission's date.
-- A withdrawn qualifying request has no remaining Story reference.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'hundred-prints:' || ranked."userId", ranked."userId", 'hundred-prints', ranked."submittedAt", "story"."id"
FROM ranked
JOIN "user" ON "user"."id" = ranked."userId"
LEFT JOIN "story" ON "story"."id" = ranked."storyId" AND "story"."uploaderId" = ranked."userId"
WHERE ranked.number = 100
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
