-- Candidate-supplied corrections received 2026-06-24.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

-- Douglas Moore (HD-31) supplied his campaign email address.
UPDATE candidates
SET
  email = 'Doug@mooreforwyoming.com',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied campaign email received 2026-06-24. Replaces original SOS roster email Dug7088@gmail.com.',
  updated_at = datetime('now')
WHERE slug = 'douglas-moore';

-- Mark Jones (HD-40) supplied his candidate bio.
UPDATE candidates
SET
  summary = 'Mark Jones is a Republican Candidate for Representative in Wyoming House District 40. Mark is a traditional conservative and a resident of Johnson County, WY. He is passionate about protecting Americans'' Constitutional Rights and defending Wyoming''s way of life.',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied bio received by email from markjonesforwyoming@gmail.com on 2026-06-22.',
  updated_at = datetime('now')
WHERE slug = 'mark-jones';

-- Craig R. Shidler (Big Horn County Sheriff) supplied his campaign website and Facebook page.
UPDATE candidates
SET
  website_url = 'https://www.shidlerforsheriff.com',
  facebook_url = 'https://www.facebook.com/profile.php?id=61589883038618',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied campaign website and Facebook page received by email from shidler4sheriff@gmail.com on 2026-06-24.',
  updated_at = datetime('now')
WHERE slug = 'craig-r-shidler-517fbf1a';

-- Samuel Buckwalter supplied his campaign website.
UPDATE candidates
SET
  website_url = 'https://www.buckwalterforwyoming.com',
  data_confidence = 'High',
  human_review_needed = 0,
  enrichment_notes = 'Candidate-supplied campaign website received by email from foxtrot6crownarms@gmail.com on 2026-06-24.',
  updated_at = datetime('now')
WHERE slug = 'samuel-buckwalter-3';
