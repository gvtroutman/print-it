-- Add the owner's scanned CoPE White as its own shelf choice.
DO $$
DECLARE
  cope_material_id TEXT;
BEGIN
  SELECT "id" INTO cope_material_id
  FROM "catalogMaterial"
  WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = 'cope'
  ORDER BY "active" DESC, "createdAt", "id"
  LIMIT 1;

  IF cope_material_id IS NULL THEN
    INSERT INTO "catalogMaterial" ("id", "name", "sortOrder", "updatedAt")
    SELECT 'catalog-material-cope', 'CoPE', COALESCE(MAX("sortOrder") + 1, 0), CURRENT_TIMESTAMP
    FROM "catalogMaterial"
    RETURNING "id" INTO cope_material_id;
  END IF;

  UPDATE "catalogMaterial"
  SET "active" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = cope_material_id AND "active" = FALSE;

  INSERT INTO "catalogColor"
    ("id", "materialId", "name", "hex", "style", "mode", "sortOrder", "updatedAt")
  SELECT 'catalog-color-cope-white', cope_material_id, 'CoPE White',
    '#efebec', '#efebec', 'solid', COALESCE(MAX("sortOrder") + 1, 0), CURRENT_TIMESTAMP
  FROM "catalogColor"
  WHERE "materialId" = cope_material_id
  ON CONFLICT ("materialId", "name") DO UPDATE
    SET "active" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;
END $$;
