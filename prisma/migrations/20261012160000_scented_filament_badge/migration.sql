-- Discover the sticker silently for earlier explicitly scented requests.
-- Audit material snapshots can also recover withdrawn requests; never infer
-- scent from a rose/coffee colour, a manufacturer, or a requester's note.
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
), first_scented AS (
    SELECT DISTINCT ON ("userId") "userId", "storyId", "submittedAt"
    FROM raw_requests
    WHERE "material" <> 'Auto' AND EXISTS (
        SELECT 1 FROM unnest(labels) AS candidate(label)
        WHERE label ~* '(^|[^a-z0-9])scent(ed)?([^a-z0-9]|$)'
          AND label !~* '(^|[^a-z0-9])(unscented|(non|not)[-[:space:]]+scented|(scent|fragrance)[-[:space:]]+free|no[-[:space:]]+scent)([^a-z0-9]|$)'
    )
    ORDER BY "userId", "submittedAt", "storyId"
)
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'stop-and-smell-the-filament:' || first_scented."userId", first_scented."userId",
    'stop-and-smell-the-filament', first_scented."submittedAt", "story"."id"
FROM first_scented JOIN "user" ON "user"."id" = first_scented."userId"
LEFT JOIN "story" ON "story"."id" = first_scented."storyId" AND "story"."uploaderId" = first_scented."userId"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
