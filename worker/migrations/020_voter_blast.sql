-- worker/migrations/020_voter_blast.sql
-- Voter file blast jobs and per-message log for geographic outreach (no opt-in required).
-- Audience queried from WY_DB; job state and send log live here in ballot_sources.

CREATE TABLE IF NOT EXISTS voter_blast_jobs (
  blast_id        TEXT PRIMARY KEY,
  county          TEXT,
  city            TEXT,
  party           TEXT,
  district_type   TEXT,   -- 'senate' | 'house' | NULL
  district        TEXT,
  message_text    TEXT NOT NULL,
  total_audience  INTEGER NOT NULL DEFAULT 0,
  current_offset  INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'created',  -- created | running | paused | complete
  actor_email     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_voter_blast_jobs_status
  ON voter_blast_jobs(status);

CREATE INDEX IF NOT EXISTS ix_voter_blast_jobs_created_at
  ON voter_blast_jobs(created_at);

CREATE TABLE IF NOT EXISTS voter_blast_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  blast_id           TEXT NOT NULL,
  voter_id           TEXT NOT NULL,
  phone_e164         TEXT NOT NULL,
  status             TEXT NOT NULL,   -- sent | failed | skipped_suppressed
  telnyx_message_id  TEXT,
  error_message      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_voter_blast_log_blast_id
  ON voter_blast_log(blast_id);

CREATE INDEX IF NOT EXISTS ix_voter_blast_log_phone
  ON voter_blast_log(phone_e164);
