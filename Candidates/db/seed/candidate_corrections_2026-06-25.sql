-- Candidate-supplied corrections received 2026-06-25.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Marcia Neumiller (SD-27) supplied her candidate description.
UPDATE candidates
SET
  summary = 'Marcia Neumiller is a Family Law Advocate and mother running for Wyoming Senate District 27.',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied description received by email on 2026-06-24. Requested bio read: Family Law Advocate and mother.',
  updated_at = datetime('now')
WHERE slug = 'marcia-neumiller';
