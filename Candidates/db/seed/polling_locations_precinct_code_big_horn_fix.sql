-- Fix Big Horn polling_locations precinct_code format: "01-01" → "1-1"
-- Aligns with offices.precinct_code format set by offices_precinct_code_big_horn_correction.sql
UPDATE polling_locations SET precinct_code = '1-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '01-01';
UPDATE polling_locations SET precinct_code = '2-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '02-01';
UPDATE polling_locations SET precinct_code = '3-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '03-01';
UPDATE polling_locations SET precinct_code = '5-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '05-01';
UPDATE polling_locations SET precinct_code = '6-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '06-01';
UPDATE polling_locations SET precinct_code = '8-1'  WHERE LOWER(county) = 'big horn' AND precinct_code = '08-01';
UPDATE polling_locations SET precinct_code = '11-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '11-01';
UPDATE polling_locations SET precinct_code = '16-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '16-01';
UPDATE polling_locations SET precinct_code = '20-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '20-01';
UPDATE polling_locations SET precinct_code = '22-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '22-01';
UPDATE polling_locations SET precinct_code = '23-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '23-01';
UPDATE polling_locations SET precinct_code = '25-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '25-01';
UPDATE polling_locations SET precinct_code = '26-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '26-01';
