-- Discover Roy G Biv silently for earlier rainbow-filament requests.
-- Only explicit filament labels qualify, never titles, notes, makers or gradients.
WITH raw_requests AS (
    SELECT "uploaderId" AS "userId", "id" AS "storyId", "createdAt" AS "submittedAt",
        "material", ARRAY["material", "swatchType", "colorName"] AS labels
    FROM "story"
    UNION ALL
    SELECT "actorId", substring("subject" from 4)::integer, "at",
        "detail"->>'material', ARRAY["detail"->>'material']
    FROM "auditEvent"
    WHERE "action" IN ('story.created', 'story.requeued')
      AND "actorId" IS NOT NULL AND "subject" ~ '^PI-[0-9]{1,9}$'
      AND jsonb_typeof("detail"->'material') = 'string'
), first_rainbow AS (
    SELECT DISTINCT ON ("userId") "userId", "storyId", "submittedAt"
    FROM raw_requests
    WHERE "material" <> 'Auto' AND EXISTS (
        SELECT 1 FROM unnest(labels) AS candidate(label)
        WHERE label ~* '(^|[^a-z0-9])rainbow([^a-z0-9]|$)'
          AND label !~* '(^|[^a-z0-9])((non|not|no)[-[:space:]]+rainbow|rainbow[-[:space:]]+free)([^a-z0-9]|$)'
    )
    ORDER BY "userId", "submittedAt", "storyId"
)
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'roy-g-biv:' || first_rainbow."userId", first_rainbow."userId",
    'roy-g-biv', first_rainbow."submittedAt", "story"."id"
FROM first_rainbow JOIN "user" ON "user"."id" = first_rainbow."userId"
LEFT JOIN "story" ON "story"."id" = first_rainbow."storyId" AND "story"."uploaderId" = first_rainbow."userId"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
