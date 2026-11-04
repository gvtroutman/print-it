-- Retire this achievement, including collected awards and activity announcements.
-- Keep other stickers, notifications, and selected card artwork unchanged.
BEGIN;

UPDATE "user" SET "cardFlair" = NULL WHERE "cardFlair" = 'around-the-world';
UPDATE "user" SET "previewCardFlair" = NULL WHERE "previewCardFlair" = 'around-the-world';
DELETE FROM "notification" WHERE "badgeKey" = 'around-the-world';
DELETE FROM "memberBadge" WHERE "badgeKey" = 'around-the-world';

COMMIT;
