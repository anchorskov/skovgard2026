-- Update Laramie office titles from SOS sequential IDs to CLK geographic precinct codes.
-- Replaces 'Precinct 46027 ...' with 'Precinct 1-5 ...' etc.
-- precinct_code column already holds the CLK code; this aligns the display title.

UPDATE offices SET title = REPLACE(title, 'Precinct 46023 ', 'Precinct 1-1 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '1-1' AND title LIKE 'Precinct 46023 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46025 ', 'Precinct 1-3 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '1-3' AND title LIKE 'Precinct 46025 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46026 ', 'Precinct 1-4 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '1-4' AND title LIKE 'Precinct 46026 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46027 ', 'Precinct 1-5 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '1-5' AND title LIKE 'Precinct 46027 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46028 ', 'Precinct 1-6 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '1-6' AND title LIKE 'Precinct 46028 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46054 ', 'Precinct 2-1 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-1' AND title LIKE 'Precinct 46054 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46055 ', 'Precinct 2-2 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-2' AND title LIKE 'Precinct 46055 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46056 ', 'Precinct 2-3 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-3' AND title LIKE 'Precinct 46056 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46057 ', 'Precinct 2-4 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-4' AND title LIKE 'Precinct 46057 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46059 ', 'Precinct 2-6 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-6' AND title LIKE 'Precinct 46059 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46060 ', 'Precinct 2-7 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-7' AND title LIKE 'Precinct 46060 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46061 ', 'Precinct 2-8 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '2-8' AND title LIKE 'Precinct 46061 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46083 ', 'Precinct 3-2 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-2' AND title LIKE 'Precinct 46083 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46084 ', 'Precinct 3-3 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-3' AND title LIKE 'Precinct 46084 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46085 ', 'Precinct 3-4 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-4' AND title LIKE 'Precinct 46085 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46024 ', 'Precinct 3-5 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-5' AND title LIKE 'Precinct 46024 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46086 ', 'Precinct 3-5 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-5' AND title LIKE 'Precinct 46086 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46087 ', 'Precinct 3-6 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-6' AND title LIKE 'Precinct 46087 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46088 ', 'Precinct 3-7 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '3-7' AND title LIKE 'Precinct 46088 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46122 ', 'Precinct 4-10 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-10' AND title LIKE 'Precinct 46122 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46113 ', 'Precinct 4-11 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-11' AND title LIKE 'Precinct 46113 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46123 ', 'Precinct 4-11 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-11' AND title LIKE 'Precinct 46123 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46114 ', 'Precinct 4-2 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-2' AND title LIKE 'Precinct 46114 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46116 ', 'Precinct 4-4 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-4' AND title LIKE 'Precinct 46116 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46117 ', 'Precinct 4-5 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-5' AND title LIKE 'Precinct 46117 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46118 ', 'Precinct 4-6 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-6' AND title LIKE 'Precinct 46118 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46119 ', 'Precinct 4-7 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-7' AND title LIKE 'Precinct 46119 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46120 ', 'Precinct 4-8 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-8' AND title LIKE 'Precinct 46120 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46121 ', 'Precinct 4-9 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '4-9' AND title LIKE 'Precinct 46121 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46143 ', 'Precinct 5-1 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '5-1' AND title LIKE 'Precinct 46143 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46144 ', 'Precinct 5-2 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '5-2' AND title LIKE 'Precinct 46144 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46145 ', 'Precinct 5-3 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '5-3' AND title LIKE 'Precinct 46145 %';
UPDATE offices SET title = REPLACE(title, 'Precinct 46146 ', 'Precinct 5-4 ') WHERE LOWER(county) = 'laramie' AND precinct_code = '5-4' AND title LIKE 'Precinct 46146 %';
