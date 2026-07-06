-- worker/migrations/023_resend_webhooks.sql
-- Append-only Resend webhook event ledger plus outbound email suppression guardrail.

CREATE TABLE IF NOT EXISTS resend_webhook_events (
  svix_id              TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL,
  event_created_at     TEXT,
  email_id             TEXT,
  message_id           TEXT,
  recipient_email      TEXT,
  recipient_email_norm TEXT,
  source               TEXT,
  kind                 TEXT,
  batch_id             TEXT,
  raw_json             TEXT NOT NULL,
  processed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_resend_webhook_events_type_created
  ON resend_webhook_events(event_type, event_created_at);

CREATE INDEX IF NOT EXISTS ix_resend_webhook_events_email
  ON resend_webhook_events(recipient_email_norm, event_created_at);

CREATE INDEX IF NOT EXISTS ix_resend_webhook_events_message
  ON resend_webhook_events(email_id, message_id);

CREATE TABLE IF NOT EXISTS email_suppressions (
  email_norm        TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  reason            TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  resend_event_id   TEXT,
  resend_message_id TEXT,
  suppressed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  details_json      TEXT
);

CREATE INDEX IF NOT EXISTS ix_email_suppressions_suppressed_at
  ON email_suppressions(suppressed_at);
