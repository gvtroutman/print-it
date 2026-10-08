-- Funfetti swatches drop the white lines across the winding: just sprinkles
-- over the base now. Stripped from every saved funfetti style, catalogue rows
-- and the copies on stories alike, whatever their base colour.
UPDATE "catalogColor"
SET "style" = replace("style", ', repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0 4px, rgba(255,255,255,0.55) 5px, rgba(255,255,255,0) 6px)', '')
WHERE "mode" = 'funfetti';

UPDATE "story"
SET "colorStyle" = replace("colorStyle", ', repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0 4px, rgba(255,255,255,0.55) 5px, rgba(255,255,255,0) 6px)', '')
WHERE "colorMode" = 'funfetti' AND "colorStyle" IS NOT NULL;
