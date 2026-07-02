# Field-naming standards for new tables built from "wild" data

**Audience:** an agent (or person) about to design a new D1 table from data
that did not originate in this schema — a spreadsheet, a scraped list, a
CSV from a county clerk, output from a research pass, etc. Read this before
writing the `CREATE TABLE` statement, not after.

This is a prompt to run yourself through, not a style-guide to skim. Work
through it in order for every new table.

---

## 1. Reuse this schema's vocabulary before inventing your own

Before naming a column, check whether `offices` or `candidates`
(`Candidates/candidate_data.md`) already has a column for that concept, and
copy its name and type exactly. Wild data rarely uses the same words the
schema does — a spreadsheet might call something `County Name`,
`COUNTY`, or `jurisdiction`; if this schema already has `county`, your new
table's column is `county`, not any of the source's variants. Consistent
naming across tables is what makes future joins and matching scripts
possible without a translation layer.

Established vocabulary in this schema (use these, don't reinvent):

| Concept | Column name | Type |
|---|---|---|
| Wyoming county, bare name (no "County" suffix) | `county` | TEXT |
| Town/city name | `municipality` | TEXT |
| Ward number/label | `ward` | TEXT |
| Precinct code (numeric, county-internal) | `precinct_code` | TEXT |
| Party, abbreviated | `ballot_party` | TEXT (`REP`\|`DEM`\|`LIB`\|`NP`) |
| Number of seats an office elects | `seats_available` | INTEGER |
| A stable identifier from an external source | `external_*_id` | TEXT, unique partial index `WHERE external_*_id IS NOT NULL` |
| URL-safe unique lookup key | `slug` | TEXT UNIQUE |

## 2. Naming mechanics

- `snake_case`, always. No camelCase, no spaces, no mixed case.
- Table names: singular concept, plural noun (`offices`, `candidates`, not
  `office`, `candidate_list`).
- Timestamps: suffix `_at`, store ISO-8601 text (`filed_at`, `applied_at`,
  `imported_at`). Never store a bare date as `_date` if the schema elsewhere
  uses `_at` for the same kind of fact.
- URLs: suffix `_url` (`source_url`, `website_url`).
- Foreign keys: suffix `_id`, type INTEGER, `REFERENCES table(id)`.
- JSON blobs stored as TEXT: suffix `_json` (`endorsements_json`).
- Booleans: store as `INTEGER DEFAULT 0`, name so that `1` reads naturally
  as true (`human_review_needed`, not `is_reviewed` with inverted meaning).
- Don't abbreviate unless the source document's abbreviation is itself the
  canonical form (e.g. `REP`/`DEM` for party — those are the values, not
  abbreviations of a "real" name).

## 3. Controlled vocabulary needs a legend, not tribal knowledge

If a column's values come from a fixed, small set (`jurisdiction_type`,
`source_status`, `match_status`, `level`, `scope_kind`), do one of:

- a `CHECK` constraint listing the values, if the set is genuinely closed, or
- a comment in the migration file listing the values, if the set may grow
  as new source documents introduce new categories (this is the more common
  case for wild data — don't over-constrain a vocabulary you've only seen
  353 examples of).

Either way, write the legend down *in the migration file itself*, next to
the column. Don't leave it only in a spreadsheet tab or a chat message —
the migration is what the next agent reads.

## 4. Every staging table needs a source trio + a re-run key

If the table's purpose is to stage externally-sourced facts before they get
applied to a live table (this is the common case — see
`multi_seat_race_sources` as the reference example), it needs:

- **A natural, deterministic key** built from the source's own stable
  fields, e.g. `ballot_group_key` = county + phase + jurisdiction_type +
  city + precinct + party + office + scope + term, lowercased and
  underscored. This is what makes the import idempotent: re-running the
  import script against a refreshed source file should `UPSERT` by this
  key, not insert duplicates. Do not use an externally-provided ID as this
  key unless you're certain the source is stable release-over-release —
  spreadsheets get regenerated with different row orders and no natural ID.
- **`source_type`, `source_url`, `source_status`, `notes`** — every row
  needs to say where it came from and how confident that source is. Don't
  skip `source_status` even if everything in the first import is
  "verified" — the whole point is to carry forward the distinction when a
  later row isn't.
- **A matching/apply boundary**, if the staged data will eventually update
  a live table: keep a `*_id_guess` (nullable, may be wrong, never read by
  the live application) separate from the confirmed `*_id` (only set once
  a human or a high-confidence script has actually applied the change).
  Never let a fuzzy match write directly to the live column — write the
  guess to the staging table, review it, then apply.

## 5. Matching scripts: prefer silence over a wrong guess

When writing the script that reconciles staged rows against a live table:

- Score only within a hard-filtered candidate pool (exact county match,
  compatible office level, etc.) — never fuzzy-match across the whole
  table.
- If two or more candidates score within a small margin of each other,
  that's `ambiguous`, not a coin flip. Record the top few candidates and
  their scores in a `match_notes` column so a human can resolve it in one
  glance, without re-running your script.
- Whole-string similarity (e.g. Python's `difflib.SequenceMatcher`) breaks
  down when many candidates share a long common substring and differ only
  in one short token (a precinct name, a ward number). If that's the shape
  of your data, score the distinguishing token directly (word-boundary-aware
  containment, not substring-in-string — `"1 1" in "11 12"` is a false
  positive) rather than the whole title.
- Normalize numeric codes before comparing — leading zeros (`01-01` vs
  `1-1`) are a real, recurring source of false negatives across Wyoming
  county documents; strip them on both sides before matching.
- A "no candidates passed the filter" result is informative, not a failure
  — it usually means the live table genuinely has no row for that source
  fact yet (e.g. a new office type nobody has seeded candidates for). Say
  so explicitly rather than lumping it in with "ambiguous."

## 6. Before applying anything to a live table

Run the generated SQL through a local, in-memory SQLite check first
(`python3 -c "import sqlite3; ..."` against the migration + seed files) to
catch syntax errors and constraint violations before they hit
`wrangler d1 execute --remote`. This repo has no staging D1 environment for
`Candidates/` — remote *is* production.
