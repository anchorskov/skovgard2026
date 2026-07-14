-- worker/migrations/031_pulse_voter_match_review.sql
-- Review queue for /pulse opt-ins that supplied voter-verification fields
-- (city/zip, optionally address1) but didn't cleanly resolve to exactly one
-- WY voter record -- see findUniqueWyTargetMatch / syncSubmittedPhoneToWyVoter
-- in worker/src/index.js. Ambiguous matches keep their candidate voter_ids so
-- staff can pick the right one without re-querying; no_match rows exist so a
-- typo/nickname mismatch can be corrected by hand instead of asking the voter
-- to resubmit identical data that will only ever produce the same result.

CREATE TABLE IF NOT EXISTS pulse_voter_match_review (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_e164           TEXT NOT NULL,
  submitted_first_name TEXT,
  submitted_last_name  TEXT,
  submitted_address1   TEXT,
  submitted_city       TEXT,
  submitted_zip        TEXT,
  match_mode           TEXT NOT NULL,   -- ambiguous_address | ambiguous_name_city_zip | no_match
  candidate_voter_ids  TEXT,            -- JSON array; populated for ambiguous_* modes
  resolved_voter_id    TEXT,
  resolved_at          TEXT,
  resolved_by          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_pulse_voter_match_review_unresolved
  ON pulse_voter_match_review(resolved_at);
