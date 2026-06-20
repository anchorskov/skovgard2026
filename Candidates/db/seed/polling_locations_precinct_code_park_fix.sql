-- Fix Park County polling_locations precinct_code: strip third segment from split-precinct rows.
-- Aligns with offices.precinct_code format (e.g. "10-1" not "10-1-1").
-- Rows with the same two-segment code share one polling venue; collapsing is correct.
UPDATE polling_locations SET precinct_code = '10-1' WHERE LOWER(county) = 'park' AND precinct_code = '10-1-1';
UPDATE polling_locations SET precinct_code = '10-1' WHERE LOWER(county) = 'park' AND precinct_code = '10-1-2';
UPDATE polling_locations SET precinct_code = '16-1' WHERE LOWER(county) = 'park' AND precinct_code = '16-1-1';
UPDATE polling_locations SET precinct_code = '16-1' WHERE LOWER(county) = 'park' AND precinct_code = '16-1-2';
UPDATE polling_locations SET precinct_code = '21-1' WHERE LOWER(county) = 'park' AND precinct_code = '21-1-1';
UPDATE polling_locations SET precinct_code = '21-1' WHERE LOWER(county) = 'park' AND precinct_code = '21-1-2';
UPDATE polling_locations SET precinct_code = '24-1' WHERE LOWER(county) = 'park' AND precinct_code = '24-1-1';
UPDATE polling_locations SET precinct_code = '24-1' WHERE LOWER(county) = 'park' AND precinct_code = '24-1-2';
UPDATE polling_locations SET precinct_code = '3-2'  WHERE LOWER(county) = 'park' AND precinct_code = '3-2-1';
UPDATE polling_locations SET precinct_code = '3-2'  WHERE LOWER(county) = 'park' AND precinct_code = '3-2-2';
UPDATE polling_locations SET precinct_code = '4-2'  WHERE LOWER(county) = 'park' AND precinct_code = '4-2-1';
UPDATE polling_locations SET precinct_code = '4-2'  WHERE LOWER(county) = 'park' AND precinct_code = '4-2-2';
UPDATE polling_locations SET precinct_code = '4-2'  WHERE LOWER(county) = 'park' AND precinct_code = '4-2-3';
UPDATE polling_locations SET precinct_code = '6-1'  WHERE LOWER(county) = 'park' AND precinct_code = '6-1-1';
UPDATE polling_locations SET precinct_code = '6-1'  WHERE LOWER(county) = 'park' AND precinct_code = '6-1-2';
UPDATE polling_locations SET precinct_code = '6-1'  WHERE LOWER(county) = 'park' AND precinct_code = '6-1-3';
