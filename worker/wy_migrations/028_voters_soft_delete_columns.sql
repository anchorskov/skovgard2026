-- worker/wy_migrations/028_voters_soft_delete_columns.sql
-- Adds soft-delete state to the shared "wy" D1 database's voters and
-- voters_raw tables, mirroring voterdata/wyoming's local wy.sqlite pattern
-- (see docs/update_voter_raw.md in that project). These two tables are read
-- live by three separate Workers (grassrootsmvt canvassing app,
-- skovgard2026 district/targeting/texting features, grassmvt_survey district
-- lookup + voter-verification quiz) -- adding columns is additive and safe,
-- but nothing here may DROP or recreate either table.
--
-- Lives in worker/wy_migrations/, NOT worker/migrations/ -- the latter is
-- scanned wholesale by `wrangler d1 migrations apply ballot_sources`, and a
-- "wy"-targeted file placed there runs against the wrong database (see the
-- warning in 024_wy_email_demographics_pipeline.sql).
--
-- Apply by hand against the shared "wy" database, not via `wrangler d1
-- migrations apply`:
--   npx wrangler d1 execute wy --remote --env production --file=wy_migrations/028_voters_soft_delete_columns.sql
--
-- One-shot, like 024/026/027 -- confirmed 2026-08-07 that neither table has
-- these columns yet, so this is not written to be re-run.

ALTER TABLE voters     ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE voters     ADD COLUMN deactivated_at TEXT;
ALTER TABLE voters     ADD COLUMN deactivated_reason TEXT;

ALTER TABLE voters_raw ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE voters_raw ADD COLUMN deactivated_at TEXT;
ALTER TABLE voters_raw ADD COLUMN deactivated_reason TEXT;
