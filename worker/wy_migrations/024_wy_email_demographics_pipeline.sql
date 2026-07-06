-- Adds the email/demographics linkage pipeline (voterdata/wyoming project) to the
-- shared "wy" D1 database. Table names avoid colliding with the existing voters/
-- voters_raw tables, which use a different schema and back live calling/targeting
-- features (call_activity, v_eligible_call, v_voter_targeting, v_best_email).
--
-- Lives in worker/wy_migrations/, NOT worker/migrations/ -- the latter is scanned
-- wholesale by `wrangler d1 migrations apply ballot_sources` (by filename, not by
-- which database the SQL targets), and a "wy"-targeted file in that folder gets
-- run against ballot_sources and fails (learned the hard way: this file briefly
-- lived at worker/migrations/024_... and broke a local `migrations apply` run).
--
-- Apply by hand against the shared "wy" database, not via `wrangler d1 migrations
-- apply` -- that database's migrations ledger is already fragmented across other
-- projects (see project_shared_wy_db_migrations memory) and replaying it fails.
--   npx wrangler d1 execute wy --remote --env production --file=wy_migrations/024_wy_email_demographics_pipeline.sql

ALTER TABLE voter_emails ADD COLUMN senate_district TEXT;

CREATE TABLE IF NOT EXISTS voter_demographics (
  voter_id      TEXT,
  lalvoterid    TEXT NOT NULL,
  age           INTEGER,
  birth_date    DATE,
  birth_month   INTEGER,
  source        TEXT NOT NULL,
  import_batch  TEXT,
  observed_at   DATETIME,
  imported_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_stale      INTEGER NOT NULL DEFAULT 0 CHECK(is_stale IN (0,1)),
  stale_reason  TEXT,
  stale_as_of   DATE
);

-- Renamed copy of voterdata/wyoming's `voters` table -- prod already has a
-- `voters` table with an incompatible schema (voter_id, political_party, county,
-- senate, house, zip) used by other features, so this pipeline gets its own name.
CREATE TABLE IF NOT EXISTS voter_registry_detail (
  voter_id         TEXT PRIMARY KEY,
  last_name        TEXT NOT NULL,
  first_name       TEXT NOT NULL,
  middle_name      TEXT,
  name_suffix      TEXT,
  county           TEXT NOT NULL,
  precinct         TEXT,
  split_code       TEXT,
  political_party  TEXT,
  eff_reg_date     DATE,
  house_district   TEXT,
  senate_district  TEXT,
  status           TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS people (
  person_id    TEXT PRIMARY KEY,
  first_name   TEXT,
  last_name    TEXT,
  email        TEXT,
  phone        TEXT
);

CREATE TABLE IF NOT EXISTS deliverable_stage_norm (
  sequence,
  lalvoterid,
  voters_first_name,
  voters_middle_name,
  voters_last_name,
  voters_name_suffix,
  age,
  birth_date,
  birth_month,
  email_raw,
  email_norm
);

CREATE VIEW IF NOT EXISTS v_demographics_email AS
WITH email_counts AS (
  SELECT voter_id, COUNT(*) AS email_count
  FROM voter_emails
  WHERE voter_id IS NOT NULL AND TRIM(voter_id) != ''
  GROUP BY voter_id
), ranked_email AS (
  SELECT
    ve.voter_id,
    ve.email_norm,
    ve.email_raw,
    ve.source AS best_email_source,
    ve.imported_at AS best_email_imported_at,
    ROW_NUMBER() OVER (
      PARTITION BY ve.voter_id
      ORDER BY COALESCE(ve.confidence_code, -1) DESC,
               COALESCE(ve.observed_at, ve.imported_at) DESC,
               ve.email_norm
    ) AS rn
  FROM voter_emails ve
  WHERE ve.voter_id IS NOT NULL AND TRIM(ve.voter_id) != ''
)
SELECT
  d.voter_id,
  d.lalvoterid,
  d.age,
  d.birth_date,
  d.birth_month,
  d.is_stale,
  d.stale_reason,
  d.stale_as_of,
  d.source,
  d.import_batch,
  d.observed_at,
  d.imported_at,
  CASE WHEN ec.email_count IS NOT NULL AND ec.email_count > 0 THEN 1 ELSE 0 END AS has_email,
  COALESCE(ec.email_count, 0) AS email_count,
  re.email_norm AS best_email_norm,
  re.email_raw AS best_email_raw,
  re.best_email_source,
  re.best_email_imported_at,
  CASE
    WHEN d.is_stale = 0 AND ec.email_count IS NOT NULL AND ec.email_count > 0 THEN 1
    ELSE 0
  END AS is_contactable_email
FROM voter_demographics d
LEFT JOIN email_counts ec ON ec.voter_id = d.voter_id
LEFT JOIN ranked_email re ON re.voter_id = d.voter_id AND re.rn = 1;

CREATE VIEW IF NOT EXISTS v_unique_name_email_all AS
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
    d.import_batch AS import_batch
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
    ve.import_batch AS import_batch
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
  COUNT(*) AS record_count
FROM combined
WHERE email_norm IS NOT NULL AND TRIM(email_norm) != ''
  AND (first_name != '' OR last_name != '')
GROUP BY first_name, middle_name, last_name, name_suffix, email_norm;

CREATE VIEW IF NOT EXISTS v_unique_name_email_not_stale AS
SELECT *
FROM v_unique_name_email_all
WHERE is_stale = 0;
