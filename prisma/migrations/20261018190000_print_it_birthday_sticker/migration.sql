-- Our first Print It! change was bc97e1c on October 6, 2026 (Eastern).
-- Celebrate annually from the founding date. Credit the earliest qualifying
-- request silently, preserving existing awards and their dates.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT DISTINCT ON ("uploaderId")
       'holiday:print-it-birthday:' || "uploaderId", "uploaderId", 'print-it-birthday', "createdAt", "id"
FROM "story"
WHERE to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'MM-DD') = '10-06'
  AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date >= DATE '2026-10-06'
ORDER BY "uploaderId", "createdAt", "id"
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
