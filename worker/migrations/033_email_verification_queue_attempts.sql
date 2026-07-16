-- worker/migrations/033_email_verification_queue_attempts.sql
-- Tracks failed-attempt count per row so runEmailVerificationBatch can give
-- up on an address that consistently times out instead of retrying it
-- forever. Without this, a small set of slow-to-respond mail servers
-- (personal/small-ISP domains -- confirmed 2026-07-15 via live cron
-- monitoring: wrws.net, colsons.net, jlazyyl.com, etc.) permanently occupy
-- the front of `ORDER BY email_norm ASC WHERE checked_at IS NULL`, since a
-- failed attempt never sets checked_at -- silently halving effective batch
-- throughput on every tick, indefinitely.

ALTER TABLE email_verification_queue ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_verification_queue ADD COLUMN last_attempted_at TEXT;
