-- Candidate website correction authorized by Jimmy Skovgard on 2026-08-03.
-- Apply to the Candidates WY_DB (`wy`) in local and production.

-- Replace the Grassroots Movement project URL with the campaign's canonical site.
UPDATE candidates
SET
  website_url = 'https://www.skovgard2026.org/',
  enrichment_notes = CASE
    WHEN enrichment_notes IS NULL OR trim(enrichment_notes) = ''
      THEN 'Candidate-authorized website correction received 2026-08-03: canonical campaign site is https://www.skovgard2026.org/.'
    ELSE enrichment_notes || ' Candidate-authorized website correction received 2026-08-03: canonical campaign site is https://www.skovgard2026.org/.'
  END,
  updated_at = datetime('now')
WHERE slug = 'jimmy-skovgard'
  AND website_url = 'https://grassrootsmvt.org';
