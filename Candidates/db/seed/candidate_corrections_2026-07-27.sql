-- Candidate-status correction received 2026-07-27.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Frank Chapman (United States Representative, Republican) is no longer running.
-- Preserve the original filing while excluding it from active ballot and guide surfaces.
UPDATE candidates
SET
  withdrawn_at = '2026-07-27T00:00:00',
  enrichment_notes = CASE
    WHEN enrichment_notes IS NULL OR trim(enrichment_notes) = ''
      THEN 'Campaign status correction received 2026-07-27: candidate is no longer running. Removed from active ballot and guide surfaces via withdrawn_at.'
    ELSE enrichment_notes || ' Campaign status correction received 2026-07-27: candidate is no longer running. Removed from active ballot and guide surfaces via withdrawn_at.'
  END,
  updated_at = datetime('now')
WHERE slug = 'frank-chapman' AND withdrawn_at IS NULL;
