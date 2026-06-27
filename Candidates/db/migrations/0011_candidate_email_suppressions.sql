-- Candidate admin email suppression list.
-- Keeps unsubscribe requests out of candidate bulk-email flows without altering
-- the public candidate filing record.

CREATE TABLE IF NOT EXISTS candidate_email_suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  reason TEXT,
  source TEXT,
  suppressed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_candidate_email_suppressions_email_norm
  ON candidate_email_suppressions(email_norm);
