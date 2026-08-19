# Candidate Data Reference

AI agent reference for the `wy` D1 database backing the Wyoming 2026 primary voter guide sub-project (`Candidates/`).

## Schema snapshot

```
offices (row count grows as county and precinct rosters are added)
  id           INTEGER PK AUTOINCREMENT
  title        TEXT NOT NULL           -- "U.S. Representative", "Wyoming State Senate"
  level        TEXT NOT NULL           -- federal | statewide | wy_senate | wy_house | county | city
  district     INTEGER NULLABLE        -- NULL for federal/statewide; HD/SD number otherwise
  sort_order   INTEGER DEFAULT 0
  precinct_code TEXT NULLABLE          -- structured precinct code for precinct committee offices
  scope_kind   TEXT NULLABLE           -- countywide | municipal | municipal_ward | precinct_party_gender | ...
  ward         TEXT NULLABLE           -- normalized municipal ward label when applicable

office_precinct_scopes
  office_id     INTEGER → offices.id
  precinct_code TEXT                   -- one row per office/precinct pair
  source_label  TEXT NULLABLE
  source_date   TEXT NULLABLE
  notes         TEXT NULLABLE
  PRIMARY KEY (office_id, precinct_code)

parties
  code         TEXT PK                -- REP | DEM | NP
  label        TEXT NOT NULL          -- official display name
  short_label  TEXT NULLABLE          -- compact result prefix
  badge_token  TEXT NULLABLE          -- CSS class suffix, never a color value
  sort_order   INTEGER NOT NULL
  is_active    INTEGER NOT NULL DEFAULT 1

party_aliases
  raw_value    TEXT PK                -- exact source value
  party_code   TEXT NOT NULL → parties.code

candidates (row count grows as county and precinct rosters are added)
  id                          INTEGER PK AUTOINCREMENT
  office_id                   INTEGER → offices.id
  party                       TEXT      -- preserved raw source value; resolve through party_aliases
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
| `ballot_party` | `NP` is reserved for genuinely nonpartisan races. Use a blank value when one office row represents partisan candidates without separate party-specific office rows. |

### Party normalization

Party source values are preserved in `candidates.party`, `offices.ballot_party`,
and `election_contests.ballot_party_raw`. Display names, compact labels, and
badge class suffixes come from `parties` through the exact, global
`party_aliases.raw_value` mapping. Blank and NULL values are intentionally not
aliased because they mean party is not applicable, not nonpartisan.

Verified local vocabulary as of 2026-08-19:

| Raw value | Canonical code | Display label | Short label | Badge token |
|---|---|---|---|---|
| `REP` | `REP` | Republican | R | `r` |
| `Republican` | `REP` | Republican | R | `r` |
| `DEM` | `DEM` | Democratic | D | `d` |
| `Democratic` | `DEM` | Democratic | D | `d` |
| `NP` | `NP` | Nonpartisan | NP | `other` |

No minor-party row is seeded without an observed source value. Adding another
party or alias is a database change rather than a frontend deploy.

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
| `db/migrations/0024_multi_seat_race_sources_selection_limit_fields.sql` | Additive columns on `multi_seat_race_sources` for the `docs/multi_selection.md` §10 CSV fields not already present: `ward`, `board_size`, `verified_date`, `source_page_or_section`. Local only as of 2026-08-02 — not yet applied to production D1. Does not touch `offices`; see "Multi-candidate selection" below |
| `db/migrations/0025_office_precinct_scopes.sql` | Creates data-backed many-to-many precinct targeting for municipal wards and other sub-county offices |
| `db/migrations/0026_ballot_recovery_tokens.sql` | Creates `ballot_recovery_tokens`, the 24h-TTL magic-link table for cross-device ballot recovery; applied to production D1 2026-08-04. See "Ballot recovery / cross-device sync" below and `docs/ballot_recovery.md` |
| `db/migrations/0027_ballot_saves.sql` | Creates `ballot_saves`, the durable email-keyed saved-ballot table purged one day after the 2026 primary by the separate `skovgard-candidates-cron` Worker; applied to production D1 2026-08-04 |
| `db/migrations/0028_election_results.sql` | Creates the 8-table election-results schema (`election_events`, `election_sources`, `election_source_checks`, `election_source_snapshots`, `election_contests`, `election_snapshot_contests`, `election_results_rows`, `election_candidate_aliases`), append-only by design, joined to `offices`/`candidates` via nullable guess/confirmed FK pairs. Applied to production D1 2026-08-18. See `docs/election_results_schema.md` |
| `db/migrations/0029_election_results_views.sql` | Adds `v_election_latest_snapshots` and `v_election_current_results`, the first pass at latest-snapshot resolution. Superseded in behavior by 0031 (verified-only selection); kept as-is since 0031 is additive and localhost already had data seeded on top of these view names. Applied to production D1 2026-08-18 |
| `db/migrations/0030_election_source_precedence.sql` | Adds `v_election_contest_county_sources` and `v_election_winning_source_per_contest_county`, resolving which source wins per (contest, county) when two independent sources report the same real-world contest. Applied to production D1 2026-08-18 |
| `db/migrations/0031_election_results_integrity.sql` | Additive fix migration: (1) redefines `v_election_latest_snapshots` to require `verification_status='verified'`, so a newer failed or unreviewed snapshot can never displace a good one; (2) adds `v_election_selected_snapshot_contests`, the correct one-row-per-(contest,county) grain for precinct-count aggregation, fixing a real bug where summing over the result-row grain multiplied precinct counts by however many candidate/writein/overvote/undervote rows a county contributed; (3) adds `source_contest_name_raw` and four sibling columns to `election_snapshot_contests` so a second source reporting a canonical contest under different wording has somewhere to record its own raw text; (4) adds integrity triggers (SQLite has no `ALTER TABLE ADD CONSTRAINT`, so these substitute for CHECK constraints on the existing tables) and a `UNIQUE(source_id, snapshot_seq)` index. Applied to production D1 2026-08-18. See `docs/election_results_schema.md` |
| `db/migrations/0032_election_source_discoveries.sql` | Creates the append-only discovery queue written by the standalone `Results/` Worker. Candidate links, other-year links, and rejected test/sample material remain review evidence and are never promoted automatically. Applied locally and to production D1 2026-08-18. |
| `db/migrations/0033_election_source_discoveries_unique_index.sql` | Adds a database-enforced `UNIQUE(source_id, discovered_url)` index on `election_source_discoveries`, so a discovered link can never be recorded twice for the same source across different checks. Application code (`Results/src/repository.js`) now looks up a source's known URLs once per run instead of once per link, caps new inserts at `MAX_DISCOVERIES_PER_SOURCE_PER_RUN` (default 20), and uses `INSERT OR IGNORE` against this index as the concurrency-safe backstop. Zero duplicate pairs existed in local or production data before this was applied. Applied locally and to production D1 2026-08-18. See `docs/election_results_schema.md` and `../Results/docs/architecture.md` |
| `db/migrations/0034_normalize_countywide_ballot_party.sql` | Sets `ballot_party` to blank for 23 explicit Natrona, Sweetwater, and Teton countywide office IDs that contain partisan candidates but are not split into party-specific office rows. Leaves Albany, Sublette, municipal, and all title values unchanged. Applied locally 2026-08-19; not applied to production. |
| `db/migrations/0035_parties_and_aliases.sql` | Creates table-backed party display metadata and global exact-value aliases for the verified REP, DEM, and NP vocabulary. It also sets office 578, Seventh Judicial District Attorney, to blank `ballot_party` because its candidate is REP and the office is not party-split. Raw candidate, office, and election source values remain unchanged. Applied locally 2026-08-19; not applied to production. |

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
| `db/seed/sweetwater_precinct_committee_candidates_2026-08-02.sql` | Idempotent Sweetwater precinct roster: 50 party/gender offices and 93 verified candidates from the county CSV/source PDF; one party-unknown filing is held |
| `db/seed/election_events_wy_2026_primary.sql` | `INSERT OR IGNORE` for the single `election_events` row for `wy-2026-primary` (`polls_close_at='2026-08-18T19:00:00-06:00'`). Deliberately does not seed a `wy-2024-primary` row. The 2024 data is used only as offline test fixtures (`tests/fixtures/elections/`), never loaded into this environment's `election_events`. Applied to production D1 2026-08-18 |
| `db/seed/election_results_wy_2026_primary_partial_2026-08-18.sql` | Generated append-only import of the Wyoming SOS election-night summary PDFs available at 22:10 MDT on 2026-08-18. Covers Platte and Washakie only: 5 logical county-scoped sources, 20 contests, and 183 result rows. It also records reviewed aliases for `Kenneth R. Casner` and the source typo `Scott Smitth`. Totals are unofficial and partial. |
| `db/seed/election_results_wy_2026_primary_partial_update_2026-08-18_2228.sql` | Second append-only SOS snapshot after a cache-bypassed 22:28 MDT refresh. Covers Fremont, Hot Springs, Park, Platte, Uinta, Washakie, and Weston: 19 logical sources, 58 contests, and 754 current result rows. Replaces the earlier snapshots only through the verified-latest views; it does not delete them. Applied locally and to production D1 2026-08-18. |
| `db/seed/election_source_registry_wy_2026_primary_v2.sql` | Generated WORM-safe election-night correction to the 23-county clerk registry. It retains one scheduled monitoring page per county, adds 23 audited v2 successors because source notes are append-only, corrects 11 stale URLs, and records verified direct 2026 artifacts for 16 counties in source notes. Generated only; apply status must be verified separately. |

`scripts/seed_election_source_registry.py --scope 2026-primary` generates the
23-county pending landing-page registry plus the statewide Secretary of State
archive, without requiring a 2024 election row. The generator validates all 23
unique county names and FIPS codes. Its 2026-08-18 election-night revision emits
23 audited v2 successors instead of rewriting source rows, corrects 11 stale
monitoring URLs, and records the 16 verified county result artifacts as audit
metadata without increasing the scheduled fetch set. The original registry was
applied to production D1 on 2026-08-18 for the Results Worker. The v2 correction
is generated but not yet applied to local or production D1. A second official-site
search at 23:13 MDT found no additional legitimate artifacts; seven county gaps
remain explicit in the generator rather than being filled with test material or
guessed URLs.

`scripts/import_sweetwater_precinct_committee_2026.py` regenerates the Sweetwater precinct seed from the normalized source CSV. It validates the election identity and expected 94-row source, imports 93 fully classified rows, and deliberately rejects the Richard F. Kaumo row until an authoritative party and seat count are available.

`scripts/extract_election_results_statewide_pdf.py` is the Stage 1 parser for
the 2026 SOS statewide unofficial candidate, Senate, and House summary PDFs.
It emits one logical source per reporting county, preserves raw candidate
spellings, and uses each printed `Total` row only as a reconciliation checksum.
Stage 2 remains `scripts/generate_election_results_sql.py`.

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

## Election results flow

Full schema reference (table relationships, append-only vs. mutable-control-data
boundaries, source-precedence rule): `docs/election_results_schema.md`.
Election-night ingestion operational reference: `docs/election_results_2026_path_forward.md`.
Repeatable county-source audit runbook: `docs/recheck_county_election_result_sources.md`.
All three are gitignored (`Candidates/docs/**`), so they carry no git safety net.
Treat them as accurate as of their own "updated" markers, not as version-controlled history.

There is no standalone results page. Results ride the existing candidate-guide
flow rather than duplicating its filtering logic:

- **`src/pages/race/[id].astro`**: for each candidate on the ballot, a
  structural match against `election_contests` (by level, district, county,
  and title/suffix disambiguation, hardcoded to `election_key = 'wy-2026-primary'`)
  adds a vote/percentage line and a "Leading" badge (`.candidate-card--leading`,
  `var(--sage)`) to that candidate's card, plus a "Full county breakdown"
  link to the contest's deep-dive page.
- **`src/pages/races/index.astro`**: one "Leading: PARTY (pct%)" chip per
  party per race card (a primary runs separate REP/DEM contests for the same
  office, so this is an array per office, never a single winner). Shows a
  bold ember results-timing banner (`.results-note`) whenever no results
  exist yet for any race, keyed off `election_events.polls_close_at`;
  disappears automatically once any result exists.
- **`src/pages/index.astro`**: the same polls-close/results-status banner,
  placed immediately after the "Local review mode" banner.
- **`src/pages/results/contest/[id].astro`**: the deep-dive view (aggregate
  totals, county-by-county breakdown, precinct-level detail where available)
  that "Full county breakdown" links to. Not reachable by browsing; only
  linked from a race card that already has a result.

A prior standalone `src/pages/results/index.astro` (browse every contest,
unfiltered) was built, then deleted. It surfaced clutter irrelevant to a
given voter (e.g. a Mills precinct race shown to a Sundance address) and was
redundant with the address-filtered flow above.

Migrations 0028-0033, the `wy-2026-primary` event seed, and the county plus
statewide pending source registry are applied to production D1 and deployed as
of 2026-08-18 (see the Migrations and Seed files tables above). The standalone
`skovgard-results` Worker is also deployed with source-check and discovery-only
write access. The first SOS election-night summaries contained data for Platte
and Washakie only. A 22:28 MDT cache-bypassed refresh advanced to seven
counties. Both reconciled snapshots are retained; the verified-latest views now
surface the 58 contests and 754 result rows from the newer publication. The UI
labels them as partial reporting rather than implying statewide completion.
`docs/election_results_2026_path_forward.md` covers the
ingestion pipeline and what remains unbuilt for actually loading 2026 results
from the other 16 counties as they become available.

Laramie County's own unofficial results PDF was supplied directly and applied
to production 2026-08-18: 46 contests and 213 result rows for federal,
statewide, and legislative district races (US Senate, US House, Governor,
Secretary of State, State Auditor, State Treasurer, Superintendent of Public
Instruction, all 4 Senate and 12 House districts touching Laramie), source
role `county_local_summary`, verified live on the US Senate card. County
offices, precinct committee seats, and municipal races from that same file
were deliberately held back: `offices.title` conventions for those levels are
inconsistent statewide (party embedded in the title for some counties'
Commissioner/Sheriff rows, a duplicated "County County" prefix for others, no
county prefix at all for others), not safe for automated `contest_name_normalized`
matching without a dedicated review of the `offices` table itself.
`extract_election_results_county_pdf.py` picked up two real fixes from this
file (a page-footer/masthead noise pattern, and a second valid reconciliation
line, "Total Votes Cast", for report variants that omit "Contest Totals"),
both re-verified against the existing Albany and Campbell fixtures with zero
regression before being trusted on real data.

The `skovgard-results` Cron Triggers were disabled 2026-08-18 (empty `crons`
in `Results/wrangler.toml`, redeployed). Discovery had already characterized
all 24 sources, and the county-title inconsistency above means further
automated discovery would not translate into automated card updates anyway.
The Worker stays deployed; only its schedule is empty.

## Database bindings

| Environment | Binding | D1 database |
|-------------|---------|-------------|
| Local (`wrangler dev`) | `WY_DB` | `wy` — local SQLite in `.wrangler/state/v3/d1/` |
| Production (`--remote`) | `WY_DB` | `wy` (ID: `4b4227f1-bf30-4fcf-8a08-6967b536a5ab`) |

Access the binding in Cloudflare Workers/Pages functions via `env.WY_DB`.

## Address-to-local-race routing

The ballot lookup resolves legislative districts and coordinates from the voter-address lookup or a geocoder. It then resolves an exact precinct from an active county GIS endpoint or the `precinct_polygons` point-in-polygon fallback, and resolves a ward from `municipal_gis` when an active municipal layer exists.

`getLocalRaces` applies `offices.scope_kind` after county/city filtering:

- `precinct_party_gender` matches `offices.precinct_code`.
- `municipal_ward` first accepts an exact `municipal_gis` ward match and otherwise accepts a D1-backed `office_precinct_scopes` match.
- Broad `countywide` and `municipal` offices remain visible to all voters in the county or municipality.

Fremont's filed 2026 ballot supplies the Lander and Riverton ward-to-precinct mappings, so those ward offices use `office_precinct_scopes`. Fremont commissioner districts cannot safely use this table alone: the official county district/precinct list shows that some precincts are split across commissioner districts. Exact commissioner routing therefore remains pending an authoritative polygon layer or address-level commissioner split data; do not infer a single commissioner district from those split precinct codes.

## Ballot recovery / cross-device sync

Full design, table lifetimes, and security properties:
`docs/ballot_recovery.md`. Short version: a voter's saved list on `/race/[id]`
lives only in `localStorage`; `ballot_saves` (0027) is the durable
email-keyed copy and `ballot_recovery_tokens` (0026) is the 24h magic link
that restores it elsewhere. `Candidates/cron/` is a separate
`skovgard-candidates-cron` Worker (own `wrangler.toml`, deployed via
`scripts/deploy_candidates_cron.sh`) that purges both past retention — it
exists only because the Astro Cloudflare adapter's generated Worker entry
has no `scheduled()` export to hang a cron trigger off of.

## Multi-candidate selection

Full rules, UI contract, and safety constraints: `docs/multi_selection.md` (gitignored, local only — see `Candidates/AGENTS.md`). This section is the pointer other agents need before touching any of it.

**`offices.seats_available` is still the only field the client reads** — race/[id].astro's `data-seats-available` — unchanged by this work. `src/lib/selection-limit.ts` exports `resolveSelectionLimit()`, the §3 jurisdiction rule table, and the ballot-instruction parser; it's the framework for *computing* what should go into `seats_available`, not a replacement for that column. Nothing currently calls it automatically — an importer that walks `multi_seat_race_sources` and writes the resolved limit into `offices.seats_available` is not yet built (spec §10, Step E).

One domain fact worth flagging here specifically because it was wrong in an earlier draft of the spec and is the single most common error in this area: **nonpartisan municipal primaries do NOT double the vote-for number.** W.S. 22-23-303 sets `max_selections = seats_to_elect`; W.S. 22-23-307(a) separately doubles that for how many *advance* to the general (`number_nominated`) — a different question that must never reach the UI. `resolveSelectionLimit`'s jurisdiction table is deliberately kept as a table rather than collapsed into a formula so this warning has somewhere to live in code, not just in the doc.

`multi_seat_race_sources` (0019, extended by 0024) already covers most of §10's CSV contract under different column names — notably `ui_instruction` (≈ `ballot_instruction`, populated on most rows already) and `source_status` (≈ `verification_status`, richer than the spec's simple verified/not gate). race/[id].astro's server code reads `ui_instruction` directly (gated on `source_status = 'verified'`) to show the real ballot text instead of a generated "Select up to N" string, but only queries it when `seats_available > 1` — single-choice races show no limit text either way.

`src/lib/race-order.ts`'s `sortRaces()` is the one place canonical ballot order (federal → statewide → wy_senate → wy_house → county → city, precinct sorted last via `scope_kind`) is decided — the homepage results panel, "Jump to a race," and the saved candidate list on race/[id].astro all derive from it rather than each inventing their own order. Do not add a second ordering anywhere; project this one via `rankMapFromOrder`/`sortByRankMap` instead (see how race/[id].astro's saved-list grouping does it).
