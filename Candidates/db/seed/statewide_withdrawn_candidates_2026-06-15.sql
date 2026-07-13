-- Candidates/db/seed/statewide_withdrawn_candidates_2026-06-15.sql
-- Preserves the six filings on the Wyoming SOS withdrawn-candidate roster while
-- excluding them from active Candidates listings through candidates.withdrawn_at.
-- Source: https://sos.wyo.gov/Elections/Docs/2026/2026_WY_Withdrawn_Primary_Election_Candidates.pdf

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Republican', 'Jason Fearneyhough', 'jason-fearneyhough', 'Cheyenne', 'WY', '82009',
       '5815 Syracuse Road', '307-421-5990', 'fearneyhoughforwyoming@gmail.com', '2026-05-27', NULL, 1
  FROM offices
 WHERE title = 'Secretary Of State' AND district IS NULL;

UPDATE candidates
   SET withdrawn_at = '2026-06-08T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-08.',
       updated_at = datetime('now')
 WHERE slug = 'jason-fearneyhough' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Republican', 'Kelly Bates', 'kelly-bates-hd-10', 'Burns', 'WY', '82053',
       '1778 Road 146', '307-314-8475', 'kbates0101@gmail.com', '2026-05-28', NULL, 1
  FROM offices
 WHERE title = 'State Representative' AND district = 10;

UPDATE candidates
   SET withdrawn_at = '2026-06-09T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-09.',
       updated_at = datetime('now')
 WHERE slug = 'kelly-bates-hd-10' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Democratic', 'Britten Young', 'britten-young-hd-13', 'Laramie', 'WY', '82070',
       '3912 Beech St # 1', '307-263-9108', 'brittenmyoung@hotmail.com', '2026-05-27', NULL, 1
  FROM offices
 WHERE title = 'State Representative' AND district = 13;

UPDATE candidates
   SET withdrawn_at = '2026-06-02T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-02.',
       updated_at = datetime('now')
 WHERE slug = 'britten-young-hd-13' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Republican', 'Michael Bechtel', 'michael-bechtel-hd-43', 'Cheyenne', 'WY', '82001',
       '913 Taft Avenue Ave', '307-640-2679', 'mbechtel5@gmail.com', '2026-05-26', NULL, 1
  FROM offices
 WHERE title = 'State Representative' AND district = 43;

UPDATE candidates
   SET withdrawn_at = '2026-06-01T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-01.',
       updated_at = datetime('now')
 WHERE slug = 'michael-bechtel-hd-43' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Republican', 'Richard "RJ" Lennox', 'richard-rj-lennox-hd-46', 'Cheyenne', 'WY', '82003',
       'P.O. Box 4012', '307-287-8999', 'rjabadan@yahoo.com', '2026-05-29', NULL, 1
  FROM offices
 WHERE title = 'State Representative' AND district = 46;

UPDATE candidates
   SET withdrawn_at = '2026-06-11T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-11.',
       updated_at = datetime('now')
 WHERE slug = 'richard-rj-lennox-hd-46' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, zip, mailing_address, phone, email, filed_at, withdrawn_at, source_page)
SELECT id, 'Republican', 'Vince Vanata', 'vince-vanata-hd-50', 'Cody', 'WY', '82414',
       '3419 Sandbak Ave', '307-250-5639', 'vincevanata4HD50@gmail.com', '2026-05-27', NULL, 1
  FROM offices
 WHERE title = 'State Representative' AND district = 50;

UPDATE candidates
   SET withdrawn_at = '2026-06-01T00:00:00',
       enrichment_notes = 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-06-01.',
       updated_at = datetime('now')
 WHERE slug = 'vince-vanata-hd-50' AND withdrawn_at IS NULL;
