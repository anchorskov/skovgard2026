#!/usr/bin/env node
// generate_ballot_surveys.mjs
// Queries wy D1 offices and outputs SQL INSERT statements for the
// grassmvt_survey ballot_surveys table.
//
// ballot_surveys lives in the grassmvt_survey DB (env.DB in production,
// which is also the wy D1). The script generates INSERTs safe to re-run
// via ON CONFLICT(race_slug) DO NOTHING.
//
// Usage:
//   node Candidates/scripts/generate_ballot_surveys.mjs --dry-run
//
// Apply to grassmvt_survey D1 (production):
//   node Candidates/scripts/generate_ballot_surveys.mjs \
//     | npx wrangler d1 execute wy --env production --remote --file=-
//
// NOTE: county and city offices are NOT included here. They require
//   manual review since they vary by county and election cycle.
//   Add them via targeted INSERT statements after reviewing local filings.

import { execSync } from 'node:child_process';

function q(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Fetch offices from wy D1 via wrangler
const raw = execSync(
  `npx wrangler d1 execute wy --env production --remote --json ` +
  `--command "SELECT id, title, level, district, county FROM offices WHERE level IN ('federal','statewide','wy_house','wy_senate') ORDER BY level, district, title;"`,
  { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
);

const parsed = JSON.parse(raw);
const offices = parsed[0]?.results || [];

const now = new Date().toISOString();
const sql = [];
sql.push('-- ballot_surveys generated from wy D1 offices');
sql.push('-- Apply to grassmvt_survey DB (wy D1 in production)');
sql.push('');

let displayOrder = 0;

// Federal and statewide first
for (const o of offices) {
  if (o.level !== 'federal' && o.level !== 'statewide') continue;

  const scopeType = o.level === 'federal' ? 'federal' : 'statewide';
  const title = o.title.replace(/\s+/g, ' ').trim();
  const raceSlug = `${slugify(title)}-2026`;

  sql.push(
    `INSERT INTO ballot_surveys (race_slug, title, scope_type, scope_value, wy_db_office_id, election_year, display_order, active, created_at, updated_at) ` +
    `VALUES (${q(raceSlug)}, ${q(title)}, ${q(scopeType)}, NULL, ${q(o.id)}, 2026, ${displayOrder++}, 1, ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(race_slug) DO NOTHING;`
  );
}

sql.push('');
sql.push('-- Wyoming Senate districts');

// Senate
for (const o of offices) {
  if (o.level !== 'wy_senate') continue;
  const dist = String(o.district).padStart(2, '0');
  const raceSlug = `wy-senate-district-${dist}-2026`;
  const title = `Wyoming State Senate, District ${o.district}`;

  sql.push(
    `INSERT INTO ballot_surveys (race_slug, title, scope_type, scope_value, wy_db_office_id, election_year, display_order, active, created_at, updated_at) ` +
    `VALUES (${q(raceSlug)}, ${q(title)}, 'state_senate', ${q(String(o.district))}, ${q(o.id)}, 2026, ${displayOrder++}, 1, ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(race_slug) DO NOTHING;`
  );
}

sql.push('');
sql.push('-- Wyoming House districts');

// House
for (const o of offices) {
  if (o.level !== 'wy_house') continue;
  const dist = String(o.district).padStart(2, '0');
  const raceSlug = `wy-house-district-${dist}-2026`;
  const title = `Wyoming House of Representatives, District ${o.district}`;

  sql.push(
    `INSERT INTO ballot_surveys (race_slug, title, scope_type, scope_value, wy_db_office_id, election_year, display_order, active, created_at, updated_at) ` +
    `VALUES (${q(raceSlug)}, ${q(title)}, 'state_house', ${q(String(o.district))}, ${q(o.id)}, 2026, ${displayOrder++}, 1, ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(race_slug) DO NOTHING;`
  );
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  process.stdout.write('-- DRY RUN\n');
}
process.stdout.write(sql.join('\n') + '\n');
process.stderr.write(`Generated ${displayOrder} ballot_surveys rows (2 federal, 5 statewide, 17 senate, ${displayOrder - 24} house)\n`);
