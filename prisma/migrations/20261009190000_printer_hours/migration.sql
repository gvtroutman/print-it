-- Printer hour meters. Additive only: the image a failed deploy rolls back to
-- never reads these tables, so leaving them in place is harmless.

-- CreateTable
CREATE TABLE "printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printerReading" (
    "id" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printerReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printerReading_printerId_createdAt_idx" ON "printerReading"("printerId", "createdAt");

-- AddForeignKey
ALTER TABLE "printerReading" ADD CONSTRAINT "printerReading_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The machine by the window. No reading yet: the owner logs the first one.
INSERT INTO "printer" ("id", "name") VALUES ('p1s-combo', 'Bambu Lab P1S Combo');
