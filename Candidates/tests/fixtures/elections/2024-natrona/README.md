<!-- Candidates/tests/fixtures/elections/2024-natrona/README.md -->
# 2024 Natrona County Primary, reference fixture set

Real, official 2024 Wyoming Primary results for Natrona County, pulled from
the Secretary of State's official archive. Used to design and test the 2026
election-results feature (schema, normalization logic, parser adapters)
*before* any 2026 data exists to build against. **This is 2024 data. It must
never be served, labeled, or mistaken for 2026 results**, it exists purely
as realistic input for scaffolding.

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Natrona |
| Retrieved | 2026-08-18 (today), during 2026 results-feature planning |
| Landing page | https://sos.wyo.gov/Elections/Docs/2024/2024PrimaryResults.aspx |

| File | Source URL | SHA-256 |
|---|---|---|
| `raw/2024_Natrona_County_Primary_PbP.pdf` | https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Natrona_County_Primary_PbP.pdf | `48477b1e1ce181540cd55d4cd0d19f6c80099507c2bda6486ee9335ff3e501e0` |
| `raw/natrona_pbp_xlsx_sheet_verbatim.csv` | Extracted from `2024_Wyoming_Primary_Results.zip` → `2024 Primary County PbP Results - OFFICIAL.xlsx`, sheet `Natrona` | ZIP: `64f3c223067fb74f3917eac8d61d7b274bf63c56e662e4c9d6c1bce7bd808ccc` |
| `raw/natrona_ballots_cast_xlsx_sheet_verbatim.csv` | Same ZIP → `2024 Primary County PbP Total Ballots Cast - OFFICIAL.xlsx`, sheet `Natrona` | (same ZIP) |

The ZIP itself (`https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Wyoming_Primary_Results.zip`)
is not checked in, it contains all 23 counties (~2.6MB uncompressed across
3 workbooks) and only the Natrona sheets are relevant here. Re-download it
directly if the other 22 counties' sheets are needed later.

## What's in here

### `raw/`, verbatim source data, untouched

- `2024_Natrona_County_Primary_PbP.pdf`, the official county-specific
  precinct-by-precinct PDF report (32 pages). Structurally identical data to
  the XLSX sheet below, but as wrapped, paginated text, candidate names lose
  their internal line break when extracted (`John\nBarrasso` → `JohnBarrasso`
  with `pypdf`), which is a real parsing hazard, not an artifact of this
  extraction. Use this as the fixture for a **text-based PDF adapter**.
- `natrona_pbp_xlsx_sheet_verbatim.csv`, the `Natrona` sheet from the
  official XLSX, dumped row-for-row with no cleanup: 3-row hierarchical
  header (contest name → party → candidate name), `-` for "this
  precinct/candidate is not part of this district" (**not** a zero), and a
  `Total` row as the county's own official rollup. Use this as the fixture
  for an **XLSX/wide-header adapter**.
- `natrona_ballots_cast_xlsx_sheet_verbatim.csv`, a much simpler
  precinct × party ballots-cast sheet from the companion workbook. Use this
  as the fixture for a **simple tabular CSV/XLS adapter**.

### `normalized/`, output of `parse_natrona_reference.py`

- `precinct_results.csv`, every precinct-level row normalized to the
  target model (see below), 1,530 rows.
- `county_rollup.csv`, the same normalization applied to the sheet's
  official `Total` row (113 rows), this is the number that should match a
  `SUM()` of `precinct_results.csv` per contest/candidate. It does, exactly
  (see Validation below).
- `ballots_cast.csv`, normalized ballots-cast-per-precinct.

### Reference parser

`../parse_county_reference.py` (shared across all five counties in this
fixture set) produced `normalized/` from `raw/`'s source XLSX, not the
verbatim CSV dumps here, which come from the original `.xlsx` files
directly (not checked in; re-run against a fresh copy of the ZIP's
workbooks to regenerate). Reference/scaffolding only, not the production
parser, see that file's header comment.

## Validation performed

`parse_natrona_reference.py` cross-checks its own output: for every
contest/candidate, `SUM(precinct_results.csv rows)` is compared against the
matching row in `county_rollup.csv` (the sheet's own official `Total` row).
**Result: 0 mismatches across all 113 candidate/write-in/overvote/undervote
combinations.** This confirms the header-forward-fill + `-`-as-not-applicable
logic is correct against real official data, not just plausible-looking.

### Correction (2026-08-18, same day): `precincts_total` was wrong on first pass

The first version of this fixture set reported **47** precincts for Natrona.
The true count is **46**. A page-break footer string
(`"Precincts Continue\non Next Page"`) had leaked into the precinct column
and was silently counted as a 47th precinct, it carries no votes, so it
didn't break the `Total`-row reconciliation check above, only the precinct
*count*. This was only caught once Laramie and Campbell were pulled as
additional fixtures and showed the identical artifact; see
`../README.md` findings #2 for the full story. `normalized/*.csv` here has
been regenerated with the fix; every `precincts_reporting`/`precincts_total`
value in this folder is now `46`, not `47`.

## Key data-handling findings from real data

See `../README.md` (the shared multi-county README) for the consolidated
list, it supersedes what was originally written here, since several
findings (notably the page-break artifact above) only became clear once
Big Horn, Fremont, Laramie, and Campbell were checked against this county
rather than trusting a single clean-looking example.
