/*
  Correct the Wyoming 2026 primary withdrawal status for two filed candidates.

  Official source:
  https://sos.wyo.gov/Elections/Docs/2026/2026_WY_Withdrawn_Primary_Election_Candidates.pdf

  The Wyoming Elections Division roster generated 2026-08-11 reports:
  Frank Chapman, United States Representative, withdrawn 2026-07-24.
  Kristen-Erin Balderaz, State Representative District 61, withdrawn 2026-08-11.

  The slug and office predicates prevent similarly named candidates in other
  contests from being changed. The date predicate makes this file idempotent.
*/

UPDATE candidates
   SET withdrawn_at = '2026-07-24T00:00:00',
       enrichment_notes = CASE
         WHEN enrichment_notes IS NULL OR trim(enrichment_notes) = ''
           THEN 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-07-24; verified 2026-08-16.'
         ELSE enrichment_notes || ' Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-07-24; verified 2026-08-16.'
       END,
       updated_at = datetime('now')
 WHERE slug = 'frank-chapman'
   AND office_id = (
     SELECT id
       FROM offices
      WHERE title = 'United States Representative'
        AND level = 'federal'
        AND district IS NULL
   )
   AND (withdrawn_at IS NULL OR withdrawn_at <> '2026-07-24T00:00:00');

UPDATE candidates
   SET withdrawn_at = '2026-08-11T00:00:00',
       enrichment_notes = CASE
         WHEN enrichment_notes IS NULL OR trim(enrichment_notes) = ''
           THEN 'Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-08-11; verified 2026-08-16.'
         ELSE enrichment_notes || ' Official Wyoming SOS withdrawn-candidate roster: withdrawn 2026-08-11; verified 2026-08-16.'
       END,
       updated_at = datetime('now')
 WHERE slug = 'kristen-erin-balderaz'
   AND office_id = (
     SELECT id
       FROM offices
      WHERE title = 'State Representative'
        AND level = 'wy_house'
        AND district = 61
   )
   AND (withdrawn_at IS NULL OR withdrawn_at <> '2026-08-11T00:00:00');
