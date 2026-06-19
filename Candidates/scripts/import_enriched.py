#!/usr/bin/env python3
"""Generate UPDATE SQL from an agent-enriched candidate CSV.

Usage:
    python3 Candidates/scripts/import_enriched.py /mnt/c/Users/ancho/Downloads/enriched6-18.csv
    python3 Candidates/scripts/import_enriched.py /mnt/c/Users/ancho/Downloads/enriched6-18.csv --dry-run

The enriched CSV must have columns:
    candidate_id, external_candidate_id, full_name,
    website_url, facebook_url, twitter_url, campaign_finance_url

Only rows where at least one URL column is non-empty are updated.
URL columns already present in the original data are never overwritten
(the UPDATE uses COALESCE so existing values are preserved).
"""
import argparse
import csv
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

URL_COLUMNS = ['website_url', 'facebook_url', 'twitter_url', 'campaign_finance_url', 'ballotpedia_url']

JUNK_HOSTS = {
    'gmail.com', 'hotmail.com', 'yahoo.com', 'myyahoo.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'live.com', 'msn.com',
    'protonmail.com', 'rocketmail.com',
}


def is_real_url(value):
    s = (value or '').strip()
    if not s:
        return False
    if not s.startswith(('http://', 'https://')):
        return False
    host = urlparse(s).netloc.lower().lstrip('www.')
    return host not in JUNK_HOSTS and '.' in host


def q(value):
    if not value:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv_path', help='Path to enriched CSV')
    parser.add_argument('--dry-run', action='store_true', help='Print SQL, do not execute')
    args = parser.parse_args()

    path = Path(args.csv_path)
    if not path.exists():
        print(f'File not found: {path}', file=sys.stderr)
        sys.exit(1)

    rows = []
    skipped = []

    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row.get('candidate_id', '').strip()
            if not cid:
                skipped.append(f'  missing candidate_id: {row.get("full_name")}')
                continue

            updates = {}
            for col in URL_COLUMNS:
                val = row.get(col, '').strip()
                if is_real_url(val):
                    updates[col] = val

            if not updates:
                continue

            rows.append((cid, row.get('full_name', ''), updates))

    print(f'-- Enriched import from {path.name}')
    print(f'-- {len(rows)} candidates with new URLs, {len(skipped)} skipped')
    if skipped:
        for s in skipped:
            print(f'-- {s}')
    print()

    sql_lines = []
    for cid, name, updates in rows:
        set_parts = ', '.join(
            f"{col} = COALESCE({col}, {q(val)})"
            for col, val in updates.items()
        )
        sql = f"UPDATE candidates SET {set_parts} WHERE id = {cid}; -- {name}"
        sql_lines.append(sql)
        print(sql)

    if not sql_lines:
        print('-- Nothing to update.')
        return

    if args.dry_run:
        print('\n-- Dry run: no changes applied.')
        return

    sql_block = '\n'.join(sql_lines)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, encoding='utf-8') as tmp:
        tmp.write(sql_block + '\n')
        tmp_path = tmp.name

    print(f'\n-- Executing {len(sql_lines)} UPDATE statements against D1...')
    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'wy', '--remote', f'--file={tmp_path}'],
        cwd='/home/anchor/projects/skovgard2026/Candidates',
    )
    if result.returncode == 0:
        print(f'-- Done. {len(sql_lines)} candidates updated.')
    else:
        print('-- wrangler execute failed. SQL saved at:', tmp_path, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
