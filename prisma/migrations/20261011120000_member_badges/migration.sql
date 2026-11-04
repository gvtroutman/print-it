CREATE TABLE "memberBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storyId" INTEGER,

    CONSTRAINT "memberBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memberBadge_userId_badgeKey_key" ON "memberBadge"("userId", "badgeKey");
CREATE INDEX "memberBadge_storyId_idx" ON "memberBadge"("storyId");

ALTER TABLE "memberBadge" ADD CONSTRAINT "memberBadge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberBadge" ADD CONSTRAINT "memberBadge_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification" ADD COLUMN "badgeKey" TEXT;

-- Existing members earned the sticker when they first submitted a request.
-- Backfill silently, using the original submission date rather than today.
INSERT INTO "memberBadge" ("id", "userId", "badgeKey", "earnedAt", "storyId")
SELECT 'first-print:' || first."uploaderId", first."uploaderId", 'first-print', first."createdAt", first."id"
FROM (
    SELECT DISTINCT ON ("uploaderId") "uploaderId", "createdAt", "id"
    FROM "story"
    ORDER BY "uploaderId", "createdAt", "id"
) AS first;
