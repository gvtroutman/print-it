-- Give earlier requests their material stickers without notification spam.
-- Saved spool type wins over a broad shelf name. Never infer a material from
-- a title, note, maker or color name. Audit records recover withdrawn requests.
WITH aliases(family, alias, priority) AS (VALUES
    ('PLA', 'pla', 0),
    ('PLA', 'pla+', 1),
    ('PLA', 'tough pla', 2),
    ('PETG', 'petg', 3),
    ('PETG', 'pet', 4),
    ('PETG', 'pctg', 5),
    ('PETG', 'cpe', 6),
    ('PETG', 'cope', 7),
    ('PETG', 'copolyester', 8),
    ('PETG', 'co polyester', 9),
    ('ABS', 'abs', 10),
    ('ASA', 'asa', 11),
    ('TPU', 'tpu', 12),
    ('TPU', 'tpe', 13),
    ('TPU', 'flex', 14),
    ('TPU', 'flexible', 15),
    ('Nylon', 'nylon', 16),
    ('Nylon', 'pa', 17),
    ('Nylon', 'pa6', 18),
    ('Nylon', 'pa12', 19),
    ('Nylon', 'paht', 20),
    ('PC', 'pc', 21),
    ('PC', 'polycarbonate', 22),
    ('Resin', 'resin', 23),
    ('Resin', 'sla', 24),
    ('Resin', 'msla', 25),
    ('HIPS', 'hips', 26)
), goals(family, key) AS (VALUES
    ('PLA', 'pla-corn'),
    ('PETG', 'petg-bottle'),
    ('ABS', 'abs-brick'),
    ('ASA', 'asa-sun'),
    ('TPU', 'tpu-flex'),
    ('Nylon', 'nylon-gear'),
    ('PC', 'pc-shield'),
    ('HIPS', 'hips-support')
), requests AS (
  SELECT "uploaderId" AS "userId", "id" AS "storyId", "createdAt" AS "submittedAt", "material", "swatchType"
  FROM "story"
  UNION ALL
  SELECT "actorId", substring("subject" from 4)::integer, "at", "detail"->>'material', NULL
  FROM "auditEvent"
  WHERE "action" IN ('story.created', 'story.requeued')
    AND "actorId" IS NOT NULL AND "subject" ~ '^PI-[0-9]{1,9}$'
    AND jsonb_typeof("detail"->'material') = 'string'
    -- Live records have the more specific spool type; don't award both labels.
    AND NOT EXISTS (SELECT 1 FROM "story" s WHERE s."id" = substring("subject" from 4)::integer AND s."uploaderId" = "actorId")
), matched AS (
  SELECT r.*, match.family
  FROM requests r
  CROSS JOIN LATERAL (
    SELECT a.family
    FROM (VALUES (r."swatchType", 0), (r."material", 1)) AS labels(label, priority)
    JOIN aliases a ON (' ' || trim(regexp_replace(lower(labels.label), '[^a-z0-9+]+', ' ', 'g')) || ' ') LIKE ('% ' || a.alias || ' %')
    ORDER BY labels.priority, length(a.alias) DESC, a.priority
    LIMIT 1
  ) AS match
  WHERE lower(trim(r."material")) <> 'auto'
), first_requests AS (
  SELECT DISTINCT ON (m."userId", g.key) m."userId", m."storyId", m."submittedAt", g.key
  FROM matched m JOIN goals g ON g.family = m.family
  ORDER BY m."userId", g.key, m."submittedAt", m."storyId"
)
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT f.key || ':' || f."userId", f."userId", f.key, f."submittedAt", s."id"
FROM first_requests f JOIN "user" u ON u."id" = f."userId"
LEFT JOIN "story" s ON s."id" = f."storyId" AND s."uploaderId" = f."userId"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
