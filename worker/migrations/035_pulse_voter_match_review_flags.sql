-- worker/migrations/035_pulse_voter_match_review_flags.sql
-- Carries the /pulse form's client-side data-quality signals through to the
-- review queue: whether the submitted phone's area code wasn't Wyoming's
-- single 307 code, and whether the submitted ZIP fell outside Wyoming's
-- range. Neither is proof of a typo (out-of-state numbers/mailing ZIPs are
-- legitimate for real WY voters), so neither blocks a submission -- they're
-- recomputed server-side (not trusted from the client) and stored purely as
-- context for staff triaging an ambiguous/no_match row.

ALTER TABLE pulse_voter_match_review ADD COLUMN phone_area_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_voter_match_review ADD COLUMN zip_range_flag INTEGER NOT NULL DEFAULT 0;
