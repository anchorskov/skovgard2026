-- worker/wy_migrations/026_v_unique_name_email_geo_columns.sql
-- Extends v_unique_name_email_all (and its is_stale=0 filter,
-- v_unique_name_email_not_stale) with county/house_district/senate_district,
-- pulled from the voter_registry_detail join both CTE branches already have.
-- Needed so the email blast can filter the full wy voter-file audience by
-- city/HD/SD the same way the existing ballot_sources-backed audience does.
--
-- Lives in worker/wy_migrations/, not worker/migrations/ -- see
-- 024_wy_email_demographics_pipeline.sql's header for why.
--
-- Apply by hand:
--   npx wrangler d1 execute wy --remote --env production --file=wy_migrations/026_v_unique_name_email_geo_columns.sql

DROP VIEW IF EXISTS v_unique_name_email_not_stale;
DROP VIEW IF EXISTS v_unique_name_email_all;

CREATE VIEW v_unique_name_email_all AS
WITH stage_name AS (
  SELECT
    lalvoterid,
    MAX(NULLIF(TRIM(voters_first_name), '')) AS stage_first_name,
    MAX(NULLIF(TRIM(voters_middle_name), '')) AS stage_middle_name,
    MAX(NULLIF(TRIM(voters_last_name), '')) AS stage_last_name,
    MAX(NULLIF(TRIM(voters_name_suffix), '')) AS stage_name_suffix
  FROM deliverable_stage_norm
  GROUP BY lalvoterid
), stage_email AS (
  SELECT
    lalvoterid,
    LOWER(TRIM(email_norm)) AS email_norm
  FROM deliverable_stage_norm
  WHERE email_norm IS NOT NULL AND TRIM(email_norm) != ''
), deliverable_named AS (
  SELECT
    d.voter_id AS voter_id,
    d.lalvoterid AS lalvoterid,
    UPPER(TRIM(COALESCE(v.first_name, sn.stage_first_name, ''))) AS first_name,
    UPPER(TRIM(COALESCE(v.middle_name, sn.stage_middle_name, ''))) AS middle_name,
    UPPER(TRIM(COALESCE(v.last_name, sn.stage_last_name, ''))) AS last_name,
    UPPER(TRIM(COALESCE(v.name_suffix, sn.stage_name_suffix, ''))) AS name_suffix,
    LOWER(TRIM(COALESCE(d.best_email_norm, se.email_norm))) AS email_norm,
    d.is_stale AS is_stale,
    d.stale_reason AS stale_reason,
    d.stale_as_of AS stale_as_of,
    d.source AS source,
    d.import_batch AS import_batch,
    v.county AS county,
    v.house_district AS house_district,
    v.senate_district AS senate_district
  FROM v_demographics_email d
  LEFT JOIN voter_registry_detail v ON v.voter_id = d.voter_id
  LEFT JOIN stage_name sn ON sn.lalvoterid = d.lalvoterid
  LEFT JOIN stage_email se ON se.lalvoterid = d.lalvoterid
), email_inventory_named AS (
  SELECT
    ve.voter_id AS voter_id,
    NULL AS lalvoterid,
    UPPER(TRIM(COALESCE(v.first_name, p.first_name, ''))) AS first_name,
    UPPER(TRIM(COALESCE(v.middle_name, ''))) AS middle_name,
    UPPER(TRIM(COALESCE(v.last_name, p.last_name, ''))) AS last_name,
    UPPER(TRIM(COALESCE(v.name_suffix, ''))) AS name_suffix,
    LOWER(TRIM(ve.email_norm)) AS email_norm,
    CASE
      WHEN ve.voter_id IS NULL OR TRIM(ve.voter_id) = '' THEN 1
      WHEN v.voter_id IS NULL THEN 1
      WHEN COALESCE(LOWER(v.status), 'active') != 'active' THEN 1
      ELSE 0
    END AS is_stale,
    CASE
      WHEN ve.voter_id IS NULL OR TRIM(ve.voter_id) = '' THEN 'no_voter_id_match_aug2025_snapshot'
      WHEN v.voter_id IS NULL THEN 'voter_id_not_in_aug2025_snapshot'
      WHEN COALESCE(LOWER(v.status), 'active') != 'active' THEN 'voter_status_not_active_in_snapshot'
      ELSE NULL
    END AS stale_reason,
    '2025-08-31' AS stale_as_of,
    ve.source AS source,
    ve.import_batch AS import_batch,
    v.county AS county,
    v.house_district AS house_district,
    v.senate_district AS senate_district
  FROM voter_emails ve
  LEFT JOIN voter_registry_detail v ON v.voter_id = ve.voter_id
  LEFT JOIN people p ON p.person_id = ve.voter_id
  WHERE ve.email_norm IS NOT NULL AND TRIM(ve.email_norm) != ''
), combined AS (
  SELECT * FROM deliverable_named
  UNION ALL
  SELECT * FROM email_inventory_named
)
SELECT
  first_name,
  middle_name,
  last_name,
  name_suffix,
  TRIM(
    first_name ||
    CASE WHEN middle_name != '' THEN ' ' || middle_name ELSE '' END ||
    CASE WHEN last_name != '' THEN ' ' || last_name ELSE '' END ||
    CASE WHEN name_suffix != '' THEN ' ' || name_suffix ELSE '' END
  ) AS full_name,
  email_norm,
  CASE
    WHEN MAX(CASE WHEN is_stale = 0 THEN 1 ELSE 0 END) = 1 THEN 0
    ELSE 1
  END AS is_stale,
  CASE
    WHEN MAX(CASE WHEN is_stale = 0 THEN 1 ELSE 0 END) = 1 THEN NULL
    ELSE MIN(stale_reason)
  END AS stale_reason,
  MAX(stale_as_of) AS stale_as_of,
  GROUP_CONCAT(DISTINCT source) AS sources,
  GROUP_CONCAT(DISTINCT import_batch) AS import_batches,
  GROUP_CONCAT(DISTINCT voter_id) AS voter_ids,
  GROUP_CONCAT(DISTINCT lalvoterid) AS lalvoterids,
  COUNT(*) AS record_count,
  MAX(county) AS county,
  MAX(house_district) AS house_district,
  MAX(senate_district) AS senate_district
FROM combined
WHERE email_norm IS NOT NULL AND TRIM(email_norm) != ''
  AND (first_name != '' OR last_name != '')
GROUP BY first_name, middle_name, last_name, name_suffix, email_norm;

CREATE VIEW v_unique_name_email_not_stale AS
SELECT *
FROM v_unique_name_email_all
WHERE is_stale = 0;
