-- Story refs no longer add 100 to the id: story 4 was "PI-104" and is now
-- "PI-4". Rewrites the refs the audit trail already holds, so old entries
-- read the same as new ones and the dashboard's "entered this column" lookup
-- (keyed on the ref) still finds them. Only exact refs are touched, never free
-- text. Every old ref is above PI-100, so nothing is shifted twice. The CASE
-- keeps the cast away from subjects that are not refs (emails and the like).
-- Data only: the image a failed deploy rolls back to just shows short refs.

UPDATE "auditEvent"
SET "subject" = 'PI-' || (substring("subject" from 4)::int - 100)
WHERE CASE WHEN "subject" ~ '^PI-[0-9]{1,9}$'
           THEN substring("subject" from 4)::int > 100
           ELSE false END;

UPDATE "auditEvent"
SET "detail" = jsonb_set("detail", '{from}', to_jsonb('PI-' || (substring("detail"->>'from' from 4)::int - 100)))
WHERE CASE WHEN jsonb_typeof("detail") = 'object' AND "detail"->>'from' ~ '^PI-[0-9]{1,9}$'
           THEN substring("detail"->>'from' from 4)::int > 100
           ELSE false END;
