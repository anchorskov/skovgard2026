CREATE TABLE IF NOT EXISTS admin_auth_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_admin_auth_failures_ip_time ON admin_auth_failures(ip_hash, created_at);
