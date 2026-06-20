-- Big Horn County offices.precinct_code: remap '01'-format to '1-1' polygon format.
-- Polygon seed uses 'N-1' codes; parsed office titles produce zero-padded 'NN' codes.

UPDATE offices SET precinct_code = '1-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '01';
UPDATE offices SET precinct_code = '2-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '02';
UPDATE offices SET precinct_code = '3-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '03';
UPDATE offices SET precinct_code = '5-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '05';
UPDATE offices SET precinct_code = '6-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '06';
UPDATE offices SET precinct_code = '8-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '08';
UPDATE offices SET precinct_code = '11-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '11';
UPDATE offices SET precinct_code = '16-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '16';
UPDATE offices SET precinct_code = '20-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '20';
UPDATE offices SET precinct_code = '22-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '22';
UPDATE offices SET precinct_code = '23-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '23';
UPDATE offices SET precinct_code = '25-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '25';
UPDATE offices SET precinct_code = '26-1' WHERE LOWER(county) = 'big horn' AND precinct_code = '26';
