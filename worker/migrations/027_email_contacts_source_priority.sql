-- worker/migrations/027_email_contacts_source_priority.sql
-- Adds source_priority bookkeeping to email_contacts so backfill/upsert scripts
-- can tell whether an incoming source outranks the value already on file
-- (per docs/db/EmailConsolidationPlan.md priority order: subscriber > volunteer
-- > candidate > voter_file) without re-deriving rank from free-text source
-- labels every time.

ALTER TABLE email_contacts ADD COLUMN source_priority INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_email_contacts_source_priority
  ON email_contacts(source_priority);
