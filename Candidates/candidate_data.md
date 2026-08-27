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
| `db/migrations/0036_election_event_data_status.sql` | Adds the constrained `election_events.data_status` production-readiness flag, defaulting new events to `needs_review`. Marks the retained local `wy-2024-primary` corpus for review and `wy-2026-primary` active. Applied locally and to production D1 2026-08-19. See `docs/election_results_2024_local_status.md`. |
| `db/migrations/0037_official_source_precedence.sql` | Rebuilds the current-result precedence views so an official snapshot wins over an unofficial snapshot at the same source-role priority. Publication time, retrieval time, and source ID provide deterministic succession after official status. Result facts remain append-only. Applied locally 2026-08-26; not applied to production. |

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
| `db/seed/election_events_wy_2026_primary.sql` | `INSERT OR IGNORE` for the production `election_events` row `wy-2026-primary` (`polls_close_at='2026-08-18T19:00:00-06:00'`). It deliberately does not seed `wy-2024-primary`. Local Miniflare also retains a structurally defective 2024 corpus marked `data_status='needs_review'`; it must not be promoted. See `docs/election_results_2024_local_status.md`. Applied to production D1 2026-08-18. |
| `db/seed/election_results_wy_2026_primary_partial_2026-08-18.sql` | Generated append-only import of the Wyoming SOS election-night summary PDFs available at 22:10 MDT on 2026-08-18. Covers Platte and Washakie only: 5 logical county-scoped sources, 20 contests, and 183 result rows. It also records reviewed aliases for `Kenneth R. Casner` and the source typo `Scott Smitth`. Totals are unofficial and partial. |
| `db/seed/election_results_wy_2026_primary_partial_update_2026-08-18_2228.sql` | Second append-only SOS snapshot after a cache-bypassed 22:28 MDT refresh. Covers Fremont, Hot Springs, Park, Platte, Uinta, Washakie, and Weston: 19 logical sources, 58 contests, and 754 current result rows. Replaces the earlier snapshots only through the verified-latest views; it does not delete them. Applied locally and to production D1 2026-08-18. |
| `db/seed/election_results_wy_2026_primary_complete_unofficial_2026-08-20.sql` | Complete append-only snapshot generated from the current Wyoming SOS unofficial statewide, Senate, and House summary PDFs. Contains 63 county-scoped source snapshots, 172 contests, and 2,668 result rows. All three PDFs report 23 of 23 counties where applicable and reconciled against their printed totals. Validated idempotently against a disposable copy of the resolved local `wy` database and applied to production on 2026-08-20 after a full SQL export. Not applied locally. |
| `db/seed/election_results_wy_2026_primary_local_5_counties_unofficial_2026-08-20.sql` | Append-only local-results import for Carbon, Goshen, Natrona, Park, and Platte. Contains 7 verified county-summary snapshots, 570 county, municipal, special-district, and precinct committee contests, and 2,401 result rows. Goshen and Platte aggregate rows matched their precinct PDFs exactly; all 143 Park summary contests matched the precinct report Totals rows. Applied to production on 2026-08-20 after backup and exact-clone validation. Not applied locally. |
| `db/seed/election_results_wy_2026_primary_local_13_counties_unofficial_2026-08-20.sql` | Supersedes the 5-county file above for local D1 (the 5-county file's counties are included here too; this is not a separate delta). User-supplied county-clerk PDFs for all 23 counties were reviewed; 15 sources across Albany, Big Horn, Carbon, Converse, Crook, Goshen, Hot Springs, Natrona (county/municipal/precinct-committee, 3 files), Niobrara, Park, Platte, Sublette, and Uinta reconciled and are included: 1,013 contests, 4,197 result rows. Converse (89/100 contests) and Crook (6/85) are partial; the rest of each county's source failed the parser's per-contest reconciliation check and was withheld rather than guessed. Big Horn, Goshen, Hot Springs, Niobrara, Park, Platte, and Uinta were additionally cross-checked against paired precinct PDFs with an exact row-for-row match. Four counties could not be downloaded at all (Fremont, Laramie, Lincoln, Sweetwater — dead links or a 403, not guessed around; a ChatGPT source-discovery prompt was handed to the user for these). Five were scanned-image PDFs with no text layer (Campbell, Johnson, Washakie, Weston, Teton) — see the OCR seed file below, they're no longer unattempted. Sheridan's source never prints a reconciliation total at all and was withheld entirely. Regenerated once in place (same filename) after a name-extraction bug was found during card-scoped-resolution testing: a `VOTE %` column left a stray `"  %"` on candidate names for reports that have one, confirmed on Natrona. Applied to local D1 2026-08-20 and to production D1 2026-08-21. |
| `db/seed/election_results_wy_2026_primary_local_ocr_5_counties_unofficial_2026-08-20.sql` | OCR-track import for the 5 counties with no PDF text layer: Campbell, Johnson, Washakie, Weston, and Teton. Generated by `scripts/extract_election_results_county_pdf_ocr.py` (tesseract via PyMuPDF rasterization, see "OCR extraction workflow" below), not the text-layer parser. 5 sources, 256 contests, 1,039 result rows. Yield varies by scan quality, not something a parser fix can equalize: Johnson 18/18 contests reconciled, Teton 80/81, Campbell 134/157, Washakie 21/39, Weston 3/43 (Weston's OCR text is full of unrecoverable garbage tokens). Applied to local D1 2026-08-20 and to production D1 2026-08-21. |
| `db/seed/election_results_wy_2026_primary_weston_verified_transcription_2026-08-21.sql` | Complete append-only successor for Weston's unofficial county summary. A reviewed Markdown transcription passed 51 of 51 local contest checks and emitted 217 rows, replacing the earlier 3-contest OCR snapshot only through the verified-latest view. Applied locally and to production D1 2026-08-21. |
| `db/seed/election_results_wy_2026_primary_converse_verified_transcription_2026-08-21.sql` | Complete append-only successor for Converse's unofficial county summary. The reviewed transcription plus 16 contest blocks checked visually against the source PDF passed 99 of 99 local contest checks and emitted 377 rows. The successor corrects Arthur Stringham from the prior extracted value of 100 to the source-printed value of 1 without modifying history. Applied locally and to production D1 2026-08-21. |
| `db/seed/election_results_wy_2026_primary_natrona_official_2026-08-26.sql` | Official final Natrona County successor: 1 verified official snapshot, 246 contests, and 1,090 result rows. The 80-page summary reconciles exactly to the 677-page precinct report and the 197-page numbered-key canvass. The HD 38 values also match the separate post-recount report. Applied locally 2026-08-26 after exact-clone validation; not applied to production. The three unofficial Natrona snapshots remain append-only history. |
| `db/seed/election_results_wy_2026_primary_converse_official_2026-08-27.sql` | Complete official Converse successor: 1 verified official snapshot, 119 contests, and 481 result rows. Every aggregate row matched the county's 19 official single-precinct reports. Applied locally 2026-08-27 after disposable replay and idempotency validation; not applied to production. The earlier unofficial source remains append-only history. |
| `db/seed/election_results_wy_2026_primary_weston_official_2026-08-27.sql` | Two nonoverlapping official Weston sources: 22 state-summary contests with 109 reconciled rows, plus 50 finalized local contests with 111 source-printed candidate or aggregate write-in rows from the official precinct matrix. Republican precinct committeeman 5-1 is deliberately absent because the county still labels it unofficial; the current view retains that contest from the earlier unofficial source. Applied locally 2026-08-27 after disposable replay and idempotency validation; not applied to production. |
| `db/seed/natrona_precinct_committee_seats_official_2026-08-26.sql` | Natural-key correction for the 98 existing Natrona precinct committee office rows using official printed `Vote For` values. Fifty-two rows changed and 46 already matched. The official review also records 86 committee contests with no existing office row; this file intentionally does not create them. Applied locally 2026-08-26 after exact-clone validation; not applied to production. |
| `db/seed/election_source_registry_wy_2026_primary_v2.sql` | Generated WORM-safe election-night correction to the 23-county clerk registry. It retains one scheduled monitoring page per county, adds 23 audited v2 successors because source notes are append-only, corrects 11 stale URLs, and records verified direct 2026 artifacts for 18 counties in source notes. Applied to production on 2026-08-20 after verification that v2 was absent. Not applied locally. |

`scripts/seed_election_source_registry.py --scope 2026-primary` generates the
23-county pending landing-page registry plus the statewide Secretary of State
archive, without requiring a 2024 election row. The generator validates all 23
unique county names and FIPS codes. Its 2026-08-20 revision emits
23 audited v2 successors instead of rewriting source rows, corrects 11 stale
monitoring URLs, and records the 18 verified county result artifacts as audit
metadata without increasing the scheduled fetch set. The original registry was
applied to production D1 on 2026-08-18 for the Results Worker. The v2 correction
was applied to production on 2026-08-20 and remains unapplied locally. Five county gaps
remain explicit in the generator rather than being filled with test material or
guessed URLs. Complete federal, statewide, and legislative coverage for all 23
counties is separately available from the Secretary of State files.

`scripts/import_sweetwater_precinct_committee_2026.py` regenerates the Sweetwater precinct seed from the normalized source CSV. It validates the election identity and expected 94-row source, imports 93 fully classified rows, and deliberately rejects the Richard F. Kaumo row until an authoritative party and seat count are available.

`scripts/extract_election_results_statewide_pdf.py` is the Stage 1 parser for
the 2026 SOS statewide unofficial candidate, Senate, and House summary PDFs.
It emits one logical source per reporting county, preserves raw candidate
spellings, and uses each printed `Total` row only as a reconciliation checksum.
Stage 2 remains `scripts/generate_election_results_sql.py`. Pass
`--source-role county_local_summary` for county-hosted result files so the
precedence views prefer them to SOS county subtotals. The county PDF parser's
`--local-only` mode rejects any unclassified contest and emits only county,
municipal, special-district, and precinct committee contests.

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
Local-only 2024 corpus status, verified defects, and the mandatory remediation
gate: `docs/election_results_2024_local_status.md`.
Election-night ingestion operational reference: `docs/election_results_2026_path_forward.md`.
Guarded policy for official sources with no contest checksum:
`docs/election_results_unreconciled_sources.md`.
Repeatable county-source audit runbook: `docs/recheck_county_election_result_sources.md`.
All five are gitignored (`Candidates/docs/**`), so they carry no git safety net.
Treat them as accurate as of their own "updated" markers, not as version-controlled history.

There is no standalone results page. Results ride the existing candidate-guide
flow rather than duplicating its filtering logic:

- **`src/pages/race/[id].astro`**: for each candidate on the ballot, a
  structural match against `election_contests` (hardcoded to `election_key =
  'wy-2026-primary'`) adds a vote/percentage line and a "Leading" badge
  (`.candidate-card--leading`, `var(--sage)`) to that candidate's card, plus
  a "Full county breakdown" link to the contest's deep-dive page. For
  federal/statewide/wy_senate/wy_house this is still level+district+title
  matching (reliable for those levels). For county/city, as of 2026-08-20
  this is card-scoped resolution instead (`docs/current_status_candidates_page.md`
  §3): candidate names on the card are matched against every county/city
  result row reported for the office's county, per party, and the
  best-overlapping contest wins the card. Replaced a title-suffix match that
  fired on roughly 1 of 1,358 county/city offices.
- **`src/pages/races/index.astro`**: one "Leading: PARTY (pct%)" chip per
  party per race card (a primary runs separate REP/DEM contests for the same
  office, so this is an array per office, never a single winner). County/city
  resolution uses the same card-scoped, per-(county, party) name-overlap
  matching as `race/[id].astro`, computed in bulk for every office on the
  page rather than per-office. Shows a bold ember results-timing banner
  (`.results-note`) whenever no results exist yet for any race, keyed off
  `election_events.polls_close_at`; disappears automatically once any
  result exists.
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
Before the complete state import, those snapshots together with Laramie's
higher-precedence county report surfaced 967 rows for the 2026 event, confirmed
by a read-only query on 2026-08-20.
The 2026-08-20 Secretary of State files now report all 23 counties. Their
complete 63-source, 172-contest, 2,668-row append-only seed was applied to
production after a full SQL backup. Production now stores 111 sources, 88
snapshots, 172 contests, and 3,818 result rows; the precedence view selects
2,667 current rows across all 23 counties. No Candidates deploy was needed for
the data update. A live check immediately afterward confirmed a cross-source
name-casing display defect: the US Senate card omitted Laramie County
subtotals even though the database aggregate was correct. Fixed 2026-08-21 in
`race/[id].astro` and `races/index.astro` — both grouped result rows by raw
`candidate_name_raw` before merging into their display-facing map, so a
candidate whose votes arrived from two differently-cased sources (e.g. `"John
Barrasso"` from the SOS track vs. `"JOHN BARRASSO"` from Laramie's
county-hosted PDF) had one source's votes silently dropped instead of summed.
Same merge-by-normalized-name pattern `results/contest/[id].astro` already
used for its deep-dive aggregation, applied to both files. See
`docs/current_status_candidates_page.md`.
`docs/election_results_2026_path_forward.md` covers the
ingestion pipeline and the remaining county and municipal coverage gaps.

Five counties' local results were added later on 2026-08-20 from seven
county-hosted summary PDFs supplied and verified by the user. Production now
stores 118 sources, 95 snapshots, 742 contests, and 6,219 result rows. The
current-results view selects all 570 new local contests and 2,401 new rows for
Carbon, Goshen, Natrona, Park, and Platte. The paired Goshen, Park, and Platte
precinct PDFs were used only as exact cross-checks, not inserted as competing
sources. Carbon and Natrona had no paired precinct PDF in the supplied set;
every one of their imported summary contests still reconciled to its printed
contest total.

Laramie County's own unofficial results PDF was supplied directly and applied
to production 2026-08-18: 46 contests and 213 result rows for federal,
statewide, and legislative district races (US Senate, US House, Governor,
Secretary of State, State Auditor, State Treasurer, Superintendent of Public
Instruction, all 4 Senate and 12 House districts touching Laramie), source
role `county_local_summary`. It reached the live US Senate card, but the later
complete-state import exposed a casing bug that caused its subtotals to be
omitted from the displayed candidate totals; fixed 2026-08-21 (see above).
County
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

The local-13-county results seed, the local-OCR-5-county results seed, and
the source registry v3 correction (previously local-only) were applied to
production D1 on 2026-08-21, immediately after the `skovgard-candidates`
Worker was redeployed with the name-casing fix above. Production now stores
154 sources, 108 snapshots, 1,518 contests, and 9,926 result rows; the
current-results view selects 8,775 rows. Applied with plain `INSERT OR
IGNORE` seeds, consistent with the append-only pattern used for every prior
production seed in this table.

Sweetwater's user-supplied 2026 unofficial Summary PDF was normalized on
2026-08-21 to `sweetwater_results.csv`. The text-layer parser reconciled all
173 in-scope county, municipal, and precinct committee contests and emitted
664 result rows, re-verified byte-for-byte reproducible from the source PDF.
Sweetwater's reversed Senate titles ("DISTRICT N STATE SENATOR"), abbreviated
Superintendent title, and municipality-only headings (Superior, Wamsutter,
Granger — confirmed against the existing `offices` roster for those towns)
are now recognized by the shared parser without changing its reconciliation
gate; the county-scoped allowlist deliberately does not affect any other
county (covered by a new test asserting Carbon still classifies "SUPERIOR" as
`unknown`).

`scripts/verify_election_results_precinct_pdf.py` also had a real bug caught
during this review: it called `extract()` on both PDFs without forwarding
`--county`, so the new municipality-only recognition above never reached it —
every run against Sweetwater failed with "Unclassified contest(s): SUPERIOR;
..." regardless of the fix already landed in the shared parser. Fixed by
passing `args.county` through both calls. After the fix, the cross-check
still cannot complete for Sweetwater: two uncontested precinct-committeeman
contests (write-in only, no filed candidate) print without their trailing
precinct-code suffix in the Precinct Summary PDF's header text, so the
regex-based classifier can't resolve them there even though the equivalent
County Summary PDF rows for those same seats have no such issue. Not
investigated further since the Summary PDF's own 173/173 reconciliation is
the primary import gate (Carbon and Natrona were both imported with no
paired precinct PDF at all); left as a known gap for whoever next needs a
clean precinct-level cross-check on this county.

Stage 2 (`election_results_wy_2026_primary_sweetwater_unofficial_2026-08-21.sql`)
was generated from the CSV with `--source-role county_local_summary`: 1
source, 1 snapshot, 173 contests, 664 result rows. Applied to local D1 and
spot-checked against `v_election_current_results` (County Commissioner REP
matched the CSV exactly), then applied to production D1 2026-08-21. Sweetwater
is no longer a gap county.

Fremont's user-supplied 2026 unofficial Summary and Precinct Summary PDFs were
reviewed on 2026-08-21. The parser identified 62 contests, including 36
county and municipal contests selected by `--local-only`; all 36 initially
withheld, since both PDFs print candidate votes, write-in votes, and a larger
`Contest Totals` value while never printing a single Overvotes or Undervotes
trailer line anywhere in either document (a document-wide absence, confirmed
by scanning the full extracted text, not three sampled contests). Full
anomaly writeup, the resulting `--allow-missing-undervote-overvote` exception
(parser 1.1.4), its safety guards, and two adjacent unfixed gaps (Fremont's
precinct-PDF cross-check pipeline only classifies 6 of dozens of expected
contests; a snapshot-level `verification_status` risk for a future county
with a *mix* of clean and exception contests) are in
`docs/election_results_2026_path_forward.md` finding #13 — that is now the
authoritative source for this county, not this paragraph.

With the exception applied, `fremont_results.csv` reconciled 36/36 contests:
93 rows (57 candidate, 36 write-in aggregate, zero fabricated undervote/
overvote rows), reproduced byte-for-byte on an independent re-run, all
stamped `verification_status='needs_review'` (not `'verified'` — the true
ballots-cast total per contest is unknown, only the candidate/write-in split
is). This is an existing schema enum value; no migration was needed, and
`v_election_latest_snapshots` requiring `'verified'` means none of this data
will appear anywhere on the live site until a human deliberately promotes it.

Stage 2 (`election_results_wy_2026_primary_fremont_unofficial_2026-08-21.sql`)
was applied to local D1 and then production D1 2026-08-21: 1 source, 1
snapshot, 36 contests, 93 result rows. The gating was directly verified in
both: 93 rows exist for Fremont's county/city contests in
`election_results_rows`, and 0 appear in `v_election_current_results` — only
Fremont's pre-existing federal/statewide/legislative rows (1,290, all
`verified`, from the earlier SOS-track import) are visible. Fremont's data
sits in D1 exactly as intended: present, auditable, and invisible on
`/races` and `/race/[id]` until someone flips `verification_status` to
`'verified'` by hand.

Laramie and Lincoln's user-supplied unofficial Summary PDFs were normalized
on 2026-08-21. Laramie's plural `COMMITTEEMEN`/`COMMITTEEWOMEN` headings are
now normalized to the existing singular precinct-committee vocabulary. No
precinct reports were supplied for these counties, so no separate precinct
cross-check was performed.

Independently re-verified 2026-08-21: re-running the parser against both raw
PDFs reproduced byte-identical data (only `parser_version` and one guessed
`source_url` differed, both expected). Found a real bug while reviewing
Laramie's output: 14 contests titled `"PROPOSITION 1"`–`"PROPOSITION 14"` had
`candidate_name_raw` set to `"FOR THE TAX"`/`"AGAINST THE TAX"` — ballot
measures being stored as fake candidate races, already live in production for
Sublette (`pro-1-percent-sales-and-use-tax`, `"FOR"`/`"AGAINST"`, from the
2026-08-20 13-county seed) though harmless there since no matching office
roster exists. Fixed in the shared parser (`level="ballot_measure"`,
excluded from `--local-only` output rather than hard-failing or silently
becoming a fake county contest) — see
`docs/election_results_2026_path_forward.md` finding #14 for the full
writeup and the still-open question of what to do about Sublette's
already-live rows. `laramie_results.csv` regenerated: 181 of 181 reconciled
local contests (was 195; the 14 propositions are now correctly excluded),
740 rows, zero fake candidate rows. `lincoln_results.csv` unaffected (no
ballot measures in its report): 409 rows from 96 of 96 reconciled local
contests.

Roster overlap spot-checked directly against `offices`/`candidates` for both
counties (e.g. Laramie's "Gunnar Malm," "Jess E. Ketcham," "M. Lee
Hasenauer" under "Laramie County Commissioner (Republican)"; several Lincoln
County Commissioner candidates) — unlike Fremont, this data was expected to
actually surface via card-scoped resolution once integrated, not stay inert.

Stage 2 seeds applied to local D1 then production D1 2026-08-21: Laramie (1
source — correctly reused the existing `county_local_summary` snapshot from
the 2026-08-18 federal/statewide import, same source_key + sha256, so the
snapshot insert no-op'd and only the new county/city contests/rows were
added — 181 contests, 740 result rows) and Lincoln (1 new source, 96
contests, 409 result rows). Both fully visible in
`v_election_current_results` (740/409, exactly matching result-row counts).
Confirmed end-to-end on the live site: `/race/497` (Laramie County
Commissioner) renders "Troy Thompson, 8,795 votes, 18.2%" with a "Leading"
badge.

Sheridan's user-supplied unofficial Summary PDF was reviewed again on
2026-08-21 under the separate policy in
`docs/election_results_unreconciled_sources.md`. The official county page's
direct Summary PDF was downloaded and matched the supplied local file exactly
by SHA-256. Parser 1.1.6 now has an explicit
`--allow-missing-contest-total` staging mode that refuses mixed reports and
emits only source-printed candidate and aggregate write-in values. It does
not describe those values as reconciled.

`sheridan_reported_rows_needs_review.csv` contains 301 rows from 137 of 137
in-scope candidate contests, all stamped `verification_status='needs_review'`
and `reporting_status='manual_required'`. The 24 nonlocal contests were
excluded by scope, and `SENIOR CITIZEN TAX QUESTION` was excluded because
ballot measures are outside the candidate-results schema.

Independently re-verified 2026-08-21: source PDF sha256 matched exactly,
parser re-run reproduced the CSV byte-for-byte (including `retrieved_at`),
and a direct `pdfplumber` text scan confirmed zero `Contest Totals`/`Total
Votes Cast`/`Overvotes`/`Undervotes` matches across all 955 extracted
lines — the document-wide guard is a genuine structural absence, not
assumed. Roster overlap spot-checked against `offices`/`candidates` for
Sheridan County Commissioner (Jim Schellinger, Christi Haswell, Holly
Jennings, etc. all match) — if this snapshot is ever promoted to
`verified`, it will render correctly, not sit inert.

Stage 2 seed generated and applied to local D1, then production D1,
2026-08-21: 1 source, 1 snapshot, 137 contests, 301 result rows. Confirmed
in both: 301 rows exist in `election_results_rows`, 0 appear in
`v_election_current_results`. This is a database load, **not** a
promotion to `verified` — per
`docs/election_results_unreconciled_sources.md`, that remains a separate,
later decision requiring documented human review (reviewer, date, source
hash, evidence, and why no better source exists), not something a
database load authorizes on its own.

## Verified Markdown transcription workflow

Added 2026-08-21 for reviewed transcriptions supplied alongside the original
county PDF. `scripts/extract_election_results_verified_md.py` reads fenced
`text` blocks from the review file and passes them through the same
classification, reconciliation, and CSV emission code used by the text-layer
and OCR PDF adapters. It does not relax the arithmetic gate.

When the review file still contains localized OCR ordering damage, an explicit
JSON file under `db/seed/source_overrides/` may replace only named contest blocks.
Each replacement records the PDF evidence page and the source-printed rows. The
JSON also pins the SHA-256 values of the reviewed Markdown and original PDF, so
the adapter refuses a different artifact. The emitted snapshot hash identifies
the exact corrected text passed to the shared parser.

Weston's hash-only manifest is
`db/seed/source_overrides/weston_2026_primary_verified_manifest.json`.
Converse's file also contains the localized contest replacements described
below.

Weston's reviewed transcription reconciled all 51 local contests and emitted
217 rows. Converse initially produced 93 of 99 reconciled contests, but review
also found 10 accepted contests with blank or punctuation-only OCR candidate
rows. Six failed contests and those 10 malformed contests were checked against
the rendered source PDF and recorded in
`db/seed/source_overrides/converse_2026_primary_verified_overrides.json`. The final
Converse output reconciled all 99 local contests, emitted 377 rows, and contains
no blank or punctuation-only candidate names.

Both were loaded as complete snapshot-sequence-2 successors under their
existing source keys. Complete replacement is required because
`v_election_latest_snapshots` selects at source snapshot grain. A partial newer
snapshot would hide valid contests present only in the older one. Production
verification confirms the new current snapshots at 51 contests and 217 rows
for Weston, and 99 contests and 377 rows for Converse. The older snapshots
remain append-only history.

## OCR extraction workflow

For county-hosted summary PDFs with no embedded text layer at all (confirmed
via `pdfplumber` returning 0 characters on every page — a different problem
than a messy-but-present text layer, which the regular parser handles).
Added 2026-08-20 for Campbell, Johnson, Washakie, Weston, and Teton.

One-time setup, only needed if `which tesseract` finds nothing:

```bash
bash scripts/setup_local_tesseract.sh
```

Downloads tesseract's `.deb` packages with `apt-get download` (no root
needed) and extracts them with `dpkg -x` into
`~/.local/share/tesseract-local`. This machine has no passwordless sudo, so
a normal `apt install tesseract-ocr` isn't an option here.

Then run the OCR parser exactly like the text-layer one, same flags, plus
`--dpi`/`--psm`/`--save-ocr-text`:

```bash
python3 scripts/extract_election_results_county_pdf_ocr.py \
  --pdf path/to/county.pdf --county "County Name" \
  --election-key wy-2026-primary \
  --source-key "wy|county-slug|wy-2026-primary|county_local_summary" \
  --source-url "https://..." --local-only \
  --save-ocr-text /tmp/county_ocr.txt \
  --out db/seed/staging/county.csv
```

`--save-ocr-text` is worth using on every new county: the reconciliation
gate catches a wrong digit, but it can't catch OCR skipping or merging an
entire contest section, which shows up as fewer contests than the source
actually has rather than a loud failure. Eyeball the saved text once.

400 DPI and `--psm 6` are the defaults, chosen because they measurably beat
300/6 on real Washakie data (21/39 vs 18/39 contests reconciled) for about
4 extra seconds on a 13-page report. A specific county may still do better
at `--psm 4` ("single column of variable-size text") or a higher `--dpi`.

Yield is bounded by scan quality, not tunable away: Johnson reconciled
18/18 contests, Teton 80/81, Campbell 134/157, Washakie 21/39, and Weston
only 3/43 (its OCR text is full of unrecoverable garbage tokens like "aa"
and "na SLAG gaa" — a genuinely low-quality scan, not a parser gap).

`run_from_text()` in `extract_election_results_county_pdf.py` is the shared
reconciliation-and-CSV-emission logic both this script and the text-layer
one call — the two scripts differ only in how they turn a PDF into text
(`pdfplumber` vs. rasterize-then-OCR). A fix to office-name recognition,
the reconciliation rule, or the CSV contract belongs in that shared
function or in `normalize_contest()`, not duplicated in the OCR script.

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
