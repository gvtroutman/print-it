ALTER TABLE "story" ADD COLUMN "preparedAt" TIMESTAMP(3);
ALTER TABLE "printerPrint" ADD COLUMN "storyId" INTEGER;
CREATE INDEX "printerPrint_storyId_idx" ON "printerPrint"("storyId");
ALTER TABLE "printerPrint" ADD CONSTRAINT "printerPrint_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE SET NULL ON UPDATE CASCADE;
