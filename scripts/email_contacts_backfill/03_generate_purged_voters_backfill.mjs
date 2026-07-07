#!/usr/bin/env node
// scripts/email_contacts_backfill/03_generate_purged_voters_backfill.mjs
//
// Phase 2 addendum to docs/db/EmailConsolidationPlan.md: brings in the
// "purged_voter" bucket -- v_unique_name_email_all rows with is_stale=1 that
// 02_generate_wy_db_backfill.mjs deliberately excluded. These are people whose
// email/name we have but who don't currently match an active voter in the
// Aug 2025 registry snapshot. That does NOT mean they're confirmed purged for
// non-voting -- as of this run, 0 of them carry stale_reason
// 'voter_status_not_active_in_snapshot' (a real matched-but-inactive voter);
// the actual split is ~41.8k with no voter_id match at all and ~5.3k whose
// matched voter_id simply isn't in the snapshot (moved, deceased, or genuinely
// removed -- indistinguishable from here). "purged_voter" is our own working
// label for "worth re-checking with the county clerk," not a verified status.
//
// Priority 0 (lowest, below voter_file=1) -- this data never overwrites a
// higher-confidence contact, it only adds a purpose tag / fills gaps.
//
// Usage:
//   node scripts/email_contacts_backfill/03_generate_purged_voters_backfill.mjs \
//     --input <path to wy_purged_voters_raw.json> --out <path> [--batch-size 150]

import fs from "node:fs";

function parseArgs(argv) {
  const args = { batchSize: 150 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--input") args.input = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--batch-size") args.batchSize = Number(argv[++i]);
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sqlValue(value) {
  const text = normalizeText(value);
  if (!text) return "NULL";
  return `'${text.replaceAll("'", "''")}'`;
}

const CONFLICT_UPDATE_SET = `
  first_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.first_name, '')) = '' THEN excluded.first_name ELSE email_contacts.first_name END,
  last_name = CASE WHEN excluded.source_priority >= email_contacts.source_priority OR TRIM(COALESCE(email_contacts.last_name, '')) = '' THEN excluded.last_name ELSE email_contacts.last_name END,
  lalvoterid = COALESCE(email_contacts.lalvoterid, excluded.lalvoterid),
  consent_status = CASE
    WHEN email_contacts.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.consent_status = 'opted_out' THEN 'opted_out'
    WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_status
    ELSE email_contacts.consent_status
  END,
  source = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source ELSE email_contacts.source END,
  source_detail = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source_detail ELSE email_contacts.source_detail END,
  source_priority = MAX(email_contacts.source_priority, excluded.source_priority),
  updated_at = datetime('now')`;

function buildContactRow({ email, emailNorm, firstName, lastName, lalvoterid, sourceDetail }) {
  return `(${sqlValue(email)}, ${sqlValue(emailNorm)}, 'no_signal', ${sqlValue(firstName)}, ${sqlValue(lastName)}, ${sqlValue(lalvoterid)}, 'email_contacts_backfill', ${sqlValue(sourceDetail)}, 0, datetime('now'), datetime('now'))`;
}

function emitContactBatches(contacts, batchSize) {
  const statements = [];
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    statements.push(
      `INSERT INTO email_contacts (email, email_norm, consent_status, first_name, last_name, lalvoterid, source, source_detail, source_priority, first_seen_at, updated_at)\nVALUES\n${batch
        .map(buildContactRow)
        .join(",\n")}\nON CONFLICT(email_norm) DO UPDATE SET${CONFLICT_UPDATE_SET};`
    );
  }
  return statements;
}

function emitPurposeBatches(emailNorms, batchSize) {
  const statements = [];
  for (let i = 0; i < emailNorms.length; i += batchSize) {
    const batch = emailNorms.slice(i, i + batchSize);
    statements.push(
      `INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)\nSELECT ec.id, 'purged_voter', 'v_unique_name_email_all:is_stale'\nFROM email_contacts ec\nWHERE ec.email_norm IN (${batch.map(sqlValue).join(", ")});`
    );
  }
  return statements;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.out) {
  console.error("Usage: node 03_generate_purged_voters_backfill.mjs --input <path> --out <path>");
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(args.input, "utf8"));
const rawRows = parsed[0]?.results ?? [];

const byEmail = new Map();
const reasonCounts = {};
for (const row of rawRows) {
  const emailNorm = normalizeText(row.email_norm).toLowerCase();
  if (!emailNorm) continue;
  reasonCounts[row.stale_reason] = (reasonCounts[row.stale_reason] || 0) + 1;
  byEmail.set(emailNorm, {
    email: emailNorm,
    emailNorm,
    firstName: normalizeText(row.first_name),
    lastName: normalizeText(row.last_name),
    lalvoterid: normalizeText(row.lalvoterid),
    sourceDetail: "v_unique_name_email_all:is_stale",
  });
}

const contacts = [...byEmail.values()];
const statements = [
  "-- Generated by scripts/email_contacts_backfill/03_generate_purged_voters_backfill.mjs -- do not commit this file's output.",
  ...emitContactBatches(contacts, args.batchSize),
  ...emitPurposeBatches([...byEmail.keys()], args.batchSize),
];

fs.writeFileSync(args.out, `${statements.join("\n\n")}\n`);

console.error(
  JSON.stringify(
    { rowsRead: rawRows.length, uniqueEmails: byEmail.size, reasonCounts, statementsWritten: statements.length - 1, outFile: args.out },
    null,
    2
  )
);
