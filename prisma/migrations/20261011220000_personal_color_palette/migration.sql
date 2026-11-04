CREATE TABLE "savedColor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savedColor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "savedColor_hex_check" CHECK ("hex" ~ '^#[0-9a-f]{6}$'),
    CONSTRAINT "savedColor_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
    CONSTRAINT "savedColor_alpha_check" CHECK ("alpha" >= 0 AND "alpha" <= 1)
);

CREATE UNIQUE INDEX "savedColor_userId_hex_alpha_key" ON "savedColor"("userId", "hex", "alpha");

ALTER TABLE "savedColor" ADD CONSTRAINT "savedColor_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
