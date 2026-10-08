-- What each material is, for the person choosing one on the upload form.
-- The four materials the catalog started with get a first description; the
-- printer owner edits these (and writes their own) on /admin/catalog.
ALTER TABLE "catalogMaterial" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

UPDATE "catalogMaterial" m
SET "description" = d.description
FROM (VALUES
  ('PLA', 'The everyday plastic. Crisp detail and bright colors, stiff but a little brittle, and it goes soft in a hot car. Great for figures, desk toys and anything that lives indoors.'),
  ('PETG', 'Tougher than PLA: it bends a little instead of snapping, and shrugs off heat, sun and water. Good for hooks, brackets, clips and anything that gets used.'),
  ('TPU', 'Rubbery and squishy: it bends, stretches and bounces back. For phone cases, bumpers, grippy feet and gaskets.'),
  ('Resin', 'Liquid cured by light, for the finest detail and the smoothest surfaces. Best for minis and small models; more brittle than filament and not for outdoors.')
) AS d(name, description)
WHERE m."name" = d.name AND m."description" = '';
