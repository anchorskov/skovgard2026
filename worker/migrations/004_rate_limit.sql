CREATE TABLE IF NOT EXISTS rl_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_rl_ip_time ON rl_submissions(ip_hash, created_at);
