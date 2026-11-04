-- Remove the retired material stickers and their profile selections/activity.
BEGIN;
UPDATE "user" SET "cardFlair" = NULL WHERE "cardFlair" IN ('abs-brick', 'asa-sun', 'nylon-gear', 'pc-shield', 'hips-support');
UPDATE "user" SET "previewCardFlair" = NULL WHERE "previewCardFlair" IN ('abs-brick', 'asa-sun', 'nylon-gear', 'pc-shield', 'hips-support');
DELETE FROM "notification" WHERE "badgeKey" IN ('abs-brick', 'asa-sun', 'nylon-gear', 'pc-shield', 'hips-support');
DELETE FROM "memberBadge" WHERE "badgeKey" IN ('abs-brick', 'asa-sun', 'nylon-gear', 'pc-shield', 'hips-support');
COMMIT;
