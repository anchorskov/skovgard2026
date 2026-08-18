<!-- Candidates/tests/fixtures/elections/2024-fremont/README.md -->
# 2024 Fremont County Primary, reference fixture set

Medium-sized county in this fixture set (32 precincts, 9 contests). Same
provenance, structure, and caveats as `../2024-natrona/README.md`, see
`../README.md` for the consolidated cross-county findings. **2024 data only;
never to be served or confused with 2026 results.**

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Fremont |
| Retrieved | 2026-08-18, during 2026 results-feature planning |

| File | Source URL | SHA-256 |
|---|---|---|
| `raw/2024_Fremont_County_Primary_PbP.pdf` | https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Fremont_County_Primary_PbP.pdf | `9813bfb1b000edcad72280fe69812cbfdd5adc80cc951d71eaeb2b5829370560` |
| `raw/pbp_xlsx_sheet_verbatim.csv` | Extracted from `2024_Wyoming_Primary_Results.zip` → `2024 Primary County PbP Results - OFFICIAL.xlsx`, sheet `Fremont` | (ZIP not checked in, see `../README.md`) |

## Validation

75 precinct/candidate combinations reconciled against the sheet's own
`Total` row. **0 mismatches.** No page-break artifact on this sheet (see
Big Horn's README, same observation).

Contests: US Senate, US House, Senate Districts 20/26, House Districts
28/33/34/54/55.
