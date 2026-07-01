#!/usr/bin/env node
// seed_freedom_caucus_links.mjs
// Seeds guide_candidate_reference_links from freedom-caucus-network-2026.md.
// Includes identity columns added in migration 0018.
//
// Usage (dry run — prints SQL):
//   node Candidates/scripts/seed_freedom_caucus_links.mjs --dry-run
//
// Usage (apply to remote wy D1):
//   SCRATCH=/tmp && node Candidates/scripts/seed_freedom_caucus_links.mjs > $SCRATCH/fc_seed.sql \
//     && npx wrangler d1 execute wy --env production --remote --file=$SCRATCH/fc_seed.sql
//
// Match notes:
//   Chip Neiman     — doc says HD01; running for SD1 in 2026. D1 reflects 2026 Senate race.
//   Ken Pendergraft — doc says HD29; running for SD21 in 2026. D1 reflects 2026 Senate race.
//   Paul Hoeft      — doc says HD25; running for SD19 in 2026. D1 reflects 2026 Senate race.
//   Rachel Rodriguez-Williams — SOS name: Rachel Williams. candidate_id=27, statewide (SOS). Source key stays as Rachel Rodriguez-Williams.
//   Scott Smith     — SOS: State Treasurer. candidate_id=32, statewide. Was tracked as HD05.
//   John Winter     — Not on 2026 SOS roster. NOT-RUNNING-2026 + VERIFY-ROSTER flags.

function q(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

const now = new Date().toISOString();

// ── Member data ────────────────────────────────────────────────────────────
// candidateName  = stable source key (used in UNIQUE constraint)
// currentName    = current SOS roster name for voter-facing use
// sourceNames    = prior/alias names as JS array (serialized to JSON)
// id, slug       = resolved from wy D1 candidates table
// level          = wy_house | wy_senate | statewide
// district       = INTEGER or null for statewide
// officeSought   = null if running for same level seat; 'Secretary of State' etc. if changed
// nameNote       = alias explanation
// officeStatusNote = not-running or status note
// verifyFlags    = additional verification_flag reference_key values to insert
const MEMBERS = [
  {
    candidateName: 'Rachel Rodriguez-Williams',
    currentName: 'Rachel Williams',
    sourceNames: ['Rachel Rodriguez-Williams'],
    id: 27, slug: 'rachel-williams',
    level: 'statewide', district: null, community: 'Cody area',
    officeSought: 'Secretary of State',
    nameNote: 'Use Rachel Williams for the 2026 Secretary of State race. Rachel Rodriguez-Williams is retained as source/alias (WYFC/BWAR pages still use that name).',
    officeStatusNote: 'Candidate for Secretary of State in 2026.',
    accountabilityUrl: 'https://betterwyo.org/park-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, chair of the Wyoming Freedom Caucus, Bextel personal-donation recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page still lists as Chairman Representative Rachel Rodriguez-Williams.',
    hasBwar: true,
    verifyFlags: ['ALIAS-SOS-ROSTER'],
  },
  {
    candidateName: 'Jeremy Haroldson',
    currentName: 'Jeremy Haroldson',
    sourceNames: ['Jeremy Haroldson'],
    id: 80, slug: 'jeremy-haroldson',
    level: 'wy_house', district: 4, community: 'Wheatland',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/laramie-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Speaker Pro Tempore, Vice Chairman, and a possible future donation recipient.',
    officialNote: 'Official page lists as Representative Jeremy Haroldson, founding member and Vice Chairman.',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Scott Heiner',
    currentName: 'Scott Heiner',
    sourceNames: ['Scott Heiner'],
    id: 108, slug: 'scott-heiner',
    level: 'wy_house', district: 18, community: 'Green River',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/sweetwater-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Majority Floor Leader, and a possible future donation recipient.',
    officialNote: 'Official page lists as Representative Scott Heiner, founding member.',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Pepper Ottman',
    currentName: 'Pepper Ottman',
    sourceNames: ['Pepper Ottman'],
    id: 139, slug: 'pepper-l-ottman',
    level: 'wy_house', district: 34, community: 'Riverton',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/fremont-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, chairwoman of the House Labor Health Committee, possible future donation recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative Pepper Ottman, founding member. (D1 full_name: Pepper L Ottman)',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'John Bear',
    currentName: 'John Bear',
    sourceNames: ['John Bear'],
    id: 136, slug: 'john-w-bear',
    level: 'wy_house', district: 31, community: 'Gillette',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/campbell-26-post-session-copy/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Appropriations chairman, former caucus chairman, session-check recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Emeritus Chairman Representative John Bear. (D1 full_name: John W. Bear)',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Chip Neiman',
    currentName: 'Chip Neiman',
    sourceNames: ['Chip Neiman'],
    id: 38, slug: 'chip-neiman',
    level: 'wy_senate', district: 1, community: 'Hulett',
    officeSought: null, nameNote: null, officeStatusNote: 'Running for SD1 in 2026; was House Speaker (HD1). D1 reflects 2026 Senate race.',
    accountabilityUrl: 'https://betterwyo.org/crook-26-post-session-copy/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, Speaker of the House, session-check recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Speaker of the House Chip Neiman. (Running for SD1 in 2026; was HD1 incumbent.)',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Tomi Strock',
    currentName: 'Tomi Strock',
    sourceNames: ['Tomi Strock'],
    id: 84, slug: 'tomi-strock',
    level: 'wy_house', district: 6, community: 'Douglas',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/natrona-26-post-session/',
    bwarNote: 'BWAR PAC-support section labels Strock as Freedom Caucus follower; official caucus page lists as member. Label difference flagged.',
    officialNote: 'Official page lists as Representative Tomi Strock.',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Chris Knapp',
    currentName: 'Chris Knapp',
    sourceNames: ['Chris Knapp'],
    id: 178, slug: 'christopher-r-knapp',
    level: 'wy_house', district: 53, community: 'Gillette',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/campbell-26-post-session-copy/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Corporations Committee chairman, session-check recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative Chris Knapp, founding member. (D1 full_name: Christopher R Knapp)',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Ken Pendergraft',
    currentName: 'Ken Pendergraft',
    sourceNames: ['Ken Pendergraft'],
    id: 61, slug: 'ken-pendergraft',
    level: 'wy_senate', district: 21, community: 'Sheridan',
    officeSought: null, nameNote: null, officeStatusNote: 'Running for SD21 in 2026; was HD29 incumbent. D1 reflects 2026 Senate race.',
    accountabilityUrl: 'https://betterwyo.org/sheridan-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Appropriations vice chairman, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative Ken Pendergraft, vice chair of Appropriations. (Running for SD21 in 2026; was HD29 incumbent.)',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Scott Smith',
    currentName: 'Scott Smith',
    sourceNames: ['Scott Smith'],
    id: 32, slug: 'scott-smith',
    level: 'statewide', district: null, community: 'Former HD05 Lingle area',
    officeSought: 'State Treasurer',
    nameNote: null,
    officeStatusNote: 'Candidate for State Treasurer in 2026. Previously tracked as HD05 House member.',
    accountabilityUrl: 'https://betterwyo.org/crook-26-post-session-copy/',
    bwarNote: 'BWAR PAC-support section labels as Freedom Caucus member. District/community mismatch between BWAR and Better Wyoming county report noted.',
    officialNote: 'Official page lists as Representative Scott Smith. (Running for State Treasurer in 2026; was HD05 Lingle.)',
    hasBwar: true, verifyFlags: ['VERIFY-DISTRICT', 'STATEWIDE-2026'],
  },
  {
    candidateName: 'Bill Allemand',
    currentName: 'Bill Allemand',
    sourceNames: ['Bill Allemand'],
    id: 188, slug: 'bill-allemand',
    level: 'wy_house', district: 58, community: 'Midwest / Natrona area',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/natrona-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus member, possible future donation recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative Bill Allemand.',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'John Winter',
    currentName: 'John Winter',
    sourceNames: ['John Winter'],
    id: null, slug: null,
    level: 'wy_house', district: 28, community: 'Thermopolis',
    officeSought: 'Not running / verify',
    nameNote: null,
    officeStatusNote: 'Not listed on 2026 SOS primary roster. Retiring or stepping aside. Verify before publication.',
    accountabilityUrl: 'https://betterwyo.org/park-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus leader, House Agriculture Committee chairman, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative John Winter, founding member. Not found in 2026 HD28 filings.',
    hasBwar: true, verifyFlags: ['NOT-RUNNING-2026', 'VERIFY-ROSTER'],
  },
  {
    candidateName: 'Joe Webb',
    currentName: 'Joe Webb',
    sourceNames: ['Joe Webb'],
    id: 110, slug: 'joe-webb',
    level: 'wy_house', district: 19, community: 'Lyman',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/uinta-26-post-session/',
    bwarNote: 'BWAR labels Webb as Freedom Caucus member in session-check section and Freedom Caucus follower in personal-donation and PAC-support sections. Label difference flagged.',
    officialNote: 'Official page lists as Representative Joe Webb.',
    hasBwar: true, verifyFlags: ['VERIFY-LABEL'],
  },
  {
    candidateName: 'Ann Lucas',
    currentName: 'Ann Lucas',
    sourceNames: ['Ann Lucas'],
    id: 159, slug: 'ann-lucas',
    level: 'wy_house', district: 43, community: 'Cheyenne',
    officeSought: null, nameNote: null, officeStatusNote: null,
    accountabilityUrl: 'https://betterwyo.org/laramie-26-post-session/',
    bwarNote: 'BWAR labels as Freedom Caucus member, possible future donation recipient, Bextel personal-donation recipient, and WY Freedom PAC-supported lawmaker.',
    officialNote: 'Official page lists as Representative Ann Lucas.',
    hasBwar: true, verifyFlags: [],
  },
  {
    candidateName: 'Paul Hoeft',
    currentName: 'Paul Hoeft',
    sourceNames: ['Paul Hoeft'],
    id: 59, slug: 'paul-hoeft',
    level: 'wy_senate', district: 19, community: 'Powell',
    officeSought: null, nameNote: null, officeStatusNote: 'Running for SD19 in 2026; was HD25 incumbent. D1 reflects 2026 Senate race.',
    accountabilityUrl: 'https://betterwyo.org/park-26-post-session/',
    bwarNote: null,
    officialNote: 'Official page lists as Representative Paul Hoeft. No BWAR entry found. (Running for SD19 in 2026; was HD25 incumbent.)',
    hasBwar: false, verifyFlags: [],
  },
];

// ── SQL generation ─────────────────────────────────────────────────────────

function insertRow(m, refKey, refKind, claimSummary, sourceUrl, verifyStatus) {
  const sourcesJson = JSON.stringify(m.sourceNames);
  return (
    `INSERT INTO guide_candidate_reference_links ` +
    `(candidate_id, candidate_slug, candidate_name, current_candidate_name, source_candidate_name, source_names_json, ` +
    `office_level, district, community, office_sought_2026, name_note, office_status_note, ` +
    `reference_key, reference_kind, claim_summary, source_url, verification_status, created_at, updated_at) VALUES ` +
    `(${q(m.id)}, ${q(m.slug)}, ${q(m.candidateName)}, ${q(m.currentName)}, ${q(m.sourceNames[0])}, ${q(sourcesJson)}, ` +
    `${q(m.level)}, ${q(m.district)}, ${q(m.community)}, ${q(m.officeSought)}, ${q(m.nameNote)}, ${q(m.officeStatusNote)}, ` +
    `${q(refKey)}, ${q(refKind)}, ${q(claimSummary)}, ${q(sourceUrl)}, ${q(verifyStatus)}, ${q(now)}, ${q(now)}) ` +
    `ON CONFLICT(candidate_name, reference_key, reference_kind) DO NOTHING;`
  );
}

const sql = [];
sql.push('-- guide_candidate_reference_links — Freedom Caucus network seed (with identity columns)');

for (const m of MEMBERS) {
  const baseVerify = m.id === null ? 'needs_candidate_match' : 'needs_official_verification';

  // Official caucus membership row
  sql.push(insertRow(
    m, 'OFFICIAL-WYFC-2026', 'candidate_network',
    m.officialNote,
    'https://wyfreedomcaucus.com/members/',
    m.id === null ? 'needs_candidate_match' : 'verified',
  ));

  // CORE-2026 reference set row
  sql.push(insertRow(
    m, 'CORE-2026', 'reference_set',
    'Better Wyoming 2026 vote-note package tracking.',
    m.accountabilityUrl,
    baseVerify,
  ));

  // BWAR donor network row (Paul Hoeft has no BWAR entry)
  if (m.hasBwar && m.bwarNote) {
    sql.push(insertRow(
      m, 'DONOR-BWAR-2026', 'source',
      m.bwarNote,
      'https://bwar.vote/bextel-bucks/',
      baseVerify,
    ));
  }

  // Verification flag rows
  for (const flag of (m.verifyFlags || [])) {
    sql.push(insertRow(
      m, flag, 'verification_flag',
      `Source flag: ${flag}. Requires review before publication.`,
      null,
      'draft',
    ));
  }
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  process.stdout.write('-- DRY RUN: review SQL below before applying\n');
}
process.stdout.write(sql.join('\n') + '\n');
