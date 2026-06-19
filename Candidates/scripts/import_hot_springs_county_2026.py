# Candidates/scripts/import_hot_springs_county_2026.py
#!/usr/bin/env python3
"""Generate INSERT SQL for Hot Springs County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_hot_springs_county_2026.py > /tmp/hot_springs_county_insert.sql

Requires: Candidates/db/migrations/0004_offices_expand.sql applied first.
Source CSVs: /tmp/hot_springs_county_2026/
"""
import csv
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse

CSV_DIR = "/tmp/hot_springs_county_2026"

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
}

LEVEL_MAP = {
    "county": "county",
    "municipal": "city",
    "city": "city",
    "precinct_committee": "county",
    "precinct": "county",
}

PARTY_MAP = {
    "DEMOCRATIC": "DEM",
    "DEMOCRAT": "DEM",
    "DEM": "DEM",
    "D": "DEM",
    "REPUBLICAN": "REP",
    "REP": "REP",
    "R": "REP",
    "LIBERTARIAN": "LIB",
    "LIB": "LIB",
    "L": "LIB",
    "NONPARTISAN": "NP",
    "NON-PARTISAN": "NP",
    "NON-PARTISAN CONTEST": "NP",
    "NO PARTY": "NP",
    "NP": "NP",
}

EMAIL_FIXES = {
    "ghandrsh@yaoo.com": "ghandrsh@yahoo.com",
}

RACE_HEADERS = {
    "race_id",
    "race_display",
    "office",
    "office_level",
    "jurisdiction_type",
    "jurisdiction_name",
    "county",
    "district_type",
    "district_code",
    "precinct",
    "ward",
    "ballot_party",
    "source_party_text",
    "seats_available",
    "term",
    "unexpired_term_flag",
    "election_date",
    "nomination_method",
    "source_file",
    "source_page",
    "source_url",
    "source_updated",
    "notes",
}

CANDIDATE_HEADERS = {
    "candidate_id",
    "person_key",
    "race_id",
    "race_display",
    "county",
    "office",
    "office_level",
    "jurisdiction_type",
    "jurisdiction_name",
    "district_type",
    "district_code",
    "precinct",
    "ward",
    "ballot_party",
    "source_party_text",
    "gender",
    "candidate_name",
    "candidate_slug",
    "status",
    "date_filed",
    "date_withdrawn",
    "mailing_address",
    "city",
    "state",
    "zip",
    "phone",
    "email",
    "website",
    "term",
    "seats_available",
    "unexpired_term_flag",
    "source_file",
    "source_page",
    "source_url",
    "source_updated",
    "source_notes",
}


def csv_lines_without_comments(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line in f:
            if line.lstrip().startswith("#"):
                continue
            yield line


def load_csv(path, required_headers):
    reader = csv.DictReader(csv_lines_without_comments(path))
    missing = required_headers - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"{path} is missing required columns: {', '.join(sorted(missing))}")
    return list(reader)


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


def q(value):
    if value is None or str(value).strip() == "":
        return "NULL"
    return "'" + str(value).strip().replace("'", "''") + "'"


def integer_value(value, default=0):
    s = (value or "").strip()
    if not s:
        return default
    try:
        return int(s)
    except ValueError:
        return default


def normalize_party(*values):
    for value in values:
        raw = (value or "").strip().upper()
        if raw in PARTY_MAP:
            return PARTY_MAP[raw]
    return "NP"


def normalize_level(value):
    return LEVEL_MAP.get((value or "").strip().lower(), "county")


def infer_committee_gender(row):
    office = (row.get("office") or row.get("race_display") or "").strip().lower()
    if "committeewoman" in office:
        return "F"
    if "committeeman" in office:
        return "M"
    return None


def derive_scope_kind(row):
    office_level = (row.get("office_level") or "").strip().lower()
    district_type = (row.get("district_type") or "").strip().lower()
    precinct = (row.get("precinct") or "").strip()
    gender = infer_committee_gender(row)
    party = normalize_party(row.get("source_party_text"), row.get("ballot_party"))

    if office_level in {"municipal", "city"}:
        return "municipal"
    if office_level in {"precinct", "precinct_committee"} or precinct:
        return "precinct_party_gender" if party != "NP" and gender else "precinct_party"
    if district_type:
        return f"{district_type}_district"
    return "countywide"


def municipality(row):
    if normalize_level(row.get("office_level")) != "city":
        return None
    raw = (row.get("jurisdiction_name") or "").strip()
    raw = re.sub(r"^Town of\s+", "", raw, flags=re.I)
    return raw or None


def normalize_website(value):
    raw = (value or "").strip()
    if not raw or raw.upper() in {"N/A", "NA", "NONE"}:
        return None

    candidate_url = raw if re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I) else f"https://{raw}"
    parsed = urlparse(candidate_url)
    host = parsed.netloc.lower().split("@")[-1].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    if not host or "." not in host or host in JUNK_WEBSITE_HOSTS:
        return None
    return candidate_url


def normalize_email(value):
    raw = (value or "").strip()
    if not raw:
        return None
    return EMAIL_FIXES.get(raw.lower(), raw)


def slug_suffix(candidate_id):
    return hashlib.md5((candidate_id or "").encode()).hexdigest()[:8]


def candidate_slug(row):
    base = (row.get("candidate_slug") or "").strip()
    if not base:
        base = re.sub(r"[^\w\s-]", "", (row.get("candidate_name") or "").lower())
        base = re.sub(r"\s+", "-", base.strip())
        base = re.sub(r"-+", "-", base)
    return f"{base}-{slug_suffix(row.get('candidate_id', ''))}"


def district_value(row):
    district_code = (row.get("district_code") or "").strip()
    if not district_code:
        return None
    return integer_value(district_code, None)


def main():
    race_rows = load_csv(f"{CSV_DIR}/hot_springs_county_2026_races.csv", RACE_HEADERS)
    candidate_rows = load_csv(f"{CSV_DIR}/hot_springs_county_2026_candidates.csv", CANDIDATE_HEADERS)

    for sort_order, row in enumerate(race_rows, start=1):
        title = row["race_display"]
        level = normalize_level(row["office_level"])
        district = district_value(row)
        county = row["county"] or "Hot Springs"
        party = normalize_party(row["source_party_text"], row["ballot_party"])
        seats_available = integer_value(row["seats_available"], 1)
        scope_kind = derive_scope_kind(row)
        contest_type = "candidate_race"
        ward = row["ward"] or None
        external_race_id = row["race_id"]

        print(
            "INSERT INTO offices "
            "(title, level, district, county, municipality, ballot_party, seats_available, "
            "scope_kind, contest_type, ward, external_race_id, sort_order) VALUES ("
            f"{q(title)}, {q(level)}, {q(district)}, {q(county)}, {q(municipality(row))}, "
            f"{q(party)}, {seats_available}, {q(scope_kind)}, {q(contest_type)}, "
            f"{q(ward)}, {q(external_race_id)}, {sort_order});"
        )

    for row in candidate_rows:
        race_id = row["race_id"]
        party = normalize_party(row["source_party_text"], row["ballot_party"])
        full_name = row["candidate_name"]
        slug = candidate_slug(row)
        city = row["city"] or municipality(row)
        state = row["state"] or "WY"
        mailing_address = row["mailing_address"] or None
        phone = row["phone"] or None
        email = normalize_email(row["email"])
        website_url = normalize_website(row["website"])
        filed_at = parse_date(row["date_filed"])
        status = (row["status"] or "").strip().lower()
        withdrawn_at = parse_date(row["date_withdrawn"]) if status == "withdrawn" else None
        source_page = row["source_page"] or None
        external_candidate_id = row["candidate_id"]
        committee_gender = infer_committee_gender(row)
        position_title = row["office"] or None

        print(
            "INSERT INTO candidates "
            "(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            "email, website_url, filed_at, withdrawn_at, source_page, external_candidate_id, "
            "committee_gender, position_title) "
            f"SELECT id, {q(party)}, {q(full_name)}, {q(slug)}, {q(city)}, {q(state)}, "
            f"{q(mailing_address)}, {q(phone)}, {q(email)}, {q(website_url)}, "
            f"{q(filed_at)}, {q(withdrawn_at)}, {q(source_page)}, {q(external_candidate_id)}, "
            f"{q(committee_gender)}, {q(position_title)} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )


if __name__ == "__main__":
    main()
