-- worker/migrations/028_email_blast_bounce_override.sql
-- Per-job bounce-rate ceiling override for the deliverability circuit
-- breaker (send-chunk, worker/src/index.js). NULL means "use the normal
-- DELIVERABILITY_BOUNCE_PAUSE_RATE default (5%)" -- unchanged behavior for
-- every existing/future job unless an admin explicitly overrides one via
-- PATCH /api/admin/emails/blast/override. Persists for the rest of that
-- job only; never alters the global default. See docs/blast_tracking.md.

ALTER TABLE email_blast_jobs
  ADD COLUMN bounce_pause_rate_override REAL;
