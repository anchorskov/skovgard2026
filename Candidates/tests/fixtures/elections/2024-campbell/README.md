<!-- Candidates/tests/fixtures/elections/2024-campbell/README.md -->
# 2024 Campbell County Primary, reference fixture set

Large county in this fixture set (37 precincts, 8 contests). Same
provenance, structure, and caveats as `../2024-natrona/README.md`, see
`../README.md` for the consolidated cross-county findings. **2024 data only;
never to be served or confused with 2026 results.**

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Campbell |
| Retrieved | 2026-08-18, during 2026 results-feature planning |

| File | Source URL | SHA-256 |
|---|---|---|
| `raw/2024_Campbell_County_Primary_PbP.pdf` | https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Campbell_County_Primary_PbP.pdf | `f0dce6efec2a991bcebfcbf1e1088a1205327a4ddcb5bfb83e02d24d8302b2e3` |
| `raw/pbp_xlsx_sheet_verbatim.csv` | Extracted from `2024_Wyoming_Primary_Results.zip` → `2024 Primary County PbP Results - OFFICIAL.xlsx`, sheet `Campbell` | (ZIP not checked in, see `../README.md`) |

## Validation

63 precinct/candidate combinations reconciled against the sheet's own
`Total` row (post page-break-artifact fix, see `../README.md` finding #2).
**0 mismatches.** Campbell's sheet *does* carry the "Precincts Continue on
Next Page" artifact, true precinct count is 37, not 38.

Contests: US Senate, US House, Senate District 24, House Districts
3/31/32/52/53.
