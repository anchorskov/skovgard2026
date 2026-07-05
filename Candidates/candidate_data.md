# Candidate Data Reference

AI agent reference for the `wy` D1 database backing the Wyoming 2026 primary voter guide sub-project (`Candidates/`).

## Schema snapshot

```
offices (86 rows)
  id           INTEGER PK AUTOINCREMENT
  title        TEXT NOT NULL           -- "U.S. Representative", "Wyoming State Senate"
  level        TEXT NOT NULL           -- federal | statewide | wy_senate | wy_house | county | city
  district     INTEGER NULLABLE        -- NULL for federal/statewide; HD/SD number otherwise
  sort_order   INTEGER DEFAULT 0
  precinct_code TEXT NULLABLE          -- structured precinct code for precinct committee offices

candidates (200 rows)
  id                          INTEGER PK AUTOINCREMENT
  office_id                   INTEGER → offices.id
  party                       TEXT      -- Republican | Democratic | Libertarian
  full_name                   TEXT
  slug                        TEXT UNIQUE  -- URL key, e.g. "harriet-hageman"
  city                        TEXT NULLABLE
  state                       TEXT DEFAULT 'WY'
  zip                         TEXT NULLABLE
  mailing_address             TEXT NULLABLE
  phone                       TEXT NULLABLE
  email                       TEXT NULLABLE
  filed_at                    TEXT NULLABLE  -- ISO-8601
  withdrawn_at                TEXT NULLABLE  -- NULL = still active
  source_page                 INTEGER NULLABLE  -- PDF page for audit

  -- Enrichment: core profile
  photo_url                   TEXT NULLABLE  -- asset path, e.g. /assets/candidates/{slug}.webp
  summary                     TEXT NULLABLE  -- 1–2 sentence teaser
  bio_full                    TEXT NULLABLE  -- long-form markdown
  occupation                  TEXT NULLABLE
  education                   TEXT NULLABLE
  hometown                    TEXT NULLABLE
  years_in_wyoming            INTEGER NULLABLE
  website_url                 TEXT NULLABLE  -- campaign homepage
  facebook_url                TEXT NULLABLE  -- best available Facebook URL
  twitter_url                 TEXT NULLABLE  -- best available X/Twitter URL
  instagram_url               TEXT NULLABLE  -- best available Instagram URL
  youtube_url                 TEXT NULLABLE  -- best available YouTube URL
  endorsements_json           TEXT NULLABLE  -- JSON array of strings
  campaign_finance_url        TEXT NULLABLE  -- FEC or WYCFIS summary page
  intro_video_url             TEXT NULLABLE

  -- Enrichment: additional social
  linkedin_url                TEXT NULLABLE

  -- Enrichment: campaign finance (FEC)
  fec_candidate_id            TEXT NULLABLE  -- e.g. "S6WY00209"
  fec_committee_id            TEXT NULLABLE  -- e.g. "C00788943"
  fec_candidate_url           TEXT NULLABLE
  fec_committee_url           TEXT NULLABLE

  -- Enrichment: Wyoming WYCFIS
  wycfis_candidate_url        TEXT NULLABLE
  wycfis_committee_url        TEXT NULLABLE

  -- Enrichment: public profile
  top_issues                  TEXT NULLABLE  -- semicolon-delimited list
  incumbency_status           TEXT NULLABLE  -- "incumbent" | "challenger" | "open_seat" | "needs_research"
  current_office              TEXT NULLABLE  -- office held if incumbent
  public_statement_url        TEXT NULLABLE  -- campaign issues/bio page

  -- Enrichment: routing and display
  candidate_page_path         TEXT NULLABLE  -- site-relative path, e.g. /candidates/us-senate/harriet-hageman/
  race_slug                   TEXT NULLABLE  -- e.g. "united-states-senator"
  race_display                TEXT NULLABLE  -- e.g. "US Senate · Republican"

  -- Enrichment: official (non-campaign) presence
  official_office_url         TEXT NULLABLE  -- gov/official website if incumbent
  official_office_facebook_url TEXT NULLABLE
  official_office_x_url       TEXT NULLABLE

  -- Enrichment: photo metadata
  thumbnail_source_url        TEXT NULLABLE  -- where the candidate image was sourced
  thumbnail_permission_status TEXT NULLABLE  -- "confirmed_free_to_use" | "needs_permission_or_public_domain"

  -- Enrichment: data quality
  data_confidence             TEXT NULLABLE  -- "High" | "Medium" | "Low"
  human_review_needed         INTEGER DEFAULT 0  -- 1 = flagged for manual check
  enrichment_notes            TEXT NULLABLE  -- structured notes from the enrichment agent
  enrichment_batch            TEXT NULLABLE  -- which batch populated this row
  batch_status                TEXT NULLABLE  -- "verified_partial" | "not_searched_in_this_batch" | etc.

  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))

candidate_email_suppressions
  id            INTEGER PK AUTOINCREMENT
  email         TEXT NOT NULL
  email_norm    TEXT NOT NULL UNIQUE
  reason        TEXT NULLABLE
  source        TEXT NULLABLE
  suppressed_at TEXT NOT NULL DEFAULT (datetime('now'))
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))

multi_seat_race_sources (367 rows)  -- see "Multi-seat race sources workflow" below
  id                 INTEGER PK AUTOINCREMENT
  ballot_group_key   TEXT NOT NULL UNIQUE   -- deterministic re-run key
  county              TEXT NOT NULL
  election_phase, jurisdiction_type, city_or_town, precinct, precinct_name,
  party, office_name, district_or_scope, term                    -- race description
  seats_open, max_selections    INTEGER NOT NULL DEFAULT 0
  ui_instruction                 TEXT NULLABLE
  source_type, source_url, source_status, notes                  -- provenance
  office_id          INTEGER REFERENCES offices(id)  -- set only once applied
  office_id_guess    INTEGER REFERENCES offices(id)  -- best guess, may be unresolved
  match_status       TEXT NOT NULL DEFAULT 'not_attempted'  -- not_attempted|exact|ambiguous|no_office_found
  match_notes        TEXT NULLABLE
  applied_at, imported_at, updated_at                              TEXT
```

## Indexes

```sql
-- Statewide/federal offices: unique on title alone when district IS NULL
CREATE UNIQUE INDEX uq_offices_statewide ON offices(title) WHERE district IS NULL;
-- District offices: unique on (title, district) when district IS NOT NULL
CREATE UNIQUE INDEX uq_offices_district  ON offices(title, district) WHERE district IS NOT NULL;

CREATE INDEX idx_candidates_office ON candidates(office_id);
CREATE INDEX idx_candidates_party  ON candidates(party);
CREATE INDEX idx_candidates_slug   ON candidates(slug);
```

## Field notes

### offices

| Field | Notes |
|-------|-------|
| `level` | Enumerated: `federal` (US House/Senate), `statewide` (Governor, AG, etc.), `wy_senate`, `wy_house`, `county`, `city` |
| `district` | NULL for any statewide or at-large office; numeric district for legislative seats (HD1–HD60, SD1–SD30) |
| `sort_order` | Used for consistent UI display ordering within a level |
| `precinct_code` | Structured precinct code for precinct committee offices, e.g. `8-1`, `01-01`; preferred over parsing `title` |

### candidates — base fields

| Field | Notes |
|-------|-------|
| `slug` | Derived from full name, URL-safe, unique across all candidates. Used as the primary lookup key for all page routing. |
| `party` | Free text as filed; common values: `Republican`, `Democratic`, `Libertarian` |
| `withdrawn_at` | ISO-8601 date if the candidate has withdrawn; NULL means still active |
| `source_page` | Integer PDF page number from the Wyoming SOS 2026 primary candidates PDF, for data audit |

### candidates — enrichment fields

**Social media priority:** For `facebook_url`, `twitter_url`, `instagram_url`, `youtube_url`, and `linkedin_url`, the generator script prefers campaign accounts (e.g. `campaign_facebook_url`) over personal/official accounts (e.g. `facebook_url` from the base CSV). The best available URL is stored in a single field — no separate campaign vs. personal column.

**`campaign_finance_url`:** Points to the FEC candidate page if available, falling back to the Wyoming WYCFIS campaign finance summary. For the raw FEC identifiers, use `fec_candidate_id` and `fec_committee_id`.

**`top_issues`:** Semicolon-delimited string as extracted from the candidate's campaign site, e.g. `"Agriculture; border security; energy"`. Not normalized.

**`incumbency_status`:** Controlled vocabulary: `incumbent`, `challenger`, `open_seat`, `needs_research`. `needs_research` means the enrichment agent could not determine status from available sources.

**`enrichment_notes`:** A structured string with labeled source citations written by the enrichment agent, e.g. `"official_roster_source: SOS roster PDF. campaign_source: verified campaign website. uncertainty_notes: ..."`. Parse with caution — format is consistent but not machine-parsed JSON.

**`data_confidence`:** Agent self-rating: `High` (multiple authoritative sources verified), `Medium` (some sources verified, some inferred), `Low` (sparse data or conflicting sources).

**`human_review_needed`:** SQLite integer boolean (0/1). Set to 1 by the enrichment agent when: thumbnail permission is unresolved, incumbent status is uncertain, or conflicting data was found.

**`batch_status`:** The enrichment status of this row in the batch that last wrote it. Common values: `verified_partial` (enriched with available data), `not_searched_in_this_batch` (this batch did not research this candidate — their data comes from an earlier batch).

## Migrations

| File | Purpose |
|------|---------|
| `db/migrations/0001_candidates_schema.sql` | Creates `offices` and `candidates` tables with base fields |
| `db/migrations/0002_candidates_enrichment.sql` | Adds 24 enrichment columns via `ALTER TABLE` |
| `db/migrations/0003_external_links.sql` | Adds `external_links_json` column to `candidates` |
| `db/migrations/0004_offices_expand.sql` | Expands `offices` table |
| `db/migrations/0005_candidates_ballotpedia.sql` | Adds Ballotpedia fields to `candidates` |
| `db/migrations/0006_polling_locations.sql` | Creates `polling_locations` table for city-based fallback lookup |
| `db/migrations/0007_county_gis.sql` | Creates `county_gis` registry for ArcGIS spatial polling lookup |
| `db/migrations/0008_precinct_polygons.sql` | Creates local precinct polygon fallback table |
| `db/migrations/0009_offices_precinct_code.sql` | Adds `offices.precinct_code` and backfills title-derived precinct committee rows |
| `db/migrations/0011_candidate_email_suppressions.sql` | Adds the candidate bulk-email suppression table |
| `db/migrations/0019_multi_seat_race_sources.sql` | Creates `multi_seat_race_sources`, the staging table for the multi-seat candidates flow (see below) |
| `db/migrations/0022_guide_rubric_definitions.sql` | Creates versioned rubric definitions and ordered categories; canonical authoring source is `data/rubrics/wy-primary-2026-v1.md` |

**Applying migrations:** the `wy` database is shared with other projects (Guide, and other unrelated features) and their `d1_migrations` bookkeeping rows live in the same table. Candidates' own 0001–0019 migrations have never been recorded in that ledger — they've always been applied by hand. Apply a new migration with `npx wrangler d1 execute wy --remote --file=db/migrations/NNNN_name.sql` from `Candidates/`. Do **not** run `wrangler d1 migrations apply` for this project — it will try to replay the entire untracked history from 0001 and fail (migration 0001's `uq_offices_statewide`/`uq_offices_district` indexes no longer match live data, which now has legitimate duplicate titles across different counties).

## Seed files

| File | Purpose |
|------|---------|
| `db/seed/001_seed.sql` | `INSERT OR IGNORE` for all 86 offices and 200 candidates from the SOS 2026 PDF |
| `db/seed/002_enrichment_updates.sql` | Auto-generated UPDATE statements from batch enrichment CSVs (batches 01–10, all 200 rows) |
| `db/seed/wy_2026_primary_candidates.csv` | Source SOS CSV — do not modify |
| `db/seed/wy_2026_primary_candidates_enhanced_batch*.csv` | Enrichment batch CSVs (85 columns, all 200 rows per file) |
| `db/seed/candidate_email_suppressions_*.sql` | Candidate bulk-email unsubscribe/suppression records |
| `db/seed/guide_rubric_2026_v1.sql` | Generated immutable seed for rubric version `wy-primary-2026-v1`; do not edit directly |

## Enrichment batch workflow

Enrichment is done in batches of 20 candidates. Each batch CSV contains all 200 rows but only enriches ~20 (rows within its batch range). Non-enriched rows carry `batch_status = 'not_searched_in_this_batch'`.

The generator script (`scripts/generate_enrichment_sql.mjs`) reads all available batch files in order and merges them using a non-destructive strategy: a field is only written to the UPDATE statement if the incoming value is non-empty. This prevents later batches from overwriting good enrichment data with empty values for candidates they did not research.

To regenerate `002_enrichment_updates.sql` after adding new batch CSVs:

```bash
cd Candidates/
node scripts/generate_enrichment_sql.mjs
```

Then apply to local D1:

```bash
npx wrangler d1 execute wy --file=db/seed/002_enrichment_updates.sql
```

All 10 batches (rows 1–200) are complete and included in `002_enrichment_updates.sql`.

## Multi-seat race sources workflow

Some county/city/precinct races elect more than one candidate (county commissioner
boards, city council wards, school/hospital/special districts, precinct committee
seats). `offices.seats_available` (added in `0004_offices_expand.sql`) is what
actually caps selections in the "My choice" UI on `/race/[id]`, but seat counts
need a traceable source before they're trusted — that's what
`multi_seat_race_sources` (added in `0019_multi_seat_race_sources.sql`) is for.

This is a **repeatable, re-runnable flow**, not a one-time import:

1. A research pass (spreadsheet) identifies multi-seat races per county, with a
   source URL and confidence status per row. Field names in that spreadsheet
   follow `docs/data_import_field_standards.md` — read that file before
   changing the sheet's schema or building a similar table for other wild data.
2. `scripts/import_multi_seat_race_sources.py` reads the spreadsheet and
   generates an idempotent `UPSERT` seed file, keyed on `ballot_group_key`
   (safe to re-run against a refreshed spreadsheet — existing rows update in
   place, nothing duplicates).
3. `scripts/match_multi_seat_race_sources.py` reconciles staged rows against
   live `offices` rows. It only ever writes to `offices.seats_available` for a
   single, unambiguous match (`match_status = 'exact'`) — everything else
   (`ambiguous`, `no_office_found`) gets a best-guess `office_id_guess` and
   `match_notes` recorded on the staging row for human review, without
   touching the live table. Re-run after resolving an ambiguous row by hand
   (or seeding a new office) — only rows still at `match_status =
   'not_attempted'` are reconsidered.

State as of 2026-07-02: 367 rows imported (353 races + 14 manual-review
placeholders for counties with no extractable source yet); 154 applied
exact matches, 25 ambiguous, 174 no matching office yet (mostly school/
special/community-college districts, which have no seeded offices at all).

## Database bindings

| Environment | Binding | D1 database |
|-------------|---------|-------------|
| Local (`wrangler dev`) | `WY_DB` | `wy` — local SQLite in `.wrangler/state/v3/d1/` |
| Production (`--remote`) | `WY_DB` | `wy` (ID: `4b4227f1-bf30-4fcf-8a08-6967b536a5ab`) |

Access the binding in Cloudflare Workers/Pages functions via `env.WY_DB`.
