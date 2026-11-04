-- First print now means printed, rather than submitted. Correct existing
-- awards silently and remove premature announcements. Use the completion
-- audit date where available; updatedAt is the fallback for legacy prints.
BEGIN;

CREATE TEMP TABLE "firstCompletedPrint" ON COMMIT DROP AS
SELECT DISTINCT ON (s."uploaderId")
    s."uploaderId" AS "userId", s."id" AS "storyId",
    COALESCE(completion."at", s."updatedAt") AS "earnedAt"
FROM "story" s
LEFT JOIN LATERAL (
    SELECT MIN(a."at") AS "at"
    FROM "auditEvent" a
    WHERE a."action" = 'story.status_changed'
      AND a."subject" = 'PI-' || s."id"
      AND a."detail"->>'to' IN ('Delivery', 'Done')
) completion ON true
WHERE s."status" IN ('Delivery', 'Done')
ORDER BY s."uploaderId", COALESCE(completion."at", s."updatedAt"), s."id";

DELETE FROM "notification" n
WHERE n."badgeKey" = 'first-print'
  AND NOT EXISTS (SELECT 1 FROM "firstCompletedPrint" c WHERE c."userId" = n."recipientId");

DELETE FROM "memberBadge" b
WHERE b."badgeKey" = 'first-print'
  AND NOT EXISTS (SELECT 1 FROM "firstCompletedPrint" c WHERE c."userId" = b."userId");

INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'first-print:' || "userId", "userId", 'first-print', "earnedAt", "storyId"
FROM "firstCompletedPrint"
ON CONFLICT ("userId", "badgeKey") DO UPDATE
SET "earnedAt" = EXCLUDED."earnedAt", "storyId" = EXCLUDED."storyId";

UPDATE "notification" n
SET "text" = 'Sticker earned: First completed print! Your first print is complete.',
    "createdAt" = c."earnedAt"
FROM "firstCompletedPrint" c
WHERE n."badgeKey" = 'first-print' AND n."recipientId" = c."userId";

COMMIT;
