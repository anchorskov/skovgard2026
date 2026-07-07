-- worker/migrations/026_email_contacts.sql
-- Canonical email contact table (Phase 1 of docs/db/EmailConsolidationPlan.md).
-- Consolidates the "why do we have this email" question that today is answered
-- by table membership (newsletter_subscribers/sms_optins/volunteers/candidates/
-- voter-file views) into one row per email_norm, with consent modeled per
-- contact and purposes tracked in a companion table instead of separate tables
-- per purpose. lalvoterid is a nullable, best-effort link back to the raw voter
-- file -- most rows will not have one, and that's expected, not an error state.

CREATE TABLE IF NOT EXISTS email_contacts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL,
  email_norm        TEXT NOT NULL,
  consent_status    TEXT NOT NULL DEFAULT 'no_signal', -- opted_in | opted_out | no_signal
  consent_version   TEXT,
  first_name        TEXT,
  last_name         TEXT,
  lalvoterid        TEXT,                              -- nullable link to raw voter file; best-effort
  source            TEXT NOT NULL,                      -- pipeline that created this row, e.g. skovgard2026:newsletter
  source_detail     TEXT,
  import_batch      TEXT,
  first_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_contacts_email_norm
  ON email_contacts(email_norm);

CREATE INDEX IF NOT EXISTS ix_email_contacts_lalvoterid
  ON email_contacts(lalvoterid);

CREATE INDEX IF NOT EXISTS ix_email_contacts_consent_status
  ON email_contacts(consent_status);

-- Why a contact exists: subscriber | volunteer | candidate | voter_file, etc.
-- A contact can carry more than one purpose (e.g. subscriber + volunteer).
CREATE TABLE IF NOT EXISTS email_contact_purposes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email_contact_id  INTEGER NOT NULL,
  purpose           TEXT NOT NULL,
  source            TEXT,
  added_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (email_contact_id) REFERENCES email_contacts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_contact_purposes_contact_purpose
  ON email_contact_purposes(email_contact_id, purpose);

CREATE INDEX IF NOT EXISTS ix_email_contact_purposes_purpose
  ON email_contact_purposes(purpose);
