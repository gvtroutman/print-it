-- A request no longer needs a model: a few words saying what is wanted is
-- enough to open a ticket, and the owner can ask for a file in the
-- conversation. The main model's columns become optional; every row filed
-- before keeps its file.
ALTER TABLE "story" ALTER COLUMN "filename" DROP NOT NULL;
ALTER TABLE "story" ALTER COLUMN "fileSize" DROP NOT NULL;
ALTER TABLE "story" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "story" ALTER COLUMN "storageKey" DROP NOT NULL;
