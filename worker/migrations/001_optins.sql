CREATE TABLE IF NOT EXISTS sms_optins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT NOT NULL,             -- digits only
  consent INTEGER NOT NULL,        -- 1 = checked
  consent_version TEXT NOT NULL,   -- copy of exact consent text/version used
  source TEXT NOT NULL,            -- 'skovgard2026:pulse'
  user_agent TEXT,
  ip_hash TEXT,                    -- sha256(ip) for audit; no raw IP stored
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sms_optins_phone ON sms_optins(phone);
CREATE INDEX IF NOT EXISTS ix_sms_optins_created ON sms_optins(created_at);
