#!/usr/bin/env python3
"""Generate review artifacts for Natrona's official 2026 primary results."""

import argparse
from collections import OrderedDict, defaultdict
import csv
import json
from pathlib import Path
import re
import sqlite3

import pdfplumber

from extract_election_results_county_pdf import NUM, VOTE_FOR_RE, extract
from verify_election_results_precinct_pdf import (
    pdf_text,
    verify_matrix,
    verify_repeated,
)


def name_key(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source))


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def write_seat_updates(path, seats):
    matched = [row for row in seats if row["office_match_status"] == "exact_natural_key"]
    with open(path, "w", encoding="utf-8") as target:
        target.write("-- Natrona 2026 official primary precinct committee seat corrections.\n")
        target.write("-- Evidence: official Election Summary PDF SHA-256 ")
        target.write(matched[0]["source_sha256"] + "\n")
        target.write("-- Natural-key updates only. Missing office rows are intentionally not created here.\n\n")
        for row in matched:
            title = sql_quote(row["office_title"])
            target.write(
                "UPDATE offices "
                f"SET seats_available = {int(row['official_vote_for'])} "
                "WHERE county = 'Natrona' "
                "AND scope_kind = 'precinct_party_gender' "
                f"AND precinct_code = {sql_quote(row['precinct'])} "
                f"AND title = {title};\n"
            )


def ordered_groups(rows, key):
    groups = OrderedDict()
    for row in rows:
        groups.setdefault(row[key], []).append(row)
    return groups


def extract_vote_for(summary_pdf):
    with pdfplumber.open(summary_pdf) as pdf:
        lines = [
            line.strip()
            for page in pdf.pages
            for line in (page.extract_text() or "").splitlines()
            if line.strip()
        ]
    values = defaultdict(list)
    for index, line in enumerate(lines[:-1]):
        match = VOTE_FOR_RE.match(lines[index + 1])
        if match:
            values[line].append(int(NUM.search(lines[index + 1]).group(0)))
    return values


def source_stats(summary_pdf):
    with pdfplumber.open(summary_pdf) as pdf:
        lines = [line.strip() for line in (pdf.pages[0].extract_text() or "").splitlines()]

    def value_for(label):
        matches = [line[len(label):].strip() for line in lines if line.startswith(label)]
        if len(matches) != 1 or not matches[0]:
            raise ValueError(f"Expected one value for {label}, got {matches}")
        return matches[0]

    return {
        "precincts_complete": value_for("Precincts Complete"),
        "registered_voters_total": int(value_for("Registered Voters - Total").replace(",", "")),
        "ballots_cast_total": int(value_for("Ballots Cast - Total").replace(",", "")),
        "voter_turnout_total": value_for("Voter Turnout - Total"),
    }


def contest_review(rows, vote_for_values):
    output = []
    for contest_key, contest_rows in ordered_groups(rows, "contest_key").items():
        first = contest_rows[0]
        vote_for_candidates = vote_for_values[first["contest_name_raw"]]
        if not vote_for_candidates:
            raise ValueError(f"Missing Vote For value: {first['contest_name_raw']}")
        vote_for = vote_for_candidates.pop(0)
        row_votes = defaultdict(int)
        for row in contest_rows:
            row_votes[row["row_type"]] += int(row["votes"])
        total_votes_cast = row_votes["candidate"] + row_votes["write_in_aggregate"]
        output.append({
            "contest_key": contest_key,
            "contest_name_raw": first["contest_name_raw"],
            "contest_name_normalized": first["contest_name_normalized"],
            "level": first["level"],
            "district": first["district"],
            "ballot_party": first["ballot_party"],
            "reporting_scope": first["reporting_scope"],
            "vote_for": vote_for,
            "result_row_count": len(contest_rows),
            "candidate_row_count": sum(row["row_type"] == "candidate" for row in contest_rows),
            "candidate_votes": row_votes["candidate"],
            "write_in_votes": row_votes["write_in_aggregate"],
            "total_votes_cast": total_votes_cast,
            "overvotes": row_votes["overvote"],
            "undervotes": row_votes["undervote"],
            "contest_total": sum(int(row["votes"]) for row in contest_rows),
            "verification_status": first["verification_status"],
            "source_key": first["source_key"],
            "source_sha256": first["sha256"],
            "parser_version": first["parser_version"],
        })
    leftovers = {key: values for key, values in vote_for_values.items() if values}
    if leftovers:
        raise ValueError(f"Unmatched Vote For values remain: {sorted(leftovers)}")
    return output


def office_map(connection):
    result = {}
    rows = connection.execute(
        """
        SELECT title, precinct_code, seats_available
        FROM offices
        WHERE UPPER(COALESCE(county, '')) = 'NATRONA'
          AND scope_kind = 'precinct_party_gender'
        """
    )
    for title, precinct, seats in rows:
        party = "REP" if " Republican " in f" {title} " else "DEM" if " Democratic " in f" {title} " else ""
        position = "committeewoman" if "Committeewoman" in title else "committeeman" if "Committeeman" in title else ""
        key = (precinct, party, position)
        if key in result:
            raise ValueError(f"Duplicate natural-key office: {key}")
        result[key] = {"office_title": title, "current_seats_available": seats}
    return result


def seat_review(contests, offices):
    output = []
    for contest in contests:
        if contest["reporting_scope"] != "precinct":
            continue
        match = re.search(
            r"Precinct (Committeeman|Committeewoman) (\d+-\d+)$",
            contest["contest_name_normalized"],
            re.I,
        )
        if not match:
            raise ValueError(f"Cannot derive precinct natural key: {contest['contest_key']}")
        position = match.group(1).lower()
        precinct = match.group(2)
        key = (precinct, contest["ballot_party"], position)
        office = offices.get(key)
        current_seats = office["current_seats_available"] if office else ""
        official_seats = int(contest["vote_for"])
        output.append({
            "contest_key": contest["contest_key"],
            "precinct": precinct,
            "party": contest["ballot_party"],
            "position": position,
            "official_vote_for": official_seats,
            "office_match_status": "exact_natural_key" if office else "missing_office",
            "office_title": office["office_title"] if office else "",
            "current_seats_available": current_seats,
            "seat_delta": official_seats - current_seats if office else "",
            "candidate_row_count": contest["candidate_row_count"],
            "source_sha256": contest["source_sha256"],
            "verification_status": contest["verification_status"],
        })
    return output


def current_rows(connection, election_key, county):
    query = """
        SELECT
          v.contest_key,
          v.contest_name_normalized,
          v.level,
          v.ballot_party,
          v.reporting_scope,
          v.source_id,
          v.source_url,
          v.is_unofficial,
          v.row_type,
          v.candidate_name_raw,
          v.votes
        FROM v_election_current_results v
        JOIN election_events ee ON ee.id = v.election_id
        WHERE ee.election_key = ?
          AND UPPER(COALESCE(v.county, '')) = UPPER(?)
    """
    return [dict(row) for row in connection.execute(query, (election_key, county))]


def result_identity(row):
    candidate = name_key(row.get("candidate_name_raw"))
    if not candidate:
        candidate = row["row_type"]
    return row["contest_key"], row["row_type"], candidate


def result_delta(official_rows, existing_rows):
    official = {}
    current = {}
    for row in official_rows:
        identity = result_identity(row)
        if identity in official:
            raise ValueError(f"Duplicate official result identity: {identity}")
        official[identity] = row
    for row in existing_rows:
        identity = result_identity(row)
        if identity in current:
            raise ValueError(f"Duplicate current result identity: {identity}")
        current[identity] = row

    output = []
    for identity in sorted(set(official) | set(current)):
        new = official.get(identity)
        old = current.get(identity)
        new_votes = int(new["votes"]) if new else None
        old_votes = int(old["votes"]) if old else None
        if old is None:
            status = "new_official_row"
        elif new is None:
            status = "absent_from_official"
        elif new_votes == old_votes:
            status = "unchanged"
        else:
            status = "vote_changed"
        base = new or old
        output.append({
            "contest_key": identity[0],
            "contest_name_normalized": base["contest_name_normalized"],
            "level": base["level"],
            "ballot_party": base["ballot_party"],
            "reporting_scope": base["reporting_scope"],
            "row_type": identity[1],
            "comparison_name_key": identity[2],
            "official_candidate_name_raw": new["candidate_name_raw"] if new else "",
            "current_candidate_name_raw": old["candidate_name_raw"] if old else "",
            "official_votes": new_votes if new_votes is not None else "",
            "current_votes": old_votes if old_votes is not None else "",
            "vote_delta": new_votes - old_votes if new_votes is not None and old_votes is not None else "",
            "status": status,
            "current_source_id": old["source_id"] if old else "",
            "current_is_unofficial": old["is_unofficial"] if old else "",
            "current_source_url": old["source_url"] if old else "",
        })
    return output


def candidate_vote(rows, contest_name, candidate_name):
    matches = [
        int(row["votes"])
        for row in rows
        if row["contest_name_normalized"] == contest_name
        and name_key(row["candidate_name_raw"]) == name_key(candidate_name)
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one result for {contest_name} / {candidate_name}, got {len(matches)}")
    return matches[0]


def official_seat_count(rows, precinct, party, position):
    matches = [
        int(row["official_vote_for"])
        for row in rows
        if row["precinct"] == precinct
        and row["party"] == party
        and row["position"] == position
    ]
    if len(matches) != 1:
        raise ValueError(
            f"Expected one seat result for {party} {precinct} {position}, got {len(matches)}"
        )
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normalized-csv", required=True)
    parser.add_argument("--summary-pdf", required=True)
    parser.add_argument("--precinct-pdf", required=True)
    parser.add_argument("--numbered-key-pdf", required=True)
    parser.add_argument("--recount-pdf", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--county", default="Natrona")
    parser.add_argument("--election-key", default="wy-2026-primary")
    args = parser.parse_args()

    output_dir = Path(args.out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = read_csv(args.normalized_csv)
    if any(row["level"] == "unknown" for row in rows):
        raise ValueError("Official normalized data still contains unknown contest levels")
    contests = contest_review(rows, extract_vote_for(args.summary_pdf))

    connection = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    offices = office_map(connection)
    seats = seat_review(contests, offices)
    deltas = result_delta(rows, current_rows(connection, args.election_key, args.county))
    connection.close()

    summary_contests = extract(pdf_text(args.summary_pdf), args.county)
    precinct_contests = extract(pdf_text(args.precinct_pdf), args.county)
    precinct_rows, precinct_contest_count = verify_repeated(
        summary_contests,
        precinct_contests,
        args.election_key,
        args.county,
        False,
    )
    numbered_pages, numbered_contests = verify_matrix(
        summary_contests,
        args.numbered_key_pdf,
        ignore_column_order=True,
        allow_omitted_undervotes=True,
    )

    recount_contests = extract(pdf_text(args.recount_pdf), args.county)
    if len(recount_contests) != 1:
        raise ValueError(f"Expected one recount contest, got {len(recount_contests)}")
    recount_votes = {
        name_key(row["candidate_name_raw"]): row["votes"]
        for row in recount_contests[0]["rows"]
        if row["row_type"] == "candidate"
    }

    stats = source_stats(args.summary_pdf)
    verification = {
        "election_key": args.election_key,
        "county": args.county,
        "official_source_sha256": rows[0]["sha256"],
        "parser_version": rows[0]["parser_version"],
        "normalized_row_count": len(rows),
        "contest_count": len(contests),
        "unknown_level_count": sum(contest["level"] == "unknown" for contest in contests),
        "precinct_committee_contest_count": len(seats),
        "precinct_committee_total_seats": sum(int(row["official_vote_for"]) for row in seats),
        "rep_3_10_committeeman_seats": official_seat_count(seats, "3-10", "REP", "committeeman"),
        "rep_3_10_committeewoman_seats": official_seat_count(seats, "3-10", "REP", "committeewoman"),
        "matched_precinct_office_count": sum(row["office_match_status"] == "exact_natural_key" for row in seats),
        "missing_precinct_office_count": sum(row["office_match_status"] == "missing_office" for row in seats),
        "source_statistics": stats,
        "skovgard_us_senate_votes": candidate_vote(rows, "United States Senator", "JIMMY SKOVGARD"),
        "hd38_hendry_votes": candidate_vote(rows, "House District 38", "ROBERT L. HENDRY"),
        "hd38_lien_votes": candidate_vote(rows, "House District 38", "JAYME LIEN"),
        "hd38_recount_hendry_votes": recount_votes[name_key("ROBERT L. HENDRY")],
        "hd38_recount_lien_votes": recount_votes[name_key("JAYME LIEN")],
        "precinct_crosscheck": {
            "matched_result_rows": precinct_rows,
            "matched_contests": precinct_contest_count,
        },
        "numbered_key_crosscheck": {
            "matched_contests": numbered_contests,
            "totals_pages_checked": numbered_pages,
        },
        "delta_status_counts": {
            status: sum(row["status"] == status for row in deltas)
            for status in ("unchanged", "vote_changed", "new_official_row", "absent_from_official")
        },
    }

    expected = {
        "precincts_complete": "46 of 46",
        "registered_voters_total": 34318,
        "ballots_cast_total": 17750,
        "voter_turnout_total": "51.72%",
        "contest_count": 246,
        "normalized_row_count": 1090,
        "precinct_committee_contest_count": 184,
        "precinct_committee_total_seats": 290,
        "rep_3_10_committeeman_seats": 8,
        "rep_3_10_committeewoman_seats": 8,
        "skovgard_us_senate_votes": 622,
        "hd38_hendry_votes": 938,
        "hd38_lien_votes": 869,
    }
    actual = {
        **stats,
        "contest_count": verification["contest_count"],
        "normalized_row_count": verification["normalized_row_count"],
        "precinct_committee_contest_count": verification["precinct_committee_contest_count"],
        "precinct_committee_total_seats": verification["precinct_committee_total_seats"],
        "rep_3_10_committeeman_seats": verification["rep_3_10_committeeman_seats"],
        "rep_3_10_committeewoman_seats": verification["rep_3_10_committeewoman_seats"],
        "skovgard_us_senate_votes": verification["skovgard_us_senate_votes"],
        "hd38_hendry_votes": verification["hd38_hendry_votes"],
        "hd38_lien_votes": verification["hd38_lien_votes"],
    }
    if actual != expected:
        raise ValueError(f"Official-result acceptance values changed: expected {expected}, got {actual}")
    if verification["hd38_hendry_votes"] != verification["hd38_recount_hendry_votes"]:
        raise ValueError("HD 38 Hendry recount value does not match the official summary")
    if verification["hd38_lien_votes"] != verification["hd38_recount_lien_votes"]:
        raise ValueError("HD 38 Lien recount value does not match the official summary")

    write_csv(output_dir / "natrona_2026_official_contest_review.csv", list(contests[0]), contests)
    write_csv(output_dir / "natrona_2026_official_seat_review.csv", list(seats[0]), seats)
    write_csv(output_dir / "natrona_2026_official_result_delta.csv", list(deltas[0]), deltas)
    write_seat_updates(output_dir / "natrona_2026_official_existing_office_seat_updates.sql", seats)
    with open(output_dir / "natrona_2026_official_verification.json", "w", encoding="utf-8") as target:
        json.dump(verification, target, indent=2, sort_keys=True)
        target.write("\n")

    print(f"OK: {len(contests)} contests, {len(rows)} rows, {len(seats)} seat rows")
    print(f"OK: precinct crosscheck {precinct_contest_count} contests / {precinct_rows} rows")
    print(f"OK: numbered-key crosscheck {numbered_contests} contests / {numbered_pages} pages")
    print(f"OK: review artifacts -> {output_dir}")


if __name__ == "__main__":
    main()
