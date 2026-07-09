#!/usr/bin/env node
// scripts/seed_email_verification_queue.mjs
//
// One-time (but safe to re-run) seed for email_verification_queue
// (migration 029) -- the durable backlog the scheduled Cron Trigger in
// worker/src/index.js (runEmailVerificationBatch) works through, 25 at a
// time, every 2 minutes. See docs/blast_tracking.md.
//
// Three sources, unioned: (1) WY_DB v_unique_name_email_not_stale, all
// house districts -- same as verify_district_emails.mjs but with no
// district filter; (2) the legacy ballot_sources every_email CTE; (3)
// "purged_voter" email_contacts -- addresses that exist in the local
// contact system but never matched to a registered WY voter record (no
// district data anywhere, hence a separate source from (1)). Minus
// opt-outs, minus yahoo.com/aol.com/rtconnect.net/rangeweb.net
// (unverifiable/content-filtered -- no reason to spend a credit), minus
// anything already checked by a local verify_district_emails.mjs run
// (its .state.json files, if present). Safe to re-run any time a new
// source of addresses needs folding in -- INSERT OR IGNORE means it only
// ever adds rows, never touches ones already seeded/checked.
//
// Usage: ADMIN_KEY=<ADMIN_EXPORT_KEY> node scripts/seed_email_verification_queue.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const SKIP_VERIFICATION_DOMAINS = new Set(["yahoo.com", "aol.com", "rtconnect.net", "rangeweb.net"]);
const INSERT_BATCH_SIZE = 1000; // inlined literals, not bind params -- see docs/blast_tracking.md re: D1's 100-bind-param ceiling

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_DIR = path.join(__dirname, "..", "worker");

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("Set ADMIN_KEY (worker/.dev.vars ADMIN_EXPORT_KEY) before running this -- needed for wrangler d1 access.");
  process.exit(1);
}

function d1(database, sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", sql],
    { cwd: WORKER_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 100 }
  );
  return JSON.parse(out)[0].results || [];
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function loadLocalStateFiles() {
  const scriptsDir = path.join(__dirname);
  const checked = new Set();
  for (const f of fs.readdirSync(scriptsDir)) {
    if (!f.endsWith(".state.json") || !f.startsWith("verify_")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(scriptsDir, f), "utf8"));
      for (const email of Object.keys(data.checked || {})) checked.add(email);
    } catch {
      // ignore unreadable/partial state files
    }
  }
  return checked;
}

async function main() {
  console.log("Fetching WY_DB voter-file emails (all house districts)...");
  const wyRows = d1("wy", `SELECT email_norm FROM v_unique_name_email_not_stale`);
  console.log(`  ${wyRows.length} rows.`);

  console.log("Fetching legacy ballot_sources every_email candidates...");
  const legacyRows = d1(
    "ballot_sources",
    `WITH email_candidates AS (
       SELECT LOWER(TRIM(cs.email)) AS email_norm FROM consent_status cs WHERE TRIM(COALESCE(cs.email, '')) <> ''
       UNION
       SELECT ns.email_norm FROM newsletter_subscribers ns
        WHERE NOT EXISTS (SELECT 1 FROM consent_status cs WHERE LOWER(TRIM(COALESCE(cs.email, ''))) = ns.email_norm)
     ) SELECT email_norm FROM email_candidates`
  );
  console.log(`  ${legacyRows.length} rows.`);

  // "purged_voter" ("Unlinked" in the admin dropdown) -- email_contacts
  // whose ENTIRE purpose set is 'purged_voter': addresses that exist in the
  // local contact system but never matched to a registered WY voter record
  // (see EMAIL_CONTACTS_FILTERS / worker/src/index.js:1399). Completely
  // separate pool from WY_DB/legacy above -- these people have no district
  // data anywhere, which is exactly why countBlastAudienceTotal/
  // queryBlastAudienceChunk special-case this filter to return empty on any
  // geo combination rather than silently reading the wrong table.
  console.log("Fetching purged_voter (unmatched-to-voter-file) email_contacts...");
  const purgedVoterRows = d1(
    "ballot_sources",
    `SELECT DISTINCT ec.email_norm
       FROM email_contacts ec
      WHERE EXISTS (SELECT 1 FROM email_contact_purposes pv WHERE pv.email_contact_id = ec.id AND pv.purpose = 'purged_voter')
        AND NOT EXISTS (SELECT 1 FROM email_contact_purposes pv2 WHERE pv2.email_contact_id = ec.id AND pv2.purpose != 'purged_voter')`
  );
  console.log(`  ${purgedVoterRows.length} rows.`);

  console.log("Fetching opt-out list...");
  const optoutRows = d1(
    "ballot_sources",
    `SELECT LOWER(TRIM(email)) AS email_norm FROM consent_status WHERE consent_email = 0 AND TRIM(COALESCE(email, '')) != ''
     UNION SELECT email_norm FROM newsletter_subscribers WHERE consent_email = 0 OR active = 0
     UNION SELECT email_norm FROM email_suppressions`
  );
  const optoutSet = new Set(optoutRows.map((r) => r.email_norm));
  console.log(`  ${optoutSet.size} opted-out/suppressed.`);

  const alreadyChecked = loadLocalStateFiles();
  console.log(`  ${alreadyChecked.size} already checked via local district scripts.`);

  const merged = new Set();
  for (const r of wyRows) if (!optoutSet.has(r.email_norm)) merged.add(r.email_norm);
  for (const r of legacyRows) if (!optoutSet.has(r.email_norm)) merged.add(r.email_norm);
  for (const r of purgedVoterRows) if (!optoutSet.has(r.email_norm)) merged.add(r.email_norm);

  const toSeed = [...merged].filter(
    (e) => !SKIP_VERIFICATION_DOMAINS.has(e.split("@")[1]) && !alreadyChecked.has(e)
  ).sort();

  console.log(`\nSeeding ${toSeed.length} addresses into email_verification_queue...`);

  for (let i = 0; i < toSeed.length; i += INSERT_BATCH_SIZE) {
    const batch = toSeed.slice(i, i + INSERT_BATCH_SIZE);
    const values = batch.map((e) => `('${sqlEscape(e)}')`).join(",");
    d1("ballot_sources", `INSERT OR IGNORE INTO email_verification_queue (email_norm) VALUES ${values}`);
    process.stdout.write(`\r  ${Math.min(i + INSERT_BATCH_SIZE, toSeed.length)} / ${toSeed.length}`);
  }
  console.log("\n\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
