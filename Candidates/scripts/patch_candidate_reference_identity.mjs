#!/usr/bin/env node
// patch_candidate_reference_identity.mjs
// One-time corrective patch for three guide_candidate_reference_links records
// updated after candidate_identity_overrides.yaml was added.
//
// Changes:
//   Rachel Rodriguez-Williams → matched to Rachel Williams (SOS candidate id=27)
//   Scott Smith               → matched to State Treasurer candidate (id=32)
//   John Winter               → flagged NOT-RUNNING-2026 + VERIFY-ROSTER
//
// Run (apply to remote wy D1):
//   node Candidates/scripts/patch_candidate_reference_identity.mjs \
//     > /tmp/patch_identity.sql \
//     && npx wrangler d1 execute wy --env production --remote --file=/tmp/patch_identity.sql

const now = new Date().toISOString();

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

const sql = [];

// ── Rachel Rodriguez-Williams ────────────────────────────────────────────────
// Current SOS name: Rachel Williams (candidates.id=27, statewide, SOS office_id=4)
// Source/WYFC name: Rachel Rodriguez-Williams (used as stable candidate_name key)

sql.push('-- Rachel Rodriguez-Williams → Rachel Williams (Secretary of State, id=27)');
sql.push(`UPDATE guide_candidate_reference_links SET
  candidate_id          = 27,
  office_level          = 'statewide',
  district              = NULL,
  community             = 'Cody area',
  current_candidate_name = 'Rachel Williams',
  source_candidate_name  = 'Rachel Rodriguez-Williams',
  source_names_json      = '["Rachel Rodriguez-Williams"]',
  office_sought_2026     = 'Secretary of State',
  name_note              = 'SOS roster: Rachel Williams. WYFC/BWAR pages still use Rachel Rodriguez-Williams.',
  office_status_note     = 'Running for Secretary of State in 2026.',
  verification_status    = 'needs_official_verification',
  updated_at             = ${q(now)}
WHERE candidate_name = 'Rachel Rodriguez-Williams';`);

// Add ALIAS-SOS-ROSTER verification flag for Rachel
sql.push(`INSERT INTO guide_candidate_reference_links
  (candidate_id, candidate_slug, candidate_name, current_candidate_name, source_candidate_name,
   office_level, district, community, reference_key, reference_kind, claim_summary,
   office_sought_2026, name_note, verification_status, created_at, updated_at)
VALUES
  (27, 'rachel-williams', 'Rachel Rodriguez-Williams', 'Rachel Williams', 'Rachel Rodriguez-Williams',
   'statewide', NULL, 'Cody area', 'ALIAS-SOS-ROSTER', 'verification_flag',
   'SOS 2026 roster uses Rachel Williams; WYFC/BWAR sources use Rachel Rodriguez-Williams. Use current name in voter-facing copy.',
   'Secretary of State',
   'SOS roster: Rachel Williams. WYFC/BWAR pages still use Rachel Rodriguez-Williams.',
   'verified', ${q(now)}, ${q(now)})
ON CONFLICT(candidate_name, reference_key, reference_kind) DO NOTHING;`);

// ── Scott Smith ──────────────────────────────────────────────────────────────
// State Treasurer candidate (candidates.id=32, statewide)
// Prior House role was HD05 — no longer a House candidate

sql.push('\n-- Scott Smith → State Treasurer (id=32), statewide');
sql.push(`UPDATE guide_candidate_reference_links SET
  candidate_id          = 32,
  office_level          = 'statewide',
  district              = NULL,
  community             = 'Former HD05 Lingle area',
  current_candidate_name = 'Scott Smith',
  source_candidate_name  = 'Scott Smith',
  source_names_json      = '["Scott Smith"]',
  office_sought_2026     = 'State Treasurer',
  office_status_note     = 'Running for State Treasurer in 2026. Previously tracked as HD05 House member.',
  verification_status    = 'needs_official_verification',
  updated_at             = ${q(now)}
WHERE candidate_name = 'Scott Smith';`);

// STATEWIDE-2026 flag for Scott Smith
sql.push(`INSERT INTO guide_candidate_reference_links
  (candidate_id, candidate_slug, candidate_name, current_candidate_name, source_candidate_name,
   office_level, district, community, reference_key, reference_kind, claim_summary,
   office_sought_2026, office_status_note, verification_status, created_at, updated_at)
VALUES
  (32, 'scott-smith', 'Scott Smith', 'Scott Smith', 'Scott Smith',
   'statewide', NULL, 'Former HD05 Lingle area', 'STATEWIDE-2026', 'verification_flag',
   'SOS roster confirms Scott Smith as State Treasurer candidate in 2026. Prior source tracking as HD05 House member is superseded.',
   'State Treasurer',
   'Running for State Treasurer in 2026.',
   'needs_official_verification', ${q(now)}, ${q(now)})
ON CONFLICT(candidate_name, reference_key, reference_kind) DO NOTHING;`);

// ── John Winter ──────────────────────────────────────────────────────────────
// Not on 2026 SOS primary roster — not running or retiring

sql.push('\n-- John Winter → NOT-RUNNING-2026 + VERIFY-ROSTER');
sql.push(`UPDATE guide_candidate_reference_links SET
  current_candidate_name = 'John Winter',
  source_candidate_name  = 'John Winter',
  office_sought_2026     = 'Not running / verify',
  office_status_note     = 'Not listed on 2026 SOS primary roster. Retiring or stepping aside. Verify before publication.',
  updated_at             = ${q(now)}
WHERE candidate_name = 'John Winter';`);

sql.push(`INSERT INTO guide_candidate_reference_links
  (candidate_id, candidate_slug, candidate_name, current_candidate_name, source_candidate_name,
   office_level, district, community, reference_key, reference_kind, claim_summary,
   office_sought_2026, office_status_note, verification_status, created_at, updated_at)
VALUES
  (NULL, NULL, 'John Winter', 'John Winter', 'John Winter',
   'wy_house', 28, 'Thermopolis', 'NOT-RUNNING-2026', 'verification_flag',
   'John Winter does not appear on the 2026 SOS primary candidate roster. HD28 race involves different candidates.',
   'Not running / verify',
   'Not listed on 2026 SOS primary roster.',
   'draft', ${q(now)}, ${q(now)})
ON CONFLICT(candidate_name, reference_key, reference_kind) DO NOTHING;`);

sql.push(`INSERT INTO guide_candidate_reference_links
  (candidate_id, candidate_slug, candidate_name, current_candidate_name, source_candidate_name,
   office_level, district, community, reference_key, reference_kind, claim_summary,
   office_sought_2026, office_status_note, verification_status, created_at, updated_at)
VALUES
  (NULL, NULL, 'John Winter', 'John Winter', 'John Winter',
   'wy_house', 28, 'Thermopolis', 'VERIFY-ROSTER', 'verification_flag',
   'Confirm roster status before publishing any 2026 election-context claim for this member.',
   'Not running / verify',
   'Not listed on 2026 SOS primary roster.',
   'draft', ${q(now)}, ${q(now)})
ON CONFLICT(candidate_name, reference_key, reference_kind) DO NOTHING;`);

process.stdout.write(sql.join('\n') + '\n');
