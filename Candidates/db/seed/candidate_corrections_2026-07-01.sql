-- Candidate-supplied corrections received 2026-07-01.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Bryan McCarty (Secretary of State, Democratic) supplied his preferred campaign email address.
UPDATE candidates
SET
  email = 'BGMc4WY@gmail.com',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied campaign email received by email on 2026-07-01. Replaces original SOS roster email bryan.mccarty0907@gmail.com.',
  updated_at = datetime('now')
WHERE slug = 'bryan-mccarty';

-- Shea Ward (Casper City Council Ward 1, Republican) is no longer running.
UPDATE candidates
SET
  withdrawn_at = '2026-07-01T00:00:00',
  enrichment_notes = 'Candidate confirmed no longer running as of 2026-07-01. Card removed from public listings via withdrawn_at.',
  updated_at = datetime('now')
WHERE slug = 'shea-ward-1' AND withdrawn_at IS NULL;
