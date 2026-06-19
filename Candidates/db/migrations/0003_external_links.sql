-- Add external_links_json to candidates for Ballotpedia-type reference links.
-- Stores a JSON array: [{"label": "Ballotpedia", "url": "https://..."}, ...]
-- Separate from website_url, facebook_url, campaign_finance_url shown on the card.
ALTER TABLE candidates ADD COLUMN external_links_json TEXT;
