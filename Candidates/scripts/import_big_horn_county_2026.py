#!/usr/bin/env python3
"""Generate INSERT SQL for Big Horn County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_big_horn_county_2026.py > /tmp/big_horn_insert.sql

Requires: 0004_offices_expand.sql already applied (adds county/municipality/etc to offices).
Source CSVs: /tmp/big_horn_2026/ (extracted from big_horn_county_2026_three_csvs.zip)

Big Horn specifics vs Park County:
- All candidate names are ALL CAPS → title-cased on import
- office_level uses 'precinct' (not 'precinct_committee')
- candidate_id has no hash suffix → MD5 of candidate_id used for slug uniqueness
- ballot_party stored as full words (REPUBLICAN/DEMOCRATIC) → normalized to REP/DEM/NP
- No withdrawn candidates, no websites in this dataset
- scope_kind derived from jurisdiction_type (no district_type values in source)
"""
import csv
import hashlib
import re
import sys
from datetime import datetime

CSV_DIR = '/tmp/big_horn_2026'

JUNK_WEBSITE_HOSTS = {
    'gmail.com', 'hotmail.com', 'yahoo.com', 'myyahoo.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'live.com', 'msn.com',
    'protonmail.com', 'rocketmail.com',
    'verizon.net', 'tritel.net', 'tctwest.net', 'bellsouth.net',
    'cityofpowell.com', 'powelltribune.com',
}

LEVEL_MAP = {
    'county':    'county',
    'municipal': 'city',
    'precinct':  'county',   # precinct committee = county-level party position
    'local':     'county',
}

SCOPE_MAP = {
    'county':    'countywide',
    'municipal': 'municipal',
    'precinct':  'precinct_party_gender',
    'local':     'special_district',
}

PARTY_MAP = {
    'REPUBLICAN':  'REP',
    'DEMOCRATIC':  'DEM',
    'LIBERTARIAN': 'LIB',
    'NONPARTISAN': 'NP',
    '':            'NP',
}


def title_case(text):
    """Title-case ALL CAPS names. Handles Mc/Mac prefixes."""
    if not text:
        return text
    # basic title case
    result = text.strip().title()
    # fix Mc/Mac (e.g. MCDONALD → Mcdonald → McDonald)
    result = re.sub(r"\bMc(\w)", lambda m: "Mc" + m.group(1).upper(), result)
    result = re.sub(r"\bMac(\w)", lambda m: "Mac" + m.group(1).upper(), result)
    return result


def parse_date(value):
    s = (value or '').strip()
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def is_real_website(url):
    from urllib.parse import urlparse
    s = (url or '').strip()
    if not s:
        return False
    host = urlparse(s).netloc.lower().lstrip('www.')
    return host not in JUNK_WEBSITE_HOSTS and '.' in host


def slug_suffix(candidate_id):
    """8-char MD5 suffix for slug uniqueness — Big Horn IDs have no embedded hash."""
    return hashlib.md5(candidate_id.encode()).hexdigest()[:8]


def q(value):
    if value is None or str(value).strip() == '':
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def load_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def main():
    races = load_csv(f'{CSV_DIR}/big_horn_county_2026_races.csv')
    cands = load_csv(f'{CSV_DIR}/big_horn_county_2026_candidates.csv')

    print('-- ============================================================')
    print('-- Big Horn County 2026 — offices INSERT')
    print('-- Requires: 0004_offices_expand.sql applied')
    print('-- ============================================================')
    print()

    for i, r in enumerate(races, start=1):
        raw_level  = r['office_level']
        level      = LEVEL_MAP.get(raw_level, 'county')
        scope      = SCOPE_MAP.get(raw_level, 'countywide')
        county     = r['county'] or 'Big Horn'
        muni       = r['city'] or None
        raw_party  = r['ballot_party'].strip().upper()
        party      = PARTY_MAP.get(raw_party, 'NP') if raw_party else None
        seats      = int(r['seats_available'] or 1)
        ext_id     = r['race_id']
        title      = r['race_display']

        print(
            f"INSERT INTO offices "
            f"(title, level, county, municipality, ballot_party, seats_available, "
            f"scope_kind, contest_type, external_race_id, sort_order) VALUES ("
            f"{q(title)}, {q(level)}, {q(county)}, {q(muni)}, {q(party)}, {seats}, "
            f"{q(scope)}, 'candidate_race', {q(ext_id)}, {i});"
        )

    print()
    print('-- ============================================================')
    print('-- Big Horn County 2026 — candidates INSERT')
    print('-- ============================================================')
    print()

    for c in cands:
        ext_cid    = c['candidate_id']
        race_id    = c['race_id']
        raw_name   = c['candidate_name']
        name       = title_case(raw_name)
        cand_slug  = c['candidate_slug'] or re.sub(r'[^\w-]', '', name.lower().replace(' ', '-'))
        slug       = f"{cand_slug}-{slug_suffix(ext_cid)}"

        raw_party  = c['ballot_party'].strip().upper()
        party      = PARTY_MAP.get(raw_party, 'NP')

        com_gen    = c['gender'].strip() or None   # M / F for precinct committee
        city       = c['city'] or None
        mailing    = c['contact_raw'] or None
        phone      = c['phone'] or None
        email      = c['email'] or None
        website    = c['website'].strip() if is_real_website(c['website']) else None
        filed      = parse_date(c['date_filed'])
        wdn_raw    = parse_date(c['date_withdrawn'])
        status     = c['status']
        withdrawn_at = wdn_raw if status == 'withdrawn' else None

        print(
            f"INSERT INTO candidates "
            f"(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            f"email, website_url, filed_at, withdrawn_at, "
            f"external_candidate_id, committee_gender) "
            f"SELECT id, {q(party)}, {q(name)}, {q(slug)}, {q(city)}, 'WY', "
            f"{q(mailing)}, {q(phone)}, {q(email)}, {q(website)}, "
            f"{q(filed)}, {q(withdrawn_at)}, "
            f"{q(ext_cid)}, {q(com_gen)} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )

    print()
    print('-- Done.')


if __name__ == '__main__':
    main()
