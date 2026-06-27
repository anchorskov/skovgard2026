-- Candidate email unsubscribe requests received 2026-06-25.
-- Apply to Candidates WY_DB (`wy`) in local and production.

INSERT INTO candidate_email_suppressions (
  email,
  email_norm,
  reason,
  source,
  suppressed_at,
  created_at,
  updated_at
) VALUES (
  'smfcodykiwi2@gmail.com',
  'smfcodykiwi2@gmail.com',
  'unsubscribe_stop_request',
  'user_request_2026-06-25',
  datetime('now'),
  datetime('now'),
  datetime('now')
)
ON CONFLICT(email_norm) DO UPDATE SET
  reason = excluded.reason,
  source = excluded.source,
  suppressed_at = COALESCE(candidate_email_suppressions.suppressed_at, excluded.suppressed_at),
  updated_at = datetime('now');
