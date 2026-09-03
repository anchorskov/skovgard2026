-- Candidate-supplied correction received 2026-08-31.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Samuel Buckwalter supplied his campaign phone number.
UPDATE candidates
SET
  phone = '307-220-5651',
  updated_at = datetime('now')
WHERE slug = 'samuel-buckwalter-3'
  AND full_name = 'Samuel Buckwalter'
  AND phone IS NULL
  AND office_id = (
    SELECT id
    FROM offices
    WHERE title = 'Laramie City Council Ward 3'
      AND level = 'city'
      AND district IS NULL
  );
