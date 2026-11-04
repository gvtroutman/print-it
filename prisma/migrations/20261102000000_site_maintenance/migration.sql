CREATE TABLE "siteMaintenance" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "siteMaintenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "siteMaintenance_singleton" CHECK ("id" = 'site')
);
