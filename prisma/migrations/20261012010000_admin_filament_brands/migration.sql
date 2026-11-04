CREATE TABLE "filamentBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "filamentBrand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "filamentBrand_key_key" ON "filamentBrand"("key");

CREATE TABLE "filamentListing" (
    "id" SERIAL NOT NULL,
    "brandId" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "amazonUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "filamentListing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "filamentListing_id_range" CHECK ("id" > 0 AND "id" < 1147483647),
    CONSTRAINT "filamentListing_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "filamentBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "filamentListing_sourceId_key" ON "filamentListing"("sourceId");
CREATE INDEX "filamentListing_brandId_active_idx" ON "filamentListing"("brandId", "active");

-- Preserve the owner's existing choices once. Subsequent changes belong to the admin.
INSERT INTO "filamentBrand" ("id", "name", "key", "aliases", "updatedAt") VALUES
('brand_elegoo', 'ELEGOO', 'elegoo', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_iemai', 'IEMAI', 'iemai', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_overture', 'Overture', 'overture', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_polymaker', 'Polymaker', 'polymaker', ARRAY['Panchroma', 'Fiberon', 'PolyLite', 'PolyFlex', 'PolyMide', 'PolySonic']::TEXT[], CURRENT_TIMESTAMP),
('brand_sunlu', 'SUNLU', 'sunlu', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_esun', 'eSUN', 'esun', ARRAY['eSUN 3D']::TEXT[], CURRENT_TIMESTAMP),
('brand_pinball', 'Pinball', 'pinball', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_jayo', 'JAYO', 'jayo', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_cookiecad', 'Cookiecad', 'cookiecad', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_3dhojor', '3DHoJor', '3dhojor', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_tinmorry', 'TINMORRY', 'tinmorry', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_amolen', 'AMOLEN', 'amolen', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_bambulab', 'Bambu Lab', 'bambulab', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_voxelab', 'Voxelab', 'voxelab', ARRAY['Voxel Lab']::TEXT[], CURRENT_TIMESTAMP),
('brand_creality', 'Creality', 'creality', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_giantarm', 'GIANTARM', 'giantarm', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_anycubic', 'Anycubic', 'anycubic', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_flashforge', 'Flashforge', 'flashforge', ARRAY['Flashforge 3D']::TEXT[], CURRENT_TIMESTAMP),
('brand_yoopai', 'YOOPAI', 'yoopai', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_eryone', 'Eryone', 'eryone', ARRAY[]::TEXT[], CURRENT_TIMESTAMP);
