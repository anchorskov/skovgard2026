#!/usr/bin/env python3
"""Match multi_seat_race_sources rows to existing offices rows and generate
a reviewable seats_available update.

Usage:
    python3 Candidates/scripts/match_multi_seat_race_sources.py \
      > Candidates/db/seed/multi_seat_race_sources_apply_YYYY-MM-DD.sql

Run from the Candidates/ directory (uses `wrangler d1 execute` under the hood,
so it must be able to reach the remote `wy` D1 database).

What it does:
  1. Pulls the live `offices` table and every `multi_seat_race_sources` row
     with match_status = 'not_attempted'.
  2. For each source row, filters offices by county + a jurisdiction_type ->
     level/scope_kind mapping, then scores the remaining candidates by title
     similarity (plus precinct/ward/party signal bonuses).
  3. Only a *single, clearly best* match is treated as 'exact' — that is the
     only case that ever touches live offices.seats_available. Everything
     else (no candidates passed the filter, or two-plus candidates scored
     within MATCH_MARGIN of each other) is left as 'ambiguous' or
     'no_office_found' with a best-guess office_id_guess and match_notes
     recorded, but office_id / offices.seats_available are NOT touched.
  4. Prints the generated SQL to stdout (apply with
     `wrangler d1 execute wy --remote --file=...` after reviewing it) and a
     human-readable ambiguous/no-match report to stderr.

Re-run safe: only rows with match_status = 'not_attempted' are considered,
so re-running after a manual fix (e.g. you resolved an ambiguous row by hand)
won't reprocess rows that already have a decision recorded. To force a
row to be reconsidered, reset its match_status to 'not_attempted' first.
"""
import json
import re
import subprocess
import sys
from difflib import SequenceMatcher

MATCH_THRESHOLD = 0.45   # minimum score to be considered a candidate at all
MATCH_MARGIN = 0.08      # top score must beat runner-up by this much to be 'exact'

JURISDICTION_LEVEL_MAP = {
    'Countywide': {'level': 'county', 'scope_kind': 'countywide'},
    'Municipal': {'level': 'city'},
    'Precinct': {'level': 'county', 'scope_kind': ('precinct_party_gender', 'precinct_party')},
    'School District': {'level': 'county', 'scope_kind': 'special_district'},
    'Special District': {'level': 'county', 'scope_kind': 'special_district'},
    'Community College District': {'level': 'county', 'scope_kind': 'special_district'},
}

PARTY_TO_BALLOT_PARTY = {
    'republican': 'REP',
    'democratic': 'DEM',
    'democrat': 'DEM',
    'libertarian': 'LIB',
}


def run_d1_json(sql):
    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'wy', '--remote', '--command', sql, '--json'],
        capture_output=True, text=True, check=True,
    )
    raw = result.stdout
    start = raw.find('[')
    return json.loads(raw[start:])[0]['results']


def normalize(text):
    if not text:
        return ''
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def normalize_precinct(text):
    """Like normalize(), but strips leading zeros from numeric tokens so
    '01-01' and '1-1' compare equal — county precinct-code conventions vary."""
    if not text:
        return ''
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    return ' '.join(str(int(t)) if t.isdigit() else t for t in tokens)


def contains_sequence(haystack_words, needle_words):
    """True if needle_words appears as a contiguous run within haystack_words.
    Word-boundary aware, unlike plain substring-in-string containment."""
    if not needle_words:
        return False
    n = len(needle_words)
    return any(
        haystack_words[i:i + n] == needle_words
        for i in range(len(haystack_words) - n + 1)
    )


def title_score(query, title):
    return SequenceMatcher(None, normalize(query), normalize(title)).ratio()


def gender_token(office_name):
    n = normalize(office_name)
    if 'committeewoman' in n:
        return 'committeewoman'
    if 'committeeman' in n:
        return 'committeeman'
    return None


def candidate_pool(offices, row):
    jmap = JURISDICTION_LEVEL_MAP.get(row['jurisdiction_type'])
    if not jmap:
        return []
    county = (row['county'] or '').strip().lower()
    pool = [o for o in offices if (o['county'] or '').strip().lower() == county]
    pool = [o for o in pool if o['level'] == jmap['level']]

    scope = jmap.get('scope_kind')
    if scope:
        allowed = (scope,) if isinstance(scope, str) else scope
        pool = [o for o in pool if o['scope_kind'] in allowed]

    if row['jurisdiction_type'] == 'Municipal' and row['city_or_town']:
        town = row['city_or_town'].strip().lower()
        pool = [o for o in pool if (o['municipality'] or '').strip().lower() == town]

    if row['jurisdiction_type'] == 'Precinct':
        party_key = (row['party'] or '').strip().lower()
        ballot_party = PARTY_TO_BALLOT_PARTY.get(party_key)
        if ballot_party:
            pool = [o for o in pool if o.get('ballot_party') == ballot_party]
        gender = gender_token(row['office_name'] or '')
        if gender:
            pool = [o for o in pool if gender in normalize(o['title'])]

    return pool


def score_candidate(row, office):
    title_norm = normalize(office['title'])

    if row['jurisdiction_type'] == 'Precinct':
        # The common suffix ("Precinct Committeeman (Republican) (M)") is
        # identical across every office in the filtered pool, so whole-string
        # similarity barely discriminates on the one thing that matters here:
        # which precinct. Score containment of the precinct identifier
        # directly instead of leaning on SequenceMatcher over the full title.
        # normalize_precinct strips leading zeros ('01-01' vs '1-1' both used
        # across different counties' source documents).
        precinct_key = normalize_precinct(row.get('precinct') or row.get('precinct_name') or row.get('district_or_scope') or '')
        if not precinct_key:
            return 0.0
        title_words = normalize_precinct(office['title']).split(' ')
        key_words = precinct_key.split(' ')
        if contains_sequence(title_words, key_words):
            score = 0.9
        else:
            # try just the name part for named precincts (e.g. "basin" from "basin-01")
            name_part = key_words[0] if key_words else ''
            score = 0.5 if name_part and not name_part.isdigit() and name_part in title_words else 0.0
        if row.get('precinct') and office.get('precinct_code'):
            if normalize_precinct(row['precinct']) == normalize_precinct(office['precinct_code']):
                score += 0.3
        return min(score, 1.0)

    query = ' '.join(filter(None, [
        row.get('office_name'), row.get('district_or_scope'),
        row.get('precinct_name'), row.get('precinct'), row.get('city_or_town'),
    ]))
    score = title_score(query, office['title'])
    if row.get('district_or_scope') and office.get('ward'):
        digits_row = re.findall(r'\d+', row['district_or_scope'])
        digits_office = re.findall(r'\d+', office['ward'])
        if digits_row and digits_row == digits_office:
            score += 0.2
    return min(score, 1.0)


def match_row(row, offices):
    pool = candidate_pool(offices, row)
    if not pool:
        return 'no_office_found', None, 'No office rows exist for this county + jurisdiction_type yet.'

    scored = sorted(
        ((score_candidate(row, o), o) for o in pool),
        key=lambda t: t[0], reverse=True,
    )
    top_score, top_office = scored[0]
    if top_score < MATCH_THRESHOLD:
        return 'no_office_found', top_office['id'], (
            f"Best candidate office #{top_office['id']} ({top_office['title']!r}) "
            f"only scored {top_score:.2f}, below threshold."
        )

    runner_up_score = scored[1][0] if len(scored) > 1 else 0.0
    if len(scored) > 1 and (top_score - runner_up_score) < MATCH_MARGIN:
        alts = ', '.join(f"#{o['id']} {o['title']!r} ({s:.2f})" for s, o in scored[:3])
        return 'ambiguous', top_office['id'], f"Top candidates too close to call: {alts}"

    return 'exact', top_office['id'], f"Matched office #{top_office['id']} ({top_office['title']!r}), score {top_score:.2f}."


def main():
    offices = run_d1_json(
        "SELECT id, title, level, scope_kind, county, municipality, ward, "
        "precinct_code, ballot_party, seats_available FROM offices"
    )
    rows = run_d1_json(
        "SELECT id, ballot_group_key, county, jurisdiction_type, city_or_town, "
        "precinct, precinct_name, party, office_name, district_or_scope, seats_open "
        "FROM multi_seat_race_sources WHERE match_status = 'not_attempted' "
        "AND jurisdiction_type != 'Manual Review'"
    )

    exact_sql = []
    report = {'exact': [], 'ambiguous': [], 'no_office_found': []}

    for row in rows:
        status, office_id, notes = match_row(row, offices)
        report[status].append({
            'ballot_group_key': row['ballot_group_key'],
            'office_name': row['office_name'],
            'county': row['county'],
            'seats_open': row['seats_open'],
            'office_id_guess': office_id,
            'notes': notes,
        })
        key = row['ballot_group_key'].replace("'", "''")
        esc_notes = (notes or '').replace("'", "''")
        if status == 'exact':
            exact_sql.append(
                f"UPDATE offices SET seats_available = {row['seats_open']} WHERE id = {office_id};"
            )
            exact_sql.append(
                f"UPDATE multi_seat_race_sources SET office_id = {office_id}, "
                f"match_status = 'exact', match_notes = '{esc_notes}', "
                f"applied_at = datetime('now'), updated_at = datetime('now') "
                f"WHERE ballot_group_key = '{key}';"
            )
        else:
            guess_sql = str(office_id) if office_id is not None else 'NULL'
            exact_sql.append(
                f"UPDATE multi_seat_race_sources SET office_id_guess = {guess_sql}, "
                f"match_status = '{status}', match_notes = '{esc_notes}', "
                f"updated_at = datetime('now') "
                f"WHERE ballot_group_key = '{key}';"
            )

    print(f"-- Generated by match_multi_seat_race_sources.py")
    print(f"-- exact: {len(report['exact'])}, ambiguous: {len(report['ambiguous'])}, "
          f"no_office_found: {len(report['no_office_found'])}\n")
    for stmt in exact_sql:
        print(stmt)

    print(json.dumps(report, indent=2), file=sys.stderr)


if __name__ == '__main__':
    main()
