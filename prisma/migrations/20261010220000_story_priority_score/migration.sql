-- Priority becomes a number, 1 (the turtle: whenever) to 100 (the rabbit:
-- now), set on a slider instead of picked from three steps.
--
-- A new column rather than a change of type, so the previous image is
-- untouched by it: its client still reads and writes the enum in "priority",
-- and an auto-rollback after this migrator has run lands on a table it
-- understands. The new image keeps "priority" in step (low/medium/high by
-- thirds), so a rollback also sees roughly what was asked for. The enum can
-- be dropped once there is no image left to roll back to that reads it.
ALTER TABLE "story" ADD COLUMN "priority_score" INTEGER NOT NULL DEFAULT 50;

-- Every ticket filed so far, at the middle of its old step.
UPDATE "story" SET "priority_score" = CASE "priority"
  WHEN 'low' THEN 25
  WHEN 'high' THEN 75
  ELSE 50
END;

ALTER TABLE "story" ADD CONSTRAINT "story_priority_score_range"
  CHECK ("priority_score" BETWEEN 1 AND 100);
