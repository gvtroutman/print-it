-- One optional sticker per account. Replacing the key replaces the sticker.
ALTER TABLE "user" ADD COLUMN "cardFlair" TEXT;
