-- 0004_offices_expand.sql
-- Add new columns to offices and candidates for county/municipal/precinct data.
-- Uses ALTER TABLE ADD COLUMN only — no table recreation needed.
-- The existing level CHECK constraint ('federal'|'statewide'|'wy_senate'|'wy_house'|'county'|'city')
-- already covers the new data: county races → 'county', municipal → 'city'.
-- Finer distinctions (precinct_committee, special_district) live in scope_kind.

ALTER TABLE offices ADD COLUMN county           TEXT;
ALTER TABLE offices ADD COLUMN municipality     TEXT;
ALTER TABLE offices ADD COLUMN ballot_party     TEXT;
ALTER TABLE offices ADD COLUMN seats_available  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE offices ADD COLUMN scope_kind       TEXT;
ALTER TABLE offices ADD COLUMN contest_type     TEXT NOT NULL DEFAULT 'candidate_race';
ALTER TABLE offices ADD COLUMN ward             TEXT;
ALTER TABLE offices ADD COLUMN external_race_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offices_external_race
  ON offices(external_race_id) WHERE external_race_id IS NOT NULL;

ALTER TABLE candidates ADD COLUMN external_candidate_id TEXT;
ALTER TABLE candidates ADD COLUMN ballot_name           TEXT;
ALTER TABLE candidates ADD COLUMN committee_gender      TEXT;
ALTER TABLE candidates ADD COLUMN position_title        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_ext_id
  ON candidates(external_candidate_id) WHERE external_candidate_id IS NOT NULL;
