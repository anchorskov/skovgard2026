-- worker/migrations/010_telnyx_webhooks.sql
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_e164 TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_phone_e164
  ON contacts(phone_e164);

CREATE TABLE IF NOT EXISTS consent_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL,
  source_detail TEXT,
  consented_at TEXT,
  revoked_at TEXT,
  last_inbound_keyword TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_consent_status_phone_e164
  ON consent_status(phone_e164);

CREATE INDEX IF NOT EXISTS ix_consent_status_status
  ON consent_status(status);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telnyx_message_id TEXT,
  phone_from TEXT NOT NULL,
  phone_to TEXT NOT NULL,
  text TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inbound_messages_telnyx_message_id
  ON inbound_messages(telnyx_message_id);

CREATE INDEX IF NOT EXISTS ix_inbound_messages_phone_from
  ON inbound_messages(phone_from);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telnyx_message_id TEXT NOT NULL,
  phone_from TEXT NOT NULL,
  phone_to TEXT NOT NULL,
  text TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  cost_nullable TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbound_messages_telnyx_message_id
  ON outbound_messages(telnyx_message_id);

CREATE INDEX IF NOT EXISTS ix_outbound_messages_phone_to
  ON outbound_messages(phone_to);

CREATE TABLE IF NOT EXISTS telnyx_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT,
  event_type TEXT NOT NULL,
  telnyx_message_id TEXT,
  occurred_at TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  signature_valid INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telnyx_events_event_id
  ON telnyx_events(event_id);

CREATE INDEX IF NOT EXISTS ix_telnyx_events_processed_at
  ON telnyx_events(processed_at);

CREATE INDEX IF NOT EXISTS ix_telnyx_events_signature_valid
  ON telnyx_events(signature_valid);
