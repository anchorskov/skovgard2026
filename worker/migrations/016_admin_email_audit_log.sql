-- worker/migrations/016_admin_email_audit_log.sql
CREATE TABLE IF NOT EXISTS admin_email_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_email TEXT,
  subject TEXT,
  message_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_admin_email_audit_log_created_at
  ON admin_email_audit_log(created_at);

CREATE INDEX IF NOT EXISTS ix_admin_email_audit_log_target_email
  ON admin_email_audit_log(target_email);
