#!/usr/bin/env node
// scripts/test_voter_blast.mjs
// Verifies voter blast query counts for all targeting flows and tests the
// send-chunk pipeline without sending real text messages.
//
// Usage:
//   ADMIN_KEY=<key> ACTOR_EMAIL=<email> node scripts/test_voter_blast.mjs
//
// Optional env vars:
//   API_BASE=https://skovgard2026.org   (default)
//   SKIP_DRY_RUN=1                      skip the send-chunk pipeline test

import { execSync } from 'child_process';

const ADMIN_KEY   = process.env.ADMIN_KEY   || '';
const ACTOR_EMAIL = process.env.ACTOR_EMAIL || 'test@skovgard2026.org';
// Use www.skovgard2026.org — the bare domain redirects (301) to www, which
// converts POST to GET on redirect and breaks the job creation endpoint.
const API_BASE    = process.env.API_BASE    || 'https://www.skovgard2026.org';
const SKIP_DRY_RUN = process.env.SKIP_DRY_RUN === '1';

// Probe text used in preview calls — does not generate an actual send.
const PROBE_TEXT = 'Test blast — verification run only. Do not send.';

if (!ADMIN_KEY) {
  console.error('\nError: ADMIN_KEY environment variable is required.\n');
  process.exit(1);
}

// ── Test scenarios ────────────────────────────────────────────────────────────
// Each scenario is tested with two independent counts:
//   1. Direct SQL against WY_DB via wrangler
//   2. The /api/admin/voter-blast/preview endpoint
// Counts must match exactly.
// Party values must match WY_DB political_party column: "Republican", "Democratic", "Unaffiliated"
// District values are sent as plain integers ("8", "4"); buildVoterBlastWhere pads them to "08", "04"
const COUNT_SCENARIOS = [
  { name: 'Statewide',                   county: null,       city: null,       party: null,           district_type: null,     district: null },
  { name: 'Statewide + Republican',      county: null,       city: null,       party: 'Republican',   district_type: null,     district: null },
  { name: 'County: Laramie',             county: 'LARAMIE',  city: null,       party: null,           district_type: null,     district: null },
  { name: 'County: Laramie + Rep',       county: 'LARAMIE',  city: null,       party: 'Republican',   district_type: null,     district: null },
  { name: 'City: Cheyenne',              county: null,       city: 'CHEYENNE', party: null,           district_type: null,     district: null },
  { name: 'City: Cheyenne + Dem',        county: null,       city: 'CHEYENNE', party: 'Democratic',   district_type: null,     district: null },
  { name: 'House District 8',            county: null,       city: null,       party: null,           district_type: 'house',  district: '8'  },
  { name: 'House District 8 + Rep',      county: null,       city: null,       party: 'Republican',   district_type: 'house',  district: '8'  },
  { name: 'Senate District 4',           county: null,       city: null,       party: null,           district_type: 'senate', district: '4'  },
  { name: 'Senate District 4 + Rep',     county: null,       city: null,       party: 'Republican',   district_type: 'senate', district: '4'  },
];

// Dry-run scenario: smallest expected audience to keep log entries minimal.
const DRY_RUN_SCENARIO = {
  name:          'HD-1 dry run',
  county:        null,
  city:          null,
  party:         null,
  district_type: 'house',
  district:      '1',
};

// ── Mirror of worker buildVoterBlastWhere ─────────────────────────────────────
// Values are hardcoded constants (not user input), so inline SQL is safe here.
function buildWhere({ county, city, party, district_type, district }) {
  const cond = ['vbp.phone_e164 IS NOT NULL'];
  if (county)                                cond.push(`v.county = '${county}'`);
  if (city)                                  cond.push(`van.city = '${city}'`);
  if (party)                                 cond.push(`v.political_party = '${party}'`);
  if (district_type === 'house'  && district) cond.push(`v.house = '${String(district).padStart(2, '0')}'`);
  if (district_type === 'senate' && district) cond.push(`v.senate = '${String(district).padStart(2, '0')}'`);
  return `WHERE ${cond.join(' AND ')}`;
}

// ── D1 direct count ───────────────────────────────────────────────────────────
function d1DirectCount(scenario) {
  const where = buildWhere(scenario);
  const sql = `SELECT COUNT(*) AS cnt FROM voters v JOIN v_best_phone vbp ON vbp.voter_id=v.voter_id JOIN voters_addr_norm van ON van.voter_id=v.voter_id ${where}`;

  const raw = execSync(
    `npx wrangler d1 execute wy --env production --remote --command "${sql}" 2>/dev/null`,
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  );

  // Extract the JSON array — wrangler may emit banner text before it
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Unexpected wrangler output — no JSON array found');
  const parsed = JSON.parse(match[0]);
  const cnt = parsed[0]?.results?.[0]?.cnt;
  if (cnt === undefined) throw new Error('No cnt in D1 result');
  return Number(cnt);
}

// ── Preview API count ─────────────────────────────────────────────────────────
async function apiPreviewCount(scenario) {
  const p = new URLSearchParams({ text: PROBE_TEXT });
  if (scenario.county)        p.set('county',        scenario.county);
  if (scenario.city)          p.set('city',          scenario.city);
  if (scenario.party)         p.set('party',         scenario.party);
  if (scenario.district_type) p.set('district_type', scenario.district_type);
  if (scenario.district)      p.set('district',      scenario.district);
  p.set('key',          ADMIN_KEY);
  p.set('actor_email',  ACTOR_EMAIL);

  const res  = await fetch(`${API_BASE}/api/admin/voter-blast/preview?${p}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return { total: Number(data.total ?? -1), previewToken: data.preview?.token, issuedAt: data.preview?.issuedAt };
}

// ── Dry-run pipeline test ─────────────────────────────────────────────────────
async function runDryRunPipeline(scenario) {
  // 1. Preview to get token
  const preview = await apiPreviewCount(scenario);
  if (preview.total === 0) return { skipped: true, reason: 'zero audience' };

  // ── helpers to surface non-JSON responses clearly ──
  const safeJson = async (res, label) => {
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 300)}`); }
  };

  // URLSearchParams percent-encodes special chars in the key (e.g. # would
  // be silently stripped as a URL fragment if interpolated directly).
  const authParams = new URLSearchParams({ key: ADMIN_KEY, actor_email: ACTOR_EMAIL });

  // 2. Create job
  const jobRes  = await fetch(`${API_BASE}/api/admin/voter-blast/job?${authParams}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      county:            scenario.county,
      city:              scenario.city,
      party:             scenario.party,
      district_type:     scenario.district_type,
      district:          scenario.district,
      text:              PROBE_TEXT,
      preview_token:     preview.previewToken,
      preview_issued_at: preview.issuedAt,
    }),
  });
  const jobData = await safeJson(jobRes, 'Job create');
  if (!jobRes.ok) throw new Error(`Job create: ${jobData.error || jobRes.status}`);
  const blastId = jobData.blast_id;

  // 3. Run one dry-run chunk
  const chunkRes  = await fetch(`${API_BASE}/api/admin/voter-blast/send-chunk?${authParams}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blast_id: blastId, dry_run: true }),
  });
  const chunkData = await safeJson(chunkRes, 'send-chunk');
  if (!chunkRes.ok) throw new Error(`Chunk: ${chunkData.error || chunkRes.status}`);

  return {
    blastId,
    totalAudience: jobData.total_audience,
    chunkSent:     chunkData.sent,
    chunkDone:     chunkData.done,
    totalSent:     chunkData.total_sent,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pass(label, detail) { console.log(`  ✓  ${label.padEnd(30)} ${detail}`); }
function fail(label, detail) { console.log(`  ✗  ${label.padEnd(30)} ${detail}`); }
function note(label, detail) { console.log(`  –  ${label.padEnd(30)} ${detail}`); }
function hr()                { console.log(`  ${'─'.repeat(62)}`); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n  Voter Blast — Test Suite\n  ${API_BASE}\n`);

  let passed = 0, failed = 0;

  // ── Phase 1: Count verification ───────────────────────────────────────────
  console.log('  Phase 1 · Count verification (D1 direct vs. preview API)\n');

  for (const s of COUNT_SCENARIOS) {
    try {
      const d1Count = d1DirectCount(s);
      const { total: apiCount } = await apiPreviewCount(s);

      if (d1Count === apiCount) {
        pass(s.name, `${d1Count.toLocaleString()} voters`);
        passed++;
      } else {
        const delta = apiCount - d1Count;
        fail(s.name, `D1=${d1Count.toLocaleString()}  API=${apiCount.toLocaleString()}  delta=${delta >= 0 ? '+' : ''}${delta}`);
        failed++;
      }
    } catch (e) {
      fail(s.name, `ERROR: ${e.message}`);
      failed++;
    }
  }

  // ── Phase 2: Dry-run pipeline ─────────────────────────────────────────────
  hr();
  if (SKIP_DRY_RUN) {
    note('Dry-run pipeline', 'skipped (SKIP_DRY_RUN=1)');
  } else {
    console.log(`\n  Phase 2 · Dry-run send pipeline (${DRY_RUN_SCENARIO.name})\n`);
    console.log('  Creates a real job record and runs one chunk with dry_run=true.');
    console.log('  No text messages are sent. Log entries have status=dry_run.\n');

    try {
      const result = await runDryRunPipeline(DRY_RUN_SCENARIO);

      if (result.skipped) {
        note('Dry-run pipeline', `skipped — ${result.reason}`);
      } else {
        pass('Job created',    result.blastId);
        pass('Audience count', `${result.totalAudience.toLocaleString()} voters`);

        if (result.chunkSent > 0) {
          pass('Chunk processed', `${result.chunkSent} dry-run log entries written`);
          passed++;
        } else {
          fail('Chunk processed', 'chunkSent=0 — expected at least 1 log entry');
          failed++;
        }

        if (result.chunkDone || result.totalAudience > 20) {
          pass('Offset behavior', result.chunkDone ? 'done=true (audience ≤ 20)' : `done=false — ${result.totalAudience - 20}+ voters remain`);
          passed++;
        } else {
          fail('Offset behavior', `Unexpected: done=${result.chunkDone}, audience=${result.totalAudience}`);
          failed++;
        }

        console.log(`\n  Verify log entries in D1:`);
        console.log(`  npx wrangler d1 execute ballot_sources --env production --remote \\`);
        console.log(`    --command "SELECT status, COUNT(*) n FROM voter_blast_log WHERE blast_id='${result.blastId}' GROUP BY status"`);
      }
    } catch (e) {
      fail('Dry-run pipeline', `ERROR: ${e.message}`);
      failed++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  hr();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
