#!/usr/bin/env node
// scripts/verify_district_emails.mjs
//
// Reusable, district-parameterized version of the HD01-specific
// verify_hd01_emails_2026-07-09.mjs -- see docs/blast_tracking.md for the
// full backstory (why this exists, the two real bugs found building the
// first version, the Yahoo/AOL blind spot). Verifies a district's WY_DB +
// legacy CTE `every_email` audience against EmailListVerify BEFORE any
// blast job exists for that district, so bad addresses are already
// suppressed by the time the blast is created in the admin UI -- the
// audience count shown there will already reflect the cleanup.
//
// Every "bad" result (invalid/invalid_mx/dead_server/email_disabled/spamtrap)
// is written to a dated CSV report and inserted into email_suppressions
// (ON CONFLICT DO NOTHING -- never overwrites a real Resend bounce record),
// so it's excluded from every future send in this repo, not just this run.
//
// Usage:
//   EMAILLISTVERIFY_API_KEY=... ADMIN_KEY=<ADMIN_EXPORT_KEY> \
//     node scripts/verify_district_emails.mjs --district=02
//
// Safe to re-run: progress tracked in a per-district .state.json next to
// this script (protects EmailListVerify credits -- each check costs 1).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const VERIFY_ENDPOINT = "https://apps.emaillistverify.com/api/verifyEmail";
// EmailListVerify's response headers show x-ratelimit-limit: 1 with a small
// burst pool -- confirmed via manual curl testing 2026-07-09 that anything
// faster than ~1/sec gets silently degraded (not an HTTP error, just wrong
// results). 1200ms keeps every request comfortably inside that.
const REQUEST_PAUSE_MS = 1200;

// See docs/blast_tracking.md for the full status-value discovery story
// (spamtrap/smtp_protocol/antispam_system aren't in EmailListVerify's own
// docs -- found by manually curling the live endpoint).
const BAD_STATUSES = new Set(["invalid", "invalid_mx", "dead_server", "email_disabled", "spamtrap"]);
const GOOD_STATUSES = new Set(["ok"]);

// Skip verifying domains that will never actually be attempted at send time
// regardless of verdict -- no reason to spend a credit on them.
//   yahoo.com/aol.com: BLAST_UNVERIFIED_SKIP_DOMAINS (worker/src/index.js)
//     -- actively resist SMTP-probe verification, confirmed 2026-07-09 on
//     HD01 (every known-dead address came back "ok_for_all", never a real
//     verdict), so send-chunk defers them rather than guessing.
//   rtconnect.net/rangeweb.net: BLAST_CONTENT_FILTER_SKIP_DOMAINS -- a
//     shared Vircom filter appliance rejects this campaign's content
//     wholesale for these two, unrelated to individual mailbox validity.
// Keep this in sync with both worker/src/index.js constants.
const SKIP_VERIFICATION_DOMAINS = new Set(["yahoo.com", "aol.com", "rtconnect.net", "rangeweb.net"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_DIR = path.join(__dirname, "..", "worker");
const REPORT_DIR = path.join(__dirname, "..", "docs", "db", "data");

const API_KEY = process.env.EMAILLISTVERIFY_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

const args = process.argv.slice(2);
const districtArg = args.find((a) => a.startsWith("--district="));
const district = districtArg ? String(Number(districtArg.split("=")[1])) : null; // normalize "02" -> "2"

if (!API_KEY) {
  console.error("Set EMAILLISTVERIFY_API_KEY before running this.");
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error("Set ADMIN_KEY (worker/.dev.vars ADMIN_EXPORT_KEY) before running this -- needed for wrangler d1 access.");
  process.exit(1);
}
if (!district || !Number.isFinite(Number(district)) || Number(district) <= 0) {
  console.error("Usage: EMAILLISTVERIFY_API_KEY=... ADMIN_KEY=... node scripts/verify_district_emails.mjs --district=02");
  process.exit(1);
}

const STATE_FILE = path.join(__dirname, `verify_district_emails.hd${district.padStart(2, "0")}.state.json`);
const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const REPORT_CSV = path.join(REPORT_DIR, `hd${district.padStart(2, "0")}_email_verification_${timestamp}.csv`);
const REFUND_CSV = path.join(REPORT_DIR, `hd${district.padStart(2, "0")}_l2_refund_candidates_${timestamp}.csv`);

function d1(database, sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", sql],
    { cwd: WORKER_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }
  );
  return JSON.parse(out)[0].results || [];
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  }
  return { checked: {} }; // email_norm -> { status, verdict }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Mirrors fetchEveryEmailGeoUnion's WY_DB ∪ legacy-CTE union in
// worker/src/index.js, minus the opt-out list (same sources as
// fetchEmailOptoutList). No "already attempted" exclusion here -- unlike
// the HD01 version, this runs BEFORE any blast job exists for this
// district, so the full geo audience is what needs checking.
function fetchDistrictAudience() {
  const optoutRows = d1(
    "ballot_sources",
    `SELECT LOWER(TRIM(email)) AS email_norm FROM consent_status
      WHERE consent_email = 0 AND TRIM(COALESCE(email, '')) != ''
     UNION
     SELECT email_norm FROM newsletter_subscribers WHERE consent_email = 0 OR active = 0
     UNION
     SELECT email_norm FROM email_suppressions`
  );
  const optoutSet = new Set(optoutRows.map((r) => r.email_norm));

  const voterRows = d1(
    "wy",
    `SELECT email_norm FROM v_unique_name_email_not_stale WHERE CAST(house_district AS INTEGER) = ${district}`
  );

  const legacyRows = d1(
    "ballot_sources",
    `WITH email_candidates AS (
       SELECT LOWER(TRIM(cs.email)) AS email_norm
         FROM consent_status cs
        WHERE TRIM(COALESCE(cs.email, '')) <> ''
          AND CAST(cs.state_house_district AS INTEGER) = ${district}
       UNION
       SELECT ns.email_norm
         FROM newsletter_subscribers ns
        WHERE NOT EXISTS (
          SELECT 1 FROM consent_status cs
           WHERE LOWER(TRIM(COALESCE(cs.email, ''))) = ns.email_norm
        )
     )
     SELECT DISTINCT email_norm FROM email_candidates`
  );

  const merged = new Set();
  for (const r of voterRows) if (!optoutSet.has(r.email_norm)) merged.add(r.email_norm);
  for (const r of legacyRows) if (!optoutSet.has(r.email_norm)) merged.add(r.email_norm);

  return [...merged].sort();
}

// Real response is a bare plain-text status string (e.g. "ok", "invalid",
// "spamtrap"), not JSON. Errors are thrown with the endpoint path only,
// never the full URL/key, so a thrown error can't leak the key into
// console output or the state/report files.
async function verifyOne(email) {
  const url = `${VERIFY_ENDPOINT}?secret=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(email)}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`network error calling verifyEmail`);
  }
  if (!res.ok) {
    throw new Error(`verifyEmail returned HTTP ${res.status}`);
  }
  const status = (await res.text()).trim();
  return { status };
}

function classify(status) {
  if (BAD_STATUSES.has(status)) return "bad";
  if (GOOD_STATUSES.has(status)) return "good";
  return "risky";
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function suppressBad(emailNorm, status) {
  const sql = `INSERT INTO email_suppressions
       (email_norm, email, reason, event_type, suppressed_at, details_json)
     VALUES ('${emailNorm}', '${emailNorm}', 'EmailListVerify: ${status}', 'third_party_verification', datetime('now'),
             '${JSON.stringify({ vendor: "EmailListVerify", status, district }).replace(/'/g, "''")}')
     ON CONFLICT(email_norm) DO NOTHING`;
  d1("ballot_sources", sql);
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const state = loadState();

  console.log(`Computing HD${district} every_email+geo audience...`);
  const audience = fetchDistrictAudience();
  const skipped = audience.filter((e) => SKIP_VERIFICATION_DOMAINS.has(e.split("@")[1]));
  const toVerify = audience.filter((e) => !SKIP_VERIFICATION_DOMAINS.has(e.split("@")[1]));
  console.log(`  ${audience.length} addresses in audience; skipping ${skipped.length} yahoo.com/aol.com (can't resolve); verifying ${toVerify.length}.`);

  const targets = toVerify.map((email_norm) => ({ email_norm }));
  const toCheck = targets.filter((t) => !state.checked[t.email_norm]);
  console.log(`${targets.length - toCheck.length} already checked in a previous run; ${toCheck.length} remaining.\n`);
  console.log(`Estimated time: ~${Math.ceil((toCheck.length * REQUEST_PAUSE_MS) / 60000)} minutes at ${REQUEST_PAUSE_MS}ms/request.\n`);

  for (let i = 0; i < toCheck.length; i++) {
    const { email_norm } = toCheck[i];
    let result;
    try {
      result = await verifyOne(email_norm);
    } catch (e) {
      console.error(`  [${i + 1}/${toCheck.length}] ${email_norm}: request failed (${e.message}), will retry next run`);
      continue;
    }
    const status = String(result.status || "unknown");
    // "error_credit" (found 2026-07-09 mid-HD02 run) and presumably other
    // "error_*" values are EmailListVerify-side account failures, not a
    // real verdict -- NOT recording these into state.checked means the
    // address stays eligible for re-checking on the next run instead of
    // being permanently mislabeled "risky" despite never actually being
    // verified. Stop the whole run here; every remaining address would hit
    // the same wall.
    if (status.startsWith("error_")) {
      console.error(`\n  [${i + 1}/${toCheck.length}] ${email_norm}: ${status} -- account error, stopping. Re-run this script once credits are restored; already-checked addresses won't be re-spent.`);
      break;
    }
    const verdict = classify(status);
    state.checked[email_norm] = { status, verdict };
    saveState(state);
    console.log(`  [${i + 1}/${toCheck.length}] ${email_norm}: ${status} (${verdict})`);

    if (verdict === "bad") {
      await suppressBad(email_norm, status);
    }

    if (i + 1 < toCheck.length) await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
  }

  const allResults = Object.entries(state.checked)
    .filter(([email_norm]) => targets.some((t) => t.email_norm === email_norm))
    .map(([email_norm, r]) => ({ email_norm, ...r }));

  const reportRows = ["email,verifier_status,verdict"];
  const refundRows = ["email,verifier_status,house_district"];
  let goodCount = 0, badCount = 0, riskyCount = 0;
  for (const r of allResults) {
    reportRows.push([r.email_norm, r.status, r.verdict].map(csvEscape).join(","));
    if (r.verdict === "bad") {
      refundRows.push([r.email_norm, r.status, district].map(csvEscape).join(","));
      badCount++;
    } else if (r.verdict === "good") {
      goodCount++;
    } else {
      riskyCount++;
    }
  }
  fs.writeFileSync(REPORT_CSV, reportRows.join("\n") + "\n");
  fs.writeFileSync(REFUND_CSV, refundRows.join("\n") + "\n");

  console.log(`\nDone. good=${goodCount} risky=${riskyCount} bad=${badCount} (of ${allResults.length} verified this district).`);
  console.log(`Full report: ${REPORT_CSV}`);
  console.log(`L2 refund-candidate list (bad only): ${REFUND_CSV} (${refundRows.length - 1} addresses)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
