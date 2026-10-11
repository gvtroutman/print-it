-- Print history from Bambu Cloud for the printer hour meters. Additive only:
-- the image a failed deploy rolls back to never reads these, so leaving them
-- in place is harmless.

-- AlterTable
ALTER TABLE "printer" ADD COLUMN "bambuDeviceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "printer_bambuDeviceId_key" ON "printer"("bambuDeviceId");

-- CreateTable
CREATE TABLE "printerPrint" (
    "id" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "seconds" INTEGER NOT NULL,
    "estimate" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "grams" DOUBLE PRECISION,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printerPrint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printerPrint_printerId_startedAt_idx" ON "printerPrint"("printerId", "startedAt");

-- AddForeignKey
ALTER TABLE "printerPrint" ADD CONSTRAINT "printerPrint_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "bambuLink" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bambuLink_pkey" PRIMARY KEY ("id")
);
