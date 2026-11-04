ALTER TABLE "user" ADD COLUMN "fiberSubmissionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "requestedMaterialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Recover known material history, including withdrawn requests whose audit
-- entries retained the material. Old reprints without a material snapshot
-- cannot safely be inferred. Catalog identities keep credit through renames.
WITH RECURSIVE aliases AS (
    SELECT "id" AS "materialId", "name" FROM "catalogMaterial" WHERE "name" <> 'Auto'
    UNION
    SELECT aliases."materialId", audit."detail"->>'previousName'
    FROM aliases JOIN "auditEvent" audit ON audit."subject" = aliases."name"
    WHERE audit."action" = 'catalog.material_updated'
      AND jsonb_typeof(audit."detail"->'previousName') = 'string'
), raw_submissions AS (
    SELECT "uploaderId" AS "userId", "id" AS "storyId", "material", "createdAt" AS "submittedAt", 0 AS source
    FROM "story"
    UNION ALL
    SELECT "actorId", substring("subject" from 4)::integer, "detail"->>'material', "at", 1
    FROM "auditEvent"
    WHERE "action" IN ('story.created', 'story.requeued')
      AND "actorId" IS NOT NULL AND "subject" ~ '^PI-[0-9]{1,9}$'
      AND jsonb_typeof("detail"->'material') = 'string'
), submissions AS (
    SELECT DISTINCT ON ("userId", "storyId") "userId", "storyId", "material", "submittedAt"
    FROM raw_submissions ORDER BY "userId", "storyId", source, "submittedAt"
), requested AS (
    SELECT submissions."userId", ARRAY_AGG(DISTINCT aliases."materialId") AS ids
    FROM submissions JOIN aliases ON aliases."name" = submissions."material"
    GROUP BY submissions."userId"
), fiber_totals AS (
    SELECT "userId", COUNT(*) FILTER (
        WHERE "material" ~* '(^|[^a-z0-9])(cf[0-9]*|gf[0-9]*|carbon|glass|fib(er|re)(glass)?)([^a-z0-9]|$)'
    )::integer AS count
    FROM submissions GROUP BY "userId"
), updated AS (
    UPDATE "user" SET "fiberSubmissionCount" = fiber_totals.count,
        "requestedMaterialIds" = COALESCE(requested.ids, ARRAY[]::TEXT[])
    FROM fiber_totals LEFT JOIN requested ON requested."userId" = fiber_totals."userId"
    WHERE "user"."id" = fiber_totals."userId"
), available AS (
    SELECT "id" FROM "catalogMaterial" material
    WHERE material."active" AND material."name" <> 'Auto'
      AND EXISTS (SELECT 1 FROM "catalogColor" color WHERE color."materialId" = material."id" AND color."active")
), first_material_requests AS (
    SELECT DISTINCT ON (submissions."userId", aliases."materialId")
        submissions."userId", aliases."materialId", submissions."storyId", submissions."submittedAt"
    FROM submissions JOIN aliases ON aliases."name" = submissions."material"
    ORDER BY submissions."userId", aliases."materialId", submissions."submittedAt", submissions."storyId"
), explorers AS (
    SELECT "userId" FROM first_material_requests JOIN available ON available."id" = first_material_requests."materialId"
    GROUP BY "userId" HAVING COUNT(*) > 0 AND COUNT(*) = (SELECT COUNT(*) FROM available)
), material_awards AS (
    SELECT DISTINCT ON (requests."userId") requests."userId", requests."storyId", requests."submittedAt"
    FROM first_material_requests requests JOIN available ON available."id" = requests."materialId"
    JOIN explorers ON explorers."userId" = requests."userId"
    ORDER BY requests."userId", requests."submittedAt" DESC, requests."storyId" DESC
), fiber_ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "submittedAt", "storyId") AS number
    FROM submissions
    WHERE "material" ~* '(^|[^a-z0-9])(cf[0-9]*|gf[0-9]*|carbon|glass|fib(er|re)(glass)?)([^a-z0-9]|$)'
), awards AS (
    SELECT "userId", "storyId", "submittedAt", 'material-explorer' AS key FROM material_awards
    UNION ALL
    SELECT "userId", "storyId", "submittedAt", 'daily-fiber' FROM fiber_ranked WHERE number = 5
)
-- Existing achievements use the qualifying request's date, silently.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT awards.key || ':' || awards."userId", awards."userId", awards.key, awards."submittedAt", "story"."id"
FROM awards JOIN "user" ON "user"."id" = awards."userId"
LEFT JOIN "story" ON "story"."id" = awards."storyId" AND "story"."uploaderId" = awards."userId"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
