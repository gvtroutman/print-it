-- A ticket can ask for a spool the owner does not have but can buy, picked
-- from the filamentcolors.xyz library. Four nullable snapshot columns, null
-- for every existing ticket (all shelf colours). Additive only: the image a
-- failed deploy rolls back to never reads or writes them.

ALTER TABLE "story" ADD COLUMN "swatchId" INTEGER;
ALTER TABLE "story" ADD COLUMN "swatchMaker" TEXT;
ALTER TABLE "story" ADD COLUMN "swatchType" TEXT;
ALTER TABLE "story" ADD COLUMN "swatchBuyUrl" TEXT;
