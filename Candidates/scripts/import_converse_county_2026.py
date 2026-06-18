#!/usr/bin/env python3
"""Generate INSERT SQL for Converse County 2026 race and candidate data.

Usage:
    python3 Candidates/scripts/import_converse_county_2026.py > /tmp/converse_insert.sql

Requires: 0004_offices_expand.sql already applied.
Source CSVs: /tmp/converse_2026/ (extracted from converse_county_2026_three_csvs.zip)

Converse County specifics:
- CSV files have a leading # comment line — skipped on read
- 93 races but 42 have no_candidate_filed=Yes — offices imported, candidates skipped
- Names are already properly cased (no ALL CAPS issue)
- mailing_address and city are clean separate columns
- candidate_id has no hash suffix — MD5 used for slug uniqueness
- jurisdiction_type uses 'town' and 'city' for municipal races
- 1 real campaign website (votejoe.info)
"""
import csv
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse

CSV_DIR = '/tmp/converse_2026'

JUNK_WEBSITE_HOSTS = {
    'gmail.com', 'hotmail.com', 'yahoo.com', 'myyahoo.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'live.com', 'msn.com',
    'protonmail.com', 'rocketmail.com',
    'verizon.net', 'tritel.net', 'tctwest.net', 'bellsouth.net',
}

LEVEL_MAP = {
    'county':    'county',
    'precinct':  'county',   # precinct committee = county-level party position
    'municipal': 'city',
}

SCOPE_MAP = {
    'county':    'countywide',
    'precinct':  'precinct_party_gender',
    'city':      'municipal',
    'town':      'municipal',
    'municipal': 'municipal',
}

PARTY_MAP = {
    'REPUBLICAN':  'REP',
    'DEMOCRATIC':  'DEM',
    'LIBERTARIAN': 'LIB',
    'NONPARTISAN': 'NP',
    '':            'NP',
}


def read_csv(path):
    """Read CSV, skipping lines that start with #."""
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


def title_case(text):
    """Title-case any word that is fully uppercase (length > 1).
    Leaves lowercase words (articles, term descriptions) unchanged.
    Handles Mc/Mac prefixes."""
    if not text:
        return text
    def fix_word(w):
        if len(w) > 1 and w.isupper():
            w = w.capitalize()
        w = re.sub(r"^Mc(\w)", lambda m: "Mc" + m.group(1).upper(), w)
        w = re.sub(r"^Mac(\w)", lambda m: "Mac" + m.group(1).upper(), w)
        return w
    return ' '.join(fix_word(w) for w in text.split())


def normalize_gender(value):
    v = (value or '').strip().upper()
    if v in ('M', 'MALE'):   return 'M'
    if v in ('F', 'FEMALE'): return 'F'
    return None


def is_no_candidate(race):
    return race.get('no_candidate_filed', '').strip().lower() in ('yes', 'true', '1', 'y')


def main():
    races = read_csv(f'{CSV_DIR}/converse_county_2026_races.csv')
    cands = read_csv(f'{CSV_DIR}/converse_county_2026_candidates.csv')

    # Index candidates by race_id for fast lookup
    cands_by_race = {}
    for c in cands:
        cands_by_race.setdefault(c['race_id'], []).append(c)

    print('-- ============================================================')
    print('-- Converse County 2026 — offices INSERT')
    print(f'-- {len(races)} races total; {sum(1 for r in races if is_no_candidate(r))} have no candidates filed')
    print('-- Requires: 0004_offices_expand.sql applied')
    print('-- ============================================================')
    print()

    for i, r in enumerate(races, start=1):
        raw_level  = r['office_level']
        juris_type = r['jurisdiction_type']
        level      = LEVEL_MAP.get(raw_level, 'county')
        scope      = SCOPE_MAP.get(juris_type, SCOPE_MAP.get(raw_level, 'countywide'))
        county     = r['county'] or 'Converse'
        # municipality: derive from race_display for town/city races
        muni = None
        if juris_type in ('city', 'town', 'municipal'):
            # first word of jurisdiction_name e.g. "Douglas" from "Douglas City"
            muni = r['jurisdiction_name'].replace(' City', '').replace(' Town', '').strip() or None
        raw_party  = r['ballot_party'].strip().upper()
        party      = PARTY_MAP.get(raw_party) if raw_party else None
        seats      = int(r['seats_available'] or 1)
        ext_id     = r['race_id']
        title      = title_case(r['race_display'])

        print(
            f"INSERT INTO offices "
            f"(title, level, county, municipality, ballot_party, seats_available, "
            f"scope_kind, contest_type, external_race_id, sort_order) VALUES ("
            f"{q(title)}, {q(level)}, {q(county)}, {q(muni)}, {q(party)}, {seats}, "
            f"{q(scope)}, 'candidate_race', {q(ext_id)}, {i});"
        )

    print()
    print('-- ============================================================')
    print('-- Converse County 2026 — candidates INSERT')
    print(f'-- {len(cands)} candidates across {len(cands_by_race)} races')
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

        com_gen    = normalize_gender(c['gender'])
        city       = c['city'] or None
        mailing    = c['mailing_address'] or None
        phone      = c['phone'] or None
        email      = c['email'] or None
        website    = c['website'].strip() if is_real_website(c['website']) else None
        src_page   = c['source_page'].strip() or None
        filed      = parse_date(c['date_filed'])
        wdn_raw    = parse_date(c['date_withdrawn'])
        withdrawn_at = wdn_raw if c['status'] == 'withdrawn' else None

        print(
            f"INSERT INTO candidates "
            f"(office_id, party, full_name, slug, city, state, mailing_address, phone, "
            f"email, website_url, filed_at, withdrawn_at, source_page, "
            f"external_candidate_id, committee_gender) "
            f"SELECT id, {q(party)}, {q(name)}, {q(slug)}, {q(city)}, 'WY', "
            f"{q(mailing)}, {q(phone)}, {q(email)}, {q(website)}, "
            f"{q(filed)}, {q(withdrawn_at)}, {q(src_page)}, "
            f"{q(ext_cid)}, {q(com_gen)} "
            f"FROM offices WHERE external_race_id = {q(race_id)};"
        )

    print()
    print('-- Done.')


if __name__ == '__main__':
    main()
