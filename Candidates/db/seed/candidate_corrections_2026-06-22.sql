-- Candidate-supplied corrections received 2026-06-22.
-- Apply once to the Candidates WY_DB (`wy`) in local and production.

UPDATE candidates
SET summary = 'Mark Jones is a Republican Candidate for Representative in Wyoming House District 40. Mark is a traditional conservative and a resident of Johnson County, WY. He is passionate about protecting Americans'' Constitutional Rights and defending Wyoming''s way of life.',
    data_confidence = 'High',
    human_review_needed = 0,
    enrichment_notes = 'Candidate-supplied statement received by email from markjonesforwyoming@gmail.com on 2026-06-22.',
    updated_at = datetime('now')
WHERE slug = 'mark-jones';

UPDATE candidates
SET website_url = 'https://sites.google.com/view/lisajamiesonfornatronacounty',
    data_confidence = 'High',
    human_review_needed = 0,
    enrichment_notes = 'Candidate-supplied website received by email from lisajamieson2@gmail.com on 2026-06-22.',
    updated_at = datetime('now')
WHERE slug = 'lisa-jamieson-commissioner';
