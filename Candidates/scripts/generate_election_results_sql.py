# Candidates/scripts/generate_election_results_sql.py
#
# Stage 2 of the election-results capture pipeline: reads one or more
# normalized CSVs produced by any Stage-1 parser. The XLSX, statewide PDF,
# and county summary PDF adapters all emit the same column contract. A future
# source adapter only needs to emit that contract. See NORMALIZED_FIELDNAMES
# in the Stage-1 parsers. This script generates one idempotent
# .sql file against the 0028_election_results.sql schema.
#
# Idempotency: every table this script writes to has a real UNIQUE
# constraint on its natural key (source_key, contest_key, result_row_key,
# or the (source_id, sha256) / (snapshot_id, contest_id) composites).
# see 0028_election_results.sql. Every INSERT here is `INSERT OR IGNORE`,
# so re-running this script's output against a database that already has
# some or all of the rows is always safe: unchanged rows are skipped,
# nothing is duplicated, nothing is overwritten. Foreign keys are resolved
# via scalar subqueries evaluated at APPLY time, not baked in at generation
# time, so the generated SQL is correct regardless of what's already in
# the target database (local or production) when it's actually run.
#
# This script never touches D1 itself. It only writes a .sql file. Review
# the output before applying it with:
#   npx --no-install wrangler d1 execute wy --file=<output.sql>          # local
#   npx --no-install wrangler d1 execute wy --remote --file=<output.sql> # production
#
# Usage for the default SOS county-subtotal role:
#   python3 generate_election_results_sql.py \
#     --csv /tmp/natrona_2024_normalized.csv --csv /tmp/bighorn_2024_normalized.csv \
#     --out /tmp/election_results_upsert.sql
#
# County-hosted summaries must add:
#   --source-role county_local_summary

import argparse
import csv
import sys

# Known election_events rows this script can ensure exist. Add an entry
# here before generating SQL for a new election_key, deliberately not
# inferred from the CSV, since polls_close_at is a safety-critical value
# (the embargo timestamp) that should never be guessed from data.
ELECTION_EVENTS = {
    "wy-2024-primary": {
        "election_name": "Wyoming Primary Election",
        "election_phase": "primary",
        "election_date": "2024-08-20",
        "polls_close_at": "2024-08-20T19:00:00-06:00",
    },
    "wy-2026-primary": {
        "election_name": "Wyoming Primary Election",
        "election_phase": "primary",
        "election_date": "2026-08-18",
        "polls_close_at": "2026-08-18T19:00:00-06:00",
    },
}


def sql_str(v):
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_int(v):
    if v is None or v == "":
        return "NULL"
    return str(int(v))


def sql_num(v):
    if v is None or v == "":
        return "NULL"
    return str(v)


def load_rows(csv_paths):
    rows = []
    for path in csv_paths:
        with open(path, newline="", encoding="utf-8") as f:
            rows.extend(list(csv.DictReader(f)))
    return rows


def dedup(rows, keys):
    seen = set()
    out = []
    for r in rows:
        k = tuple(r[key] for key in keys)
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def emit_election_events(rows, out):
    election_keys = sorted(set(r["election_key"] for r in rows))
    for ek in election_keys:
        if ek not in ELECTION_EVENTS:
            raise ValueError(
                f"Unknown election_key '{ek}', add it to ELECTION_EVENTS in this "
                f"script before generating SQL (polls_close_at must never be guessed)."
            )
        meta = ELECTION_EVENTS[ek]
        out.append(
            "INSERT OR IGNORE INTO election_events "
            "(election_key, election_name, election_phase, election_date, polls_close_at) VALUES "
            f"({sql_str(ek)}, {sql_str(meta['election_name'])}, {sql_str(meta['election_phase'])}, "
            f"{sql_str(meta['election_date'])}, {sql_str(meta['polls_close_at'])});"
        )


def emit_sources(rows, out, source_role):
    for r in dedup(rows, ["source_key"]):
        out.append(
            "INSERT OR IGNORE INTO election_sources "
            "(source_key, election_id, county, source_role, endpoint_url, status) VALUES "
            f"({sql_str(r['source_key'])}, "
            f"(SELECT id FROM election_events WHERE election_key = {sql_str(r['election_key'])}), "
            f"{sql_str(r['county'])}, {sql_str(source_role)}, {sql_str(r['source_url'])}, 'active');"
        )


def emit_snapshots(rows, out):
    for r in dedup(rows, ["source_key", "sha256"]):
        out.append(
            "INSERT OR IGNORE INTO election_source_snapshots "
            "(source_id, snapshot_seq, sha256, retrieved_at, source_published_at, "
            "parser_name, parser_version, is_unofficial, verification_status) "
            "SELECT "
            f"(SELECT id FROM election_sources WHERE source_key = {sql_str(r['source_key'])}), "
            f"(SELECT COALESCE(MAX(snapshot_seq), 0) + 1 FROM election_source_snapshots "
            f" WHERE source_id = (SELECT id FROM election_sources WHERE source_key = {sql_str(r['source_key'])})), "
            f"{sql_str(r['sha256'])}, {sql_str(r['retrieved_at'])}, {sql_str(r['source_published_at'])}, "
            f"{sql_str(r['parser_name'])}, {sql_str(r['parser_version'])}, "
            f"{sql_int(r['is_unofficial'])}, {sql_str(r['verification_status'])};"
        )


def emit_contests(rows, out):
    for r in dedup(rows, ["contest_key"]):
        out.append(
            "INSERT OR IGNORE INTO election_contests "
            "(contest_key, election_id, contest_name_raw, contest_name_normalized, level, "
            "district, ballot_party, ballot_party_raw, reporting_scope, county) "
            "SELECT "
            f"{sql_str(r['contest_key'])}, "
            f"(SELECT id FROM election_events WHERE election_key = {sql_str(r['election_key'])}), "
            f"{sql_str(r['contest_name_raw'])}, {sql_str(r['contest_name_normalized'])}, {sql_str(r['level'])}, "
            f"{sql_int(r['district'])}, {sql_str(r['ballot_party'])}, {sql_str(r['ballot_party_raw'])}, "
            f"{sql_str(r['reporting_scope'])}, "
            f"{sql_str(r['county']) if r['level'] in ('county', 'city') else 'NULL'};"
        )


def emit_snapshot_contests(rows, out):
    # source_contest_name_raw etc. (added in 0031) preserve THIS source's own
    # wording for the contest, distinct from election_contests.contest_name_raw
    # which only ever holds the first source to create that contest_key. A
    # second source reporting the same canonical contest under different
    # wording has somewhere to record its own raw text here.
    for r in dedup(rows, ["source_key", "sha256", "contest_key"]):
        out.append(
            "INSERT OR IGNORE INTO election_snapshot_contests "
            "(snapshot_id, contest_id, precincts_reporting, precincts_total, reporting_status, "
            "source_contest_name_raw, source_contest_name_normalized, source_district_raw, source_ballot_party_raw) "
            "SELECT "
            "(SELECT s.id FROM election_source_snapshots s "
            f" JOIN election_sources src ON src.id = s.source_id "
            f" WHERE src.source_key = {sql_str(r['source_key'])} AND s.sha256 = {sql_str(r['sha256'])}), "
            f"(SELECT id FROM election_contests WHERE contest_key = {sql_str(r['contest_key'])}), "
            f"{sql_int(r['precincts_reporting'])}, {sql_int(r['precincts_total'])}, {sql_str(r['reporting_status'])}, "
            f"{sql_str(r['contest_name_raw'])}, {sql_str(r['contest_name_normalized'])}, "
            f"{sql_str(r['district'])}, {sql_str(r['ballot_party_raw'])};"
        )


def emit_result_rows(rows, out):
    for r in rows:
        out.append(
            "INSERT OR IGNORE INTO election_results_rows "
            "(result_row_key, snapshot_contest_id, row_type, reporting_county, precinct_code, "
            "precinct_name_raw, candidate_name_raw, candidate_name_normalized, external_candidate_id, "
            "votes, percentage_reported) "
            "SELECT "
            f"{sql_str(r['result_row_key'])}, "
            "(SELECT sc.id FROM election_snapshot_contests sc "
            " JOIN election_source_snapshots s ON s.id = sc.snapshot_id "
            " JOIN election_sources src ON src.id = s.source_id "
            " JOIN election_contests c ON c.id = sc.contest_id "
            f" WHERE src.source_key = {sql_str(r['source_key'])} AND s.sha256 = {sql_str(r['sha256'])} "
            f" AND c.contest_key = {sql_str(r['contest_key'])}), "
            f"{sql_str(r['row_type'])}, {sql_str(r['reporting_county'])}, {sql_str(r['precinct_code'])}, "
            f"{sql_str(r['precinct_name_raw'])}, {sql_str(r['candidate_name_raw'])}, "
            f"{sql_str(r['candidate_name_normalized'])}, {sql_str(r['external_candidate_id'])}, "
            f"{sql_int(r['votes'])}, {sql_num(r['percentage_reported'])};"
        )


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--csv", action="append", required=True, dest="csvs")
    p.add_argument("--out", required=True)
    p.add_argument(
        "--source-role",
        default="county_pbp_summary",
        choices=("county_pbp_summary", "county_local_summary"),
        help="Source precedence role for every input CSV in this seed.",
    )
    args = p.parse_args()

    rows = load_rows(args.csvs)
    if not rows:
        print("No rows found in input CSV(s).", file=sys.stderr)
        sys.exit(1)

    out = [
        "-- Generated by Candidates/scripts/generate_election_results_sql.py",
        "-- Idempotent: every statement is INSERT OR IGNORE against a real UNIQUE",
        "-- constraint from 0028_election_results.sql. Safe to re-run.",
        f"-- Source CSV(s): {', '.join(args.csvs)}",
        "",
    ]
    emit_election_events(rows, out)
    out.append("")
    emit_sources(rows, out, args.source_role)
    out.append("")
    emit_snapshots(rows, out)
    out.append("")
    emit_contests(rows, out)
    out.append("")
    emit_snapshot_contests(rows, out)
    out.append("")
    emit_result_rows(rows, out)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    n_sources = len(dedup(rows, ["source_key"]))
    n_snapshots = len(dedup(rows, ["source_key", "sha256"]))
    n_contests = len(dedup(rows, ["contest_key"]))
    print(f"OK: wrote {args.out}")
    print(f"    {n_sources} source(s), {n_snapshots} snapshot(s), {n_contests} contest(s), {len(rows)} result row(s)")


if __name__ == "__main__":
    main()
