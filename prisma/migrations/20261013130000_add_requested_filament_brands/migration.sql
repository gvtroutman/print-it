-- Enable the requested brands on existing installations while preserving saved settings.
INSERT INTO "filamentBrand" ("id", "name", "key", "aliases", "updatedAt") VALUES
('brand_hatchbox', 'HATCHBOX', 'hatchbox', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_protopasta', 'Protopasta', 'protopasta', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_prusament', 'Prusament', 'prusament', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_colorfabb', 'colorFabb', 'colorfabb', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
('brand_matterhackers', 'MatterHackers', 'matterhackers', ARRAY[]::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
