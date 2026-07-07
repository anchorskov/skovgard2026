-- worker/migrations/025_email_optin_tokens.sql
-- Per-recipient tokens for Yes/No opt-in confirmation buttons embedded in
-- admin-sent share/blast emails. A click updates the token row here AND
-- upserts newsletter_subscribers (the table ADMIN_EMAIL_CONTACTS_CTE treats
-- as authoritative for consent_email regardless of which table a contact
-- originated from) so the response takes effect on the next audience query
-- immediately -- no separate sync step.

CREATE TABLE IF NOT EXISTS email_optin_tokens (
  token         TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL,
  message_slug  TEXT NOT NULL,
  batch_id      TEXT,
  response      TEXT NOT NULL DEFAULT 'pending',  -- pending | yes | no
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at  TEXT
);

CREATE INDEX IF NOT EXISTS ix_email_optin_tokens_email
  ON email_optin_tokens(email_norm);

CREATE INDEX IF NOT EXISTS ix_email_optin_tokens_message_slug
  ON email_optin_tokens(message_slug);
