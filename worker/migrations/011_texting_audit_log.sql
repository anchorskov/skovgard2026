-- worker/migrations/011_texting_audit_log.sql
CREATE TABLE IF NOT EXISTS texting_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_phone TEXT,
  message_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_texting_audit_log_created_at
  ON texting_audit_log(created_at);

CREATE INDEX IF NOT EXISTS ix_texting_audit_log_target_phone
  ON texting_audit_log(target_phone);
