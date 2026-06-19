-- Migration 0005: add ballotpedia_url to candidates
ALTER TABLE candidates ADD COLUMN ballotpedia_url TEXT;
