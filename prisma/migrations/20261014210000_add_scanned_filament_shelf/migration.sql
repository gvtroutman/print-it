-- Add the owner's October 14 scans as distinct, brand-labeled shelf choices.
-- Existing shelf colors and historical request snapshots are retained.
INSERT INTO "filamentBrand" ("id", "name", "key", "aliases", "updatedAt")
VALUES ('brand_justmaker', 'Justmaker', 'justmaker', ARRAY[]::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

DO $$
DECLARE
  sample RECORD;
  shelf_material_id TEXT;
BEGIN
  FOR sample IN
    SELECT * FROM (VALUES
      ('petg', 'PETG', 'IEMAI White', '#e1e0e3', 'catalog-color-iemai-petg-white'),
      ('pla', 'PLA', 'Justmaker Bronze (Silk)', '#796a6f', 'catalog-color-justmaker-silk-pla-bronze'),
      ('petg', 'PETG', 'IEMAI Black', '#1d1c1f', 'catalog-color-iemai-petg-black'),
      ('pla', 'PLA', 'Bambu Lab Green', '#00a256', 'catalog-color-bambu-lab-pla-green')
    ) AS s(material_key, material_name, name, hex, id)
  LOOP
    shelf_material_id := NULL;
    SELECT "id" INTO shelf_material_id
    FROM "catalogMaterial"
    WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = sample.material_key
    ORDER BY "active" DESC, "createdAt", "id"
    LIMIT 1;

    IF shelf_material_id IS NULL THEN
      INSERT INTO "catalogMaterial" ("id", "name", "sortOrder", "updatedAt")
      SELECT 'catalog-material-' || sample.material_key, sample.material_name,
        COALESCE(MAX("sortOrder") + 1, 0), CURRENT_TIMESTAMP
      FROM "catalogMaterial"
      RETURNING "id" INTO shelf_material_id;
    END IF;

    UPDATE "catalogMaterial"
    SET "active" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = shelf_material_id AND "active" = FALSE;

    INSERT INTO "catalogColor"
      ("id", "materialId", "name", "hex", "style", "mode", "sortOrder", "updatedAt")
    SELECT sample.id, shelf_material_id, sample.name, sample.hex, sample.hex,
      'solid', COALESCE(MAX("sortOrder") + 1, 0), CURRENT_TIMESTAMP
    FROM "catalogColor"
    WHERE "materialId" = shelf_material_id
    ON CONFLICT ("materialId", "name") DO UPDATE
      SET "active" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;
  END LOOP;
END $$;
