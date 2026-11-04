-- Keep the owner's member-preview icon separate from their admin icon.
ALTER TABLE "user" ADD COLUMN "previewCardFlair" TEXT;
