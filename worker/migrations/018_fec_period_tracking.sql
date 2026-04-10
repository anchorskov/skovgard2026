-- worker/migrations/018_fec_period_tracking.sql
-- Add election_period to contributions for FEC per-period limit tracking.
-- Values: 'primary' (through Aug 18 2026) | 'general' (Aug 19 – Nov 3 2026)
-- Existing rows are tagged 'primary' since all prior contributions occurred before Aug 18 2026.

ALTER TABLE contributions ADD COLUMN election_period TEXT NOT NULL DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS idx_contributions_election_period ON contributions(election_period);
