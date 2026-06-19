<!-- docs/polling/AddPollingLocations.md -->
# Adding Polling Locations — Agent Procedure

This document is the authoritative step-by-step procedure for adding polling location data
for a Wyoming county to the voter guide. Follow it exactly. Do not skip the D1 apply or
verify steps, and do not defer deployment to the end — apply to both D1 databases as each
SQL file is ready.

---

## Before you start

Read these files to orient yourself:

- `Candidates/wrangler.toml` — D1 database names and binding names
- `Candidates/db/migrations/0006_polling_locations.sql` — `polling_locations` table schema
- `Candidates/src/pages/api/ballot-lookup.js` — `getPollingLocations()` function (no code
  changes needed for new counties; the query already handles all counties)

**D1 databases:**

| Purpose | DB name | Command flag |
|---------|---------|--------------|
| Production | `wy` | `--remote` |
| Local dev | `wy` | _(no flag — uses local SQLite in `.wrangler/state/`)_ |

All `wrangler` commands run from the `Candidates/` directory.

---

## Data model — read this carefully

The `polling_locations` table:

```
county          TEXT  — county name, e.g. "Big Horn", "Park"
precinct_code   TEXT  — precinct identifier, e.g. "01-01", "4-2-3"
precinct_name   TEXT  — human name, e.g. "Basin", "Cody East & North Inside"
location_name   TEXT  — polling place name, e.g. "Big Horn County Fair Grounds"
address         TEXT  — FULL physical address of the polling place, including city,
                        state, and ZIP. May be in a different city than the voter.
city            TEXT  — THE VOTER'S HOME CITY. This is the lookup key. A voter entering
                        "Otto" must get a row where city = 'Otto', even if the polling
                        place is in Burlington.
zip             TEXT  — voter's home ZIP (optional; not used in the query)
election_year   INT   — always 2026 for this cycle
county_clerk_url TEXT — county clerk page for the voter to verify details
```

**The critical rule:** `city` is the **voter's entry** in the address form, NOT the
polling location's city. For precincts where voters from community A vote at a location
in community B, create a row with `city = 'A'` and put the full physical address of the
location in `address`.

**Example (Big Horn County, Otto precinct):**
```
city = 'Otto', address = '114 N Main St, Burlington, WY 82411',
location_name = 'Burlington Fire Hall'
```

**The query uses `SELECT DISTINCT location_name, address, county_clerk_url`**, so multiple
precinct rows for the same city/location collapse to one result. Keep distinct
`(location_name, address)` combinations per city to ≤ 3 (the query has `LIMIT 3`).

**Countywide vote-center counties:** If the source says every voter in the county may
vote at any listed vote center regardless of district or precinct, use
`city = '__countywide__'` for those vote-center rows. The lookup includes these rows for
any submitted city in the matching county. Do not use this sentinel for normal precinct
polling-place counties.

---

## Step 1 — Extract data from source

Accepted sources: county clerk PDF, GIS screenshot, spreadsheet, direct list.

For each precinct (or polling location), capture:

| Field | Notes |
|-------|-------|
| `precinct_code` | As shown on source — "01-01", "4-2-3", etc. |
| `precinct_name` | Community or area name |
| `location_name` | Exact venue name |
| `address` | Full street address including city/state/ZIP of the **venue** |
| `city` | The **voter's home city** for this precinct |
| `zip` | Voter's home ZIP (leave blank if unknown) |
| `county_clerk_url` | County clerk elections page |

Flag any address that cannot be read from the source as **NEEDS VERIFICATION**. Create
the row with city/state only and add a comment to the SQL file. Do not guess street
numbers — the voter sees this text directly.

---

## Step 2 — Create the seed files

File naming: use a lowercase hyphenated county slug.

```
Candidates/db/seed/polling_locations_{county_slug}.csv
Candidates/db/seed/polling_locations_{county_slug}_insert.sql
```

**CSV format** (match existing files exactly):
```
county,precinct_code,precinct_name,location_name,address,city,zip,election_year,county_clerk_url
Park,1-1,Clark-Sirrine,Clark Community Center,"Clark, WY",Clark,,2026,https://...
```

**INSERT SQL format:**
```sql
-- {County} County 2026 primary polling locations
-- Source: {describe the source document}
-- Any NEEDS VERIFICATION addresses are noted with inline comments.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Park','1-1','Clark-Sirrine','Clark Community Center','Clark, WY','Clark',NULL,2026,'https://...'),
  ...;
```

---

## Step 3 — Apply to both D1 databases

Apply production first, then local. Run these from `Candidates/`:

```bash
# Production
npx wrangler d1 execute wy --remote \
  --file=db/seed/polling_locations_{county_slug}_insert.sql

# Local dev (no --remote — targets local SQLite in .wrangler/state/)
npx wrangler d1 execute wy \
  --file=db/seed/polling_locations_{county_slug}_insert.sql
```

Confirm both commands report `"success": true` and a `changes` count matching the number
of INSERT rows before continuing.

---

## Step 4 — Verify

Run a spot check on each distinct city in the new data:

```bash
npx wrangler d1 execute wy --remote --command="
  SELECT DISTINCT location_name, address
  FROM polling_locations
  WHERE LOWER(county) = LOWER('{County}')
    AND LOWER(city) = LOWER('{city}')
    AND election_year = 2026
  LIMIT 5"
```

Also test via the live API for at least one address in the new county:

```bash
curl -s -X POST https://candidates.skovgard2026.org/api/ballot-lookup \
  -H 'content-type: application/json' \
  -d '{"houseNumber":"123","street":"Main St","city":"{city}","zip":"{zip}"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    [print(f'  {r[\"location_name\"]} — {r[\"address\"]}') \
     for r in (d.get('d1PollingLocations') or [])]"
```

If `d1PollingLocations` is null for a city that should have data, check:
1. `county` spelling in the row vs. what the geocoder returns in `districts.county`
2. `city` spelling — must match what a voter would enter in the address form

---

## Step 5 — Handle address corrections

When the user supplies verified street addresses for NEEDS VERIFICATION rows:

1. Write a patch SQL file:
   ```
   Candidates/db/seed/polling_locations_{county_slug}_addr_patch.sql
   ```

   ```sql
   -- Address corrections verified by user on {date}.
   UPDATE polling_locations
     SET address = '{verified address}'
     WHERE county = '{County}' AND location_name = '{Location Name}';
   ```

   Use `location_name` as the WHERE key (not `id`) so the patch is idempotent across
   both databases and re-runnable if needed.

2. Apply to both databases:
   ```bash
   npx wrangler d1 execute wy --remote \
     --file=db/seed/polling_locations_{county_slug}_addr_patch.sql

   npx wrangler d1 execute wy \
     --file=db/seed/polling_locations_{county_slug}_addr_patch.sql
   ```

3. Update the CSV and INSERT SQL to match the corrected addresses, so the repo reflects
   D1 exactly. Never re-run the original INSERT SQL after corrections — it would insert
   duplicate rows.

4. Verify the correction is live:
   ```bash
   npx wrangler d1 execute wy --remote --command="
     SELECT DISTINCT location_name, address
     FROM polling_locations
     WHERE county = '{County}' AND location_name = '{Location Name}'"
   ```

---

## Step 6 — Commit

Stage all new/modified seed files:

```bash
git add Candidates/db/seed/polling_locations_{county_slug}*.sql \
        Candidates/db/seed/polling_locations_{county_slug}.csv
git commit -m "Add {County} County polling locations for 2026 primary

{N} precincts, {M} distinct polling locations.
Source: {describe source}.
Any unverified addresses noted in SQL comments.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

Do NOT stage `Candidates/dist/` or any build output.

---

## Step 7 — Deploy

The Worker code itself does not change when adding polling location data, but deploy
anyway to pick up any in-flight code changes on the branch:

```bash
./scripts/deploy_candidates.sh
```

Run from the repo root. The script validates the Worker name and guards against
`--env production` drift.

---

## Step 8 — Final smoke test

```bash
curl -s -X POST https://candidates.skovgard2026.org/api/ballot-lookup \
  -H 'content-type: application/json' \
  -d '{"houseNumber":"{number}","street":"{street}","city":"{city}","zip":"{zip}"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    [print(r['location_name'], '—', r['address']) \
     for r in (d.get('d1PollingLocations') or [])]"
```

If no results come back for a city that has data, the most common causes are:
- `districts.county` from the geocoder doesn't match the `county` column spelling
  (check: `districts.county` is returned in the API response — compare to what's in D1)
- `address.city` from the form doesn't match `city` in D1 (check for spelling/spacing)

---

## Counties completed

| County | Precincts | Source | Status |
|--------|-----------|--------|--------|
| Albany | 10 vote centers | County notice PDF | Complete — countywide vote centers |
| Big Horn | 13 | County clerk polling PDF | Complete — all addresses verified |
| Converse | 19 | County polling locations PDF | Complete — all addresses verified |
| Niobrara | 6 | County polling place screenshot | Complete — all addresses from source |
| Park | 31 | TerraCIS GIS screenshot | Complete — all 5 unverified addresses corrected |

## Counties remaining (18)

Campbell, Carbon, Crook, Fremont, Goshen, Hot Springs, Johnson, Laramie,
Lincoln, Natrona, Platte, Sheridan, Sublette, Sweetwater, Teton, Uinta,
Washakie, Weston

---

## Known limitations of city-based lookup

- Voters in unincorporated rural areas often have a city mailing address (e.g., Cody WY
  82414) that spans multiple precincts using different polling places. They will see all
  distinct polling locations for that city (up to 3) and must verify which applies.
- The VTD geometry pipeline (Phase 2, not yet built) will resolve this by matching
  lat/lon coordinates from the Census geocoder to TIGER/Line precinct boundaries.
- Until Phase 2 is complete, always include the county clerk verification link so voters
  can confirm their specific location.
