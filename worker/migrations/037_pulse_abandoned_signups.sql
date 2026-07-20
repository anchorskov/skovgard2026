-- worker/migrations/037_pulse_abandoned_signups.sql
-- Captures /pulse form starts that never reached a real POST /api/optin
-- submission -- today those leave zero trace anywhere (checking the consent
-- checkbox and typing a phone number is pure client-side state; see
-- static/js/pulse-optin.js). This table exists purely so staff can call and
-- try to walk the person through completing a real opt-in -- it is NOT a
-- consent record and must never be read as one. Same "possession of a phone
-- number is not consent to contact" doctrine as docs/after_verification.md's
-- pre-consent poll-calling view; a completed call writes real consent into
-- consent_status via the normal upsertConsentStatus path (see
-- POST /api/admin/pulse-abandoned-signups/complete-optin), tagged
-- source='staff_call' so it's distinguishable from a self-submitted /pulse
-- form. call_status is a fixed engineering enum, matching migration 036's
-- pulse_voter_match_review precedent -- not a staff-editable list.

CREATE TABLE IF NOT EXISTS pulse_abandoned_signups (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_e164           TEXT NOT NULL,
  first_name           TEXT,
  step_reached         TEXT NOT NULL,   -- 'consent_checked' | 'step2_reached'
  captured_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  call_status          TEXT NOT NULL DEFAULT 'not_called',
  call_attempts        INTEGER NOT NULL DEFAULT 0,
  call_notes           TEXT,
  called_at            TEXT,
  called_by            TEXT,
  do_not_call          INTEGER NOT NULL DEFAULT 0,
  completed_phone_e164 TEXT      -- set once a real consent_status opt-in exists for this phone
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pulse_abandoned_signups_phone ON pulse_abandoned_signups(phone_e164);
CREATE INDEX IF NOT EXISTS ix_pulse_abandoned_signups_open ON pulse_abandoned_signups(call_status, do_not_call);
