#!/usr/bin/env python3
"""Generate INSERT SQL for Park County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_park_county_2026.py > /tmp/park_county_insert.sql

Requires: Candidates/db/migrations/0004_offices_expand.sql applied first.
Source CSVs: /tmp/park_county_2026/ (extracted from park_county_2026_three_csvs.zip)
"""
import csv
import re
import sys
from datetime import datetime
from urllib.parse import urlparse

# Domains that are clearly email providers, ISPs, or non-campaign sites
JUNK_WEBSITE_HOSTS = {
    'gmail.com', 'hotmail.com', 'yahoo.com', 'myyahoo.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'live.com', 'msn.com',
    'protonmail.com', 'rocketmail.com',
    'verizon.net', 'tritel.net', 'tctwest.net', 'bellsouth.net',
    'cityofpowell.com', 'powelltribune.com', 'highcountrylife.net', 'codyice.com',
}

CSV_DIR = '/tmp/park_county_2026'

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    return text[:80]

def parse_date(value):
    s = (value or '').strip()
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None

def is_real_website(url):
    s = (url or '').strip()
    if not s:
        return False
    host = urlparse(s).netloc.lower().lstrip('www.')
    return host not in JUNK_WEBSITE_HOSTS and '.' in host

def q(value):
    """Quote a value for SQL — NULL if empty/None, else escaped string."""
    if value is None or str(value).strip() == '':
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"

def load_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))

# Map CSV office_level values to DB level values (constrained by existing CHECK constraint).
# county/city are the only new values needed — scope_kind carries finer distinction.
LEVEL_MAP = {
    'county':             'county',
    'municipal':          'city',
    'local':              'county',   # special district under county jurisdiction
    'precinct_committee': 'county',   # county party committee position
}

def main():
    races_rows = load_csv(f'{CSV_DIR}/park_county_2026_races.csv')
    cand_rows  = load_csv(f'{CSV_DIR}/park_county_2026_candidates.csv')

    print('-- ============================================================')
    print('-- Park County 2026 — offices INSERT')
    print('-- Requires: 0004_offices_expand.sql applied')
    print('-- ============================================================')
    print()

    for r in races_rows:
        raw_level = r['office_level']
        level    = LEVEL_MAP.get(raw_level, 'county')   # county | city
        county   = r['county']         # Park
        muni     = r['municipality'] or None
        party    = r['ballot_party'] or None
        seats    = int(r['seats_available'] or 1)
        scope    = r['scope_kind'] or None
        ctype    = r['contest_type'] or 'candidate_race'
        ext_id   = r['race_id']
        sort_ord = int(r['sort_order'] or 0)

        # Use race_display as the title — it's already unique and descriptive
        # (e.g. "Powell City Council Ward 1", "Precinct 1-1 REP Committeeman")
        title = r['race_display']

        print(
            f"INSERT INTO offices "
            f"(title, level, county, municipality, ballot_party, seats_available, "
            f"scope_kind, contest_type, external_race_id, sort_order) VALUES ("
            f"{q(title)}, {q(level)}, {q(county)}, {q(muni)}, {q(party)}, {seats}, "
            f"{q(scope)}, {q(ctype)}, {q(ext_id)}, {sort_ord});"
        )

    print()
    print('-- ============================================================')
    print('-- Park County 2026 — candidates INSERT')
    print('-- ============================================================')
    print()

    for c in cand_rows:
        ext_cid  = c['candidate_id']
        race_id  = c['race_id']
        name     = c['candidate_name']
        party    = c['ballot_party'].strip() or 'NP'  # nonpartisan municipal races have no party
        com_gen  = c['committee_gender'] or None
        pos_ttl  = c['position_title'] or None
        status   = c['status']
        city     = c['contact_city_guess'] or None
        mailing  = c['mailing_address_raw'] or None
        phone    = c['phone'] or None
        email    = c['email'] or None
        src_page_raw = (c['source_page'] or '').strip()
        src_page = src_page_raw if src_page_raw and src_page_raw != '0' else None

        website  = c['website'].strip() if is_real_website(c['website']) else None
        filed    = parse_date(c['date_filed'])
        wdn_raw  = parse_date(c['date_withdrawn'])
        withdrawn_at = wdn_raw if status == 'withdrawn' else None

        # Slug: name-slug + hash suffix from candidate_id for uniqueness
        hash_suffix = ext_cid.split('-')[-1]
        slug = slugify(name) + '-' + hash_suffix

        print(
            f"INSERT INTO candidates "
            f"(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            f"email, website_url, filed_at, withdrawn_at, source_page, "
            f"external_candidate_id, committee_gender, position_title) "
            f"SELECT id, {q(party)}, {q(name)}, {q(slug)}, {q(city)}, 'WY', "
            f"{q(mailing)}, {q(phone)}, {q(email)}, {q(website)}, "
            f"{q(filed)}, {q(withdrawn_at)}, {q(src_page)}, "
            f"{q(ext_cid)}, {q(com_gen)}, {q(pos_ttl)} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )

    print()
    print('-- Done.')

if __name__ == '__main__':
    main()
