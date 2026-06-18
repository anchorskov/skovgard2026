#!/usr/bin/env python3
"""Generate INSERT SQL for Fremont County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_fremont_county_2026.py > /tmp/fremont_insert.sql

Requires: 0004_offices_expand.sql already applied.
Source CSVs: /tmp/fremont_2026/ (extracted from fremont_county_2026_three_csvs.zip)

Fremont County specifics:
- 26 races, 57 candidates — county + municipal only, no precinct committee
- Race titles already properly cased (no ALL CAPS issue)
- Jurisdiction names clean: Lander, Riverton, Dubois, Hudson, Pavillion, Shoshoni
- residential_address used as mailing when mailing_address empty (often ALL CAPS)
- candidate_id has no hash suffix — MD5 used for slug uniqueness
- No withdrawn candidates, no websites
- CSV may have leading # comment lines — stripped on read
"""
import csv
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse

CSV_DIR = '/tmp/fremont_2026'

JUNK_WEBSITE_HOSTS = {
    'gmail.com', 'hotmail.com', 'yahoo.com', 'myyahoo.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'live.com', 'msn.com',
    'protonmail.com', 'rocketmail.com',
    'verizon.net', 'tritel.net', 'tctwest.net', 'bellsouth.net',
}

LEVEL_MAP = {
    'county':    'county',
    'municipal': 'city',
    'precinct':  'county',
}

SCOPE_MAP = {
    'county':    'countywide',
    'city':      'municipal',
    'town':      'municipal',
    'municipal': 'municipal',
    'precinct':  'precinct_party_gender',
}

PARTY_MAP = {
    'REPUBLICAN':  'REP',
    'DEMOCRATIC':  'DEM',
    'LIBERTARIAN': 'LIB',
    'NONPARTISAN': 'NP',
    '':            'NP',
}


def read_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        lines = [l for l in f if not l.startswith('#')]
    return list(csv.DictReader(lines))


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
    s = (url or '').strip()
    if not s:
        return False
    host = urlparse(s).netloc.lower().lstrip('www.')
    return host not in JUNK_WEBSITE_HOSTS and '.' in host


def slug_suffix(candidate_id):
    return hashlib.md5(candidate_id.encode()).hexdigest()[:8]


def q(value):
    if value is None or str(value).strip() == '':
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def main():
    races = read_csv(f'{CSV_DIR}/fremont_county_2026_races.csv')
    cands = read_csv(f'{CSV_DIR}/fremont_county_2026_candidates.csv')

    print('-- ============================================================')
    print('-- Fremont County 2026 — offices INSERT')
    print(f'-- {len(races)} races, {len(cands)} candidates')
    print('-- Requires: 0004_offices_expand.sql applied')
    print('-- ============================================================')
    print()

    for i, r in enumerate(races, start=1):
        raw_level  = r['office_level']
        juris_type = r['jurisdiction_type']
        level      = LEVEL_MAP.get(raw_level, 'county')
        scope      = SCOPE_MAP.get(juris_type, SCOPE_MAP.get(raw_level, 'countywide'))
        county     = r['county'] or 'Fremont'
        # jurisdiction_name is already clean (e.g. "Lander", "Fremont County")
        muni = r['jurisdiction_name'] if juris_type in ('city', 'town') else None
        raw_party  = r['ballot_party'].strip().upper()
        party      = PARTY_MAP.get(raw_party) if raw_party else None
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
    print('-- Fremont County 2026 — candidates INSERT')
    print('-- ============================================================')
    print()

    for c in cands:
        ext_cid    = c['candidate_id']
        race_id    = c['race_id']
        name       = c['candidate_name']
        cand_slug  = c['candidate_slug'] or re.sub(r'[^\w-]', '', name.lower().replace(' ', '-'))
        slug       = f"{cand_slug}-{slug_suffix(ext_cid)}"

        raw_party  = c['ballot_party'].strip().upper()
        party      = PARTY_MAP.get(raw_party, 'NP')

        # use residential_address as fallback when mailing_address empty
        mailing    = c['mailing_address'].strip() or c['residential_address'].strip() or None
        city_raw   = c.get('city', '').strip()
        # derive city from residential_address if no city column
        # format: "650 WEST LN LANDER WY 82520" — city is second-to-last word before state
        city = city_raw or None
        if not city and mailing:
            parts = mailing.split()
            # look for WY in address to extract city
            if 'WY' in parts:
                wy_idx = parts.index('WY')
                if wy_idx >= 2:
                    city = parts[wy_idx - 1].title()

        phone      = c['phone'] or None
        email      = c['email'] or None
        website    = c['website'].strip() if is_real_website(c.get('website', '')) else None
        src_page   = c['source_page'].strip() or None
        filed      = parse_date(c['date_filed'])
        wdn_raw    = parse_date(c['date_withdrawn'])
        withdrawn_at = wdn_raw if c['status'] == 'withdrawn' else None

        print(
            f"INSERT INTO candidates "
            f"(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            f"email, website_url, filed_at, withdrawn_at, source_page, "
            f"external_candidate_id) "
            f"SELECT id, {q(party)}, {q(name)}, {q(slug)}, {q(city)}, 'WY', "
            f"{q(mailing)}, {q(phone)}, {q(email)}, {q(website)}, "
            f"{q(filed)}, {q(withdrawn_at)}, {q(src_page)}, "
            f"{q(ext_cid)} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )

    print()
    print('-- Done.')


if __name__ == '__main__':
    main()
