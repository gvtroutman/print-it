-- The owner's own 1-5 marks for the upload form's comparison chart, one per
-- trait. Null means the built-in filament table's mark stands (see
-- src/lib/filament-traits.ts), so every existing row keeps its table marks.
ALTER TABLE "catalogMaterial"
  ADD COLUMN "strength" INTEGER,
  ADD COLUMN "flex" INTEGER,
  ADD COLUMN "heat" INTEGER,
  ADD COLUMN "finish" INTEGER,
  ADD COLUMN "outdoors" INTEGER;
