-- Candidates/db/migrations/0027_ballot_saves.sql
-- Durable, email-keyed ballot save. Unlike ballot_recovery_tokens (a 24h,
-- single-purpose "prove you own this inbox" link), this table holds the
-- actual saved ballot data: one row per email, upserted every time the voter
-- saves or updates their list from a device that has one. The cold "recover
-- by email" endpoint (no link in hand) reads from here. Retention is a
-- hardcoded election-cycle deadline (one calendar day after the WY 2026
-- primary), matching the pattern guide_questionnaire_tokens already uses,
-- purged by the separate skovgard-candidates-cron Worker. See
-- docs/ballot_recovery.md for the full design and reasoning.

CREATE TABLE IF NOT EXISTS ballot_saves (
  email_norm   TEXT PRIMARY KEY,               -- lowercased/trimmed
  payload_json TEXT NOT NULL,                  -- { availableRaces, choices } -- latest save wins
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
