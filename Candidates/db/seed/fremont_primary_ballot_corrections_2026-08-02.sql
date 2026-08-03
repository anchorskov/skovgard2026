-- Fremont County 2026 primary ballot corrections and missing precinct candidates.
-- Source: filed sample-ballot advertising PDF dated 2026-07-25, reviewed 2026-08-02.
-- Idempotent: guarded corrections plus INSERT OR IGNORE keyed by stable external IDs/slugs.

-- Correct filed ballot names. Clarence V. Thomas is intentionally unchanged.
UPDATE candidates
   SET full_name = 'Michael V (Mike) Bailey',
       ballot_name = 'Michael V (Mike) Bailey',
       updated_at = datetime('now')
 WHERE full_name = 'Michael L (Mike) Bailey'
   AND office_id = (SELECT id FROM offices WHERE title = 'Riverton Mayor' AND county = 'Fremont');

UPDATE candidates
   SET full_name = 'Jim A Anderson',
       ballot_name = 'Jim A Anderson',
       updated_at = datetime('now')
 WHERE full_name = 'James A Anderson'
   AND office_id = (SELECT id FROM offices WHERE title = 'Fremont County County Treasurer (Republican)' AND county = 'Fremont');

-- The filed PDF identifies Mike Box as withdrawn but gives no exact withdrawal date.
-- Use the source document date as the status-as-of date and preserve that limitation for review.
UPDATE candidates
   SET withdrawn_at = COALESCE(withdrawn_at, '2026-07-25'),
       data_confidence = 'Medium',
       human_review_needed = 1,
       enrichment_notes = CASE
         WHEN COALESCE(enrichment_notes, '') LIKE '%withdrawal_date_note:%' THEN enrichment_notes
         ELSE TRIM(COALESCE(enrichment_notes || ' ', '') ||
           'withdrawal_date_note: Filed Fremont sample ballot dated 2026-07-25 marks candidate withdrawn; exact withdrawal date was not stated, so withdrawn_at records the source status date.')
       END,
       updated_at = datetime('now')
 WHERE full_name = 'Mike Box'
   AND office_id = (SELECT id FROM offices WHERE title = 'Lander City Council Ward 1' AND county = 'Fremont');

-- The filed ballot says each of these town-council races elects two.
UPDATE offices SET seats_available = 2
 WHERE county = 'Fremont'
   AND title IN ('Dubois Town Council', 'Hudson Town Council', 'Pavillion Town Council', 'Shoshoni Town Council')
   AND seats_available = 1;

-- Ward metadata. The many-to-many precinct mappings below are authoritative fallback
-- routing when no municipal ward GIS layer is registered.
UPDATE offices SET scope_kind = 'municipal_ward', ward = 'Ward 1'
 WHERE county = 'Fremont' AND title IN ('Lander City Council Ward 1', 'Riverton City Council Ward 1');
UPDATE offices SET scope_kind = 'municipal_ward', ward = 'Ward 2'
 WHERE county = 'Fremont' AND title IN ('Lander City Council Ward 2', 'Riverton City Council Ward 2');
UPDATE offices SET scope_kind = 'municipal_ward', ward = 'Ward 3'
 WHERE county = 'Fremont' AND title IN ('Lander City Council Ward 3', 'Riverton City Council Ward 3');

INSERT OR IGNORE INTO office_precinct_scopes
  (office_id, precinct_code, source_label, source_date, notes)
SELECT offices.id, mapping.precinct_code, 'Fremont County 2026 filed primary sample ballot', '2026-07-25',
       'Municipal ward precinct mapping printed in the filed ballot.'
FROM offices
JOIN (
  SELECT
    json_extract(value, '$[0]') AS office_title,
    json_extract(value, '$[1]') AS precinct_code
  FROM json_each('[
    ["Lander City Council Ward 1","1-1"],
    ["Lander City Council Ward 1","1-2"],
    ["Lander City Council Ward 2","1-3"],
    ["Lander City Council Ward 2","1-4"],
    ["Lander City Council Ward 3","1-5"],
    ["Lander City Council Ward 3","1-6"],
    ["Riverton City Council Ward 1","3-1"],
    ["Riverton City Council Ward 1","3-2"],
    ["Riverton City Council Ward 2","3-3"],
    ["Riverton City Council Ward 2","3-4"],
    ["Riverton City Council Ward 3","3-5"],
    ["Riverton City Council Ward 3","3-6"]
  ]')
) mapping ON mapping.office_title = offices.title
WHERE offices.county = 'Fremont';


WITH roster(precinct, party, gender, seats, candidate_name, candidate_slug, review_needed, review_note) AS (
  SELECT
    json_extract(value, '$[0]'), json_extract(value, '$[1]'),
    json_extract(value, '$[2]'), json_extract(value, '$[3]'),
    json_extract(value, '$[4]'), json_extract(value, '$[5]'),
    json_extract(value, '$[6]'), json_extract(value, '$[7]')
  FROM json_each('[
["1-1","REP","F",2,"Karen M Wetzel","karen-m-wetzel",0,null],
["1-2","REP","F",1,"Lisa Wilson","lisa-wilson",0,null],
["1-3","REP","F",2,"Juanita Duncan","juanita-duncan",0,null],
["1-4","REP","M",1,"James A Anderson","james-a-anderson",0,null],
["1-4","REP","M",1,"Mike Titzer","mike-titzer",1,"The filed ballot punctuation places this name after the usual man/woman separator; local public records identify Mike Titzer as male, so Committeeman is used pending clerk confirmation."],
["1-5","REP","M",2,"Charles Clifford","charles-clifford",0,null],
["1-5","REP","M",2,"John L Larsen","john-l-larsen",0,null],
["1-5","REP","F",2,"Diana Currah","diana-currah",0,null],
["1-5","REP","F",2,"Tina Clifford","tina-clifford",0,null],
["3-2","REP","F",1,"Sandy K Luers","sandy-k-luers",0,null],
["3-3","REP","M",2,"Jeremy Aycock","jeremy-aycock",0,null],
["3-3","REP","M",2,"Roger Bower","roger-bower",0,null],
["3-3","REP","M",2,"Karl Falken","karl-falken",0,null],
["3-3","REP","F",2,"Kristine A Anderson","kristine-a-anderson",0,null],
["3-3","REP","F",2,"Ginger Bennett","ginger-bennett",0,null],
["3-4","REP","M",2,"Joel Guggenmos","joel-guggenmos",0,null],
["3-4","REP","F",2,"Elizabeth Guggenmos","elizabeth-guggenmos",0,null],
["3-5","REP","M",2,"Kevin S Broemer","kevin-s-broemer",0,null],
["3-5","REP","F",2,"Gerri Boesch","gerri-boesch",0,null],
["3-5","REP","F",2,"Karin Broemer","karin-broemer",0,null],
["3-5","REP","F",2,"Kami Cunningham","kami-cunningham",0,null],
["3-6","REP","F",3,"Georgia Davis","georgia-davis",0,null],
["4-1","REP","M",1,"Nate Penn","nate-penn",0,null],
["4-1","REP","F",1,"Sarah Penn","sarah-penn",0,null],
["5-1","REP","M",4,"Troy Jones","troy-jones",0,null],
["5-1","REP","M",4,"John P Shade","john-p-shade",0,null],
["5-1","REP","F",4,"Joan Patricia Jones","joan-patricia-jones",0,null],
["5-1","REP","F",4,"Amanda Shade","amanda-shade",0,null],
["6-1","REP","M",1,"Pavlos Papadopoulos","pavlos-papadopoulos",0,null],
["6-1","REP","F",1,"Anne Thurston","anne-thurston",0,null],
["7-1","REP","M",3,"Reg Phillips","reg-phillips",0,null],
["7-1","REP","F",3,"Amy L Cross","amy-l-cross",0,null],
["8-1","REP","F",1,"Lori Weber","lori-weber",0,null],
["9-1","REP","F",1,"Elizabeth Philp","elizabeth-philp",0,null],
["10-1","REP","M",2,"Joseph Calvin Martinez","joseph-calvin-martinez",0,null],
["12-1","REP","M",1,"Thad Dockery","thad-dockery",0,null],
["12-1","REP","M",1,"Elijah Clyde","elijah-clyde",0,null],
["12-1","REP","F",1,"Andrae L Dockery","andrae-l-dockery",0,null],
["12-1","REP","F",1,"Hadessa Clyde","hadessa-clyde",0,null],
["13-1","REP","F",1,"Patricia Ann McNiven","patricia-ann-mcniven",0,null],
["14-1","REP","M",2,"Steven J Lynn","steven-j-lynn",0,null],
["14-1","REP","M",2,"Chris Rodkey","chris-rodkey",0,null],
["16-1","REP","M",1,"Mitch Benson","mitch-benson",0,null],
["16-1","REP","F",1,"Jerri L Robinson","jerri-l-robinson",0,null],
["17-1","REP","M",1,"Rafael Delgadillo","rafael-delgadillo",0,null],
["17-1","REP","F",1,"Donna Drogos","donna-drogos",0,null],
["18-1","REP","M",3,"Rob Fabrizius","rob-fabrizius",0,null],
["18-1","REP","F",3,"Alexandra (Ali) Etsinger","alexandra-ali-etsinger",0,null],
["18-1","REP","F",3,"Kim Fabrizius","kim-fabrizius",0,null],
["18-1","REP","F",3,"Pepper L Ottman","pepper-l-ottman",0,null],
["18-1","REP","F",3,"Sarah Trehearne","sarah-trehearne",0,null],
["19-1","REP","M",1,"Colby Gillespie","colby-gillespie",0,null],
["19-1","REP","F",1,"Georgia D Gillespie","georgia-d-gillespie",0,null],
["20-1","REP","M",1,"Joel Highsmith","joel-highsmith",0,null],
["21-1","REP","M",1,"Terry Cantrell","terry-cantrell",0,null],
["24-1","REP","M",1,"John Birbari","john-birbari",0,null],
["24-1","REP","F",1,"Tatum Hall","tatum-hall",0,null],
["1-1","DEM","F",1,"Christine Parr","christine-parr",0,null],
["1-2","DEM","M",1,"Gary L Curtis","gary-l-curtis",0,null],
["1-2","DEM","F",1,"Darla Curtis","darla-curtis",0,null],
["1-4","DEM","M",1,"Rod Haper","rod-haper",0,null],
["1-4","DEM","F",1,"Mary D Haper","mary-d-haper",0,null],
["1-5","DEM","M",1,"Robert J Oakleaf","robert-j-oakleaf",0,null],
["1-5","DEM","F",1,"Barbara J Oakleaf","barbara-j-oakleaf",0,null],
["6-1","DEM","F",1,"Maia Ross","maia-ross",0,null],
["21-1","DEM","F",1,"Deborah Thomas","deborah-thomas",0,null]
]')
)
INSERT OR IGNORE INTO offices
  (title, level, district, sort_order, county, ballot_party, seats_available,
   scope_kind, external_race_id, precinct_code)
SELECT DISTINCT
  'Fremont Precinct ' || precinct || ' ' ||
    CASE party WHEN 'REP' THEN 'Republican' ELSE 'Democratic' END || ' Precinct ' ||
    CASE gender WHEN 'M' THEN 'Committeeman' ELSE 'Committeewoman' END,
  'county', NULL, 400, 'Fremont', party, seats, 'precinct_party_gender',
  'wy-2026-primary-fremont-precinct-' || precinct || '-' || lower(party) || '-' ||
    CASE gender WHEN 'M' THEN 'committeeman' ELSE 'committeewoman' END,
  precinct
FROM roster;

WITH roster(precinct, party, gender, seats, candidate_name, candidate_slug, review_needed, review_note) AS (
  SELECT
    json_extract(value, '$[0]'), json_extract(value, '$[1]'),
    json_extract(value, '$[2]'), json_extract(value, '$[3]'),
    json_extract(value, '$[4]'), json_extract(value, '$[5]'),
    json_extract(value, '$[6]'), json_extract(value, '$[7]')
  FROM json_each('[
["1-1","REP","F",2,"Karen M Wetzel","karen-m-wetzel",0,null],
["1-2","REP","F",1,"Lisa Wilson","lisa-wilson",0,null],
["1-3","REP","F",2,"Juanita Duncan","juanita-duncan",0,null],
["1-4","REP","M",1,"James A Anderson","james-a-anderson",0,null],
["1-4","REP","M",1,"Mike Titzer","mike-titzer",1,"The filed ballot punctuation places this name after the usual man/woman separator; local public records identify Mike Titzer as male, so Committeeman is used pending clerk confirmation."],
["1-5","REP","M",2,"Charles Clifford","charles-clifford",0,null],
["1-5","REP","M",2,"John L Larsen","john-l-larsen",0,null],
["1-5","REP","F",2,"Diana Currah","diana-currah",0,null],
["1-5","REP","F",2,"Tina Clifford","tina-clifford",0,null],
["3-2","REP","F",1,"Sandy K Luers","sandy-k-luers",0,null],
["3-3","REP","M",2,"Jeremy Aycock","jeremy-aycock",0,null],
["3-3","REP","M",2,"Roger Bower","roger-bower",0,null],
["3-3","REP","M",2,"Karl Falken","karl-falken",0,null],
["3-3","REP","F",2,"Kristine A Anderson","kristine-a-anderson",0,null],
["3-3","REP","F",2,"Ginger Bennett","ginger-bennett",0,null],
["3-4","REP","M",2,"Joel Guggenmos","joel-guggenmos",0,null],
["3-4","REP","F",2,"Elizabeth Guggenmos","elizabeth-guggenmos",0,null],
["3-5","REP","M",2,"Kevin S Broemer","kevin-s-broemer",0,null],
["3-5","REP","F",2,"Gerri Boesch","gerri-boesch",0,null],
["3-5","REP","F",2,"Karin Broemer","karin-broemer",0,null],
["3-5","REP","F",2,"Kami Cunningham","kami-cunningham",0,null],
["3-6","REP","F",3,"Georgia Davis","georgia-davis",0,null],
["4-1","REP","M",1,"Nate Penn","nate-penn",0,null],
["4-1","REP","F",1,"Sarah Penn","sarah-penn",0,null],
["5-1","REP","M",4,"Troy Jones","troy-jones",0,null],
["5-1","REP","M",4,"John P Shade","john-p-shade",0,null],
["5-1","REP","F",4,"Joan Patricia Jones","joan-patricia-jones",0,null],
["5-1","REP","F",4,"Amanda Shade","amanda-shade",0,null],
["6-1","REP","M",1,"Pavlos Papadopoulos","pavlos-papadopoulos",0,null],
["6-1","REP","F",1,"Anne Thurston","anne-thurston",0,null],
["7-1","REP","M",3,"Reg Phillips","reg-phillips",0,null],
["7-1","REP","F",3,"Amy L Cross","amy-l-cross",0,null],
["8-1","REP","F",1,"Lori Weber","lori-weber",0,null],
["9-1","REP","F",1,"Elizabeth Philp","elizabeth-philp",0,null],
["10-1","REP","M",2,"Joseph Calvin Martinez","joseph-calvin-martinez",0,null],
["12-1","REP","M",1,"Thad Dockery","thad-dockery",0,null],
["12-1","REP","M",1,"Elijah Clyde","elijah-clyde",0,null],
["12-1","REP","F",1,"Andrae L Dockery","andrae-l-dockery",0,null],
["12-1","REP","F",1,"Hadessa Clyde","hadessa-clyde",0,null],
["13-1","REP","F",1,"Patricia Ann McNiven","patricia-ann-mcniven",0,null],
["14-1","REP","M",2,"Steven J Lynn","steven-j-lynn",0,null],
["14-1","REP","M",2,"Chris Rodkey","chris-rodkey",0,null],
["16-1","REP","M",1,"Mitch Benson","mitch-benson",0,null],
["16-1","REP","F",1,"Jerri L Robinson","jerri-l-robinson",0,null],
["17-1","REP","M",1,"Rafael Delgadillo","rafael-delgadillo",0,null],
["17-1","REP","F",1,"Donna Drogos","donna-drogos",0,null],
["18-1","REP","M",3,"Rob Fabrizius","rob-fabrizius",0,null],
["18-1","REP","F",3,"Alexandra (Ali) Etsinger","alexandra-ali-etsinger",0,null],
["18-1","REP","F",3,"Kim Fabrizius","kim-fabrizius",0,null],
["18-1","REP","F",3,"Pepper L Ottman","pepper-l-ottman",0,null],
["18-1","REP","F",3,"Sarah Trehearne","sarah-trehearne",0,null],
["19-1","REP","M",1,"Colby Gillespie","colby-gillespie",0,null],
["19-1","REP","F",1,"Georgia D Gillespie","georgia-d-gillespie",0,null],
["20-1","REP","M",1,"Joel Highsmith","joel-highsmith",0,null],
["21-1","REP","M",1,"Terry Cantrell","terry-cantrell",0,null],
["24-1","REP","M",1,"John Birbari","john-birbari",0,null],
["24-1","REP","F",1,"Tatum Hall","tatum-hall",0,null],
["1-1","DEM","F",1,"Christine Parr","christine-parr",0,null],
["1-2","DEM","M",1,"Gary L Curtis","gary-l-curtis",0,null],
["1-2","DEM","F",1,"Darla Curtis","darla-curtis",0,null],
["1-4","DEM","M",1,"Rod Haper","rod-haper",0,null],
["1-4","DEM","F",1,"Mary D Haper","mary-d-haper",0,null],
["1-5","DEM","M",1,"Robert J Oakleaf","robert-j-oakleaf",0,null],
["1-5","DEM","F",1,"Barbara J Oakleaf","barbara-j-oakleaf",0,null],
["6-1","DEM","F",1,"Maia Ross","maia-ross",0,null],
["21-1","DEM","F",1,"Deborah Thomas","deborah-thomas",0,null]
]')
)
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, ballot_name, slug, state, source_page,
   external_candidate_id, committee_gender, position_title, data_confidence,
   human_review_needed, enrichment_notes)
SELECT
  o.id, r.party, r.candidate_name, r.candidate_name,
  'fremont-pct-' || r.precinct || '-' || lower(r.party) || '-' ||
    CASE r.gender WHEN 'M' THEN 'man-' ELSE 'woman-' END || r.candidate_slug,
  'WY', 3,
  'wy-2026-primary-fremont-pct-' || r.precinct || '-' || lower(r.party) || '-' ||
    CASE r.gender WHEN 'M' THEN 'man-' ELSE 'woman-' END || r.candidate_slug,
  r.gender,
  CASE r.gender WHEN 'M' THEN 'Committeeman' ELSE 'Committeewoman' END,
  CASE r.review_needed WHEN 1 THEN 'Medium' ELSE 'High' END,
  r.review_needed,
  r.review_note
FROM roster r
JOIN offices o
  ON o.external_race_id =
    'wy-2026-primary-fremont-precinct-' || r.precinct || '-' || lower(r.party) || '-' ||
    CASE r.gender WHEN 'M' THEN 'committeeman' ELSE 'committeewoman' END;


-- Jason Fearneyhough remains withdrawn and Clarence V. Thomas remains unchanged by design.
