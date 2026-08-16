-- Candidates/db/migrations/0026_ballot_recovery_tokens.sql
-- Cross-device ballot-list recovery. A voter's saved races/candidate picks
-- live only in browser localStorage; this table backs an optional, no-account
-- email link that restores that same list on another device. Real per-row
-- TTL (expires_at set explicitly on insert) — unlike guide_questionnaire_tokens,
-- which uses a hardcoded election-cycle deadline, this is a genuine short-lived
-- magic link and rows are expected to be deleted opportunistically by the
-- request endpoint once expired.

CREATE TABLE IF NOT EXISTS ballot_recovery_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT    NOT NULL UNIQUE,       -- 32-char random hex, used in URL path
  payload_json TEXT    NOT NULL,              -- { availableRaces, choices } — no email inside
  email_norm   TEXT    NOT NULL,              -- lowercased/trimmed; used only for cooldown/rate-limit checks, never returned to clients
  ip           TEXT,                          -- cf-connecting-ip at request time; used only for the per-IP hourly cap
  sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL,              -- datetime('now', '+24 hours') at insert time
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ballot_recovery_token
  ON ballot_recovery_tokens(token);

CREATE INDEX IF NOT EXISTS idx_ballot_recovery_email_sent
  ON ballot_recovery_tokens(email_norm, sent_at);

CREATE INDEX IF NOT EXISTS idx_ballot_recovery_ip_sent
  ON ballot_recovery_tokens(ip, sent_at);
