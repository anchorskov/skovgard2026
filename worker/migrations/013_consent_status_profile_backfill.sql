-- worker/migrations/013_consent_status_profile_backfill.sql
ALTER TABLE consent_status ADD COLUMN first_name TEXT;
ALTER TABLE consent_status ADD COLUMN last_name TEXT;
ALTER TABLE consent_status ADD COLUMN email TEXT;
ALTER TABLE consent_status ADD COLUMN consent_email INTEGER;
ALTER TABLE consent_status ADD COLUMN wy_voter INTEGER;
ALTER TABLE consent_status ADD COLUMN county TEXT;
ALTER TABLE consent_status ADD COLUMN zip TEXT;
ALTER TABLE consent_status ADD COLUMN consent_version TEXT;
ALTER TABLE consent_status ADD COLUMN user_agent TEXT;
ALTER TABLE consent_status ADD COLUMN ip_hash TEXT;

WITH normalized AS (
  SELECT
    CASE
      WHEN phone IS NULL OR TRIM(phone) = '' THEN NULL
      WHEN LENGTH(phone) = 10 THEN '+1' || phone
      WHEN LENGTH(phone) = 11 AND SUBSTR(phone, 1, 1) = '1' THEN '+' || phone
      ELSE '+' || phone
    END AS phone_e164,
    NULLIF(TRIM(first_name), '') AS first_name,
    NULLIF(TRIM(last_name), '') AS last_name,
    NULLIF(TRIM(email), '') AS email,
    consent,
    consent_email,
    wy_voter,
    NULLIF(TRIM(county), '') AS county,
    NULLIF(TRIM(zip), '') AS zip,
    NULLIF(TRIM(consent_version), '') AS consent_version,
    NULLIF(TRIM(user_agent), '') AS user_agent,
    NULLIF(TRIM(ip_hash), '') AS ip_hash,
    NULLIF(TRIM(source), '') AS legacy_source,
    COALESCE(created_at, datetime('now')) AS created_at
  FROM sms_optins
)
INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at)
SELECT
  phone_e164,
  first_name,
  last_name,
  created_at,
  created_at
FROM normalized
WHERE phone_e164 IS NOT NULL
ON CONFLICT(phone_e164) DO UPDATE SET
  first_name=COALESCE(NULLIF(contacts.first_name, ''), excluded.first_name),
  last_name=COALESCE(NULLIF(contacts.last_name, ''), excluded.last_name),
  updated_at=datetime('now');

WITH normalized AS (
  SELECT
    CASE
      WHEN phone IS NULL OR TRIM(phone) = '' THEN NULL
      WHEN LENGTH(phone) = 10 THEN '+1' || phone
      WHEN LENGTH(phone) = 11 AND SUBSTR(phone, 1, 1) = '1' THEN '+' || phone
      ELSE '+' || phone
    END AS phone_e164,
    NULLIF(TRIM(first_name), '') AS first_name,
    NULLIF(TRIM(last_name), '') AS last_name,
    NULLIF(TRIM(email), '') AS email,
    consent,
    consent_email,
    wy_voter,
    NULLIF(TRIM(county), '') AS county,
    NULLIF(TRIM(zip), '') AS zip,
    NULLIF(TRIM(consent_version), '') AS consent_version,
    NULLIF(TRIM(user_agent), '') AS user_agent,
    NULLIF(TRIM(ip_hash), '') AS ip_hash,
    NULLIF(TRIM(source), '') AS legacy_source,
    COALESCE(created_at, datetime('now')) AS created_at,
    CASE
      WHEN source IN ('skovgard2026:pulse', 'pulse') THEN 'web_form'
      WHEN source IN ('skovgard2026:donate', 'donate') THEN 'web_form'
      WHEN source IN ('skovgard2026:inbound_sms', 'inbound_sms') THEN 'inbound_sms'
      ELSE COALESCE(NULLIF(TRIM(source), ''), 'web_form')
    END AS consent_source,
    CASE
      WHEN source IN ('skovgard2026:pulse', 'pulse') THEN 'pulse'
      WHEN source IN ('skovgard2026:donate', 'donate') THEN 'donate'
      WHEN source IN ('skovgard2026:inbound_sms', 'inbound_sms') THEN 'legacy_sms_optin'
      ELSE NULLIF(TRIM(source), '')
    END AS consent_source_detail
  FROM sms_optins
)
INSERT INTO consent_status (
  phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword,
  first_name, last_name, email, consent_email, wy_voter, county, zip,
  consent_version, user_agent, ip_hash, created_at, updated_at
)
SELECT
  phone_e164,
  CASE
    WHEN COALESCE(consent, 0) = 1 THEN 'opted_in'
    WHEN consent_source = 'inbound_sms' THEN 'opted_out'
    ELSE 'unknown'
  END AS status,
  consent_source,
  consent_source_detail,
  CASE WHEN COALESCE(consent, 0) = 1 THEN created_at ELSE NULL END AS consented_at,
  CASE WHEN COALESCE(consent, 0) = 1 OR consent_source != 'inbound_sms' THEN NULL ELSE created_at END AS revoked_at,
  NULL,
  first_name,
  last_name,
  email,
  consent_email,
  wy_voter,
  county,
  zip,
  consent_version,
  user_agent,
  ip_hash,
  created_at,
  created_at
FROM normalized
WHERE phone_e164 IS NOT NULL
ON CONFLICT(phone_e164) DO NOTHING;

WITH normalized AS (
  SELECT
    CASE
      WHEN phone IS NULL OR TRIM(phone) = '' THEN NULL
      WHEN LENGTH(phone) = 10 THEN '+1' || phone
      WHEN LENGTH(phone) = 11 AND SUBSTR(phone, 1, 1) = '1' THEN '+' || phone
      ELSE '+' || phone
    END AS phone_e164,
    NULLIF(TRIM(first_name), '') AS first_name,
    NULLIF(TRIM(last_name), '') AS last_name,
    NULLIF(TRIM(email), '') AS email,
    consent,
    consent_email,
    wy_voter,
    NULLIF(TRIM(county), '') AS county,
    NULLIF(TRIM(zip), '') AS zip,
    NULLIF(TRIM(consent_version), '') AS consent_version,
    NULLIF(TRIM(user_agent), '') AS user_agent,
    NULLIF(TRIM(ip_hash), '') AS ip_hash,
    NULLIF(TRIM(source), '') AS legacy_source,
    COALESCE(created_at, datetime('now')) AS created_at,
    CASE
      WHEN source IN ('skovgard2026:pulse', 'pulse') THEN 'web_form'
      WHEN source IN ('skovgard2026:donate', 'donate') THEN 'web_form'
      WHEN source IN ('skovgard2026:inbound_sms', 'inbound_sms') THEN 'inbound_sms'
      ELSE NULLIF(TRIM(source), '')
    END AS consent_source,
    CASE
      WHEN source IN ('skovgard2026:pulse', 'pulse') THEN 'pulse'
      WHEN source IN ('skovgard2026:donate', 'donate') THEN 'donate'
      WHEN source IN ('skovgard2026:inbound_sms', 'inbound_sms') THEN 'legacy_sms_optin'
      ELSE NULLIF(TRIM(source), '')
    END AS consent_source_detail
  FROM sms_optins
)
UPDATE consent_status
SET
  first_name = COALESCE(NULLIF(consent_status.first_name, ''), (SELECT n.first_name FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  last_name = COALESCE(NULLIF(consent_status.last_name, ''), (SELECT n.last_name FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  email = COALESCE(NULLIF(consent_status.email, ''), (SELECT n.email FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  consent_email = COALESCE(consent_status.consent_email, (SELECT n.consent_email FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  wy_voter = COALESCE(consent_status.wy_voter, (SELECT n.wy_voter FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  county = COALESCE(NULLIF(consent_status.county, ''), (SELECT n.county FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  zip = COALESCE(NULLIF(consent_status.zip, ''), (SELECT n.zip FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  consent_version = COALESCE(NULLIF(consent_status.consent_version, ''), (SELECT n.consent_version FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  user_agent = COALESCE(NULLIF(consent_status.user_agent, ''), (SELECT n.user_agent FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  ip_hash = COALESCE(NULLIF(consent_status.ip_hash, ''), (SELECT n.ip_hash FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  source = COALESCE(NULLIF(consent_status.source, ''), (SELECT n.consent_source FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  source_detail = COALESCE(NULLIF(consent_status.source_detail, ''), (SELECT n.consent_source_detail FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)),
  consented_at = COALESCE(
    consent_status.consented_at,
    CASE
      WHEN consent_status.status = 'opted_in' THEN (SELECT n.created_at FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)
      ELSE NULL
    END
  ),
  revoked_at = COALESCE(
    consent_status.revoked_at,
    CASE
      WHEN consent_status.status = 'opted_out' THEN (SELECT n.created_at FROM normalized n WHERE n.phone_e164 = consent_status.phone_e164)
      ELSE NULL
    END
  )
WHERE phone_e164 IN (
  SELECT phone_e164
  FROM normalized
  WHERE phone_e164 IS NOT NULL
);
