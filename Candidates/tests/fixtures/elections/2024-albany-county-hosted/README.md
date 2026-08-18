<!-- Candidates/tests/fixtures/elections/2024-albany-county-hosted/README.md -->
# 2024 Albany County, county-hosted result fixture

Real, verified county-hosted 2024 result PDF, fetched to characterize the
**second, distinct source track** for this feature: county-clerk-hosted
result publications, as opposed to the SOS official archive covered by
`../2024-natrona/` etc.

**Update:** this fixture HAS now been ingested, `scripts/extract_election_results_county_pdf.py`
reconciled 58/63 contests (269 rows) and is loaded into local `wy` D1. The
full anomaly catalog from building and testing that adapter (against this
fixture and `../2024-campbell-county-hosted/`) lives in
`Candidates/docs/election_results_2026_path_forward.md`, that supersedes
the reconnaissance-only findings originally written below, which are kept
for historical context on how the format was first characterized.

<!-- Original reconnaissance notes below, written before the adapter existed -->

It exists to ground the design of a future adapter in a real artifact,
matching the same discipline used for the SOS-track fixtures: characterize
the real format before writing a parser, don't guess at it.

## Provenance

| Field | Value |
|---|---|
| Election | Wyoming Primary Election, August 20, 2024 |
| County | Albany |
| Source | `election_sources.source_key = 'wy\|albany\|wy-2024-primary\|county_local_summary'` |
| Retrieved | 2026-08-18, during 2026 results-feature planning |
| Source URL | https://www.albanycountywy.gov/DocumentCenter/View/6819/OFFICIAL-RESULTS---2024-Primary-Election- |
| SHA-256 | `8dc1a1198f10e2c5fe6f3a910184aa816028b1e321bae45b886f987e0f7f9b6d` |

## Why this format is a genuinely different adapter problem, not a variant of `xlsx_wide_header`

1. **County-wide summary, not precinct-by-precinct.** This is a canvass
   "Summary Results Report", one total per candidate per contest for the
   whole county. There is no precinct-level breakdown anywhere in this
   document. (The SOS-track fixtures are the opposite: precinct rows plus
   a county rollup.) A county-hosted adapter targeting this report type
   cannot produce `precinct_code`-level rows at all, only county rollups.

2. **It includes exactly what the SOS archive omits**: `REP COUNTY
   COMMISSIONER` (a 4-seat multi-candidate contest) and `REP PRECINCT
   COMMITTEEMAN 13-2 V1` (a precinct-scoped party office) both appear in
   this one document. This is direct, concrete evidence that the
   county-hosted track is the correct (and only) way to close the
   county/local contest gap flagged repeatedly in earlier planning.

3. **Labels and numbers extract into separate blocks, not aligned columns.**
   `pypdf` text extraction on this PDF yields every contest's candidate
   *names* first, then a separate `TOTAL` block with the corresponding
   *numbers*, in the same order but visually and structurally decoupled
   (see `raw/albany_2024_full_text.txt`, e.g. page 2: all of `JOHN
   BARRASSO / JOHN HOLTZ / REID RASNER / Write-In Totals / Overvotes /
   Undervotes / Contest Totals` appear as one label block, followed by
   `TOTAL 2,563 524 1,000 153 2 211 4,453` as a separate value block).
   A parser has to pair labels to values *positionally*, in strict order,
   which is a materially different and more fragile extraction problem
   than the SOS sheet's clean columnar CSV shape, one dropped or
   misaligned label silently shifts every subsequent value in that
   contest. Any adapter for this format needs to validate structurally
   (e.g. confirm the value block's element count matches the label
   block's before trusting the pairing) rather than assume alignment
   holds.

4. **`Vote For 1` / seat-count markers appear inline per contest**, useful
   for multi-seat detection (`REP COUNTY COMMISSIONER` doesn't show a
   `Vote For` count in this extract, worth checking against the PDF's
   later pages) but not yet confirmed as a reliable machine-parseable
   signal across contests.

5. **No `Total` reconciliation row exists at a finer grain to check
   against**, unlike the SOS sheets, where precinct rows could be summed
   and checked against an official county `Total` row, this document *is*
   the county total already. A county-hosted adapter loses that
   free built-in reconciliation check the SOS-track adapter relies on;
   an equivalent validation (e.g. `sum(candidate votes) + write-ins +
   overvotes + undervotes == Contest Totals`, which the document itself
   states per contest) would need to be built instead.

## What this fixture is NOT

Not a working adapter, not ingested data, not a claim that this format
generalizes to the other 17 counties with a verified county-hosted 2024
source (`Candidates/docs/wyoming_2026_election_results_sources.md` §4 lists
`static_html`, `vendor_page`, and `pdf_text` as three distinct observed
formats among them, this fixture only characterizes one `pdf_text`
example). Building and validating a real parser against this, and ideally
at least one `static_html` example, is separate follow-up work.
