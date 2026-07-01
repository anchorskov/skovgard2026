#!/usr/bin/env node
// populate_wy_candidate_id.mjs
// Matches race_candidates rows to candidates by deriving office level+district
// from race_slug, then fuzzy-matching candidate names.
//
// Usage:
//   node Candidates/scripts/populate_wy_candidate_id.mjs --dry-run   (print SQL + unmatched report)
//   node Candidates/scripts/populate_wy_candidate_id.mjs              (write SQL to stdout)
//   SCRATCH=/tmp && node ... > $SCRATCH/wy_cid.sql \
//     && npx wrangler d1 execute wy --env production --remote --file=$SCRATCH/wy_cid.sql

import { execSync } from 'child_process';

const dryRun = process.argv.includes('--dry-run');

function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute wy --env production --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: '/home/anchor/projects/skovgard2026/Candidates', maxBuffer: 8 * 1024 * 1024 }
  ).toString();
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

function normalizeName(n) {
  if (!n) return '';
  return n
    .replace(/\./g, '')          // remove periods (Kenneth R. → Kenneth R)
    .replace(/\s+/g, ' ')        // collapse spaces
    .trim()
    .toLowerCase();
}

// ── race_slug → { level, district } ──────────────────────────────────────
const STATEWIDE_MAP = {
  'governor-2026':                                  { level: 'statewide', officeId: 3 },
  'secretary-of-state-2026':                        { level: 'statewide', officeId: 4 },
  'state-auditor-2026':                             { level: 'statewide', officeId: 5 },
  'state-treasurer-2026':                           { level: 'statewide', officeId: 6 },
  'superintendent-of-public-instruction-2026':      { level: 'statewide', officeId: 7 },
  'us-senate-2026':                                 { level: 'federal',   officeId: 1 },
  'us-house-2026':                                  { level: 'federal',   officeId: 2 },
};

function parseRaceSlug(slug) {
  if (STATEWIDE_MAP[slug]) return STATEWIDE_MAP[slug];

  // state-house-XX-2026 → wy_house, district=XX
  const houseMatch = slug.match(/^state-house-(\d+)-2026$/);
  if (houseMatch) return { level: 'wy_house', district: parseInt(houseMatch[1], 10), officeId: null };

  // state-senate-XX-2026 → wy_senate, district=XX
  const senateMatch = slug.match(/^state-senate-(\d+)-2026$/);
  if (senateMatch) return { level: 'wy_senate', district: parseInt(senateMatch[1], 10), officeId: null };

  return null;
}

// ── Load offices (for level+district → office_id) ─────────────────────────
const officeRows = d1('SELECT id, level, district FROM offices WHERE level IN (\'wy_house\',\'wy_senate\',\'statewide\',\'federal\')');
const officeByLevelDist = {};
for (const o of officeRows) {
  const key = `${o.level}:${o.district ?? '__'}`;
  officeByLevelDist[key] = o.id;
}

// ── Load candidates ────────────────────────────────────────────────────────
const candRows = d1('SELECT c.id, c.full_name, c.office_id FROM candidates c');
// Build lookup: officeId → [ { id, normName, fullName } ]
const candByOffice = {};
for (const c of candRows) {
  if (!c.office_id) continue;
  if (!candByOffice[c.office_id]) candByOffice[c.office_id] = [];
  candByOffice[c.office_id].push({ id: c.id, normName: normalizeName(c.full_name), fullName: c.full_name });
}

// ── Load race_candidates ──────────────────────────────────────────────────
const rcRows = d1('SELECT id, candidate_name, race_slug FROM race_candidates WHERE wy_candidate_id IS NULL');

const updates = [];
const unmatched = [];

for (const rc of rcRows) {
  const slug = rc.race_slug;
  const parsed = parseRaceSlug(slug);
  if (!parsed) {
    unmatched.push({ rc, reason: `unknown race_slug format: ${slug}` });
    continue;
  }

  // Resolve office_id
  let officeId = parsed.officeId;
  if (!officeId) {
    const key = `${parsed.level}:${parsed.district}`;
    officeId = officeByLevelDist[key];
    if (!officeId) {
      unmatched.push({ rc, reason: `no office found for ${key}` });
      continue;
    }
  }

  // Find candidate in that office by normalized name
  const candidates = candByOffice[officeId] ?? [];
  const normRc = normalizeName(rc.candidate_name);

  let matched = candidates.find(c => c.normName === normRc);

  if (!matched) {
    // Last-name-only fallback: match if last word of normalized name matches both sides
    const rcLastName = normRc.split(' ').at(-1);
    const singleMatches = candidates.filter(c => c.normName.split(' ').at(-1) === rcLastName);
    if (singleMatches.length === 1) matched = singleMatches[0];
  }

  if (matched) {
    updates.push(`UPDATE race_candidates SET wy_candidate_id = ${matched.id} WHERE id = ${rc.id};`);
  } else {
    unmatched.push({ rc, reason: `no name match in office ${officeId}`, candidates: candidates.map(c => c.fullName) });
  }
}

// ── Output ─────────────────────────────────────────────────────────────────
if (dryRun || unmatched.length > 0) {
  process.stderr.write(`\n=== wy_candidate_id match report ===\n`);
  process.stderr.write(`Matched:   ${updates.length}\n`);
  process.stderr.write(`Unmatched: ${unmatched.length}\n\n`);
  if (unmatched.length) {
    process.stderr.write('Unmatched rows:\n');
    for (const u of unmatched) {
      process.stderr.write(`  [${u.rc.id}] "${u.rc.candidate_name}" (${u.rc.race_slug})\n`);
      process.stderr.write(`        Reason: ${u.reason}\n`);
      if (u.candidates?.length) {
        process.stderr.write(`        Available: ${u.candidates.join(', ')}\n`);
      }
    }
  }
}

if (updates.length > 0) {
  const out = `-- race_candidates.wy_candidate_id population\n-- ${updates.length} updates generated\n\n` +
    updates.join('\n') + '\n';
  process.stdout.write(out);
}
