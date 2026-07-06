-- worker/migrations/025_email_blast_jobs.sql
-- Paginated email blast jobs, mirroring the voter_blast_jobs/voter_blast_log
-- pattern (020_voter_blast.sql) so a filter-based audience larger than the
-- 250-per-call admin email send cap can be worked through in resumable chunks.

CREATE TABLE IF NOT EXISTS email_blast_jobs (
  blast_id          TEXT PRIMARY KEY,
  filter            TEXT NOT NULL,
  city              TEXT,
  hd                TEXT,
  sd                TEXT,
  since_hours       INTEGER,
  subject           TEXT NOT NULL,
  email_mode        TEXT NOT NULL DEFAULT 'custom',  -- custom | share | share_with_intro
  share_slug        TEXT,
  share_intro_text  TEXT,
  message_body      TEXT,
  chunk_size        INTEGER NOT NULL DEFAULT 200,
  total_audience    INTEGER NOT NULL DEFAULT 0,
  current_offset    INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count     INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'created',  -- created | running | paused | complete | cancelled
  actor_email       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_email_blast_jobs_status
  ON email_blast_jobs(status);

CREATE INDEX IF NOT EXISTS ix_email_blast_jobs_created_at
  ON email_blast_jobs(created_at);

CREATE TABLE IF NOT EXISTS email_blast_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  blast_id           TEXT NOT NULL,
  email              TEXT NOT NULL,
  email_norm         TEXT NOT NULL,
  status             TEXT NOT NULL,   -- sent | failed | skipped_suppressed
  resend_message_id  TEXT,
  error_message      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_email_blast_log_blast_id
  ON email_blast_log(blast_id);

CREATE INDEX IF NOT EXISTS ix_email_blast_log_email
  ON email_blast_log(email_norm);
