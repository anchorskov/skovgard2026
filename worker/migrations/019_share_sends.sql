-- worker/migrations/019_share_sends.sql
-- Audit log for every share-email send attempt.
-- Also serves as the rate-limit counter (checked by sender_ip_hash + created_at index).
CREATE TABLE IF NOT EXISTS share_sends (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  message_slug      TEXT    NOT NULL DEFAULT 'jimmys-story',
  recipient_email   TEXT    NOT NULL,
  sender_name       TEXT,
  sender_ip_hash    TEXT,
  resend_message_id TEXT,
  status            TEXT    NOT NULL,   -- 'sent' | 'failed'
  error_message     TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_share_sends_ip_hash
  ON share_sends(sender_ip_hash, created_at);

CREATE INDEX IF NOT EXISTS ix_share_sends_created_at
  ON share_sends(created_at);

CREATE INDEX IF NOT EXISTS ix_share_sends_recipient
  ON share_sends(recipient_email);
