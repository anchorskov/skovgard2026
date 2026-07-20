-- worker/migrations/036_pulse_voter_match_review_call_tracking.sql
-- Lets staff work pulse_voter_match_review (migration 031) as a call queue:
-- someone submitted /pulse for real (they already have SMS/email consent on
-- file) but couldn't be cleanly matched to a WY voter record, so a phone
-- call is the way to verbally confirm the address that resolves the match.
-- call_status is a fixed engineering enum (not staff-editable), matching the
-- existing precedent of consent_status.status and this table's own
-- match_mode column -- see docs/pulse_flow.md.

ALTER TABLE pulse_voter_match_review ADD COLUMN call_status TEXT NOT NULL DEFAULT 'not_called';
ALTER TABLE pulse_voter_match_review ADD COLUMN call_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_voter_match_review ADD COLUMN call_notes TEXT;
ALTER TABLE pulse_voter_match_review ADD COLUMN called_at TEXT;
ALTER TABLE pulse_voter_match_review ADD COLUMN called_by TEXT;
