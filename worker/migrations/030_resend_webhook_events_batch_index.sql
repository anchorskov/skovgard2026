-- worker/migrations/030_resend_webhook_events_batch_index.sql
-- computeBlastJobDeliverabilityRates (src/resend-webhooks.js) filters
-- resend_webhook_events WHERE batch_id = ? on every send-chunk call once a
-- job's sent_count crosses DELIVERABILITY_MIN_SAMPLE -- but batch_id had no
-- dedicated index (only (event_type, event_created_at), (recipient_email_norm,
-- event_created_at), and (email_id, message_id) existed from migration 023).
-- With the table at ~9,500+ rows from today's combined cron/webhook/blast
-- traffic, that per-chunk full scan pushed send-chunk over Cloudflare's
-- CPU-time limit (error 1102), stalling the running blast job.

CREATE INDEX IF NOT EXISTS ix_resend_webhook_events_batch_id
  ON resend_webhook_events(batch_id);

-- queryVerifiedUnsentAudienceChunk (src/index.js, filter=verified_unsent)
-- runs `WHERE q.verdict = 'good' ... ORDER BY q.email_norm ASC LIMIT ?` with
-- no OFFSET (deliberately, see the comment above that function) -- every
-- chunk re-scans from the start of email_norm order. EXPLAIN QUERY PLAN
-- confirmed this uses `SCAN q USING INDEX sqlite_autoindex_..._1` (the
-- email_norm primary key, for ordering only) with no filtering on verdict
-- at the index level -- every one of the 83,957 rows must be visited and
-- verdict-checked in the worst case. As more of this job's audience gets
-- marked sent (and thus excluded via the email_blast_log NOT EXISTS check),
-- each new chunk call has to walk past a growing prefix of already-excluded
-- rows before reaching fresh ones. This index lets SQLite restrict the scan
-- to verdict='good' rows only, in email_norm order, without touching
-- risky/bad rows at all.
CREATE INDEX IF NOT EXISTS ix_email_verification_queue_verdict_email
  ON email_verification_queue(verdict, email_norm);
