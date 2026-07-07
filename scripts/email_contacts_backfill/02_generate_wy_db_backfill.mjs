#!/usr/bin/env node
// scripts/email_contacts_backfill/02_generate_wy_db_backfill.mjs
//
// Phase 2 backfill of email_contacts (docs/db/EmailConsolidationPlan.md) from
// the two WY_DB sources that can't be reached with a live cross-database
// query: candidates and the voter-file view. D1 bindings can't join across
// databases, so this reads pre-fetched JSON exports (see step 1 below),
// dedupes/merges in memory, and emits batched INSERT ... ON CONFLICT SQL to
// apply against ballot_sources.
//
// Priority order (docs/db/EmailConsolidationPlan.md): candidate = 2,
// voter_file = 1 (both below subscriber=4 / volunteer=3 from same-DB sources).
//
// Usage:
//   1. Export sources from WY_DB (already done for this run):
//      npx wrangler d1 execute wy --remote --env production --json --command "..." > wy_candidates_raw.json
//      npx wrangler d1 execute wy --remote --env production --json --command "..." > wy_voter_file_raw.json
//   2. node scripts/email_contacts_backfill/02_generate_wy_db_backfill.mjs \
//        --candidates <path> --voter-file <path> --out <path> [--batch-size 500]

import fs from "node:fs";

function parseArgs(argv) {
  const args = { batchSize: 500 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--candidates") args.candidates = argv[++i];
    else if (key === "--voter-file") args.voterFile = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--batch-size") args.batchSize = Number(argv[++i]);
  }
  return args;
}

function loadRows(path) {
  const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  return parsed[0]?.results ?? [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
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

function buildContactRow({ email, emailNorm, consentStatus, firstName, lastName, lalvoterid, sourceDetail, priority }) {
  return `(${sqlValue(email)}, ${sqlValue(emailNorm)}, ${sqlValue(consentStatus)}, ${sqlValue(firstName)}, ${sqlValue(lastName)}, ${sqlValue(lalvoterid)}, 'email_contacts_backfill', ${sqlValue(sourceDetail)}, ${priority}, datetime('now'), datetime('now'))`;
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

function emitPurposeBatches(emailNorms, purpose, source, batchSize) {
  const statements = [];
  for (let i = 0; i < emailNorms.length; i += batchSize) {
    const batch = emailNorms.slice(i, i + batchSize);
    statements.push(
      `INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)\nSELECT ec.id, ${sqlValue(purpose)}, ${sqlValue(source)}\nFROM email_contacts ec\nWHERE ec.email_norm IN (${batch.map(sqlValue).join(", ")});`
    );
  }
  return statements;
}

const args = parseArgs(process.argv.slice(2));
if (!args.candidates || !args.voterFile || !args.out) {
  console.error("Usage: node 02_generate_wy_db_backfill.mjs --candidates <path> --voter-file <path> --out <path>");
  process.exit(1);
}

const candidateRows = loadRows(args.candidates);
const voterFileRows = loadRows(args.voterFile);

// Candidates: priority 2, purpose 'candidate'. Suppressed emails are marked
// opted_out rather than dropped -- we still want a record that they exist.
const candidatesByEmail = new Map();
for (const row of candidateRows) {
  const emailNorm = normalizeEmail(row.email);
  if (!emailNorm) continue;
  candidatesByEmail.set(emailNorm, {
    email: normalizeText(row.email),
    emailNorm,
    consentStatus: Number(row.is_suppressed) === 1 ? "opted_out" : "no_signal",
    firstName: normalizeText(row.full_name),
    lastName: "",
    lalvoterid: "",
    sourceDetail: "candidates",
    priority: 2,
  });
}

// Voter file: priority 1, purpose 'voter_file'. lalvoterid is best-effort --
// most rows will carry one, some will not, and that's expected.
const voterFileByEmail = new Map();
for (const row of voterFileRows) {
  const emailNorm = normalizeEmail(row.email_norm);
  if (!emailNorm) continue;
  // Same email_norm can appear under more than one name variant in the source
  // view (grouped by name+email, not email alone) -- last one wins, which is
  // fine since every row in this source shares the same priority tier.
  voterFileByEmail.set(emailNorm, {
    email: emailNorm,
    emailNorm,
    consentStatus: "no_signal",
    firstName: normalizeText(row.first_name),
    lastName: normalizeText(row.last_name),
    lalvoterid: normalizeText(row.lalvoterid),
    sourceDetail: "v_unique_name_email_not_stale",
    priority: 1,
  });
}

const statements = [
  "-- Generated by scripts/email_contacts_backfill/02_generate_wy_db_backfill.mjs -- do not commit this file's output.",
  ...emitContactBatches([...voterFileByEmail.values()], args.batchSize),
  ...emitPurposeBatches([...voterFileByEmail.keys()], "voter_file", "v_unique_name_email_not_stale", args.batchSize),
  ...emitContactBatches([...candidatesByEmail.values()], args.batchSize),
  ...emitPurposeBatches([...candidatesByEmail.keys()], "candidate", "candidates", args.batchSize),
];

fs.writeFileSync(args.out, `${statements.join("\n\n")}\n`);

console.error(
  JSON.stringify(
    {
      candidateRowsRead: candidateRows.length,
      candidatesUniqueEmails: candidatesByEmail.size,
      voterFileRowsRead: voterFileRows.length,
      voterFileUniqueEmails: voterFileByEmail.size,
      statementsWritten: statements.length - 1,
      outFile: args.out,
    },
    null,
    2
  )
);
