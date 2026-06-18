-- 0002_candidates_enrichment.sql
-- Adds enrichment columns to candidates table.
-- All columns nullable so existing rows are unaffected.

-- Additional social
ALTER TABLE candidates ADD COLUMN linkedin_url TEXT;

-- Campaign finance (FEC + Wyoming WYCFIS)
ALTER TABLE candidates ADD COLUMN fec_candidate_id TEXT;
ALTER TABLE candidates ADD COLUMN fec_committee_id TEXT;
ALTER TABLE candidates ADD COLUMN fec_candidate_url TEXT;
ALTER TABLE candidates ADD COLUMN fec_committee_url TEXT;
ALTER TABLE candidates ADD COLUMN wycfis_candidate_url TEXT;
ALTER TABLE candidates ADD COLUMN wycfis_committee_url TEXT;

-- Public profile
ALTER TABLE candidates ADD COLUMN top_issues TEXT;
ALTER TABLE candidates ADD COLUMN incumbency_status TEXT;
ALTER TABLE candidates ADD COLUMN current_office TEXT;
ALTER TABLE candidates ADD COLUMN public_statement_url TEXT;

-- Routing / display
ALTER TABLE candidates ADD COLUMN candidate_page_path TEXT;
ALTER TABLE candidates ADD COLUMN race_slug TEXT;
ALTER TABLE candidates ADD COLUMN race_display TEXT;

-- Official (non-campaign) presence
ALTER TABLE candidates ADD COLUMN official_office_url TEXT;
ALTER TABLE candidates ADD COLUMN official_office_facebook_url TEXT;
ALTER TABLE candidates ADD COLUMN official_office_x_url TEXT;

-- Photo metadata
ALTER TABLE candidates ADD COLUMN thumbnail_source_url TEXT;
ALTER TABLE candidates ADD COLUMN thumbnail_permission_status TEXT;

-- Enrichment tracking
ALTER TABLE candidates ADD COLUMN data_confidence TEXT;
ALTER TABLE candidates ADD COLUMN human_review_needed INTEGER DEFAULT 0;
ALTER TABLE candidates ADD COLUMN enrichment_notes TEXT;
ALTER TABLE candidates ADD COLUMN enrichment_batch TEXT;
ALTER TABLE candidates ADD COLUMN batch_status TEXT;
