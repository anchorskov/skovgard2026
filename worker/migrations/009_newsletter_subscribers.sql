CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  consent_email INTEGER NOT NULL DEFAULT 1, -- 0/1
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL,                     -- e.g. skovgard2026:updates
  active INTEGER NOT NULL DEFAULT 1,        -- 0/1 for future unsubscribes
  confirmed_at TEXT,                        -- reserved for future double opt-in
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_newsletter_subscribers_email_norm
  ON newsletter_subscribers(email_norm);

CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_created
  ON newsletter_subscribers(created_at);
