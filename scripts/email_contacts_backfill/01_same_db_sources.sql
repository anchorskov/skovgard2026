-- scripts/email_contacts_backfill/01_same_db_sources.sql
-- Phase 2 backfill of email_contacts (see docs/db/EmailConsolidationPlan.md)
-- from the sources that already live in ballot_sources. Safe to re-run: every
-- INSERT is an upsert keyed on email_norm.
--
-- Priority order (docs/db/EmailConsolidationPlan.md, confirmed 2026-07-07):
--   subscriber (newsletter_subscribers) = 4 (highest)
--   volunteer (sms_optins.is_volunteer, volunteers table) = 3
--   [candidate = 2, voter_file = 1 come from WY_DB, handled separately]
--
-- consent_status policy: 'opted_out' is sticky once set by any source -- an
-- explicit do-not-contact signal should never be silently overwritten by a
-- lower- or equal-priority "no signal" from another table.

-- 1a. newsletter_subscribers -> purpose 'subscriber', priority 4
INSERT INTO email_contacts (
  email, email_norm, consent_status, consent_version, first_name, last_name,
  source, source_detail, source_priority, first_seen_at, updated_at
)
SELECT
  ns.email,
  ns.email_norm,
  CASE WHEN ns.consent_email = 1 AND ns.active = 1 THEN 'opted_in'
       WHEN ns.active = 0 THEN 'opted_out'
       ELSE 'no_signal' END,
  ns.consent_version,
  NULL,
  NULL,
  'email_contacts_backfill',
  'newsletter_subscribers',
  4,
  ns.created_at,
  datetime('now')
FROM newsletter_subscribers ns
WHERE TRUE -- required: disambiguates the parser's ON from a join condition before ON CONFLICT
ON CONFLICT(email_norm) DO UPDATE SET
  consent_status = CASE
    WHEN email_contacts.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_status
    ELSE email_contacts.consent_status
  END,
  consent_version = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_version ELSE email_contacts.consent_version END,
  source = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source ELSE email_contacts.source END,
  source_detail = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source_detail ELSE email_contacts.source_detail END,
  source_priority = MAX(email_contacts.source_priority, excluded.source_priority),
  updated_at = datetime('now');

INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)
SELECT ec.id, 'subscriber', 'newsletter_subscribers'
FROM email_contacts ec
JOIN newsletter_subscribers ns ON ns.email_norm = ec.email_norm;

-- 1b. sms_optins (is_volunteer=1) -> purpose 'volunteer', priority 3
INSERT INTO email_contacts (
  email, email_norm, consent_status, first_name, last_name,
  source, source_detail, source_priority, first_seen_at, updated_at
)
SELECT
  so.email,
  LOWER(TRIM(so.email)),
  CASE WHEN so.consent_email = 1 THEN 'opted_in' ELSE 'no_signal' END,
  so.first_name,
  so.last_name,
  'email_contacts_backfill',
  'sms_optins_volunteer',
  3,
  so.created_at,
  datetime('now')
FROM sms_optins so
WHERE so.is_volunteer = 1 AND TRIM(COALESCE(so.email, '')) != ''
ON CONFLICT(email_norm) DO UPDATE SET
  first_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.first_name, '')) = '' THEN excluded.first_name ELSE email_contacts.first_name END,
  last_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.last_name, '')) = '' THEN excluded.last_name ELSE email_contacts.last_name END,
  consent_status = CASE
    WHEN email_contacts.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_status
    ELSE email_contacts.consent_status
  END,
  source = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source ELSE email_contacts.source END,
  source_detail = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source_detail ELSE email_contacts.source_detail END,
  source_priority = MAX(email_contacts.source_priority, excluded.source_priority),
  updated_at = datetime('now');

INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)
SELECT ec.id, 'volunteer', 'sms_optins'
FROM email_contacts ec
JOIN sms_optins so ON LOWER(TRIM(so.email)) = ec.email_norm
WHERE so.is_volunteer = 1;

-- 1c. volunteers table -> purpose 'volunteer', priority 3
-- status='do_not_contact' is an explicit do-not-email signal -> opted_out.
INSERT INTO email_contacts (
  email, email_norm, consent_status, first_name, last_name,
  source, source_detail, source_priority, first_seen_at, updated_at
)
SELECT
  v.email,
  LOWER(TRIM(v.email)),
  CASE WHEN v.status = 'do_not_contact' THEN 'opted_out' ELSE 'no_signal' END,
  v.first_name,
  v.last_name,
  'email_contacts_backfill',
  'volunteers',
  3,
  v.created_at,
  datetime('now')
FROM volunteers v
WHERE TRIM(COALESCE(v.email, '')) != ''
ON CONFLICT(email_norm) DO UPDATE SET
  first_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.first_name, '')) = '' THEN excluded.first_name ELSE email_contacts.first_name END,
  last_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.last_name, '')) = '' THEN excluded.last_name ELSE email_contacts.last_name END,
  consent_status = CASE
    WHEN email_contacts.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_status
    ELSE email_contacts.consent_status
  END,
  source = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source ELSE email_contacts.source END,
  source_detail = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source_detail ELSE email_contacts.source_detail END,
  source_priority = MAX(email_contacts.source_priority, excluded.source_priority),
  updated_at = datetime('now');

INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)
SELECT ec.id, 'volunteer', 'volunteers'
FROM email_contacts ec
JOIN volunteers v ON LOWER(TRIM(v.email)) = ec.email_norm;
