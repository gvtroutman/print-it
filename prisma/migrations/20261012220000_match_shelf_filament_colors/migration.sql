-- Match the owner's Library swatches to the exact filaments they supplied.
-- These are saved catalog styles, so admin previews and future requests use
-- the same colors. Existing story snapshots and availability are untouched.
-- Color sources and the distinction between measured/estimated shades are
-- recorded in docs/material-catalog.md.
DO $$
DECLARE
  filament RECORD;
  shelf RECORD;
  product_url TEXT;
  funfetti_style TEXT := 'radial-gradient(circle at 6px 7px, #ff4fa3 2.4px, transparent 3px) 0 0 / 31px 27px, radial-gradient(circle at 21px 17px, #2fb8e8 2.4px, transparent 3px) 0 0 / 41px 33px, radial-gradient(circle at 13px 24px, #3cc24a 2.4px, transparent 3px) 0 0 / 43px 37px, radial-gradient(circle at 28px 5px, #ffd23f 2.4px, transparent 3px) 0 0 / 37px 43px, radial-gradient(circle at 9px 31px, #2a5bd7 2.4px, transparent 3px) 0 0 / 53px 41px, radial-gradient(circle at 35px 20px, #c2185b 2.4px, transparent 3px) 0 0 / 47px 53px, radial-gradient(circle at 16px 11px, #ff9f1c 2.4px, transparent 3px) 0 0 / 59px 47px, radial-gradient(circle at 3px 3px, #ffffff 2.4px, transparent 3px) 0 0 / 29px 34px, #dfdfd3';
BEGIN
  -- PETG-GF is a separate material from plain PETG. Add it only if absent;
  -- an existing material's availability, ratings and description stay saved.
  INSERT INTO "catalogMaterial" ("id", "name", "sortOrder")
  SELECT 'catalog-material-petg-gf', 'PETG-GF', COALESCE(MAX("sortOrder") + 1, 0)
  FROM "catalogMaterial"
  HAVING NOT EXISTS (
    SELECT 1 FROM "catalogMaterial"
    WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = 'petggf'
  );

  FOR filament IN
    SELECT * FROM (VALUES
      ('pla', 'Green', '#00ae42', '#00ae42', 'solid', 'B0F68ZJ1F1', ARRAY['green', 'bambugreen']),
      ('tpu', 'Black', '#000000', '#000000', 'solid', 'B09Q8RR6KD', ARRAY['black', 'blacktpu', 'tpublack', '95ablack']),
      ('pla', 'Blue gradient', '#99dfea', 'linear-gradient(135deg, #35b8d9 0%, #99dfea 50%, #effbfc 100%)', 'gradient', 'B0D5M58Y3Q', ARRAY['bluegradient', 'gradientblue', 'glacier', 'glaciergradient']),
      ('pla', 'Funfetti', '#dfdfd3', funfetti_style, 'funfetti', 'B0BRTJLMCR', ARRAY['funfetti', 'funfetticlear', 'funfetticlearwithrainbowglitter']),
      ('tpu', 'Pink', '#f092b3', '#f092b3', 'solid', 'B0BN8WPKD7', ARRAY['pink', 'pinktpu', 'tpupink', 'hstpupink']),
      ('petg', 'Space grey', '#80817e', '#80817e', 'solid', 'B07PGXY9Z3', ARRAY['spacegrey', 'spacegray']),
      ('petggf', 'Blue', '#114d94', '#114d94', 'solid', 'B0DPSRL347', ARRAY['blue', 'frostedblue', 'bluepetggf', 'petggfblue', 'petggffrostedblue'])
    ) AS f(material_key, name, hex, style, mode, asin, aliases)
  LOOP
    product_url := 'https://www.amazon.com/dp/' || filament.asin;
    FOR shelf IN
      SELECT "id" FROM "catalogMaterial"
      WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = filament.material_key
    LOOP
      -- Reuse the existing choice (including its name, order and on/off state).
      -- A saved exact product link also identifies a choice renamed by the owner.
      UPDATE "catalogColor"
      SET "hex" = filament.hex,
          "style" = filament.style,
          "mode" = filament.mode::"CatalogColorMode",
          "amazonUrl" = product_url,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "materialId" = shelf."id" AND "mode" <> 'whatever'
        AND (regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = ANY(filament.aliases)
          OR "amazonUrl" ~ ('/dp/' || filament.asin || '([/?#]|$)'));

      IF NOT FOUND THEN
        INSERT INTO "catalogColor" ("id", "materialId", "name", "hex", "style", "mode", "amazonUrl", "sortOrder")
        SELECT 'catalog-color-product-' || md5(shelf."id" || filament.asin),
               shelf."id", filament.name, filament.hex, filament.style,
               filament.mode::"CatalogColorMode", product_url,
               COALESCE(MAX("sortOrder") + 1, 0)
        FROM "catalogColor" WHERE "materialId" = shelf."id";
      END IF;
    END LOOP;
  END LOOP;
END
$$;
