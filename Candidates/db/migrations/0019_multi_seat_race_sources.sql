-- Migration 0019: multi_seat_race_sources
--
-- Staging/provenance table for the "multi-seat candidates flow": a repeatable
-- research pass (spreadsheet in, this table out) that finds county/city/precinct
-- races electing more than one candidate (county commissioner boards, city
-- council wards, school/hospital/special districts, precinct committee seats)
-- and records seats_open plus the source that verified it.
--
-- offices.seats_available (added in 0004_offices_expand.sql) is the field that
-- actually drives the ballot-selection cap in the UI. This table does NOT
-- replace it — it is the reviewable staging ground that seats_available updates
-- are generated from, so every seat count stays traceable to a source and this
-- research pass can be re-run later (new proclamations, corrections) without
-- losing history. Import is idempotent on ballot_group_key: re-running the
-- import script against an updated spreadsheet upserts existing rows rather
-- than duplicating them.
--
-- Matching a row to a live office is intentionally a separate, reviewed step
-- (see scripts/match_multi_seat_race_sources.py) — office_id is only set once
-- a match has actually been applied to offices.seats_available.

CREATE TABLE multi_seat_race_sources (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,

  -- identity / re-run key
  ballot_group_key   TEXT NOT NULL UNIQUE,

  -- race description, as extracted from the source document
  county              TEXT NOT NULL,
  election_phase      TEXT,                 -- 'Primary' | 'General'
  jurisdiction_type   TEXT NOT NULL,        -- 'Countywide' | 'Municipal' | 'Precinct' | 'School District' | 'Special District' | 'Community College District' | 'Manual Review'
  city_or_town        TEXT,
  precinct             TEXT,
  precinct_name        TEXT,
  party                 TEXT,
  office_name           TEXT,
  district_or_scope     TEXT,
  term                  TEXT,

  -- seat count
  seats_open            INTEGER NOT NULL DEFAULT 0,
  max_selections         INTEGER NOT NULL DEFAULT 0,
  ui_instruction          TEXT,

  -- provenance
  source_type              TEXT,             -- 'proclamation' | 'candidate_roster' | 'precinct_committee_allocation' | 'public_notice' | 'manual_review'
  source_url                TEXT,
  source_status              TEXT,           -- 'verified' | 'candidate_roster_partial' | 'manual_pull_needed' | 'source_conflict' | ... (free text, see field_guide sheet)
  notes                       TEXT,

  -- reconciliation against offices
  office_id                    INTEGER REFERENCES offices(id),  -- set only once applied
  office_id_guess                INTEGER REFERENCES offices(id), -- best guess, may be unresolved
  match_status                    TEXT NOT NULL DEFAULT 'not_attempted'
                                   CHECK (match_status IN ('not_attempted', 'exact', 'ambiguous', 'no_office_found')),
  match_notes                       TEXT,
  applied_at                          TEXT,   -- set when office_id_guess -> office_id and offices.seats_available was updated

  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_multi_seat_race_sources_county       ON multi_seat_race_sources(county);
CREATE INDEX idx_multi_seat_race_sources_match_status ON multi_seat_race_sources(match_status);
CREATE INDEX idx_multi_seat_race_sources_office       ON multi_seat_race_sources(office_id);
