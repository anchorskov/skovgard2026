-- Fix for duplicate Natrona precinct committee offices.
-- The original seed was applied without county/scope_kind, creating 98 offices with NULL county.
-- The corrected seed file then inserted 98 duplicate offices (with county/scope_kind) because
-- there was no UNIQUE constraint on title to trigger INSERT OR IGNORE.
-- This script removes the childless duplicates and patches the originals.

-- Step 1: Remove the new duplicate offices (those with county set but no candidates).
DELETE FROM offices
WHERE title LIKE 'Natrona Precinct%'
  AND county = 'Natrona'
  AND id NOT IN (SELECT DISTINCT office_id FROM candidates WHERE office_id IS NOT NULL);

-- Step 2: Patch the original offices to add county and scope_kind.
UPDATE offices
SET county = 'Natrona', scope_kind = 'precinct_party_gender'
WHERE title LIKE 'Natrona Precinct%'
  AND county IS NULL;
