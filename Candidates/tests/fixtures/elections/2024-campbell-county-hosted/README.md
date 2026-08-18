<!-- Candidates/tests/fixtures/elections/2024-campbell-county-hosted/README.md -->
# 2024 Campbell County, county-hosted result fixture

Second real example of the "Summary Results Report" county-hosted PDF
format (see `../2024-albany-county-hosted/README.md` for the first).
**This fixture HAS been ingested** into local `wy` D1 via
`scripts/extract_election_results_county_pdf.py`, 158/158 contests
reconciled, 621 normalized rows. Full anomaly catalog for this whole
track: `Candidates/docs/election_results_2026_path_forward.md`.

## Provenance

| Field | Value |
|---|---|
| Source | `election_sources.source_key = 'wy\|campbell\|wy-2024-primary\|county_local_summary'` |
| Source URL | https://www.campbellcountywy.gov/DocumentCenter/View/23726/2024-Primary-Election |
| SHA-256 | `bff054cb7a8beb54cdb0bbbdfaa43a404ccc52456afecad30fef969690e72154` |

## Why this fixture mattered specifically

Campbell's report uses a **4-column layout** (TOTAL / Election Day /
Absentee / Early-ABS) vs. Albany's single TOTAL column, proved the
adapter needs to detect column count per-contest, not assume a fixed
shape, and specifically proved the "single-column: use the last number /
multi-column: use the first number" value-extraction rule is necessary,
not redundant, see path-forward doc anomaly #3. Reconciling 158/158
contests with **zero** manual intervention on this county, immediately
after Albany needed several real bug fixes, is what gave confidence the
adapter generalizes across counties using this report format, not
certainty for other formats (`static_html`, `vendor_page`), which remain
untested.
