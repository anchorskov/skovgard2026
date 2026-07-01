/**
 * seed_rubric_evidence_links.mjs
 *
 * Populates guide_rubric_evidence_links from existing guide_candidate_reference_links rows.
 * Skips verification_flag rows. Maps reference_kind → category_key per the PLANNING.md table.
 * All rows default to ballot_visible=0 — flip to 1 separately after editorial approval.
 *
 * Run: node Candidates/scripts/seed_rubric_evidence_links.mjs [--dry-run]
 */

import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Category mapping ────────────────────────────────────────────────────────
// reference_kind + optional reference_key → category_key + claim_summary + weight + verif_status

const CATEGORY_MAP = {
  // Freedom Caucus official membership
  'candidate_network:OFFICIAL-WYFC-2026': {
    category_key: 'coalition',
    claim_summary: 'Listed as an official member of the Wyoming Freedom Caucus for 2026.',
    evidence_weight: 4,
  },
  // CORE-2026 legislation package
  'reference_set:CORE-2026': {
    category_key: 'issue_alignment',
    claim_summary:
      'Associated with the CORE-2026 bill package — legislation prioritized by the Wyoming Freedom Caucus.',
    evidence_weight: 3,
  },
  // Better Wyoming Accountability Report donor network
  'source:DONOR-BWAR-2026': {
    category_key: 'accountability',
    claim_summary:
      'Noted in Better Wyoming Accountability Report donor-network data.',
    evidence_weight: 2,
  },
};

// Inherited verification_status from the source row unless overridden here
const VERIFICATION_OVERRIDE = {
  'candidate_network:OFFICIAL-WYFC-2026': null, // use row's own status
  'reference_set:CORE-2026': null,
  'source:DONOR-BWAR-2026': null,
};

// ── Fetch source rows ────────────────────────────────────────────────────────

function d1Query(sql) {
  const oneLiner = sql.replace(/\s+/g, ' ').trim();
  const raw = execSync(
    `npx wrangler d1 execute wy --remote --json --command ${JSON.stringify(oneLiner)}`,
    { cwd: '/home/anchor/projects/skovgard2026/Candidates', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const parsed = JSON.parse(raw);
  return parsed[0]?.results ?? [];
}

const sourceRows = d1Query(`
  SELECT candidate_id, reference_key, reference_kind, verification_status
  FROM guide_candidate_reference_links
  WHERE candidate_id IS NOT NULL
    AND reference_kind != 'verification_flag'
  ORDER BY candidate_id, reference_kind, reference_key
`);

console.log(`Found ${sourceRows.length} source rows to process.`);

// ── Build INSERT statements ──────────────────────────────────────────────────

const inserts = [];

for (const row of sourceRows) {
  const mapKey = `${row.reference_kind}:${row.reference_key}`;
  const mapping = CATEGORY_MAP[mapKey];
  if (!mapping) {
    console.warn(`  SKIP — no category mapping for: ${mapKey} (candidate_id=${row.candidate_id})`);
    continue;
  }

  const vStatus =
    VERIFICATION_OVERRIDE[mapKey] !== null && VERIFICATION_OVERRIDE[mapKey] !== undefined
      ? VERIFICATION_OVERRIDE[mapKey]
      : row.verification_status;

  inserts.push({
    candidate_id: row.candidate_id,
    category_key: mapping.category_key,
    reference_kind: row.reference_kind,
    reference_key: row.reference_key,
    claim_summary: mapping.claim_summary,
    evidence_weight: mapping.evidence_weight,
    ballot_visible: 0,
    display_publicly: 1,
    verification_status: vStatus,
  });
}

console.log(`\nPrepared ${inserts.length} rubric evidence link inserts.`);

// Group by candidate for display
const byCand = {};
for (const r of inserts) {
  (byCand[r.candidate_id] = byCand[r.candidate_id] || []).push(r);
}
for (const [cid, rows] of Object.entries(byCand)) {
  console.log(`  candidate_id=${cid}: ${rows.map((r) => `${r.category_key}/${r.reference_key}`).join(', ')}`);
}

if (DRY_RUN) {
  console.log('\n[dry-run] No changes written.');
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

let totalChanges = 0;

for (const r of inserts) {
  const sql = `
INSERT INTO guide_rubric_evidence_links
  (candidate_id, category_key, reference_kind, reference_key,
   claim_summary, evidence_weight, ballot_visible, display_publicly,
   verification_status, created_at, updated_at)
VALUES
  (${r.candidate_id}, '${r.category_key}', '${r.reference_kind}', '${r.reference_key}',
   '${r.claim_summary.replace(/'/g, "''")}', ${r.evidence_weight},
   ${r.ballot_visible}, ${r.display_publicly},
   '${r.verification_status}', '${now}', '${now}')
ON CONFLICT(candidate_id, category_key, reference_kind, reference_key) DO NOTHING;
  `.trim();

  const res = d1Query(sql);
  // d1 execute with --json returns meta.changes on write statements wrapped differently
  // just count rows returned (0 for DO NOTHING, meta tracked separately)
  totalChanges++;
  process.stdout.write('.');
}

console.log(`\n\nDone. Applied ${totalChanges} statements.`);

// ── Verification ─────────────────────────────────────────────────────────────

const verify = d1Query(`
  SELECT candidate_id, category_key, reference_key, verification_status, ballot_visible
  FROM guide_rubric_evidence_links
  ORDER BY candidate_id, category_key, reference_key
  LIMIT 60
`);

console.log(`\nguide_rubric_evidence_links now has ${verify.length}+ rows:`);
for (const r of verify) {
  console.log(
    `  [cand=${r.candidate_id}] ${r.category_key}/${r.reference_key} verif=${r.verification_status} ballot_visible=${r.ballot_visible}`
  );
}
