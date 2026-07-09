-- worker/migrations/029_email_verification_queue.sql
-- Durable queue for the scheduled (Cron Trigger) EmailListVerify batch job
-- -- see docs/blast_tracking.md. Seeded once with the statewide backlog
-- (WY_DB voter file union'd with the local legacy contacts, minus opt-outs
-- and the unverifiable yahoo.com/aol.com/rtconnect.net/rangeweb.net
-- domains), then the scheduled handler claims a bounded batch every tick
-- (WHERE checked_at IS NULL), verifies it, and writes status/verdict back
-- here -- resumable across ticks with no separate progress-tracking file.

CREATE TABLE IF NOT EXISTS email_verification_queue (
  email_norm   TEXT PRIMARY KEY,
  status       TEXT,                              -- verifier's raw status; NULL until checked
  verdict      TEXT,                               -- good | risky | bad; NULL until checked
  checked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_email_verification_queue_unchecked
  ON email_verification_queue(checked_at);
