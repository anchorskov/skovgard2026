-- worker/migrations/021_share_sends_admin_flag.sql
-- Adds is_admin_send flag to share_sends so admin sends are excluded from
-- the per-IP rate-limit count. Applied manually 2026-06-22 via ALTER TABLE;
-- this file records that change for migration tracking.
--
-- NOTE: column already exists in production. If applied to a fresh database
-- (e.g. ballot_sources_preview) this runs normally. If run against the live
-- DB after the manual ALTER, SQLite will error — seed d1_migrations first.

ALTER TABLE share_sends ADD COLUMN is_admin_send INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_share_sends_admin
  ON share_sends(is_admin_send, created_at);
