# Candidates/scripts/extract_election_results_xlsx.py
#
# Stage 1 of the election-results capture pipeline: turns one county's
# SOS-format "wide header" precinct-by-precinct sheet into a single
# normalized CSV following the fixed contract that
# generate_election_results_sql.py (Stage 2) consumes. Any future parser
# for a different source format (HTML table, vendor CSV, county-clerk PDF)
# should target the SAME output contract, that's what makes Stage 2, and
# everything downstream of it, reusable across source formats without
# changes. This script only knows how to read ONE format: the SOS
# xlsx_wide_header shape validated against 2024 Natrona/Big Horn/Fremont/
# Laramie/Campbell data (see tests/fixtures/elections/README.md).
#
# Two input modes, same downstream logic:
#   --xlsx FILE --sheet NAME  , read directly from a live SOS workbook
#   --grid-csv FILE           , read from a verbatim sheet-grid CSV dump
#                                  (what tests/fixtures/elections/*/raw/
#                                  *_sheet_verbatim.csv already are)
#
# Hard-fails (nonzero exit) rather than emitting unverified data if the
# sheet's own official "Total" row does not exactly reconcile against the
# summed precinct rows, this is the same reconciliation check that caught
# two real bugs while building the 2024 fixtures (an inflated precinct
# count from a page-break artifact, and an unfiltered Total row in a
# companion sheet). A parser failure must never write partial or
# unverified rows silently.
#
# Usage (against a checked-in fixture, proving the pipeline end-to-end):
#   python3 extract_election_results_xlsx.py \
#     --grid-csv ../tests/fixtures/elections/2024-natrona/raw/natrona_pbp_xlsx_sheet_verbatim.csv \
#     --county Natrona --election-key wy-2024-primary \
#     --source-key "wy|natrona|wy-2024-primary|county_pbp_summary" \
#     --source-url "https://sos.wyo.gov/Elections/Docs/2024/Results/Primary/2024_Natrona_County_Primary_PbP.pdf" \
#     --certified \
#     --out /tmp/natrona_2024_normalized.csv
#
# Usage (against a live 2026 SOS workbook, once one exists):
#   python3 extract_election_results_xlsx.py \
#     --xlsx "2026 Primary County PbP Results - OFFICIAL.xlsx" --sheet Natrona \
#     --county Natrona --election-key wy-2026-primary \
#     --source-key "wy|natrona|wy-2026-primary|county_pbp_summary" \
#     --source-url "https://sos.wyo.gov/Elections/Docs/2026/Results/Primary/2026_Natrona_County_Primary_PbP.pdf" \
#     --out /tmp/natrona_2026_normalized.csv

import argparse
import csv
import hashlib
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

NORMALIZED_FIELDNAMES = [
    "election_key", "source_key", "county",
    "contest_key", "contest_name_raw", "contest_name_normalized",
    "level", "district", "ballot_party", "ballot_party_raw", "reporting_scope",
    "sha256", "retrieved_at", "source_published_at",
    "parser_name", "parser_version", "is_unofficial", "verification_status",
    "source_url",
    "precincts_reporting", "precincts_total", "reporting_status",
    "row_type", "reporting_county", "precinct_code", "precinct_name_raw",
    "candidate_name_raw", "candidate_name_normalized", "external_candidate_id",
    "votes", "percentage_reported",
    "result_row_key",
]

PARSER_NAME = "xlsx_wide_header_v1"
PARSER_VERSION = "1.0.0"


def slugify(value):
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[\s_]+", "-", value).strip("-")


def is_junk_label(v):
    # Page-break footer text ("Precincts Continue\non Next Page") leaks into
    # column A on sheets long enough to need an internal print break.
    # confirmed on Natrona, Laramie, and Campbell in the 2024 fixture set.
    # Never trust column A by position; filter by what it explicitly isn't.
    return isinstance(v, str) and ("continue" in v.lower() or "page" in v.lower())


def office_level_and_district_and_scope(contest_name):
    contest_name = re.sub(r",\s*Continued$", "", contest_name).strip()
    m = re.match(r"^(Senate|House) District (\d+)$", contest_name)
    if m:
        level = "wy_senate" if m.group(1) == "Senate" else "wy_house"
        return contest_name, level, int(m.group(2)), "legislative_district"
    if contest_name in ("United States Senator", "United States Representative"):
        return contest_name, "federal", None, "statewide"
    return contest_name, "unknown", None, "county"


def load_grid_from_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return [row for row in csv.reader(f)]


def load_grid_from_xlsx(path, sheet):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    return [list(row) for row in ws.iter_rows(values_only=True)]


def normalize_cell(v):
    return "" if v in (None,) else v


def parse_columns(grid):
    contest_row, party_row, cand_row = grid[2], grid[3], grid[4]
    columns = []
    last_contest, last_party = None, None
    for i in range(len(cand_row)):
        c = normalize_cell(contest_row[i]) if i < len(contest_row) else ""
        p = normalize_cell(party_row[i]) if i < len(party_row) else ""
        cand = normalize_cell(cand_row[i])
        if c:
            last_contest = c
        if p:
            last_party = p
        if i == 0 or not cand:
            continue
        contest_name, level, district, reporting_scope = office_level_and_district_and_scope(last_contest)
        columns.append({
            "col": i,
            "contest_name_raw": last_contest,
            "contest_name_normalized": contest_name,
            "level": level,
            "district": district,
            "reporting_scope": reporting_scope,
            "ballot_party_raw": last_party,
            "candidate": str(cand).replace("\n", " ").strip() if isinstance(cand, str) else cand,
            "is_writein": cand == "Write-Ins",
            "is_overvote": cand == "Overvotes",
            "is_undervote": cand == "Undervotes",
        })
    return columns


def row_type_for(col):
    if col["is_writein"]:
        return "write_in_aggregate"
    if col["is_overvote"]:
        return "overvote"
    if col["is_undervote"]:
        return "undervote"
    return "candidate"


def ballot_party_norm(raw):
    if not raw:
        return None
    key = raw.strip().upper()
    return {"REPUBLICAN": "REP", "DEMOCRATIC": "DEM", "LIBERTARIAN": "LIB"}.get(key, key[:3])


def extract(grid):
    columns = parse_columns(grid)

    def is_precinct_row(row):
        label = row[0] if row else None
        return label not in (None, "") and not is_junk_label(label)

    data_rows = [r for r in grid[5:] if is_precinct_row(r)]
    total_row = next((r for r in data_rows if r[0] == "Total"), None)
    precinct_rows = [r for r in data_rows if r[0] != "Total"]
    precincts_total = len(precinct_rows)

    if total_row is None:
        raise ValueError("No official 'Total' row found, refusing to emit unverified data.")

    def rows_from(source_rows, is_rollup):
        out = []
        for prow in source_rows:
            precinct = None if is_rollup else prow[0]
            for col in columns:
                val = prow[col["col"]] if col["col"] < len(prow) else None
                if val in ("-", None, ""):
                    continue  # structurally not applicable, omit, never zero-fill
                out.append({"col": col, "precinct": precinct, "votes": int(val)})
        return out

    precinct_out = rows_from(precinct_rows, is_rollup=False)
    rollup_out = rows_from([total_row], is_rollup=True)

    # Reconciliation: sum(precinct rows) must exactly equal the sheet's own Total row.
    sums = defaultdict(int)
    for r in precinct_out:
        key = (r["col"]["contest_name_normalized"], r["col"]["ballot_party_raw"], r["col"]["candidate"], row_type_for(r["col"]))
        sums[key] += r["votes"]
    mismatches = []
    for r in rollup_out:
        key = (r["col"]["contest_name_normalized"], r["col"]["ballot_party_raw"], r["col"]["candidate"], row_type_for(r["col"]))
        if sums.get(key) != r["votes"]:
            mismatches.append((key, sums.get(key), r["votes"]))
    if mismatches:
        raise ValueError(f"Reconciliation FAILED against the sheet's own Total row: {mismatches[:5]}")

    return precinct_out, rollup_out, precincts_total


def build_normalized_rows(args, precinct_out, rollup_out, precincts_total):
    rows = []
    reporting_status = "certified" if args.certified else (
        "county_complete" if precincts_total > 0 else "waiting"
    )
    is_unofficial = 0 if args.certified else 1
    verification_status = "verified"

    def emit(entry, precinct_code):
        col = entry["col"]
        contest_key = "|".join([
            args.election_key, col["level"], slugify(col["contest_name_normalized"]),
            (ballot_party_norm(col["ballot_party_raw"]) or "na").lower(),
        ])
        row_type = row_type_for(col)
        is_candidate = row_type == "candidate"
        candidate_raw = col["candidate"] if is_candidate else None
        candidate_norm = candidate_raw if is_candidate else None

        key_parts = [
            args.source_key, args.sha256, contest_key, row_type,
            candidate_norm or row_type, args.county, precinct_code or "COUNTY",
            col["ballot_party_raw"] or "",
        ]
        result_row_key = "|".join(str(p) for p in key_parts)

        rows.append({
            "election_key": args.election_key,
            "source_key": args.source_key,
            "county": args.county,
            "contest_key": contest_key,
            "contest_name_raw": col["contest_name_raw"],
            "contest_name_normalized": col["contest_name_normalized"],
            "level": col["level"],
            "district": col["district"] if col["district"] is not None else "",
            "ballot_party": ballot_party_norm(col["ballot_party_raw"]) or "",
            "ballot_party_raw": col["ballot_party_raw"] or "",
            "reporting_scope": col["reporting_scope"],
            "sha256": args.sha256,
            "retrieved_at": args.retrieved_at,
            "source_published_at": args.source_published_at or "",
            "parser_name": PARSER_NAME,
            "parser_version": PARSER_VERSION,
            "is_unofficial": is_unofficial,
            "verification_status": verification_status,
            "source_url": args.source_url,
            "precincts_reporting": precincts_total,
            "precincts_total": precincts_total,
            "reporting_status": reporting_status,
            "row_type": row_type,
            "reporting_county": args.county,
            "precinct_code": precinct_code or "",
            "precinct_name_raw": "",
            "candidate_name_raw": candidate_raw or "",
            "candidate_name_normalized": candidate_norm or "",
            "external_candidate_id": "",
            "votes": entry["votes"],
            "percentage_reported": "",
            "result_row_key": result_row_key,
        })

    for entry in precinct_out:
        emit(entry, precinct_code=entry["precinct"])
    for entry in rollup_out:
        emit(entry, precinct_code=None)

    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--xlsx")
    p.add_argument("--sheet")
    p.add_argument("--grid-csv")
    p.add_argument("--county", required=True)
    p.add_argument("--election-key", required=True)
    p.add_argument("--source-key", required=True)
    p.add_argument("--source-url", required=True)
    p.add_argument("--source-published-at", default=None)
    p.add_argument("--retrieved-at", default=None)
    p.add_argument("--certified", action="store_true", help="Mark as certified/official rather than unofficial election-night data")
    p.add_argument("--out", required=True)
    args = p.parse_args()

    if not args.xlsx and not args.grid_csv:
        p.error("one of --xlsx or --grid-csv is required")

    if args.grid_csv:
        source_bytes_path = args.grid_csv
        grid = load_grid_from_csv(args.grid_csv)
    else:
        if not args.sheet:
            p.error("--sheet is required with --xlsx")
        source_bytes_path = args.xlsx
        grid = load_grid_from_xlsx(args.xlsx, args.sheet)

    with open(source_bytes_path, "rb") as f:
        args.sha256 = hashlib.sha256(f.read()).hexdigest()

    args.retrieved_at = args.retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    precinct_out, rollup_out, precincts_total = extract(grid)
    rows = build_normalized_rows(args, precinct_out, rollup_out, precincts_total)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=NORMALIZED_FIELDNAMES)
        w.writeheader()
        w.writerows(rows)

    print(f"OK: {len(rows)} normalized rows written to {args.out}")
    print(f"    county={args.county} precincts_total={precincts_total} sha256={args.sha256[:12]}... reconciled=YES")


if __name__ == "__main__":
    main()
