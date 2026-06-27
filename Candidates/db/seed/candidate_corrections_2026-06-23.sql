-- Candidate-supplied corrections received 2026-06-21 through 2026-06-23.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Kenneth Casner clarified the ballot display name and statewide race designation.
UPDATE candidates
SET
  full_name = 'Kenneth R Casner',
  summary = 'Kenneth R Casner is a Democratic/Independent candidate for Governor of Wyoming.',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied ballot-name and race clarification received by email from casnerken89@gmail.com on 2026-06-23.',
  updated_at = datetime('now')
WHERE slug = 'kenneth-r-casner';

-- Andrew Server supplied his campaign Facebook page and professional background.
UPDATE candidates
SET
  facebook_url = 'https://www.facebook.com/profile.php?id=61572111394159',
  occupation = 'Teacher at Cheyenne East High School; summer quality assurance inspector for roadway construction.',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied Facebook page and professional background received by email from serverforwy@gmail.com on 2026-06-22.',
  updated_at = datetime('now')
WHERE slug = 'andrew-server';

-- Ozzie Knezovich supplied his campaign website.
UPDATE candidates
SET
  website_url = 'https://ozzieforsheriff.com/',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied campaign website received by email from ozzieforsheriff@sheriffozzie.com on 2026-06-21.',
  updated_at = datetime('now')
WHERE slug = 'ozzie-knezovich-7038add5';

-- Lisa Kinney's campaign manager supplied campaign website and Facebook handle.
UPDATE candidates
SET
  website_url = 'https://lisakinneyforcongress.com/',
  facebook_url = 'https://www.facebook.com/lisakinneyforUSHouse/',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Campaign website and Facebook handle supplied by campaign manager Laurie Larsen via email from lisakinney2026@wyoming.com on 2026-06-22.',
  updated_at = datetime('now')
WHERE slug = 'lisa-kinney';
