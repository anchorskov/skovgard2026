-- Candidates/db/migrations/0036_election_event_data_status.sql
--
-- Keep election readiness explicit. New events require deliberate review
-- before runtime code may treat their ingested data as production-ready.

ALTER TABLE election_events
  ADD COLUMN data_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (data_status IN ('needs_review', 'active'));

UPDATE election_events
SET data_status = 'needs_review'
WHERE election_key = 'wy-2024-primary';

UPDATE election_events
SET data_status = 'active'
WHERE election_key = 'wy-2026-primary';
