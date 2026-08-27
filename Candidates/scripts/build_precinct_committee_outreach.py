#!/usr/bin/env python3
"""Build a won/lost precinct-committee outreach list for one county.

Joins the official election-results rows (vote counts, all named candidates
including losers) to the `candidates` roster (contact info, filed by the
county) via a natural-key office match, ranks each contest by votes against
`offices.seats_available` to assign won/lost, and appends a house/senate
district crosswalk pulled from the voterdata voter-registration file.

Only run this against a county whose precinct-committee results are the
official/certified source (`is_unofficial = 0` in the current-results view).
Running it against a county that still has only unofficial election-night
data will silently produce an empty result set, by design.

Usage (from Candidates/):
  python3 scripts/build_precinct_committee_outreach.py --county Natrona \
    --out /path/to/output.csv
"""

import argparse
import csv
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

WRANGLER_CMD = ["npx", "--no-install", "wrangler", "d1", "execute", "WY_DB", "--local", "--json"]

VOTERDATA_DB = Path("/home/anchor/projects/voterdata/wyoming/wy.sqlite")

RESULTS_SQL_TEMPLATE = """
WITH pc_rows AS (
  SELECT
    v.contest_id,
    v.contest_name_normalized,
    v.ballot_party,
    v.candidate_name_raw,
    v.votes,
    v.row_type,
    CASE
      WHEN v.contest_name_normalized LIKE 'Precinct Committeeman %'
        THEN REPLACE(v.contest_name_normalized, 'Precinct Committeeman ', '')
      WHEN v.contest_name_normalized LIKE 'Precinct Committeewoman %'
        THEN REPLACE(v.contest_name_normalized, 'Precinct Committeewoman ', '')
    END AS precinct_code,
    CASE
      WHEN v.contest_name_normalized LIKE 'Precinct Committeeman %' THEN 'Committeeman'
      WHEN v.contest_name_normalized LIKE 'Precinct Committeewoman %' THEN 'Committeewoman'
    END AS position_label
  FROM v_election_current_results v
  WHERE v.county = '{county}'
    AND v.reporting_scope = 'precinct'
    AND v.is_unofficial = 0
    AND (v.contest_name_normalized LIKE 'Precinct Committeeman %'
      OR v.contest_name_normalized LIKE 'Precinct Committeewoman %')
),
matched AS (
  SELECT
    r.*,
    o.id AS office_id,
    o.title AS office_title,
    o.seats_available
  FROM pc_rows r
  LEFT JOIN offices o
    ON o.county = '{county}'
   AND o.scope_kind = 'precinct_party_gender'
   AND o.precinct_code = r.precinct_code
   AND o.title = (
     '{county} Precinct ' || r.precinct_code || ' '
     || CASE r.ballot_party WHEN 'REP' THEN 'Republican' WHEN 'DEM' THEN 'Democratic' END
     || ' Precinct ' || r.position_label
   )
),
named AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY contest_id
      ORDER BY votes DESC, candidate_name_raw ASC
    ) AS vote_rank
  FROM matched
  WHERE row_type IN ('candidate','write_in_named')
),
writein_agg AS (
  SELECT contest_id, SUM(votes) AS write_in_aggregate_votes
  FROM matched
  WHERE row_type = 'write_in_aggregate'
  GROUP BY contest_id
)
SELECT
  n.precinct_code,
  n.ballot_party,
  n.position_label,
  n.seats_available,
  n.candidate_name_raw,
  n.votes,
  n.vote_rank,
  CASE WHEN n.seats_available IS NULL THEN 'unmatched_office'
       WHEN n.vote_rank <= n.seats_available THEN 'won' ELSE 'lost' END AS result_status,
  COALESCE(w.write_in_aggregate_votes, 0) AS write_in_aggregate_votes,
  CASE
    WHEN n.vote_rank = n.seats_available
     AND COALESCE(w.write_in_aggregate_votes, 0) > n.votes
    THEN 1 ELSE 0
  END AS write_in_could_have_displaced_last_winner,
  n.office_id,
  n.office_title
FROM named n
LEFT JOIN writein_agg w ON w.contest_id = n.contest_id
ORDER BY n.precinct_code, n.ballot_party, n.position_label, n.vote_rank;
"""

CONTACTS_SQL_TEMPLATE = """
SELECT
  o.id AS office_id,
  c.full_name,
  c.email,
  c.phone,
  c.mailing_address,
  c.city,
  c.state,
  c.zip,
  c.withdrawn_at
FROM offices o
JOIN candidates c ON c.office_id = o.id
WHERE o.county = '{county}'
  AND o.scope_kind = 'precinct_party_gender';
"""


def name_key(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def run_d1_query(sql):
    result = subprocess.run(
        WRANGLER_CMD + [f"--command={sql}"],
        cwd=Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return data[0]["results"]


def load_district_crosswalk(county):
    if not VOTERDATA_DB.exists():
        print(f"WARNING: {VOTERDATA_DB} not found; district columns will be blank.", file=sys.stderr)
        return {}
    con = sqlite3.connect(f"file:{VOTERDATA_DB}?mode=ro", uri=True)
    try:
        cur = con.execute(
            """
            SELECT precinct,
              GROUP_CONCAT(DISTINCT house_district) AS hd,
              GROUP_CONCAT(DISTINCT senate_district) AS sd
            FROM voters
            WHERE UPPER(county) = UPPER(?)
            GROUP BY precinct
            """,
            (county,),
        )
        crosswalk = {}
        for precinct, hd, sd in cur.fetchall():
            crosswalk[precinct] = {
                "house_district": hd,
                "senate_district": sd,
                "district_note": "spans multiple districts" if ("," in (hd or "") or "," in (sd or "")) else "",
            }
        return crosswalk
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--county", required=True, help="County name exactly as stored, e.g. Natrona")
    parser.add_argument("--out", required=True, help="Output CSV path")
    args = parser.parse_args()

    results = run_d1_query(RESULTS_SQL_TEMPLATE.format(county=args.county))
    if not results:
        print(
            f"No official precinct-committee results found for {args.county}. "
            "This county likely hasn't been promoted to official results yet "
            "(see docs/final_results_primary.md) — refusing to emit an empty file "
            "that could be mistaken for a complete result.",
            file=sys.stderr,
        )
        sys.exit(1)

    contacts = run_d1_query(CONTACTS_SQL_TEMPLATE.format(county=args.county))
    contact_by_office_and_name = {}
    for c in contacts:
        if c["withdrawn_at"]:
            continue
        key = (c["office_id"], name_key(c["full_name"]))
        contact_by_office_and_name[key] = c

    crosswalk = load_district_crosswalk(args.county)

    fieldnames = [
        "county", "precinct", "party", "position", "seats_available",
        "result_status", "vote_rank", "votes", "write_in_aggregate_votes",
        "write_in_could_have_displaced_last_winner",
        "candidate_name_official_results", "matched_roster_name",
        "email", "phone", "mailing_address", "city", "state", "zip",
        "house_district", "senate_district", "district_note",
        "office_title", "contact_match_status",
    ]

    unmatched_offices = 0
    no_contact_match = 0

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            if r["result_status"] == "unmatched_office":
                unmatched_offices += 1

            key = (r["office_id"], name_key(r["candidate_name_raw"]))
            contact = contact_by_office_and_name.get(key)
            contact_match_status = "matched" if contact else "no_roster_match"
            if not contact:
                no_contact_match += 1

            dc = crosswalk.get(r["precinct_code"], {})

            writer.writerow({
                "county": args.county,
                "precinct": r["precinct_code"],
                "party": r["ballot_party"],
                "position": r["position_label"],
                "seats_available": r["seats_available"],
                "result_status": r["result_status"],
                "vote_rank": r["vote_rank"],
                "votes": r["votes"],
                "write_in_aggregate_votes": r["write_in_aggregate_votes"],
                "write_in_could_have_displaced_last_winner": r["write_in_could_have_displaced_last_winner"],
                "candidate_name_official_results": r["candidate_name_raw"],
                "matched_roster_name": contact["full_name"] if contact else "",
                "email": contact["email"] if contact else "",
                "phone": contact["phone"] if contact else "",
                "mailing_address": contact["mailing_address"] if contact else "",
                "city": contact["city"] if contact else "",
                "state": contact["state"] if contact else "",
                "zip": contact["zip"] if contact else "",
                "house_district": dc.get("house_district", ""),
                "senate_district": dc.get("senate_district", ""),
                "district_note": dc.get("district_note", ""),
                "office_title": r["office_title"] or "",
                "contact_match_status": contact_match_status,
            })

    won = sum(1 for r in results if r["result_status"] == "won")
    lost = sum(1 for r in results if r["result_status"] == "lost")
    with_email = sum(
        1 for r in results
        if contact_by_office_and_name.get((r["office_id"], name_key(r["candidate_name_raw"])), {}).get("email")
    )

    print(f"Wrote {len(results)} rows to {args.out}")
    print(f"  won: {won}, lost: {lost}, unmatched_office: {unmatched_offices}")
    print(f"  rows with an email on file: {with_email} of {len(results)}")
    print(f"  rows with no roster contact match at all: {no_contact_match}")


if __name__ == "__main__":
    main()
