-- Create volunteers table - slim schema
CREATE TABLE IF NOT EXISTS volunteers (
  id         TEXT PRIMARY KEY,  -- uuid or ulid as text
  first_name TEXT,
  last_name  TEXT,
  email      TEXT,
  phone      TEXT,
  source     TEXT DEFAULT 'manual',   -- web_form, sms_optins, event, import
  status     TEXT DEFAULT 'new',      -- new, active, paused, do_not_contact
  notes      TEXT,
  tags_json  TEXT DEFAULT '[]',       -- JSON array of tags
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Indexes and trigger
CREATE UNIQUE INDEX IF NOT EXISTS ux_volunteers_email ON volunteers(email)  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_volunteers_phone ON volunteers(phone)  WHERE phone IS NOT NULL;
CREATE INDEX        IF NOT EXISTS ix_volunteers_status ON volunteers(status);

CREATE TRIGGER IF NOT EXISTS trg_volunteers_updated_at
AFTER UPDATE ON volunteers
FOR EACH ROW
BEGIN
  UPDATE volunteers
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = OLD.id;
END;
