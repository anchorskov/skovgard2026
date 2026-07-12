-- Candidates/db/migrations/0023_guide_questionnaire_consent.sql
-- Consent timestamps captured at questionnaire submission time, alongside
-- the existing sent_at tracking on the per-candidate token row.

ALTER TABLE guide_questionnaire_tokens ADD COLUMN consent_authorized_at TEXT;
ALTER TABLE guide_questionnaire_tokens ADD COLUMN consent_publish_at TEXT;
