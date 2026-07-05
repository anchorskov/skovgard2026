<!-- docs/email_guide.md -->
# Wyoming Voter Email Pipeline (`voter_emails` / `v_best_email`)

Last updated: 2026-07-03

Purpose: document the raw voter-email storage table in the shared `wy` D1
database, why it's spread across three separate projects, and the exact
process used to build and load the first data set (Wyoming hunter license
lists) into it — so the same process can be repeated for future sources
without re-discovering all of this from scratch.

**Read this before touching `voter_emails`, `v_best_email`, or any future
"match an external list to Wyoming voters" task.**

---

## Why this spans three projects

The `wy` D1 database is shared infrastructure, not owned by any single repo.
Each project touches a different layer:

| Project | Role | Key paths |
|---|---|---|
| `~/projects/voterdata/wyoming` | Local data pipeline. Local `wy.sqlite` mirror of the voter file. Where new `wy`-schema work is authored and tested first. **Not a git repo** — no revert safety net, back up manually before editing. | `bin/wv.sh`, `wy.sqlite`, `originals/` |
| `~/projects/grassrootsmvt` | The actual git-tracked, numbered-migration source of truth for the production `wy` D1 schema. Binds `wy_local` for local dev, `wy` for production. | `worker/db/migrations/`, `scripts/`, `CLAUDE.md` |
| `~/projects/skovgard2026` (this repo) | Consumer/requester — the campaign that needed voter emails. Binds `WY_DB` → `wy` in `worker/wrangler.toml`, read-only for this data. | `docs/db/README.md`, `AGENTS.md` |

**Do not assume `wy`, `wy_local`, and `wy_preview` are interchangeable** —
see `skovgard2026/AGENTS.md`'s D1 guardrails, which apply here too even
though the schema work itself happens in the other two projects.

---

## Schema

Defined once, identically, in three places (see "Keeping local and
production aligned" below for why there are three copies):

- `~/projects/voterdata/wyoming/bin/wv.sh` — `emails-bootstrap` / `emails-views` subcommands (source of truth for local authoring)
- `~/projects/grassrootsmvt/worker/db/migrations/034_add_voter_emails.sql` — the tracked migration, applied to both `wy_local` and production `wy`
- `~/projects/grassrootsmvt/worker/db/migrations/035_add_zip_to_voter_emails.sql` — added the `zip` column after the table already had data; see "Adding zip" below.
- `~/projects/grassrootsmvt/worker/db/migrations/036_add_zip_to_voters.sql` — added `zip` to `voters` (not `voters_raw`; see "voters vs voters_raw" below), applied `wy_local` + production.
- `~/projects/grassrootsmvt/worker/db/migrations/037_add_senate_district_to_voter_emails.sql` — **superseded, do not use as a model.** Added `senate_district` as a stored column. Applied to `wy_local` only, never production.
- `~/projects/grassrootsmvt/worker/db/migrations/038_worm_senate_district_as_view.sql` — corrects 037. Drops the stored column, adds the live-join views described below. Applied to local `wy.sqlite`, `wy_local`, and production `wy` — all three fully aligned as of 2026-07-03.

```sql
CREATE TABLE IF NOT EXISTS voter_emails (
  voter_id         TEXT,                  -- FK to voters.voter_id; NULL until matched
  email_raw        TEXT NOT NULL,
  email_norm       TEXT NOT NULL,
  confidence_code  INTEGER,
  source           TEXT NOT NULL,
  import_batch     TEXT,
  observed_at      DATETIME,
  imported_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  zip              TEXT,                  -- from the source file only; not derived/verified
  UNIQUE(voter_id, email_norm) ON CONFLICT IGNORE,
  UNIQUE(source, email_norm) ON CONFLICT IGNORE
);
```

`v_best_email` is a real SQL `VIEW` (not a materialized table — unlike its
older sibling `v_best_phone`, which started as a view in `grassrootsmvt`
migration `001` and was converted to a table in migration `025` specifically
to support bulk seeding and real-time upserts). Ranks by `confidence_code
DESC`, then `COALESCE(observed_at, imported_at) DESC`, one row per voter:

```sql
CREATE VIEW v_best_email AS
WITH ranked AS (
  SELECT voter_id, email_norm, email_raw, confidence_code, source,
         import_batch, observed_at, imported_at, zip,
    ROW_NUMBER() OVER (
      PARTITION BY voter_id
      ORDER BY confidence_code DESC, COALESCE(observed_at, imported_at) DESC
    ) AS rn
  FROM voter_emails
  WHERE voter_id IS NOT NULL
)
SELECT voter_id, email_norm, email_raw, confidence_code, source, import_batch, observed_at, imported_at, zip
FROM ranked WHERE rn=1;
```

**Design notes, in case they look wrong later:**
- `voter_id` is nullable **on purpose**. Unlike `voter_phones` (only ever
  inserted after a match already exists), `voter_emails` is meant to hold
  raw, pre-match data. Rows with `voter_id IS NULL` are real, valid data —
  just not yet linked to a voter.
- `confidence_code` is `INTEGER`, higher = better, matching the existing
  `voter_phones.confidence_code` convention exactly (not a letter grade —
  alphabetical sort doesn't reliably track quality order).
- Two `UNIQUE ... ON CONFLICT IGNORE` constraints, not one. `(voter_id,
  email_norm)` alone doesn't dedupe unmatched rows — SQLite treats every
  `NULL` as distinct, so the same raw email from the same source could
  otherwise be inserted unlimited times while unmatched. `(source,
  email_norm)` closes that gap.
- **Presence in this table is not consent.** Never treat a row here as an
  opt-in for outreach. `newsletter_subscribers` (in `ballot_sources`) is the
  actual consent record — this table is raw storage only, same rule as the
  original design brief that created it.

---

## The `wv.sh` subcommands

Run from `~/projects/voterdata/wyoming`, operating on the local `wy.sqlite`:

```bash
./bin/wv.sh emails-bootstrap             # create voter_emails table (idempotent)
./bin/wv.sh emails-views                 # (re)create v_best_email view
./bin/wv.sh emails-import /path/to.csv   # load a matched CSV into voter_emails
```

`emails-import` expects a 7-column CSV with header `voter_id,email_raw,
email_norm,confidence_code,source,import_batch,observed_at` (any of
`voter_id`/`confidence_code`/`observed_at` may be blank → imported as
`NULL`). It loads through a staging table rather than `sqlite3 .import`
directly into `voter_emails`, because `.import` fills missing columns with
literal `NULL` instead of applying the table's `imported_at` default —
staging + `INSERT ... SELECT` (omitting `imported_at` from the column list)
lets the `CURRENT_TIMESTAMP` default apply correctly.

There is **no `emails-import`-style bulk vendor-CSV loader** yet (unlike
`phones-import`, which parses a raw vendor CSV directly). The matching step
that produces the 7-column CSV `emails-import` expects is currently a
separate, manual process — see below.

---

## How the first data set was built (Wyoming hunter lists, 2026-07-03)

This is the process to repeat for any future external list.

### 1. Stage the raw files

Raw source files go in `~/projects/voterdata/wyoming/originals/<source-name>/`
— matching the existing `originals/phones/` convention for the L2 phone
vendor CSV. For the hunter data: `originals/hunters/`.

Also export a minimal voter lookup CSV for matching against (small enough
to hand to an external tool):

```bash
cd ~/projects/voterdata/wyoming
sqlite3 -header -csv wy.sqlite "
SELECT voter_id, first_name, last_name,
       COALESCE(NULLIF(ra_zip,''), ma_zip) AS zip
FROM voters_raw;
" > originals/<source-name>/wy_voters_lookup_fn_ln_zip.csv
```

### 2. Match (external agent or local script)

Matching was done by an external ChatGPT session (file upload + Code
Interpreter), then **independently re-verified locally with pandas** —
both runs agreed exactly. Either approach works; independent
cross-verification is worth doing regardless of which one does the
matching, since this data goes straight into a shared production database.

Matching rule: normalize (`UPPER`, trim) `first_name`/`last_name`, reduce
`zip` to 5 digits, require an **exact, unique** match on all three fields.
Ambiguous (2+ voters match) or zero-match rows are excluded from the
primary pass — see tiering below for what to do with them instead of
discarding them.

### 3. Tier the results by confidence

Don't stop at "matched / not matched." The hunter data run found real
signal hiding in the "zero match" bucket:

| Tier | Condition | `confidence_code` | `voter_id` |
|---|---|---|---|
| 1 | Exact `fn+ln+zip`, unique | 5 | matched |
| 2 | Zero zip match, but `fn+ln` unique **statewide** (zip mismatch, not a real non-match — people move, or use a different address for a license than voter registration) | 3 | matched |
| 3 | No match at all, but zip is a valid Wyoming zip (82001–83128) — possible unregistered voter, still a usable outreach contact | 0 | `NULL` |
| — | No match, non-Wyoming zip | excluded | — |
| — | 2+ candidate voters at exact `fn+ln+zip` (ambiguous) | excluded | — |

For the hunter data specifically: Tier 1 = 16,659 rows, Tier 2 = 5,633,
Tier 3 = 16,546, ambiguous = 550 (kept as a review CSV, not imported),
non-WY = 93 (kept as a reference CSV, not imported). Ambiguous and non-WY
rows are **not** in `voter_emails` — they're informational files sitting in
`originals/hunters/` if anyone wants to review them by hand later.

### 4. Import locally, then push to `wy_local`, then production

```bash
cd ~/projects/voterdata/wyoming
./bin/wv.sh emails-import originals/<source>/tier1.csv
./bin/wv.sh emails-import originals/<source>/tier2.csv
./bin/wv.sh emails-import originals/<source>/tier3_unregistered.csv
```

Then push local → `wy_local` → production `wy`:

```bash
cd ~/projects/grassrootsmvt
python3 scripts/d1_seed_voter_emails.py local
python3 scripts/d1_seed_voter_emails.py production
```

`d1_seed_voter_emails.py` reads directly from local `wy.sqlite`'s
`voter_emails` table (not from the tier CSVs directly) and batches `INSERT`
statements via `wrangler d1 execute --file=` — 200 rows per statement (1000
hit D1's `SQLITE_TOOBIG` limit during testing; 200 is the proven-safe size
for this row width). It's safe to re-run: the schema's own
`ON CONFLICT IGNORE` constraints make every insert idempotent, confirmed by
re-running it against `wy_local` after the initial load with zero row-count
change.

### 5. Verify all three layers agree

```bash
# local
sqlite3 ~/projects/voterdata/wyoming/wy.sqlite "SELECT COUNT(*) FROM voter_emails;"

# wy_local
cd ~/projects/grassrootsmvt
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --command "SELECT COUNT(*) FROM voter_emails;"

# production
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT COUNT(*) FROM voter_emails;"
```

All three should match exactly. As of 2026-07-03: **38,838** rows in
`voter_emails` (16,659 + 5,633 + 16,546), **21,816** distinct voters in
`v_best_email`, verified identical across local `wy.sqlite`, `wy_local`, and
production `wy`.

### 6. Adding `zip` after the fact

`zip` wasn't in the original schema — it was dropped when the 7-column
`emails-import` CSVs were built, then added back once it became clear it
was useful for downstream inference (see "Zip-based district inference"
below). Since the table already had data everywhere, this needed an
`ALTER TABLE` + backfill rather than just a fresh `CREATE TABLE`:

```bash
# 1. Local: add column + backfill directly with sqlite3
cd ~/projects/voterdata/wyoming
sqlite3 wy.sqlite "ALTER TABLE voter_emails ADD COLUMN zip TEXT;"
# rebuild an email_norm+source -> zip lookup from the original source files,
# then backfill via a staging table + UPDATE (see wv.sh emails-bootstrap's
# CREATE TABLE for the up-to-date schema, and originals/hunters/ for the
# lookup CSV this specific backfill used).
./bin/wv.sh emails-views   # refresh v_best_email to include zip

# 2. grassrootsmvt: migration 035, then backfill wy_local and production
cd ~/projects/grassrootsmvt
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --file=worker/db/migrations/035_add_zip_to_voter_emails.sql
python3 scripts/d1_backfill_voter_emails_zip.py local /path/to/zip_lookup_source_email_norm.csv

npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --file=worker/db/migrations/035_add_zip_to_voter_emails.sql
python3 scripts/d1_backfill_voter_emails_zip.py production /path/to/zip_lookup_source_email_norm.csv
```

**Gotcha worth knowing before this bites again**: `d1_backfill_voter_emails_zip.py`
loads the lookup into a staging table, then does a correlated-subquery
`UPDATE voter_emails SET zip = (SELECT zip FROM stage WHERE ...)`. Without
an index on the staging table's `(source, email_norm)`, this is a full
table scan per row of `voter_emails` — up to ~1.5 billion comparisons for
this data set. It worked fine against local SQLite (in-process, fast
enough to brute-force) but **silently never completed against remote
production D1** — no error, the script just never printed past "staged
39481/39481," and `wrangler` still exited 0. The staging table was left
behind, undropped, as the tell. Fix: `CREATE INDEX` on the staging table
before the `UPDATE`. The script now does this by default — if writing a
similar batched-`UPDATE`-from-staging-table script in the future, index the
staging table first, and don't trust a "completed" background task
notification alone — verify the actual row count in the target database
directly afterward.

Zip is raw, from-the-source-file data — **not verified against the voter
file or any authoritative source**. Treat it as "what the hunter license
list said," not ground truth.

### Zip-based district inference — built as views, not stored columns

For the 16,546 confidence-0 rows (`voter_id IS NULL`), `zip` enables a
useful trick: every *registered* voter already carries their own
`house`/`senate` district, so grouping voters by zip and district gives
an empirically-derived "which district(s) actually exist in this zip"
answer — no geocoding, no external polygon data, no new data acquisition
at all.

Tested against the real data before building anything: **House
districts don't resolve cleanly** (Wyoming has 62 House districts across
~264 zips, so populous zips routinely span 3-9 different districts —
only ~37% of confidence-0 rows land in a zip with a clean single or
strongly-dominant district — House was deprioritized entirely, not built).
**Senate districts resolve much better** (31 districts, less splintering):
roughly 53% of confidence-0 rows are in a zip with either exactly one
senate district or one that holds ≥80% of that zip's registered voters;
up to ~69% if the 60-79%-dominant tier is included too. About half the
confidence-0 population is in a zip with no reliable district majority at
all — that's a real, honest limit of zip-level inference, not a threshold
to tune away.

**First built this as a stored `senate_district` column on `voter_emails`
— then reversed that decision.** Walking through why matters more than the
final answer, since the same mistake is easy to repeat:

1. For matched rows, a stored `senate_district` is a *copy* of
   `voters.senate` made at backfill time. If Wyoming redistricts, or the
   voter file gets corrected, `voters.senate` updates — the copy silently
   does not, unless someone remembers to rerun the exact backfill. That's
   the textbook case WORM exists to prevent: derived data duplicated
   outside its source of truth, free to drift unnoticed.
2. The one column would have conflated two very different confidence
   levels (ground truth for matched rows, a probabilistic zip-guess for
   unmatched ones) with no way to tell them apart short of also checking
   `voter_id`.
3. Live joins are self-correcting; stored copies aren't. A format mismatch
   between tables shows up immediately as zero matched rows during
   testing of a live join. A stored value can look fine at write time and
   be silently wrong forever after.

**Final design — three views, `voters`/`voters_raw` stay the only source
of truth, nothing about district is ever written to `voter_emails`:**

```sql
-- One row per (zip, senate district) with vote counts — the raw material.
CREATE VIEW v_zip_senate_districts AS
WITH counts AS (
  SELECT zip, senate, COUNT(*) AS n
  FROM voters                                -- grassrootsmvt: `voters`
  -- FROM voters_raw, ra_zip AS zip           -- voterdata/wyoming: `voters_raw`
  WHERE zip IS NOT NULL AND zip != '' AND senate IS NOT NULL AND senate != ''
  GROUP BY zip, senate
)
SELECT zip, senate, n AS voter_count,
       ROUND(100.0 * n / SUM(n) OVER (PARTITION BY zip), 1) AS pct_of_zip,
       COUNT(*) OVER (PARTITION BY zip) AS n_districts_in_zip
FROM counts;

-- Collapses to one row per zip, only for zips that resolve confidently
-- (single district, or one holds >=80%). Ambiguous zips are simply absent
-- — not guessed.
CREATE VIEW v_zip_confident_senate AS
SELECT zip, senate FROM (
  SELECT zip, senate, voter_count,
         ROW_NUMBER() OVER (PARTITION BY zip ORDER BY voter_count DESC) AS rnk
  FROM v_zip_senate_districts
  WHERE n_districts_in_zip = 1 OR pct_of_zip >= 80
) WHERE rnk = 1;

-- Every voter_emails row, senate_district computed live: ground truth via
-- voter_id join when matched, confident zip inference when not.
CREATE VIEW v_voter_emails_senate_district AS
SELECT
  ve.voter_id, ve.email_norm, ve.email_raw, ve.confidence_code, ve.source, ve.zip,
  COALESCE(v.senate, zc.senate) AS senate_district,
  CASE
    WHEN v.senate IS NOT NULL THEN 'matched'
    WHEN zc.senate IS NOT NULL THEN 'zip_inferred'
    ELSE NULL
  END AS senate_district_source
FROM voter_emails ve
LEFT JOIN voters v ON v.voter_id = ve.voter_id     -- voters_raw locally
LEFT JOIN v_zip_confident_senate zc ON zc.zip = ve.zip;
```

`v_best_email` also picks up `senate_district` the same way (a live
`LEFT JOIN` to `voters`/`voters_raw` in its own `ranked` CTE) — it only
ever needs the ground-truth path, since every row in `v_best_email` is
already matched.

**Tests to run after building this anywhere** (all four passed identically
on local `wy.sqlite` and `wy_local` before this was considered done):

```sql
-- 1. Row parity — the LEFT JOINs must not drop or duplicate rows.
SELECT (SELECT COUNT(*) FROM voter_emails) AS base,
       (SELECT COUNT(*) FROM v_voter_emails_senate_district) AS view_rows;
-- expect: equal (38,838 = 38,838 at the time this was written)

-- 2. Ground truth check — every matched row's senate_district must exactly
-- equal that voter's actual current district. Zero mismatches expected.
SELECT COUNT(*) AS mismatches
FROM v_voter_emails_senate_district v
JOIN voters vr ON vr.voter_id = v.voter_id          -- voters_raw locally
WHERE v.voter_id IS NOT NULL
  AND (v.senate_district_source != 'matched' OR v.senate_district IS NOT vr.senate);

-- 3. Exact count check on the confident-zip-inference tier (a known value
-- from prior analysis catches any regression in the confidence logic).
SELECT COUNT(*) FROM v_voter_emails_senate_district
WHERE voter_id IS NULL AND senate_district_source = 'zip_inferred';
-- expect: 8,716

-- 4. No-guessing check on a known-ambiguous zip (82601/Casper: 5 senate
-- districts, top one only 60.5% — below the 80% confidence bar).
SELECT COUNT(*) AS total_in_zip,
       SUM(CASE WHEN senate_district_source IS NULL THEN 1 ELSE 0 END) AS correctly_unassigned
FROM v_voter_emails_senate_district
WHERE voter_id IS NULL AND zip = '82601';
-- expect: total_in_zip = correctly_unassigned (every row in an ambiguous
-- zip should come back NULL, not a guess)
```

### `voters` vs `voters_raw` — they are not the same table in every project

This tripped up the district-inference work badly enough to be worth its
own heading. `voterdata/wyoming`'s local `wy.sqlite` has `voters_raw`
(274,656 rows, has `ra_zip`) as its real, populated voter table.
`grassrootsmvt`'s `wy_local`/production databases *also* have a table
called `voters_raw` — **but it only has 1 row there.** It's a stale
leftover from an early schema experiment (migration `022`), not the real
data. The actual, actively-synced table in `grassrootsmvt` (274,656 rows,
kept current by `scripts/d1_seed_from_sqlite.py`) is called **`voters`**,
and it had no `zip` column at all until migration `036` added one.

**Always check row counts before building anything against a table named
`voters`/`voters_raw` in any of these three projects — the same name does
not imply the same table.** `SELECT COUNT(*) FROM <table>` first, every
time, in whichever database you're about to touch.

### Gotchas hit while building this (worth reading before repeating them)

- **`ALTER TABLE ... DROP COLUMN` / `RENAME TO` can fail on an unrelated
  broken view.** Local `wy.sqlite` has an old, already-broken view
  (`v_addr_compare_name_zip`, referencing a column that no longer exists
  in some other table, part of unrelated historical address-matching
  work) sitting in it. SQLite's `DROP COLUMN`/`RENAME TO` implementation
  appears to validate every view in the schema before proceeding, and
  aborts hard on the first broken one it finds — completely unrelated to
  the table actually being altered. Plain `CREATE TABLE`/`DROP TABLE`/
  `INSERT` do **not** trigger this check. Workaround used here: build a
  new table under a throwaway name, copy data across with an explicit
  column list, verify row counts match, `DROP TABLE` the old one, `CREATE
  TABLE` again under the real name, copy the data back in, drop the
  throwaway. Three tables' worth of churn, but every step is a plain
  CREATE/DROP/INSERT, none of which touch the broken view.
- **`kill -9` on a `wrangler`/`npx` wrapper process does not kill the
  actual `workerd` process underneath it.** A confident-zip backfill
  query was accidentally left recomputing an expensive aggregation
  repeatedly (see below) and appeared stuck. Killing the PIDs shown by a
  narrow `ps aux | grep wrangler` search only killed the shell/npm
  wrapper layer — the real `workerd` process (visible separately, **100%
  CPU for 24 minutes** in this case) kept running underneath, still
  holding the local D1 SQLite file locked (`SQLITE_BUSY` on every
  subsequent query). Search more broadly (`ps aux | grep -iE
  "wrangler|miniflare|workerd"`) and kill everything related, not just
  the PIDs matching your original command string.
- **A query that re-references a view multiple times in one statement can
  be very slow**, because SQLite may recompute the view's full underlying
  aggregation each time rather than computing it once. This is what
  caused the stuck query above: a `WITH confident AS (... FROM
  v_zip_senate_districts ... AND (zip, voter_count) IN (SELECT zip,
  MAX(voter_count) FROM v_zip_senate_districts GROUP BY zip))` referenced
  the view twice, each reference re-aggregating all 274,656 voters. The
  `v_zip_confident_senate` view above exists specifically to compute this
  once, as its own named, single-reference view, rather than inline
  inside a larger query.

---

## Keeping local and production aligned

`voterdata/wyoming`'s local `wy.sqlite` is the intentional "working copy" —
schema and data changes are authored and tested there first. Production
will inevitably drift ahead over time (future real-time upserts, matching
work landing directly in production the way `voter_phones` sync already
does for phones) while local stays a point-in-time snapshot. That's an
accepted tradeoff, not a bug — resync local from production occasionally
rather than trying to keep them continuously identical.

## What's explicitly not built yet

- No bulk vendor-CSV → matched-CSV loader (`emails-import` loads an
  already-matched CSV; the matching step itself is still manual/external).
- No re-matching pass for the 550 ambiguous or 16,639 excluded
  (non-Wyoming or fully-unmatched) rows.
- House district inference was deprioritized entirely (only ~37% yield vs
  senate's ~53-69%) — no `v_zip_house_districts` exists or is planned.
- `v_best_email` / `v_voter_emails_senate_district` have no application
  code reading from them yet — this is storage, matching, and inference
  only, not wired into any outreach flow.
- If real-time single-row upserts into `voter_emails` are ever needed (the
  email equivalent of `syncSubmittedPhoneToWyVoter` in `skovgard2026`'s
  Worker), `v_best_email` will very likely need to become a materialized
  table at that point, the same way `v_best_phone` did — a view can't be
  targeted by `INSERT ... ON CONFLICT DO UPDATE`. `v_zip_senate_districts`/
  `v_voter_emails_senate_district` would need the same reconsideration if
  that ever happens — this doc's own WORM reasoning would need revisiting,
  not just reflexively re-adding a stored column.

## Related files

- `skovgard2026/docs/db/README.md` — the broader `wy`/`ballot_sources` D1 map this guide is a sub-page of.
- `skovgard2026/AGENTS.md` — D1 safety guardrails that apply across all `wy`-touching work, not just this repo.
- `grassrootsmvt/CLAUDE.md` — D1 migration workflow and naming convention used for `034`-`038`.
- `grassrootsmvt/scripts/d1_seed_from_sqlite.py` — the original seeding script `d1_seed_voter_emails.py`'s pattern was copied from (seeds `voters`/`v_best_phone`/`voters_addr_norm` instead).
- `grassrootsmvt/scripts/d1_seed_voter_emails.py` — batched `INSERT` seeding for `voter_emails`, local → `wy_local` → production.
- `grassrootsmvt/scripts/d1_backfill_voter_emails_zip.py` — batched staging-table `UPDATE` backfill, used for adding `zip`; see the indexing gotcha above before reusing this pattern.
- `grassrootsmvt/scripts/d1_backfill_voters_zip.py` — same pattern, backfills `voters.zip` (274,656 rows) from the local pipeline's `voters_raw.ra_zip`.
- `voterdata/wyoming/docs/Voter_Schema.md` — schema reference for `voters_raw`, the table this whole pipeline matches against (in `voterdata/wyoming` specifically — see the `voters` vs `voters_raw` warning above before assuming this applies elsewhere).
