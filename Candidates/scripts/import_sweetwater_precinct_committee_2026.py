#!/usr/bin/env python3
"""Generate an idempotent Sweetwater 2026 precinct-committee D1 seed."""

import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

REQUIRED = {
    "county", "election_phase", "election_date", "party", "precinct",
    "precinct_name", "office_name", "term", "seats_open", "candidate_name",
    "filed_date_as_printed", "candidate_source_url", "candidate_source_page",
    "seats_source_url", "seats_source_page", "verification_status", "notes",
}

PARTIES = {
    "Republican": ("REP", "Republican"),
    "Democrat": ("DEM", "Democratic"),
    "Democratic": ("DEM", "Democratic"),
}

OFFICES = {
    "Precinct Committeeman": ("M", "man", "Committeeman"),
    "Precinct Committeewoman": ("F", "woman", "Committeewoman"),
}


def slugify(value):
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return re.sub(r"-+", "-", value)


def parse_date(value):
    try:
        return datetime.strptime(value.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def sql_quote(value):
    return "'" + value.replace("'", "''") + "'"


def roster_cte(rows):
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    columns = (
        "precinct, precinct_name, party, party_label, gender, gender_slug, "
        "position_title, seats, candidate_name, candidate_slug, filed_at, source_page, "
        "verification_status, review_needed, review_note, candidate_source_url, seats_source_url"
    )
    extracts = ",\n    ".join(f"json_extract(value, '$[{index}]')" for index in range(17))
    return (
        f"WITH roster({columns}) AS (\n"
        f"  SELECT\n    {extracts}\n"
        f"  FROM json_each({sql_quote(payload)})\n"
        ")"
    )


def load(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)

    accepted = []
    held = []
    seen_candidate_keys = set()
    group_seats = {}

    for row in rows:
        if row["county"] != "Sweetwater" or row["election_phase"] != "primary" or row["election_date"] != "2026-08-18":
            raise ValueError(f"unexpected election identity: {row['county']} {row['election_phase']} {row['election_date']}")

        if not row["party"].strip() or not row["seats_open"].strip():
            held.append(row)
            continue
        if row["party"] not in PARTIES:
            raise ValueError(f"unsupported party: {row['party']}")
        if row["office_name"] not in OFFICES:
            raise ValueError(f"unsupported office: {row['office_name']}")

        party, party_label = PARTIES[row["party"]]
        gender, gender_slug, position_title = OFFICES[row["office_name"]]
        precinct = row["precinct"].strip()
        seats = int(row["seats_open"])
        group_key = (precinct, party, gender)
        if group_key in group_seats and group_seats[group_key] != seats:
            raise ValueError(f"inconsistent seats for {group_key}")
        group_seats[group_key] = seats

        name_slug = slugify(row["candidate_name"])
        candidate_slug = f"sweetwater-pct-{slugify(precinct)}-{party.lower()}-{gender_slug}-{name_slug}"
        if candidate_slug in seen_candidate_keys:
            raise ValueError(f"duplicate candidate key: {candidate_slug}")
        seen_candidate_keys.add(candidate_slug)

        filed_at = parse_date(row["filed_date_as_printed"])
        review_needed = 0 if filed_at else 1
        review_note = row["notes"].strip() or None
        if not filed_at and not review_note:
            raise ValueError(f"invalid filing date without note: {row['candidate_name']}")

        accepted.append([
            precinct, row["precinct_name"].strip(), party, party_label, gender,
            gender_slug, position_title, seats, row["candidate_name"].strip(),
            candidate_slug, filed_at, int(row["candidate_source_page"]),
            row["verification_status"].strip(), review_needed, review_note,
            row["candidate_source_url"].strip(), row["seats_source_url"].strip(),
        ])

    if len(rows) != 94 or len(accepted) != 93 or len(held) != 1:
        raise ValueError(f"expected 94 total / 93 accepted / 1 held, got {len(rows)} / {len(accepted)} / {len(held)}")
    held_row = held[0]
    if held_row["candidate_name"] != "Richard F. Kaumo":
        raise ValueError("the only held row must be Richard F. Kaumo")
    return accepted, held


def main():
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} PATH_TO_CSV")
    rows, held = load(Path(sys.argv[1]))
    cte = roster_cte(rows)

    print("-- Sweetwater County 2026 precinct committee candidates.")
    print("-- Generated from sweetwater_2026_precinct_committee_candidates.csv on 2026-08-02.")
    print("-- Official candidate source: https://www.sweetwatercountywy.gov/departments/county_clerk/election_information/Precinct%206.17%20Updated.pdf?t=202606171415000")
    print("-- 93 candidates imported. Richard F. Kaumo is intentionally held because the official source and CSV have no party or seat count; do not infer them.")
    print()
    print(cte)
    print("INSERT OR IGNORE INTO offices")
    print("  (title, level, district, sort_order, county, ballot_party, seats_available, scope_kind, external_race_id, precinct_code)")
    print("SELECT DISTINCT")
    print("  'Sweetwater Precinct ' || precinct || ' ' || party_label || ' Precinct ' || position_title,")
    print("  'county', NULL, 528 + dense_rank() OVER (ORDER BY precinct, party, gender),")
    print("  'Sweetwater', party, seats, 'precinct_party_gender',")
    print("  'wy-2026-primary-sweetwater-precinct-' || lower(precinct) || '-' || lower(party) || '-' || lower(position_title),")
    print("  precinct")
    print("FROM roster;")
    print()
    print(cte)
    print("INSERT OR IGNORE INTO candidates")
    print("  (office_id, party, full_name, ballot_name, slug, state, filed_at, source_page,")
    print("   external_candidate_id, committee_gender, position_title, data_confidence,")
    print("   human_review_needed, enrichment_notes)")
    print("SELECT")
    print("  o.id, r.party, r.candidate_name, r.candidate_name, r.candidate_slug, 'WY', r.filed_at, r.source_page,")
    print("  'wy-2026-primary-' || r.candidate_slug, r.gender, r.position_title,")
    print("  CASE r.review_needed WHEN 1 THEN 'Medium' ELSE 'High' END, r.review_needed,")
    print("  TRIM('verification_status: ' || r.verification_status || '; candidate_source: ' ||")
    print("    r.candidate_source_url || '; seats_source: ' || r.seats_source_url ||")
    print("    CASE WHEN r.review_note IS NULL THEN '' ELSE '; source_note: ' || r.review_note END)")
    print("FROM roster r")
    print("JOIN offices o ON o.external_race_id =")
    print("  'wy-2026-primary-sweetwater-precinct-' || lower(r.precinct) || '-' || lower(r.party) || '-' || lower(r.position_title);")


if __name__ == "__main__":
    main()
