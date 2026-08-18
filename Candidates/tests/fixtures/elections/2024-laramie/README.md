<!-- Candidates/tests/fixtures/elections/2024-laramie/README.md -->
# 2024 Laramie County Primary, reference fixture set

Largest county in this fixture set by population (Cheyenne) and by
concurrent contests: 40 precincts, **17 contests**, more than double any
other county sampled here (12 overlapping WY House/Senate districts alone).
Same provenance, structure, and caveats as `../2024-natrona/README.md`, see
`../README.md` for the consolidated cross-county findings. **2024 data only;
never to be served or confused with 2026 results.**

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Laramie |
| Retrieved | 2026-08-18, during 2026 results-feature planning |

| File | Source URL | SHA-256 |
|---|---|---|
| `raw/2024_Laramie_County_Primary_PbP.pdf` | https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Laramie_County_Primary_PbP.pdf | `5ecaa2c1b3fdd5fc765c6983bd04e915b10320a0b649e5a73338e8cb2d29ea05` |
| `raw/pbp_xlsx_sheet_verbatim.csv` | Extracted from `2024_Wyoming_Primary_Results.zip` → `2024 Primary County PbP Results - OFFICIAL.xlsx`, sheet `Laramie` | (ZIP not checked in, see `../README.md`) |

## Validation

150 precinct/candidate combinations reconciled against the sheet's own
`Total` row (post page-break-artifact fix, see `../README.md` finding #2).
**0 mismatches.** Laramie's sheet carries the "Precincts Continue on Next
Page" artifact, true precinct count is 40, not 41. Its raw XLSX sheet is
the widest in this fixture set (126+ columns across 17 contest blocks),
making it the best stress test for the header forward-fill logic:
`", Continued"` contest-name suffixes and party-block boundaries appear far
more often here than on any smaller county.

Contests: US Senate, US House, Senate Districts 4/6/8, House Districts
4/7/8/9/10/11/12/41/42/43/44/61.
