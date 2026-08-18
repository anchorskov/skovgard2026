<!-- Candidates/tests/fixtures/elections/2024-bighorn/README.md -->
# 2024 Big Horn County Primary, reference fixture set

Smallest county in this fixture set (13 precincts, 6 contests). Same
provenance, structure, and caveats as `../2024-natrona/README.md`, see
`../README.md` for the consolidated cross-county findings. **2024 data only;
never to be served or confused with 2026 results.**

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Big Horn |
| Retrieved | 2026-08-18, during 2026 results-feature planning |

| File | Source URL | SHA-256 |
|---|---|---|
| `raw/2024_Big_Horn_County_Primary_PbP.pdf` | https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Big_Horn_County_Primary_PbP.pdf | `29bd4cdb649d4167284e896612c389c2760ec53b71d9b7f5d7e33c2044d6383f` |
| `raw/pbp_xlsx_sheet_verbatim.csv` | Extracted from `2024_Wyoming_Primary_Results.zip` → `2024 Primary County PbP Results - OFFICIAL.xlsx`, sheet `Big Horn` | (ZIP not checked in, see `../README.md`) |

## Validation

47 precinct/candidate combinations reconciled against the sheet's own
`Total` row (post page-break-artifact fix, see `../README.md` finding #2).
**0 mismatches.** No "Precincts Continue on Next Page" artifact on this
sheet, Big Horn and Fremont were the two counties in this set *without*
it, consistent with the theory that it only appears once a sheet is tall
enough to need an internal print break.

Contests: US Senate, US House, Senate District 20, House Districts 26–28.
