-- Unknown historical usage stays null: weights and model dimensions cannot
-- establish actual extruded length. Completed requests can be logged later.
ALTER TABLE "story" ADD COLUMN "filamentMeters" DECIMAL(12,3);
ALTER TABLE "story" ADD CONSTRAINT "story_filamentMeters_range"
    CHECK ("filamentMeters" >= 0 AND "filamentMeters" <= 1000000);
