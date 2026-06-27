-- Candidate-provided campaign social links, received 2026-06-21.
-- Apply to both local and production WY_DB (`wy`).
UPDATE candidates
SET
  facebook_url = 'https://www.facebook.com/profile.php?id=61590168326305',
  instagram_url = 'https://www.instagram.com/nicholasjesse4laramie/',
  updated_at = datetime('now')
WHERE slug = 'nicholas-jesse-1';
