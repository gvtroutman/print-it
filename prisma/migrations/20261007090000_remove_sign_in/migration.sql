-- Remove sign-in.
--
-- People now pick their name on /hello and the printer owner unlocks the
-- owner pages with ADMIN_PASSWORD, so Better Auth's tables and the invite
-- table have nothing left to hold. Dropping a column also drops the indexes
-- and foreign keys built on it (user_username_key, user_invitedById_fkey).
--
-- This is one-way: an image from before this migration cannot run against
-- the database afterwards, so do not roll a deployment back past it.

DROP TABLE "session";
DROP TABLE "account";
DROP TABLE "verification";
DROP TABLE "passkey";
DROP TABLE "rateLimit";
DROP TABLE "invite";

ALTER TABLE "user"
  DROP COLUMN "emailVerified",
  DROP COLUMN "image",
  DROP COLUMN "username",
  DROP COLUMN "displayUsername",
  DROP COLUMN "invitedById",
  DROP COLUMN "banned",
  DROP COLUMN "banReason",
  DROP COLUMN "banExpires",
  ALTER COLUMN "email" DROP NOT NULL;

-- The trail names people now. Rows whose actor still exists get that name;
-- the rest keep the address they were written with.
ALTER TABLE "auditEvent" RENAME COLUMN "actorEmail" TO "actorName";

UPDATE "auditEvent" AS e
   SET "actorName" = u."name"
  FROM "user" AS u
 WHERE e."actorId" = u."id";
