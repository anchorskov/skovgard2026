// scripts/optins/test-optin-import.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_SOURCE_CSV = "/mnt/c/Users/ancho/Downloads/signup_optins_lines_1_2_5_7_8.csv";
const TMP_DIR = path.join("/tmp", `skovgard2026-optin-import-${process.pid}`);
const DB_PATH = path.join(TMP_DIR, "optin-import-test.sqlite");
const FIXTURE_PATH = path.join(TMP_DIR, "optin-import-source.csv");
const WORKING_ROOT = path.join(ROOT_DIR, "docs", "db", "data", "optin-import");
const RUN_NAME = `test-${process.pid}`;
const GENERATED_AT = "2026-04-05T15:30:00.000Z";
const CONSENT_VERSION = "signup-sheet-import-v1-2026-04-05";
const KEEP_ARTIFACTS = String(process.env.KEEP_OPTIN_TEST_ARTIFACTS || "") === "1";

const EXTRA_ROWS = [
  "9,Fran / Bob Caller,,307-555-0100,Laramie,,,Yes,Volunteer-only phone row.",
  "10,Alice Emailonly,alice@example.com,,Laramie,,Yes,Yes,Volunteer email-only row.",
  "11,Terry Textonly,,307-555-0111,Laramie,Yes,,,Text-only row.",
  "12,Opted Out Example,optedout@example.com,307-555-0222,Laramie,Yes,,,Existing opted-out safety row.",
  "13,Inactive Email,inactive@example.com,,Laramie,,Yes,,Existing inactive email safety row.",
];

let failures = 0;
let runDir = "";

function info(message) {
  console.log(`i ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    encoding: "utf8",
    env: options.env || process.env,
    input: options.input,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function runJsonCommand(command, args, options = {}) {
  const output = runCommand(command, args, options);
  return JSON.parse(output || "null");
}

function sqliteExec(sql) {
  runCommand("sqlite3", [DB_PATH, sql]);
}

function sqliteJson(sql) {
  return runJsonCommand("sqlite3", ["-json", DB_PATH, sql]);
}

function applyMigrations() {
  info("Applying worker migrations to temporary SQLite database");
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(path.join(WORKING_ROOT, RUN_NAME), { recursive: true, force: true });
  const migrationDir = path.join(ROOT_DIR, "worker", "migrations");
  const files = fs
    .readdirSync(migrationDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const fileName of files) {
    const filePath = path.join(migrationDir, fileName);
    runCommand("bash", [
      "-lc",
      `sqlite3 "${DB_PATH.replaceAll("\"", "\\\"")}" < "${filePath.replaceAll("\"", "\\\"")}"`
    ]);
  }
}

function writeFixture(sourcePath) {
  info("Building temporary source CSV fixture from the provided signup file");
  const sourceText = fs.readFileSync(sourcePath, "utf8").trimEnd();
  fs.writeFileSync(FIXTURE_PATH, `${sourceText}\n${EXTRA_ROWS.join("\n")}\n`, "utf8");
}

function seedSafetyRows() {
  info("Seeding safety rows to verify conservative upsert behavior");
  sqliteExec(`
INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at)
VALUES ('+13075550222', 'Opted', 'Out', datetime('now'), datetime('now'));

INSERT INTO consent_status (
  phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword,
  created_at, updated_at, first_name, last_name, email, consent_email, wy_voter,
  county, zip, consent_version, user_agent, ip_hash, address1, address2, city,
  state, country, state_house_district, state_senate_district
)
VALUES (
  '+13075550222', 'opted_out', 'seed', 'safety', '2026-04-01T12:00:00.000Z', '2026-04-02T12:00:00.000Z', 'STOP',
  '2026-04-01T12:00:00.000Z', '2026-04-02T12:00:00.000Z', 'Opted', 'Out', 'optedout@example.com', 0, NULL,
  NULL, NULL, 'seed-safety-optout', NULL, NULL, NULL, NULL, 'Laramie',
  NULL, NULL, NULL, NULL
);

INSERT INTO newsletter_subscribers (
  email, email_norm, consent_email, consent_version, source, active, confirmed_at,
  user_agent, ip_hash, created_at, updated_at
)
VALUES (
  'inactive@example.com', 'inactive@example.com', 0, 'seed-safety-email', 'seed', 0, NULL,
  NULL, NULL, '2026-04-01T12:00:00.000Z', '2026-04-02T12:00:00.000Z'
);
`);
}

function runTransform() {
  info("Running transform-optin-csv.mjs");
  runCommand("node", [
    "scripts/optins/transform-optin-csv.mjs",
    "--source",
    FIXTURE_PATH,
    "--output-root",
    WORKING_ROOT,
    "--run-name",
    RUN_NAME,
    "--generated-at",
    GENERATED_AT,
    "--consent-version",
    CONSENT_VERSION,
  ]);
  runDir = path.join(WORKING_ROOT, RUN_NAME);
  return JSON.parse(fs.readFileSync(path.join(runDir, "summary.json"), "utf8"));
}

function runImport(apply = true) {
  const args = [
    "scripts/optins/upsert-optin-data.mjs",
    "--input-dir",
    runDir,
    "--sqlite",
    DB_PATH,
  ];
  if (apply) args.push("--apply");
  runCommand("node", args);
  return { applied: apply };
}

function expectEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(`${label}: expected ${expected}, got ${actual}`);
}

function expectTruthy(value, label) {
  if (value) pass(label);
  else fail(`${label}: expected truthy value`);
}

function cleanup() {
  if (KEEP_ARTIFACTS) return;
  try {
    if (runDir) fs.rmSync(runDir, { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}

try {
  const sourcePath = path.resolve(process.argv[2] || DEFAULT_SOURCE_CSV);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source CSV not found: ${sourcePath}`);
  }

  applyMigrations();
  writeFixture(sourcePath);
  seedSafetyRows();

  const transformSummary = runTransform();
  expectTruthy(transformSummary.runDir, "Transform produced a run directory");
  expectEqual(transformSummary.contactsRows, 6, "Transform wrote 6 contact rows");
  expectEqual(transformSummary.consentStatusRows, 6, "Transform wrote 6 consent_status rows");
  expectEqual(transformSummary.newsletterRows, 6, "Transform wrote 6 newsletter rows");
  expectEqual(transformSummary.smsOptinsRows, 4, "Transform wrote 4 sms_optins rows");
  expectEqual(transformSummary.volunteerRows, 5, "Transform wrote 5 volunteer rows");

  const firstImport = runImport(true);
  expectEqual(firstImport.applied, true, "Import applied to temporary SQLite DB");

  const counts = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM contacts) AS contacts_count,
  (SELECT COUNT(*) FROM consent_status) AS consent_count,
  (SELECT COUNT(*) FROM newsletter_subscribers) AS newsletter_count,
  (SELECT COUNT(*) FROM sms_optins) AS sms_optins_count,
  (SELECT COUNT(*) FROM volunteers) AS volunteers_count;
`)[0];

  expectEqual(Number(counts.contacts_count || 0), 6, "Contacts count matches expected rows");
  expectEqual(Number(counts.consent_count || 0), 6, "Consent_status count matches expected rows");
  expectEqual(Number(counts.newsletter_count || 0), 6, "Newsletter count matches expected rows");
  expectEqual(Number(counts.sms_optins_count || 0), 4, "sms_optins count matches expected rows");
  expectEqual(Number(counts.volunteers_count || 0), 5, "Volunteers count matches expected rows");

  const becky = sqliteJson(`
SELECT first_name, last_name
  FROM consent_status
 WHERE phone_e164 = '+13077602332';
`)[0];
  expectEqual(becky?.first_name || "", "Becky", "Combined name keeps the first person first name");
  expectEqual(becky?.last_name || "", "Salvador", "Combined name preserves shared trailing surname");

  const volunteerPhoneOnly = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM consent_status WHERE phone_e164 = '+13075550100') AS consent_count,
  (SELECT COUNT(*) FROM sms_optins WHERE phone = '13075550100' AND is_volunteer = 1 AND consent = 0) AS sms_count,
  (SELECT COUNT(*) FROM volunteers WHERE phone = '+13075550100') AS volunteer_count;
`)[0];
  expectEqual(Number(volunteerPhoneOnly?.consent_count || 0), 0, "Volunteer-only phone row does not create consent_status");
  expectEqual(Number(volunteerPhoneOnly?.sms_count || 0), 1, "Volunteer-only phone row creates sms_optins compatibility row");
  expectEqual(Number(volunteerPhoneOnly?.volunteer_count || 0), 1, "Volunteer-only phone row creates volunteers row");

  const volunteerEmailOnly = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM consent_status WHERE email = 'alice@example.com') AS consent_count,
  (SELECT COUNT(*) FROM newsletter_subscribers WHERE email_norm = 'alice@example.com') AS newsletter_count,
  (SELECT COUNT(*) FROM volunteers WHERE email = 'alice@example.com') AS volunteer_count;
`)[0];
  expectEqual(Number(volunteerEmailOnly?.consent_count || 0), 0, "Volunteer email-only row does not create consent_status");
  expectEqual(Number(volunteerEmailOnly?.newsletter_count || 0), 1, "Volunteer email-only row creates newsletter subscriber");
  expectEqual(Number(volunteerEmailOnly?.volunteer_count || 0), 1, "Volunteer email-only row creates volunteers row");

  const textOnly = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM contacts WHERE phone_e164 = '+13075550111') AS contacts_count,
  (SELECT COUNT(*) FROM newsletter_subscribers WHERE email_norm = '') AS bogus_newsletter_count;
`)[0];
  expectEqual(Number(textOnly?.contacts_count || 0), 1, "Text-only row creates contact");
  expectEqual(Number(textOnly?.bogus_newsletter_count || 0), 0, "Text-only row does not create newsletter subscriber");

  const safetyRows = sqliteJson(`
SELECT
  (SELECT status FROM consent_status WHERE phone_e164 = '+13075550222') AS opted_out_status,
  (SELECT active FROM newsletter_subscribers WHERE email_norm = 'inactive@example.com') AS inactive_active,
  (SELECT consent_email FROM newsletter_subscribers WHERE email_norm = 'inactive@example.com') AS inactive_consent;
`)[0];
  expectEqual(safetyRows?.opted_out_status || "", "opted_out", "Existing opted-out SMS row is not reactivated");
  expectEqual(Number(safetyRows?.inactive_active || 0), 0, "Existing inactive newsletter row stays inactive");
  expectEqual(Number(safetyRows?.inactive_consent || 0), 0, "Existing inactive newsletter consent flag stays 0");

  const beforeRerun = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM contacts) AS contacts_count,
  (SELECT COUNT(*) FROM consent_status) AS consent_count,
  (SELECT COUNT(*) FROM newsletter_subscribers) AS newsletter_count,
  (SELECT COUNT(*) FROM sms_optins) AS sms_optins_count,
  (SELECT COUNT(*) FROM volunteers) AS volunteers_count;
`)[0];
  runImport(true);
  const afterRerun = sqliteJson(`
SELECT
  (SELECT COUNT(*) FROM contacts) AS contacts_count,
  (SELECT COUNT(*) FROM consent_status) AS consent_count,
  (SELECT COUNT(*) FROM newsletter_subscribers) AS newsletter_count,
  (SELECT COUNT(*) FROM sms_optins) AS sms_optins_count,
  (SELECT COUNT(*) FROM volunteers) AS volunteers_count;
`)[0];

  expectEqual(Number(afterRerun.contacts_count || 0), Number(beforeRerun.contacts_count || 0), "Rerun keeps contacts deduped");
  expectEqual(Number(afterRerun.consent_count || 0), Number(beforeRerun.consent_count || 0), "Rerun keeps consent_status deduped");
  expectEqual(Number(afterRerun.newsletter_count || 0), Number(beforeRerun.newsletter_count || 0), "Rerun keeps newsletter_subscribers deduped");
  expectEqual(Number(afterRerun.sms_optins_count || 0), Number(beforeRerun.sms_optins_count || 0), "Rerun keeps sms_optins deduped");
  expectEqual(Number(afterRerun.volunteers_count || 0), Number(beforeRerun.volunteers_count || 0), "Rerun keeps volunteers deduped");
} catch (error) {
  fail(String(error?.message || error));
} finally {
  cleanup();
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("PASS opt-in import workflow");
}
