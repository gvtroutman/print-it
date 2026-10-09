-- Story refs moved from "PPP-104" to "PI-104"; the number is unchanged.
-- Rewrites the refs the audit trail already holds, so old entries read the
-- same as new ones and the dashboard's "entered this column" lookup (keyed on
-- the ref) still finds them. Only exact refs are touched, never free text.
-- Data only: the image a failed deploy rolls back to just shows PI- refs.

UPDATE "auditEvent"
SET "subject" = 'PI-' || substring("subject" from 5)
WHERE "subject" ~ '^PPP-[0-9]+$';

UPDATE "auditEvent"
SET "detail" = jsonb_set("detail", '{from}', to_jsonb('PI-' || substring("detail"->>'from' from 5)))
WHERE jsonb_typeof("detail") = 'object'
  AND "detail"->>'from' ~ '^PPP-[0-9]+$';
