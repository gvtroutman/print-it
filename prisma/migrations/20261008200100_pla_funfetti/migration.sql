-- Funfetti PLA: clear with coloured flakes. It goes just before "Whatever's on"
-- (the whatever rows move down one), or last if PLA has no whatever row.
-- The style is funfettiStyle(FUNFETTI_CLEAR) from src/lib/catalog.ts.
UPDATE "catalogColor" c
SET "sortOrder" = c."sortOrder" + 1
FROM "catalogMaterial" m
WHERE c."materialId" = m."id" AND m."name" = 'PLA' AND c."mode" = 'whatever'
  AND NOT EXISTS (SELECT 1 FROM "catalogColor" x WHERE x."materialId" = m."id" AND x."name" = 'Funfetti');

INSERT INTO "catalogColor" ("id", "materialId", "name", "hex", "style", "mode", "sortOrder")
SELECT 'catalog-color-pla-funfetti', m."id", 'Funfetti', '#cfd4d8',
       'radial-gradient(circle at 6px 7px, #ff4fa3 2.4px, transparent 3px) 0 0 / 31px 27px, radial-gradient(circle at 21px 17px, #2fb8e8 2.4px, transparent 3px) 0 0 / 41px 33px, radial-gradient(circle at 13px 24px, #3cc24a 2.4px, transparent 3px) 0 0 / 43px 37px, radial-gradient(circle at 28px 5px, #ffd23f 2.4px, transparent 3px) 0 0 / 37px 43px, radial-gradient(circle at 9px 31px, #2a5bd7 2.4px, transparent 3px) 0 0 / 53px 41px, radial-gradient(circle at 35px 20px, #c2185b 2.4px, transparent 3px) 0 0 / 47px 53px, radial-gradient(circle at 16px 11px, #ff9f1c 2.4px, transparent 3px) 0 0 / 59px 47px, radial-gradient(circle at 3px 3px, #ffffff 2.4px, transparent 3px) 0 0 / 29px 34px, repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0 4px, rgba(255,255,255,0.55) 5px, rgba(255,255,255,0) 6px), #cfd4d8',
       'funfetti',
       COALESCE(
         (SELECT MIN(c."sortOrder") - 1 FROM "catalogColor" c WHERE c."materialId" = m."id" AND c."mode" = 'whatever'),
         (SELECT MAX(c."sortOrder") + 1 FROM "catalogColor" c WHERE c."materialId" = m."id"),
         0)
FROM "catalogMaterial" m
WHERE m."name" = 'PLA'
ON CONFLICT ("materialId", "name") DO NOTHING;
