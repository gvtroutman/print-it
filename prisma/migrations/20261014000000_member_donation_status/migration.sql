ALTER TABLE "user" ADD COLUMN "hasDonated" BOOLEAN NOT NULL DEFAULT false;

-- Preserve Store access for members with an existing confirmed $1+ gift.
UPDATE "user" AS member
SET "hasDonated" = true
WHERE EXISTS (
  SELECT 1 FROM "donation" AS gift
  WHERE gift."donorId" = member.id
    AND gift.status = 'Received'
    AND gift."amountCents" >= 100
);
