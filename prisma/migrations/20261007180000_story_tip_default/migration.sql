-- Requests no longer offer the owner anything in return, so new tickets leave
-- the tip out and it falls back to "". Old tickets keep what they offered.
--
-- A default only, on purpose: the deploy wizard rolls back to the previous
-- image when a deploy fails its health check, and it does not undo
-- migrations. That image still writes a tip on every ticket and still reads
-- the benefit table, so neither the column nor the table is dropped here.
ALTER TABLE "story" ALTER COLUMN "tip" SET DEFAULT '';
