-- Photos, videos and extra models sent with an order, and the links that go
-- with it. The main model stays on "story", so nothing that reads it changes.
--
-- Additive on purpose, like story_source_url: the deploy wizard rolls back to
-- the previous image when a deploy fails its health check and does not undo
-- migrations. That image's client names its columns and has never heard of a
-- new table, so it reads and writes tickets exactly as before.

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('model', 'image', 'video');

-- AlterTable
ALTER TABLE "story" ADD COLUMN     "links" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "storyAttachment" (
    "id" TEXT NOT NULL,
    "storyId" INTEGER NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "dims" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storyAttachment_storyId_idx" ON "storyAttachment"("storyId");

-- AddForeignKey
ALTER TABLE "storyAttachment" ADD CONSTRAINT "storyAttachment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
