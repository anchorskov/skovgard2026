-- worker/wy_migrations/029_voters_addr_norm_soft_delete_columns.sql
-- Companion to 028_voters_soft_delete_columns.sql -- adds the same
-- soft-delete columns to voters_addr_norm, per the decision to expose
-- is_active on every voter-roll table rather than only voters/voters_raw,
-- so any live app can filter on it directly without a join.
--
-- Apply by hand, same convention as 024/026/027/028:
--   npx wrangler d1 execute wy --remote --env production --file=wy_migrations/029_voters_addr_norm_soft_delete_columns.sql
--
-- One-shot; confirmed 2026-08-07 this table has neither column yet.

ALTER TABLE voters_addr_norm ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE voters_addr_norm ADD COLUMN deactivated_at TEXT;
ALTER TABLE voters_addr_norm ADD COLUMN deactivated_reason TEXT;
