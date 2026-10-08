-- Sprinkles over a base colour, for clear filament with coloured flakes in it.
-- On its own: a new enum value can't be used in the transaction that adds it.
ALTER TYPE "CatalogColorMode" ADD VALUE 'funfetti';
