-- worker/migrations/012_contacts_welcome_tags.sql
ALTER TABLE contacts ADD COLUMN tags TEXT;
ALTER TABLE contacts ADD COLUMN welcome_sent_at TEXT;

CREATE INDEX IF NOT EXISTS ix_contacts_welcome_sent_at
  ON contacts(welcome_sent_at);
