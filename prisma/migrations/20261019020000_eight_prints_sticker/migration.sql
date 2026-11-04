-- Eight completed prints earn the eight-spool Leaning Tower of Pisa sticker.
-- Delivery and Done count once per request, regardless of quantity or filament.
-- Historical completion times are unavailable, so backfill uses rollout time.
-- Credit existing progress silently; reruns preserve existing awards and dates.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'eight-prints:' || "uploaderId", "uploaderId", 'eight-prints', CURRENT_TIMESTAMP,
       (array_agg("id" ORDER BY "updatedAt" DESC, "id" DESC))[1]
FROM "story"
WHERE "status" IN ('Delivery', 'Done')
GROUP BY "uploaderId"
HAVING COUNT(*) >= 8
ON CONFLICT ("userId", "badgeKey") DO NOTHING;
