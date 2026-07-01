-- Migration 0018: Identity columns on guide_candidate_reference_links
--
-- Separates current SOS roster name from source/prior names so matching
-- can use aliases without publishing stale names as current candidate identity.
-- Also adds office_sought_2026 and status note for non-running incumbents.

ALTER TABLE guide_candidate_reference_links ADD COLUMN current_candidate_name TEXT;
ALTER TABLE guide_candidate_reference_links ADD COLUMN source_candidate_name  TEXT;
ALTER TABLE guide_candidate_reference_links ADD COLUMN source_names_json      TEXT;
ALTER TABLE guide_candidate_reference_links ADD COLUMN office_sought_2026     TEXT;
ALTER TABLE guide_candidate_reference_links ADD COLUMN name_note              TEXT;
ALTER TABLE guide_candidate_reference_links ADD COLUMN office_status_note     TEXT;

-- Allow new verification flags from updated reference table
-- (ALIAS-SOS-ROSTER, STATEWIDE-2026, VERIFY-ROSTER, NOT-RUNNING-2026 are all
--  stored as reference_kind = 'verification_flag', which is already in the CHECK constraint)

CREATE INDEX IF NOT EXISTS idx_guide_candidate_reference_current_name
  ON guide_candidate_reference_links(current_candidate_name)
  WHERE current_candidate_name IS NOT NULL;
