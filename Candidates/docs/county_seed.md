# County Candidate Seed Workflow

Step-by-step guide for adding a new Wyoming county's candidates to the WY D1 voter guide database. Follow this every time new official candidate filings arrive.

---

## 1. Source documents

County clerks publish two official PDFs after the filing deadline:

- **General candidates list** — county, municipal, and state office candidates with name, address, and email
- **Precinct committee candidates list** — Republican/Democratic committeemen and committeewomen by precinct

Both are required. Do not add candidates from unofficial or preliminary lists.

---

## 2. Pre-flight checks

Run all three queries before writing any SQL. All commands run from `Candidates/` with `--remote` for production.

**a. Confirm zero existing data for this county:**
```sql
SELECT COUNT(*) FROM offices WHERE county = 'COUNTY_NAME';
SELECT COUNT(*) FROM candidates c JOIN offices o ON c.office_id = o.id WHERE o.county = 'COUNTY_NAME';
```
If either count is non-zero, you are doing an update, not a fresh seed. Stop and treat it as a correction file instead.

**b. Get the current max sort_order:**
```sql
SELECT MAX(sort_order) FROM offices;
```
Your new county's offices start at `max + 1`. Reserve a contiguous block: 8–10 for county offices, 2–3 for municipal offices, then one per precinct committee office.

**c. Check for canonical state legislative offices:**
```sql
SELECT id, title, level, district, county FROM offices WHERE level IN ('wy_house', 'wy_senate') AND district IN (HD_NUMBERS_FOR_THIS_COUNTY);
```
State house and senate offices already exist in the DB (one per district, `county = NULL`). **Do not create new offices for them.** Candidates belong to the existing office by district number. If an office is missing, check `001_seed.sql` — all 60 house and 30 senate seats were seeded there.

---

## 3. `level` field — CHECK constraint

The `offices.level` column has a strict `CHECK` constraint. Only these values are valid:

| Value | Use for |
|---|---|
| `'federal'` | US House, US Senate |
| `'statewide'` | Governor, Secretary of State, AG, etc. |
| `'wy_senate'` | Wyoming State Senate districts |
| `'wy_house'` | Wyoming State House districts |
| `'county'` | All county offices AND precinct committee races |
| `'city'` | Municipal offices (mayor, city council, etc.) |

**Common mistakes:**
- `'municipal'` → **invalid**, use `'city'`
- `'state'` → **invalid**, use `'wy_house'` or `'wy_senate'`
- `'precinct'` → **invalid**, use `'county'` with `scope_kind = 'precinct_party_gender'`

`INSERT OR IGNORE` silently discards rows that violate this constraint. Always verify row counts after applying (see §7).

---

## 4. Seed file naming and location

```
Candidates/db/seed/{county_slug}_candidates_{YYYY-MM-DD}.sql
```

Use the date the PDF was received or the official filing close date — whichever appears on the document. If you need a corrective follow-up file, name it:

```
Candidates/db/seed/{county_slug}_corrections_{YYYY-MM-DD}.sql
```

Both files are committed to the repo. They are idempotent (`INSERT OR IGNORE`) and safe to re-run.

---

## 5. Office INSERT pattern

### County offices
```sql
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Fremont County Commissioner', 'county', NULL, 502, 'Fremont', 3, 'NP');
```

- `ballot_party` is `'NP'` for all county and municipal offices (nonpartisan races).
- `seats_available` defaults to 1; set it explicitly when there are multiple seats (commissioner boards, city council).
- `district` is `NULL` for county and municipal offices.

### Municipal offices
```sql
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, municipality, seats_available, ballot_party)
  VALUES ('Lander Mayor', 'city', NULL, 510, 'Fremont', 'Lander', 1, 'NP');
```

- Always include the `municipality` column (city/town name) for `level = 'city'`.

### Precinct committee offices
```sql
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, seats_available, scope_kind)
  VALUES ('Fremont Precinct 1-1 Republican Precinct Committeeman', 'county', NULL, 520, '1-1', 'Fremont', 1, 'precinct_party_gender');
```

- Title pattern: `{County} Precinct {N-N} {Party} Precinct Committeeman|Committeewoman`
- `scope_kind = 'precinct_party_gender'`
- `seats_available` is 1 unless the precinct has multiple seats (some urban precincts have 2–4 committee seats per gender — check the PDF header).
- Only create an office if at least one candidate filed for it. Skip empty slots.
- Do not create `ballot_party` on precinct offices — the party is implied by the title.

### State legislative (wy_house / wy_senate) — canonical office lookup
Do NOT create a new office. Insert candidates into the existing office:
```sql
-- First verify the office exists and get its id
SELECT id, title, district FROM offices WHERE level = 'wy_house' AND district = 40;

-- Then insert candidates
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Jane Smith', 'jane-smith-hd-40', 'Laramie', 'WY', '123 Main St Laramie WY 82070', NULL
  FROM offices WHERE level = 'wy_house' AND district = 40;
```

---

## 6. Candidate INSERT pattern

Always use a `SELECT ... FROM offices WHERE title = '...'` subquery for `office_id` — never hard-code an ID.

```sql
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'John Doe', 'john-doe-fremont-county-commissioner',
    'Lander', 'WY', '456 Oak Ave Lander WY 82520', 'jdoe@example.com'
  FROM offices WHERE title = 'Fremont County Commissioner';
```

**Required fields:** `office_id`, `party`, `full_name`, `slug`  
**Always include when available:** `city`, `state`, `mailing_address`, `email`  
**Leave NULL if unknown** — do not guess or fill in placeholder values.

### Party values
- `'REP'` — Republican
- `'DEM'` — Democrat
- `'NP'` — Nonpartisan (county and municipal offices)
- `'LIB'` — Libertarian (rare)

Note: existing enriched candidates may have `party = 'Republican'` (full word) from the enrichment batch. New seeds use the short form `'REP'` — both are accepted by the app.

### Slug conventions

| Office type | Pattern | Example |
|---|---|---|
| County office | `{first-last}-{county-slug}-{office-key}` | `jane-smith-fremont-county-commissioner` |
| Municipal | `{first-last}-{city-slug}-{office-key}` | `bob-jones-lander-mayor` |
| State house | `{first-last}-hd-{N}` | `jane-smith-hd-40` |
| State senate | `{first-last}-sd-{N}` | `bob-jones-sd-17` |
| Precinct committee | `{county-slug}-pct-{N-N}-{party-lower}-{man\|woman}-{first-last}` | `fremont-pct-1-1-rep-man-john-doe` |

Rules:
- Lowercase, hyphens only, no periods or special characters
- Use the candidate's **legal name** from the filing document, not a nickname
- Middle initials: include as a single letter with no period — `john-a-doe`
- Slugs must be globally unique across the entire `candidates` table. For common names, the office suffix makes them unique.

### Withdrawn candidates
Insert the candidate first (so the record exists), then update:
```sql
UPDATE candidates SET withdrawn_at = '2026-06-16T00:00:00'
  WHERE slug = 'shane-f-greet-johnson-county-sheriff' AND withdrawn_at IS NULL;
```

Use the date from the official withdrawal notice. The `AND withdrawn_at IS NULL` guard keeps the UPDATE idempotent.

### Malformed contact data
If a source PDF contains a corrupt email (e.g. a space in the address like `tortoise kim@icloud.com`), store `email = NULL` and add a comment in the SQL explaining why.

---

## 7. Verification queries

Run these immediately after applying the seed file. If counts are off, see §8.

```sql
-- Office count for the new county
SELECT COUNT(*) FROM offices WHERE county = 'COUNTY_NAME';

-- Candidate count (only county-tagged offices)
SELECT COUNT(*) FROM candidates c
  JOIN offices o ON c.office_id = o.id
  WHERE o.county = 'COUNTY_NAME';

-- Withdrawn candidates
SELECT full_name, withdrawn_at FROM candidates c
  JOIN offices o ON c.office_id = o.id
  WHERE o.county = 'COUNTY_NAME' AND c.withdrawn_at IS NOT NULL;

-- Spot-check a specific office
SELECT c.full_name, c.party, c.email FROM candidates c
  JOIN offices o ON c.office_id = o.id
  WHERE o.title = 'COUNTY_NAME County Sheriff';
```

**Expected math:**
- `changes` reported by wrangler = total offices inserted + total candidates inserted + withdrawn UPDATEs
- If `changes` < total statements: some INSERTs were silently skipped. The most common cause is a `level` CHECK violation (§3). Re-run the queries above to find which offices are missing, then write a corrections file.

---

## 8. Corrections file pattern

When the initial seed had a silent failure (wrong `level`, slug collision, etc.), write a separate corrections file rather than editing the original seed. This preserves the historical record.

```
Candidates/db/seed/{county_slug}_corrections_{YYYY-MM-DD}.sql
```

The corrections file should:
- Include a header comment explaining what failed and why
- Use `INSERT OR IGNORE` for new rows and `UPDATE ... WHERE ... AND withdrawn_at IS NULL` for updates
- Be idempotent — safe to re-run if applied again

---

## 9. Apply to production

Run from `Candidates/`:
```bash
npx wrangler d1 execute WY_DB --remote --file=db/seed/{filename}.sql
```

Then run the verification queries (§7) before continuing.

---

## 10. Deploy

After verifying data, redeploy the Worker from the repo root:
```bash
SKIP_BUILD=1 ./scripts/deploy_candidates.sh
```

`SKIP_BUILD=1` skips the Astro build since this is a data-only change. Confirm the deploy output shows `WY_DB → wy` and worker name `skovgard-candidates`.

---

## 11. Commit

Stage and commit both the seed file and any corrections file:
```bash
git add Candidates/db/seed/{county_slug}_candidates_{date}.sql
git add Candidates/db/seed/{county_slug}_corrections_{date}.sql  # if present
git commit -m "Add {County} County candidates from {date} official distribution"
```

Do not commit intermediate working files, raw PDFs, or extracted CSV/TXT artifacts to this directory.

---

## 12. Counties already in the database

_(updated 2026-08-02 — all 23 counties now have county-tagged records and Sweetwater precinct candidates were added; completeness still requires source-by-source verification)_

All 23 Wyoming counties now have at least some county-tagged candidate data. Do not treat that as proof that every contest type is complete: query the relevant `scope_kind` and compare it with the official county source before calling a county complete.

Sweetwater precinct status as of 2026-08-02: 50 `precinct_party_gender` offices and 93 candidates across 26 precinct codes. Richard F. Kaumo (04-4 Committeeman) remains unimported because the official filing source leaves both party and seat count blank; do not infer them.

Always query `MAX(sort_order)` immediately before generating a new seed; never rely on a documented next value.
