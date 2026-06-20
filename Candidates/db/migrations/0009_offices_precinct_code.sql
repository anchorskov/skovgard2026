-- 0009_offices_precinct_code.sql
-- Add structured precinct targeting for precinct committee offices.
-- Data backfill lives in db/seed/offices_precinct_code_title_backfill.sql
-- because county source title formats vary and need reviewable parser output.

ALTER TABLE offices ADD COLUMN precinct_code TEXT;

CREATE INDEX IF NOT EXISTS idx_offices_precinct_scope
  ON offices(LOWER(county), precinct_code, scope_kind);
