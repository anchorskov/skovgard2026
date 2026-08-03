<!-- Guide/AGENTS.md -->
# Guide Sub-project — Agent Instructions

Voter guide admin and rubric scoring for the Wyoming 2026 primary.
Lives at `guide.skovgard2026.org`, deployed as a **Cloudflare Pages** project.
This file covers everything specific to `Guide/`. For campaign-wide rules see the root `AGENTS.md`.

---

## Quick reference

| Thing | Value |
|---|---|
| Pages project name | `skovgard-guide` |
| D1 binding | `WY_DB` → database `wy` (ID `4b4227f1-bf30-4fcf-8a08-6967b536a5ab`) |
| Deploy script | `./scripts/deploy_guide.sh` from repo root |
| Data-only redeploy | `SKIP_BUILD=1 ./scripts/deploy_guide.sh` |
| Candidate data | Shared with Candidates/ — same WY_DB instance |
| Auth header | `x-admin-key: $CANDIDATES_ADMIN_KEY_GUIDE` |

---

## Cloudflare Infrastructure

Three separate projects share one D1 database (`wy`):

```
candidates.skovgard2026.org   Cloudflare Worker   skovgard-candidates   WY_DB → wy
guide.skovgard2026.org        Cloudflare Pages    skovgard-guide        WY_DB → wy
grassrootsmvt.org             Cloudflare Worker   grassmvtsurvey        DB    → wy  (same DB, different binding name)
```

All three also bind the `ballot_sources` D1 (`LOOKUP_DB` in `skovgard-candidates`,
`DB` in the main `skovgard2026-api` Worker). Do not confuse the two databases.

**`wy` D1 is the source of truth for:**
- All candidate and office data
- All guide scoring and evidence tables
- Polling location data

**`ballot_sources` D1 is the source of truth for:**
- Campaign contacts and consent
- grassrootsmvt ballot survey tables: `ballot_surveys`, `race_candidates`, `ballot_responses`
- Voter geo lookup: `user_address_verification`

---

## Database: All Tables in WY_DB

### Base data (shared across all three projects)

| Table | Project(s) | Purpose |
|---|---|---|
| `offices` | Candidates, Guide | Wyoming offices — federal, statewide, wy_senate, wy_house, county, city |
| `candidates` | Candidates, Guide, grassroots | One row per candidate per office. FK: `office_id → offices.id` |
| `polling_locations` | Candidates | City-based polling venue lookup |
| `county_gis` | Candidates | ArcGIS endpoints for spatial precinct lookup |
| `precinct_polygons` | Candidates | GeoJSON precinct boundaries |

`offices.level` CHECK constraint accepts only: `'federal' | 'statewide' | 'wy_senate' | 'wy_house' | 'county' | 'city'`.
Do NOT use `'state_senate'`, `'state_house'`, `'municipal'`, or `'state'` — inserts silently fail.

### Scoring and endorsement tables (Guide admin writes; Candidates reads summaries)

| Table | Purpose |
|---|---|
| `guide_rubric_scores` | Per-candidate scores across 10 categories (UNIQUE on candidate_id + category_key) |
| `guide_rubric_versions` | Versioned rubric metadata and scoring policy; one active version per election cycle |
| `guide_rubric_categories` | Ordered labels, weights, standards, and evidence guidance for each rubric version |
| `guide_sources` | Per-candidate numbered citation list — mutable, DELETE+reinsert on each save |
| `guide_endorsements` | Aggregate endorsement status, final_score, evidence_confidence per candidate |
| `guide_public_corrections` | Factual corrections to published guide pages |
| `guide_questionnaire_tokens` | Token-based candidate questionnaire URLs (no auth needed) |
| `guide_questionnaire_responses` | Per-question candidate submissions |

### Reference evidence tables (migration 0017, applied 2026-06)

Reusable legislative and network evidence, separate from the per-candidate `guide_sources` list.

| Table | Purpose |
|---|---|
| `guide_reference_sources` | Reusable source registry (source_key UNIQUE). Referenced from evidence links. |
| `guide_legislation_items` | Individual bills/votes (ref_id UNIQUE). Includes `topic_display` for voter-facing UI. |
| `guide_reference_sets` | Named collections of legislation items (e.g. "CORE-2026" bill package) |
| `guide_reference_set_items` | Many-to-many: reference_set → legislation items |
| `guide_candidate_reference_links` | Candidate ↔ source/set/legislation associations + identity metadata |
| `guide_rubric_evidence_links` | Rubric-categorized evidence rows. `ballot_visible` gates voter exposure. |

#### `guide_candidate_reference_links` key columns

- `candidate_id` — FK to `candidates.id`. NULL for unmatched/unverified source rows.
- `candidate_name` — stable source key (UNIQUE with reference_key + reference_kind).
- `current_candidate_name` — SOS-roster name (may differ from older source names).
- `office_sought_2026` — current verified office, or "Not running / verify".
- `office_status_note` — free text for status caveats.
- `reference_kind` — `'source' | 'reference_set' | 'legislation' | 'candidate_network' | 'verification_flag'`
- `verification_status` — `'draft' | 'needs_official_verification' | 'verified' | 'do_not_publish'`

#### `guide_rubric_evidence_links` key columns

- `candidate_id` — FK to `candidates.id` (NOT NULL — only matched candidates get evidence links).
- `category_key` — one of the 10 rubric categories.
- `reference_kind / reference_key` — pointer back into `guide_candidate_reference_links`.
- `ballot_visible` — **0 = admin scoring only (default). 1 = surfaced on grassrootsmvt ballot page.**
  Flip to 1 only after cross-checking WY Legislature roll-call records and SOS roster.
  All VERIFY-* flagged rows must stay 0 until those flags are resolved.
- `display_publicly` — secondary gate for Candidates public profile pages (future).
- UNIQUE on `(candidate_id, category_key, reference_kind, reference_key)`.

#### Rubric category → evidence theme mapping

| Category key | Evidence theme |
|---|---|
| `coalition` | Freedom Caucus official membership |
| `issue_alignment` | CORE-2026 bill package, specific bill votes |
| `accountability` | BWAR donor network, public records |
| `local_impact` | Public lands bills (SJ009, HB019, etc.) |
| `evidence_quality` | Verification flags, official SOS/Legislature records |
| `public_service` | BWAR public service notes |

---

## Cross-Project Data Flow

```
Guide admin (guide.skovgard2026.org)
  Reads/writes: guide_rubric_scores, guide_rubric_evidence_links, guide_endorsements, etc.
  Auth: x-admin-key header (CANDIDATES_ADMIN_KEY_GUIDE Wrangler secret)

Candidates voter guide (candidates.skovgard2026.org)
  Reads: offices, candidates → ballot lookup + candidate profiles
  Reads: guide_endorsements → summary score shown on candidate profiles
  Reads: polling_locations, county_gis → polling place lookup

grassrootsmvt ballot page (grassrootsmvt.org)
  DB binding also resolves to the wy D1 (same physical database).
  Ballot card query flow:
    1. user_address_verification (ballot_sources) → HD/SD for this user
    2. ballot_surveys (ballot_sources) → active races matching HD/SD/statewide
    3. race_candidates (ballot_sources) → candidates per race, includes wy_candidate_id
    4. guide_rubric_evidence_links (wy) WHERE candidate_id = wy_candidate_id AND ballot_visible = 1
    5. guide_legislation_items (wy) → topic_display + source_framing for each evidence row
    6. ballot_responses (ballot_sources) → user's saved choices and notes
```

### The join key: `wy_candidate_id`

`race_candidates.wy_candidate_id` (ballot_sources D1) references `candidates.id` (wy D1).
Populated by `Candidates/scripts/populate_wy_candidate_id.mjs`. The 2026-06-30
sync matched 200 of 203 rows. The unmatched Fearneyhough (Secretary of State),
Bates (HD10), and Lennox (HD46) filings are all on the Wyoming Secretary of
State withdrawn roster and must not be treated as active candidates.
Candidates with NULL wy_candidate_id appear on the ballot page but have no evidence links.

---

## Migration History

Guide migrations in `Guide/db/migrations/` mirror the corresponding Candidates migrations.
Both target the same `wy` D1 — run either set, not both.
**Canonical migration location going forward: `Candidates/db/migrations/`.**

| Guide file | Candidates equivalent | Content |
|---|---|---|
| `0001_guide_rubric.sql` | `0012_guide_rubric.sql` | guide_rubric_scores, guide_sources |
| `0002_guide_endorsements.sql` | `0013_guide_endorsements.sql` | guide_endorsements |
| `0003_guide_corrections.sql` | `0014_guide_corrections.sql` | guide_public_corrections |
| `0004_guide_questionnaire.sql` | `0015_guide_questionnaire.sql` | guide_questionnaire_tokens/responses |
| *(not in Guide/)* | `0016_candidate_docs.sql` | docs_json column on candidates |
| *(not in Guide/)* | `0017_guide_reference_evidence.sql` | guide_reference_sources, guide_legislation_items, guide_reference_sets, guide_reference_set_items, guide_candidate_reference_links, guide_rubric_evidence_links |
| *(not in Guide/)* | `0018_guide_candidate_reference_identity.sql` | Identity columns on guide_candidate_reference_links |
| *(not in Guide/)* | `0022_guide_rubric_definitions.sql` | Versioned rubric definitions loaded by Guide and Candidates |

Future migrations: add to `Candidates/db/migrations/` only. Apply with:

```bash
cd Candidates
npx wrangler d1 execute WY_DB --remote --file=db/migrations/00XX_description.sql
```

Never run old migrations (0001–0010) again — non-idempotent `ALTER TABLE` statements exist.

---

## Deploy Rules

**Always use `./scripts/deploy_guide.sh`** from the repo root:

```bash
./scripts/deploy_guide.sh                 # full install + build + deploy
SKIP_BUILD=1 ./scripts/deploy_guide.sh   # deploy existing dist/client/ (data-only changes)
./scripts/deploy_guide.sh --commit-message "rubric admin update"
```

What the script does:
1. Validates `Guide/wrangler.toml` names `skovgard-guide` (fails if mismatched).
2. Guards against an `[env.production]` block (would silently retarget `skovgard-guide-production`).
3. Validates `Guide/scripts/postbuild-pages.mjs` exists (generates `_worker.js` shim for Pages SSR).
4. Runs `npm ci` + `npm run build` (which runs `astro build` then `postbuild-pages.mjs`).
5. Requires the project-local pinned CLI and deploys with `npx --no-install wrangler pages deploy ./dist/client --project-name skovgard-guide`.

Do NOT:
- Run `npx wrangler pages deploy` directly — no project-name guard.
- Run `npx wrangler deploy` (that targets Workers, not Pages).
- Mix this project's deploy with `skovgard-candidates` or `skovgard2026-api`.

---

## Current API Endpoints

All endpoints require `x-admin-key: <CANDIDATES_ADMIN_KEY_GUIDE>`.

| Method | Path | File | Purpose |
|---|---|---|---|
| GET | `/api/admin/candidates` | `src/pages/api/admin/candidates.js` | List all candidates ordered by office level + title |
| GET | `/api/admin/rubric?candidate_id=X` | `src/pages/api/admin/rubric.js` | Load rubric scores + sources + endorsement for one candidate |
| POST | `/api/admin/rubric` | `src/pages/api/admin/rubric.js` | Save rubric scores, sources, and endorsement |
| GET | `/api/admin/rubric-definition` | `src/pages/api/admin/rubric-definition.js` | Load the active D1 rubric definition, with generated fallback |

Admin UI: `Guide/public/admin/rubric/index.html` — standalone HTML, not an Astro page.

Rubric authoring source: `Candidates/data/rubrics/wy-primary-2026-v1.md`.
Workflow: `Candidates/docs/rubrics/README.md`. Guide must not maintain a separate
hard-coded category list or scoring policy.

---

## Seed Scripts and State

All seed scripts in `Candidates/scripts/`. Run from repo root: `node Candidates/scripts/<name>.mjs`.

| Script | Tables written | Status |
|---|---|---|
| `seed_reference_evidence.mjs` | guide_reference_sources, guide_legislation_items, guide_reference_sets, guide_reference_set_items | Applied — 24 legislation items |
| `seed_freedom_caucus_links.mjs` | guide_candidate_reference_links | Applied — 46 rows, 14 matched to candidate_id |
| `patch_candidate_reference_identity.mjs` | guide_candidate_reference_links (UPDATE) | Applied — corrected Rachel Williams, Scott Smith, John Winter |
| `populate_wy_candidate_id.mjs` | race_candidates.wy_candidate_id (ballot_sources) | Applied — 200/203 matched |
| `seed_rubric_evidence_links.mjs` | guide_rubric_evidence_links | Applied — 41 rows, all ballot_visible=0 |

---

## Current Build Status and Next Steps

### Completed
- Schema migrated (migrations 0017, 0018 applied to wy D1)
- Reference sources, legislation items, reference sets seeded from YAML
- Freedom Caucus member links seeded and identity-corrected
- `race_candidates.wy_candidate_id` populated (200/203 matched)
- `guide_rubric_evidence_links` seeded (41 rows, all ballot_visible=0)
- Guide admin candidate list ordering fixed (`wy_senate`/`wy_house` level values)
- Ballot page (grassrootsmvt) built — choose buttons, notes textarea, results page
- Candidates voter guide → ballot CTA wired (renders after address lookup)

### Step 10 — Editorial Approval Gate (pending)
Before flipping any `ballot_visible` to 1:
- Cross-check each claim against official WY Legislature roll-call records
- Verify candidate SOS roster status (especially `needs_official_verification` rows)
- VERIFY-* flagged rows must stay 0 until resolved
- Flip per-row: `UPDATE guide_rubric_evidence_links SET ballot_visible=1, updated_at=datetime('now') WHERE id=?`
- After any flip, grassrootsmvt ballot card query surfaces those rows automatically
  (ballot card API must first be updated per Step 12 below)

### Step 12 — Guide Admin Reference Evidence UI (next)
Three pieces:

**1. API: `GET /api/admin/reference-evidence?candidate_id=X`**
Returns guide_rubric_evidence_links rows for a candidate, joined to guide_legislation_items
for claim_summary, topic_display, and official_url.

**2. API: `POST /api/admin/reference-evidence`**
Body: `{ id, ballot_visible, verification_status, notes }`
WORM: only updates `ballot_visible`, `verification_status`, `notes`, `updated_at`. No deletes.
Auth: same `CANDIDATES_ADMIN_KEY_GUIDE` header.

**3. UI: `Guide/public/admin/evidence/index.html`**
Candidate selector → evidence table with ballot_visible toggle per row.
Shows category_key, reference_key, claim_summary, verification_status.

**4. Ballot card integration** (in `grassmvt_survey/src/worker.js`)
After building the candidate list, fetch evidence:
```sql
SELECT rel.candidate_id, rel.category_key, rel.reference_key, rel.claim_summary,
       li.topic_display, li.source_framing, li.official_url
FROM guide_rubric_evidence_links rel
JOIN guide_legislation_items li ON li.ref_id = rel.reference_key
WHERE rel.candidate_id IN (?) AND rel.ballot_visible = 1
```
Attach `evidence[]` array to each candidate in the survey response.
Update `grassmvt_survey/public/js/ballot.js` to render a "Key votes & positions" section.

### Internal Geo Endpoint (future)
`GET /api/internal/geo` on `skovgard-candidates` Worker — server-to-server ballot geography
lookup without requiring a Turnstile token. Needed when grassmvt worker calls Candidates
for county/precinct scoping. Currently `fetchBallotGeography()` returns null for those fields.

---

## D1 Query Examples

Run from `Candidates/` (same WY_DB binding and database):

```bash
# Evidence link counts per candidate
npx wrangler d1 execute WY_DB --remote --command "SELECT candidate_id, COUNT(*) FROM guide_rubric_evidence_links GROUP BY candidate_id;"

# ballot_visible status breakdown
npx wrangler d1 execute WY_DB --remote --command "SELECT ballot_visible, COUNT(*) FROM guide_rubric_evidence_links GROUP BY ballot_visible;"

# VERIFY-* flags still unresolved
npx wrangler d1 execute WY_DB --remote --command "SELECT candidate_name, reference_key, office_sought_2026 FROM guide_candidate_reference_links WHERE reference_kind='verification_flag' ORDER BY candidate_name;"

# Candidates with endorsement scores
npx wrangler d1 execute WY_DB --remote --command "SELECT c.full_name, ge.status, ge.final_score FROM candidates c JOIN guide_endorsements ge ON ge.candidate_id = c.id ORDER BY ge.final_score DESC LIMIT 20;"
```

---

## Auth Pattern

All Guide API endpoints use a timing-safe header check:

```javascript
const key = request.headers.get('x-admin-key') ?? '';
timingSafeEqual(key, env.CANDIDATES_ADMIN_KEY_GUIDE ?? '')
```

`CANDIDATES_ADMIN_KEY_GUIDE` is a Wrangler secret set via `wrangler secret put CANDIDATES_ADMIN_KEY_GUIDE`.
The Guide admin HTML prompts for the key and stores it in `sessionStorage` — never sent to a third party.
