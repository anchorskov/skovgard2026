#!/usr/bin/env node
// seed_reference_evidence.mjs
// Seeds guide_reference_sources, guide_legislation_items, guide_reference_sets,
// guide_reference_set_items from wy_2026_legislation.yaml into the wy D1.
//
// Usage (dry run — prints SQL):
//   node Candidates/scripts/seed_reference_evidence.mjs --dry-run
//
// Usage (apply to local D1):
//   node Candidates/scripts/seed_reference_evidence.mjs | npx wrangler d1 execute wy --local --file=-
//
// Usage (apply to production D1):
//   node Candidates/scripts/seed_reference_evidence.mjs | npx wrangler d1 execute wy --remote --file=-
//
// After seeding legislation tables, separately import freedom_caucus network:
//   node Candidates/scripts/seed_freedom_caucus_links.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from '../../node_modules/js-yaml/dist/js-yaml.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const yamlPath = join(__dir, '../../.tmp/guide-legislation-review/wy_2026_legislation.yaml');

function q(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

const rawYaml = readFileSync(yamlPath, 'utf-8');
const data = loadYaml(rawYaml);

const sql = [];
const now = new Date().toISOString();

// --- guide_reference_sources ---
const sourceDefs = {
  'BETTER-WY-STATEWIDE-2026': {
    source_name: 'Better Wyoming 2026 Post-Session Statewide Summary',
    source_type: 'advocacy',
    source_url: data.source_pages?.better_wyoming_statewide || '',
    publisher: 'Better Wyoming',
    publication_date: '2026',
    summary: 'Statewide post-session vote-note summary covering 2026 Legislature outcomes.',
    verification_status: 'needs_official_verification',
  },
  'BWAR-FOLLOW-MONEY-2026': {
    source_name: 'BWAR Follow the Money — Bextel Bucks Report',
    source_type: 'advocacy',
    source_url: data.source_pages?.better_wyoming_bwar_follow_the_money || '',
    publisher: 'Better Wyoming Action + Research',
    publication_date: '2026',
    summary: 'Donor-network report tracking Freedom Caucus campaign finance connections.',
    verification_status: 'needs_official_verification',
  },
  'OFFICIAL-WYFC-2026': {
    source_name: 'Wyoming Freedom Caucus Official Members Page',
    source_type: 'official',
    source_url: data.source_pages?.wyoming_freedom_caucus_members || '',
    publisher: 'Wyoming Freedom Caucus',
    publication_date: '2026',
    summary: 'Official member roster for the Wyoming Freedom Caucus.',
    verification_status: 'verified',
  },
};

sql.push('-- guide_reference_sources');
for (const [key, s] of Object.entries(sourceDefs)) {
  sql.push(
    `INSERT INTO guide_reference_sources ` +
    `(source_key, source_name, source_type, source_url, publisher, publication_date, summary, verification_status, created_at, updated_at) ` +
    `VALUES (${q(key)}, ${q(s.source_name)}, ${q(s.source_type)}, ${q(s.source_url)}, ` +
    `${q(s.publisher)}, ${q(s.publication_date)}, ${q(s.summary)}, ${q(s.verification_status)}, ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(source_key) DO NOTHING;`
  );
}

// --- guide_legislation_items ---
const topicDisplayMap = {
  healthcare: 'Healthcare',
  education: 'Education',
  'tax reform': 'Property Taxes',
  housing: 'Housing',
  'public lands': 'Public Lands',
  workers: 'Workers',
  elections: 'Elections',
  'economic development': 'Economic Development',
  'state workforce': 'State Workforce',
};

sql.push('\n-- guide_legislation_items');
for (const [refId, item] of Object.entries(data.legislation || {})) {
  const topicDisplay = topicDisplayMap[item.topic] || item.topic || null;
  sql.push(
    `INSERT INTO guide_legislation_items ` +
    `(ref_id, session_year, chamber_id, item_type, official_url, topic, topic_display, ` +
    `source_framing, source_reported_status, verification_status, created_at, updated_at) ` +
    `VALUES (` +
    `${q(refId)}, 2026, ${q(item.chamber_id)}, 'bill', ${q(item.official_url)}, ` +
    `${q(item.topic)}, ${q(topicDisplay)}, ` +
    `${q(item.better_wyoming_summary)}, ${q(item.better_wyoming_status)}, ` +
    `'needs_official_verification', ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(ref_id) DO NOTHING;`
  );
}

// --- guide_reference_sets ---
sql.push('\n-- guide_reference_sets');
for (const [setKey, setDef] of Object.entries(data.reference_sets || {})) {
  sql.push(
    `INSERT INTO guide_reference_sets ` +
    `(set_key, set_name, description, source_key, verification_status, created_at, updated_at) ` +
    `VALUES (${q(setKey)}, ${q(setKey)}, ${q(setDef.description)}, 'BETTER-WY-STATEWIDE-2026', ` +
    `'needs_official_verification', ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(set_key) DO NOTHING;`
  );
}

// --- guide_reference_set_items ---
sql.push('\n-- guide_reference_set_items');
let sortOrder = 0;
for (const [setKey, setDef] of Object.entries(data.reference_sets || {})) {
  sortOrder = 0;
  for (const refId of (setDef.refs || [])) {
    sql.push(
      `INSERT INTO guide_reference_set_items (set_key, ref_id, sort_order, created_at) ` +
      `VALUES (${q(setKey)}, ${q(refId)}, ${sortOrder++}, ${q(now)}) ` +
      `ON CONFLICT(set_key, ref_id) DO NOTHING;`
    );
  }
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  process.stdout.write('-- DRY RUN: review SQL below before applying\n');
}
process.stdout.write(sql.join('\n') + '\n');
