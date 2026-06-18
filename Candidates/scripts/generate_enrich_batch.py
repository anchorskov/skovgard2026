#!/usr/bin/env python3
"""Generate a CSV batch of un-enriched county candidates for AI research.

Usage:
    python3 Candidates/scripts/generate_enrich_batch.py --batch 1
    python3 Candidates/scripts/generate_enrich_batch.py --batch 2

Writes: /mnt/c/Users/ancho/Downloads/enrich{NNN}.csv
Each batch contains BATCH_SIZE candidates with no website or Facebook URL,
ordered by county → office → name. Skips precinct_party_gender races.
"""
import argparse
import csv
import json
import subprocess
import sys

BATCH_SIZE = 20
OUTPUT_DIR = '/mnt/c/Users/ancho/Downloads'

QUERY = """
SELECT
  c.id                    AS candidate_id,
  c.external_candidate_id,
  c.full_name,
  c.party,
  o.title                 AS office_title,
  o.scope_kind,
  o.county,
  o.municipality,
  c.city,
  c.email
FROM candidates c
JOIN offices o ON c.office_id = o.id
WHERE c.withdrawn_at IS NULL
  AND o.county IS NOT NULL
  AND o.scope_kind != 'precinct_party_gender'
  AND c.website_url IS NULL
  AND c.facebook_url IS NULL
ORDER BY o.county, o.sort_order, c.full_name
LIMIT {limit} OFFSET {offset}
"""

COLUMNS_IN = [
    'candidate_id', 'external_candidate_id', 'full_name', 'party',
    'office_title', 'scope_kind', 'county', 'municipality', 'city', 'email',
]
COLUMNS_OUT = COLUMNS_IN + ['website_url', 'facebook_url', 'twitter_url', 'campaign_finance_url']


def run_d1(sql):
    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'wy', '--remote', '--command', sql],
        cwd='/home/anchor/projects/skovgard2026/Candidates',
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print('wrangler error:', result.stderr, file=sys.stderr)
        sys.exit(1)
    # wrangler outputs a JSON array spread across multiple lines; collect from first '['
    lines = result.stdout.splitlines()
    start = next((i for i, l in enumerate(lines) if l.strip() == '['), None)
    if start is None:
        return []
    blob = '\n'.join(lines[start:])
    data = json.loads(blob)
    return data[0].get('results', [])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=int, required=True, help='Batch number (1-based)')
    args = parser.parse_args()

    offset = (args.batch - 1) * BATCH_SIZE
    sql = QUERY.format(limit=BATCH_SIZE, offset=offset)
    rows = run_d1(sql)

    if not rows:
        print(f'No candidates at offset {offset}. All batches complete.')
        sys.exit(0)

    out_path = f'{OUTPUT_DIR}/enrich{args.batch:03d}.csv'
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS_OUT, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            row['website_url'] = ''
            row['facebook_url'] = ''
            row['twitter_url'] = ''
            row['campaign_finance_url'] = ''
            writer.writerow(row)

    print(f'Wrote {len(rows)} candidates → {out_path}')
    print(f'Next batch: --batch {args.batch + 1}')


if __name__ == '__main__':
    main()
