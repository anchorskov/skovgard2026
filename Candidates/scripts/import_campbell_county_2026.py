# Candidates/scripts/import_campbell_county_2026.py
#!/usr/bin/env python3
"""Generate INSERT SQL for Campbell County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_campbell_county_2026.py > /tmp/campbell_county_insert.sql

Source CSVs: /tmp/campbell_county_2026/
"""

import csv
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse

CSV_DIR = "/tmp/campbell_county_2026"

JUNK_WEBSITE_HOSTS = {
    "gmail.com",
    "hotmail.com",
    "yahoo.com",
    "outlook.com",
    "live.com",
    "myyahoo.com",
    "protonmail.com",
    "rocketmail.com",
    "verizon.net",
    "tritel.net",
    "tctwest.net",
    "bellsouth.net",
    "vcn.com",
    "bresnan.net",
    "msn.com",
    "aol.com",
    "icloud.com",
    "wyoming.com",
    "reagan.com",
    "proton.me",
    "collinscom.net",
    "comcast.net",
}

LEVEL_MAP = {
    "county": "county",
    "municipal": "city",
    "city": "city",
    "precinct": "county",
    "precinct_committee": "county",
}

PARTY_MAP = {
    "REPUBLICAN": "REP",
    "DEMOCRATIC": "DEM",
    "DEMOCRAT": "DEM",
    "LIBERTARIAN": "LIB",
    "NONPARTISAN": "NP",
    "REP": "REP",
    "DEM": "DEM",
    "LIB": "LIB",
    "R": "REP",
    "D": "DEM",
    "": "NP",
}


def q(value):
    if value is None or str(value).strip() == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def load_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def parse_date(value):
    s = (value or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def slug_suffix(candidate_id):
    return hashlib.md5((candidate_id or "").encode()).hexdigest()[:8]


def normalize_party(value):
    return PARTY_MAP.get((value or "").strip().upper(), "NP")


def is_real_website(raw):
    s = (raw or "").strip()
    if not s:
        return False
    candidate_url = s if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I) else f"https://{s}"
    parsed = urlparse(candidate_url)
    host = parsed.netloc.lower().lstrip("www.")
    if not host or "." not in host or host in JUNK_WEBSITE_HOSTS:
        return False
    return True


def normalize_website(raw):
    s = (raw or "").strip()
    if not is_real_website(s):
        return None
    return s if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I) else f"https://{s}"


def scope_kind(row):
    level = (row.get("office_level") or "").strip().lower()
    if level in {"municipal", "city"}:
        return "municipal"
    if level in {"precinct", "precinct_committee"}:
        return "precinct_party_gender"
    return "countywide"


def main():
    races = load_csv(f"{CSV_DIR}/campbell_county_2026_races.csv")
    candidates = load_csv(f"{CSV_DIR}/campbell_county_2026_candidates.csv")

    print("-- ============================================================")
    print("-- Campbell County 2026 — offices INSERT")
    print("-- Generated from /tmp/campbell_county_2026 three-CSV workflow")
    print("-- ============================================================")
    print()

    for i, row in enumerate(races, start=1):
        raw_level = (row.get("office_level") or "").strip().lower()
        level = LEVEL_MAP.get(raw_level, "county")
        party = normalize_party(row.get("ballot_party"))
        municipality = row.get("city") or None
        ward = row.get("ward") or None
        seats = int(row.get("seats_available") or 1)
        ext_id = row["race_id"]

        print(
            "INSERT INTO offices "
            "(title, level, county, municipality, ballot_party, seats_available, "
            "scope_kind, contest_type, ward, external_race_id, sort_order) VALUES ("
            f"{q(row['race_display'])}, {q(level)}, {q(row.get('county') or 'Campbell')}, "
            f"{q(municipality)}, {q(party)}, {seats}, {q(scope_kind(row))}, "
            f"'candidate_race', {q(ward)}, {q(ext_id)}, {i});"
        )

    print()
    print("-- ============================================================")
    print("-- Campbell County 2026 — candidates INSERT")
    print("-- ============================================================")
    print()

    for row in candidates:
        ext_candidate_id = row["candidate_id"]
        race_id = row["race_id"]
        full_name = row["candidate_name"]
        base_slug = row.get("candidate_slug") or re.sub(r"[^\w-]", "", full_name.lower().replace(" ", "-"))
        slug = f"{base_slug}-{slug_suffix(ext_candidate_id)}"
        party = normalize_party(row.get("ballot_party"))
        filed_at = parse_date(row.get("date_filed"))
        withdrawn_date = parse_date(row.get("date_withdrawn"))
        withdrawn_at = withdrawn_date if (row.get("status") or "").strip().lower() == "withdrawn" else None
        website = normalize_website(row.get("website"))
        committee_gender = (row.get("gender") or "").strip() or None
        position_title = row.get("position_title") or None
        source_page = None

        print(
            "INSERT INTO candidates "
            "(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            "email, website_url, filed_at, withdrawn_at, source_page, external_candidate_id, "
            "committee_gender, position_title, ballot_name, race_display, enrichment_notes, "
            "human_review_needed, data_confidence) "
            "SELECT id, "
            f"{q(party)}, {q(full_name)}, {q(slug)}, {q(row.get('city'))}, 'WY', "
            f"{q(row.get('contact_raw'))}, {q(row.get('phone'))}, {q(row.get('email'))}, "
            f"{q(website)}, {q(filed_at)}, {q(withdrawn_at)}, {q(source_page)}, "
            f"{q(ext_candidate_id)}, {q(committee_gender)}, {q(position_title)}, "
            f"{q(row.get('candidate_name'))}, {q(row.get('race_display'))}, {q(row.get('notes'))}, "
            f"{1 if row.get('notes') else 0}, "
            f"{q('needs_review' if row.get('notes') else 'source_pdf_extracted')} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )

    print()
    print("-- Done.")


if __name__ == "__main__":
    main()
