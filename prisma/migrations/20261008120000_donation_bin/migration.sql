-- The donation bin. Additive only: the image a failed deploy rolls back to
-- never reads these tables, so leaving them in place is harmless.

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('Pledged', 'Received', 'Declined');

-- CreateTable
CREATE TABLE "donationBin" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goalCents" INTEGER NOT NULL,
    "url" TEXT,
    "payUrl" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donationBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation" (
    "id" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "donorId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "DonationStatus" NOT NULL DEFAULT 'Pledged',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "kofiTransactionId" TEXT,

    CONSTRAINT "donation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donation_binId_status_idx" ON "donation"("binId", "status");

-- CreateIndex
CREATE INDEX "donation_donorId_idx" ON "donation"("donorId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_kofiTransactionId_key" ON "donation"("kofiTransactionId");

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_binId_fkey" FOREIGN KEY ("binId") REFERENCES "donationBin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The first bin: Bambu Lab's launch price, before tax and shipping. The
-- money goes through the owner's Ko-fi page.
INSERT INTO "donationBin" ("id", "title", "goalCents", "url", "payUrl")
VALUES (
    'h2d-laser-40w',
    'Bambu Lab H2D Laser Full Combo (40W)',
    349900,
    'https://us.store.bambulab.com/products/h2d',
    'https://ko-fi.com/gvtroutman'
);
