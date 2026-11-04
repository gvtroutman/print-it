-- Enable Geeetech on existing installations without changing saved brand settings.
INSERT INTO "filamentBrand" ("id", "name", "key", "aliases", "updatedAt")
VALUES ('brand_geeetech', 'Geeetech', 'geeetech', ARRAY[]::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
