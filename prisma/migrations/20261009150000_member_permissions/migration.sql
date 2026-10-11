-- Two switches the printer owner can flip per member from the guest list:
-- whether they may sign another device in for themselves, and whether they
-- may invite somebody. Off for everybody who is already here.
ALTER TABLE "user" ADD COLUMN "canAddDevice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "canAddMember" BOOLEAN NOT NULL DEFAULT false;
