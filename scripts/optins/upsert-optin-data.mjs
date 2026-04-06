// scripts/optins/upsert-optin-data.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT_DIR,
  OUTPUT_FILE_NAMES,
  loadTransformedRun,
  normalizeEmail,
  normalizeOptionalText,
} from "./lib.mjs";

const WRANGLER_BIN = path.join(ROOT_DIR, "worker", "node_modules", ".bin", "wrangler");
const WRANGLER_CONFIG = path.join(ROOT_DIR, "worker", "wrangler.toml");

function usage() {
  console.log(`Usage:
  node scripts/optins/upsert-optin-data.mjs --input-dir docs/db/data/optin-import/<run> [options]

Options:
  --input-dir PATH    Directory produced by transform-optin-csv.mjs
  --sqlite PATH       Apply/query against a standalone SQLite file for isolated tests
  --local             Target the local D1 database (default)
  --remote            Target the remote D1 database
  --env NAME          Wrangler environment for --remote, such as production or preview
  --apply             Execute the generated SQL after writing it
  --help              Show this message
`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(token, true);
      continue;
    }
    args.set(token, next);
    index += 1;
  }
  return args;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  if (!text.length) return "NULL";
  return `'${text.replaceAll("'", "''")}'`;
}

function sqlInteger(value, fallback = "NULL") {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : fallback;
}

function normalizeCsvNullable(value) {
  const text = normalizeOptionalText(value);
  return text || null;
}

function normalizeCsvInteger(value) {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function normalizeVolunteerExisting(row) {
  return {
    id: normalizeOptionalText(row.id),
    first_name: normalizeOptionalText(row.first_name),
    last_name: normalizeOptionalText(row.last_name),
    email: normalizeOptionalText(row.email),
    email_norm: normalizeEmail(row.email),
    phone: normalizeOptionalText(row.phone),
    source: normalizeOptionalText(row.source),
    status: normalizeOptionalText(row.status),
    notes: normalizeOptionalText(row.notes),
    tags_json: normalizeOptionalText(row.tags_json),
    created_at: normalizeOptionalText(row.created_at),
    updated_at: normalizeOptionalText(row.updated_at),
  };
}

function mergeVolunteerNotes(existingNotes, incomingNotes) {
  const values = [normalizeOptionalText(existingNotes), normalizeOptionalText(incomingNotes)].filter(Boolean);
  return [...new Set(values)].join(" | ");
}

function parseWranglerResults(output) {
  const parsed = JSON.parse(output);
  if (Array.isArray(parsed)) {
    const first = parsed[0] || {};
    if (Array.isArray(first.results)) return first.results;
    if (Object.prototype.hasOwnProperty.call(first, "results")) return first.results || [];
  }
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.results)) return parsed.results;
    if (Object.prototype.hasOwnProperty.call(parsed, "results")) return parsed.results || [];
  }
  return [];
}

function runWrangler(args, { expectJson = false } = {}) {
  const result = spawnSync(WRANGLER_BIN, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: "/tmp",
      WRANGLER_LOG_PATH: "/tmp/skovgard2026-wrangler.log",
    },
  });
  if (result.status !== 0) {
    throw new Error(`${WRANGLER_BIN} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return expectJson ? parseWranglerResults(result.stdout) : result.stdout;
}

function runSqlite(sqlitePath, args, { expectJson = false } = {}) {
  const result = spawnSync("sqlite3", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`sqlite3 ${sqlitePath} failed:\n${result.stderr || result.stdout}`);
  }
  return expectJson ? JSON.parse(result.stdout || "[]") : result.stdout;
}

function buildWranglerArgs(baseArgs, mode, envName) {
  const args = [...baseArgs, mode, "--config", WRANGLER_CONFIG];
  if (envName) args.push("--env", envName);
  return args;
}

function queryTarget(sql, target) {
  if (target.kind === "sqlite") {
    return runSqlite(target.sqlitePath, ["-json", target.sqlitePath, sql], { expectJson: true });
  }
  return runWrangler(
    buildWranglerArgs(["d1", "execute", "ballot_sources", "--json", "--command", sql], target.mode, target.envName),
    { expectJson: true }
  );
}

function applySqlFile(filePath, target) {
  if (target.kind === "sqlite") {
    return runSqlite(target.sqlitePath, [target.sqlitePath, `.read ${filePath}`]);
  }
  return runWrangler(buildWranglerArgs(["d1", "execute", "ballot_sources", "--file", filePath], target.mode, target.envName));
}

function buildVolunteerLookupQuery(rows) {
  const phones = [...new Set(rows.map((row) => normalizeOptionalText(row.phone)).filter(Boolean))];
  const emails = [...new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean))];
  if (!phones.length && !emails.length) return "";

  const clauses = [];
  if (phones.length) {
    clauses.push(`phone IN (${phones.map((value) => sqlValue(value)).join(", ")})`);
  }
  if (emails.length) {
    clauses.push(`LOWER(TRIM(COALESCE(email, ''))) IN (${emails.map((value) => sqlValue(value)).join(", ")})`);
  }

  return `SELECT id, first_name, last_name, email, phone, source, status, notes, tags_json, created_at, updated_at
            FROM volunteers
           WHERE ${clauses.join(" OR ")}`;
}

function resolveVolunteerRows(rows, target) {
  if (!rows.length) return { resolvedRows: [], conflicts: [] };
  const lookupSql = buildVolunteerLookupQuery(rows);
  const existingRows = lookupSql ? queryTarget(lookupSql, target).map(normalizeVolunteerExisting) : [];
  const existingByPhone = new Map();
  const existingByEmail = new Map();
  const conflicts = [];

  for (const row of existingRows) {
    if (row.phone) {
      const prior = existingByPhone.get(row.phone);
      if (prior && prior.id !== row.id) {
        conflicts.push(`Existing volunteers share phone ${row.phone}: ${prior.id} vs ${row.id}`);
      } else {
        existingByPhone.set(row.phone, row);
      }
    }
    if (row.email_norm) {
      const prior = existingByEmail.get(row.email_norm);
      if (prior && prior.id !== row.id) {
        conflicts.push(`Existing volunteers share email ${row.email_norm}: ${prior.id} vs ${row.id}`);
      } else {
        existingByEmail.set(row.email_norm, row);
      }
    }
  }

  const resolvedRows = rows.map((row) => {
    const phone = normalizeOptionalText(row.phone);
    const emailNorm = normalizeEmail(row.email);
    const phoneMatch = phone ? existingByPhone.get(phone) : null;
    const emailMatch = emailNorm ? existingByEmail.get(emailNorm) : null;

    if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
      conflicts.push(
        `Volunteer import row conflicts across phone/email match: phone ${phone || "<blank>"} -> ${phoneMatch.id}, email ${emailNorm || "<blank>"} -> ${emailMatch.id}`
      );
    }

    const existing = phoneMatch || emailMatch || null;
    return {
      id: normalizeOptionalText(existing?.id) || normalizeOptionalText(row.id),
      first_name: normalizeOptionalText(existing?.first_name) || normalizeOptionalText(row.first_name),
      last_name: normalizeOptionalText(existing?.last_name) || normalizeOptionalText(row.last_name),
      email: normalizeOptionalText(existing?.email) || normalizeOptionalText(row.email),
      phone: normalizeOptionalText(existing?.phone) || phone,
      source: normalizeOptionalText(existing?.source) || normalizeOptionalText(row.source),
      status: normalizeOptionalText(existing?.status) || normalizeOptionalText(row.status),
      notes: mergeVolunteerNotes(existing?.notes, row.notes),
      tags_json: normalizeOptionalText(existing?.tags_json) || normalizeOptionalText(row.tags_json) || "[]",
      created_at: normalizeOptionalText(existing?.created_at) || normalizeOptionalText(row.created_at),
      updated_at: normalizeOptionalText(row.updated_at) || normalizeOptionalText(existing?.updated_at),
    };
  });

  return { resolvedRows, conflicts };
}

function contactsStatement(row) {
  return `
INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at, tags, welcome_sent_at)
VALUES (
  ${sqlValue(normalizeCsvNullable(row.phone_e164))},
  ${sqlValue(normalizeCsvNullable(row.first_name))},
  ${sqlValue(normalizeCsvNullable(row.last_name))},
  ${sqlValue(normalizeCsvNullable(row.created_at))},
  ${sqlValue(normalizeCsvNullable(row.updated_at))},
  ${sqlValue(normalizeCsvNullable(row.tags))},
  ${sqlValue(normalizeCsvNullable(row.welcome_sent_at))}
)
ON CONFLICT(phone_e164) DO UPDATE SET
  first_name = CASE
    WHEN TRIM(COALESCE(contacts.first_name, '')) = '' THEN excluded.first_name
    ELSE contacts.first_name
  END,
  last_name = CASE
    WHEN TRIM(COALESCE(contacts.last_name, '')) = '' THEN excluded.last_name
    ELSE contacts.last_name
  END,
  tags = CASE
    WHEN TRIM(COALESCE(contacts.tags, '')) = '' THEN excluded.tags
    ELSE contacts.tags
  END,
  welcome_sent_at = COALESCE(contacts.welcome_sent_at, excluded.welcome_sent_at),
  updated_at = excluded.updated_at;`.trim();
}

function consentStatusStatement(row) {
  return `
INSERT INTO consent_status (
  phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword,
  created_at, updated_at, first_name, last_name, email, consent_email, wy_voter,
  county, zip, consent_version, user_agent, ip_hash, address1, address2, city,
  state, country, state_house_district, state_senate_district
)
VALUES (
  ${sqlValue(normalizeCsvNullable(row.phone_e164))},
  ${sqlValue(normalizeCsvNullable(row.status))},
  ${sqlValue(normalizeCsvNullable(row.source))},
  ${sqlValue(normalizeCsvNullable(row.source_detail))},
  ${sqlValue(normalizeCsvNullable(row.consented_at))},
  ${sqlValue(normalizeCsvNullable(row.revoked_at))},
  ${sqlValue(normalizeCsvNullable(row.last_inbound_keyword))},
  ${sqlValue(normalizeCsvNullable(row.created_at))},
  ${sqlValue(normalizeCsvNullable(row.updated_at))},
  ${sqlValue(normalizeCsvNullable(row.first_name))},
  ${sqlValue(normalizeCsvNullable(row.last_name))},
  ${sqlValue(normalizeCsvNullable(row.email))},
  ${sqlInteger(normalizeCsvInteger(row.consent_email))},
  ${sqlInteger(normalizeCsvInteger(row.wy_voter))},
  ${sqlValue(normalizeCsvNullable(row.county))},
  ${sqlValue(normalizeCsvNullable(row.zip))},
  ${sqlValue(normalizeCsvNullable(row.consent_version))},
  ${sqlValue(normalizeCsvNullable(row.user_agent))},
  ${sqlValue(normalizeCsvNullable(row.ip_hash))},
  ${sqlValue(normalizeCsvNullable(row.address1))},
  ${sqlValue(normalizeCsvNullable(row.address2))},
  ${sqlValue(normalizeCsvNullable(row.city))},
  ${sqlValue(normalizeCsvNullable(row.state))},
  ${sqlValue(normalizeCsvNullable(row.country))},
  ${sqlValue(normalizeCsvNullable(row.state_house_district))},
  ${sqlValue(normalizeCsvNullable(row.state_senate_district))}
)
ON CONFLICT(phone_e164) DO UPDATE SET
  status = CASE
    WHEN COALESCE(consent_status.status, '') = 'opted_out' THEN consent_status.status
    WHEN COALESCE(consent_status.status, '') IN ('', 'unknown') THEN excluded.status
    ELSE consent_status.status
  END,
  source = CASE
    WHEN TRIM(COALESCE(consent_status.source, '')) = '' THEN excluded.source
    ELSE consent_status.source
  END,
  source_detail = CASE
    WHEN TRIM(COALESCE(consent_status.source_detail, '')) = '' THEN excluded.source_detail
    ELSE consent_status.source_detail
  END,
  consented_at = CASE
    WHEN COALESCE(consent_status.status, '') = 'opted_out' THEN consent_status.consented_at
    ELSE COALESCE(consent_status.consented_at, excluded.consented_at)
  END,
  revoked_at = COALESCE(consent_status.revoked_at, excluded.revoked_at),
  last_inbound_keyword = COALESCE(NULLIF(consent_status.last_inbound_keyword, ''), excluded.last_inbound_keyword),
  first_name = CASE
    WHEN TRIM(COALESCE(consent_status.first_name, '')) = '' THEN excluded.first_name
    ELSE consent_status.first_name
  END,
  last_name = CASE
    WHEN TRIM(COALESCE(consent_status.last_name, '')) = '' THEN excluded.last_name
    ELSE consent_status.last_name
  END,
  email = CASE
    WHEN TRIM(COALESCE(consent_status.email, '')) = '' THEN excluded.email
    ELSE consent_status.email
  END,
  consent_email = CASE
    WHEN consent_status.consent_email IS NULL THEN excluded.consent_email
    WHEN consent_status.consent_email = 1 THEN consent_status.consent_email
    ELSE consent_status.consent_email
  END,
  wy_voter = COALESCE(consent_status.wy_voter, excluded.wy_voter),
  county = CASE
    WHEN TRIM(COALESCE(consent_status.county, '')) = '' THEN excluded.county
    ELSE consent_status.county
  END,
  zip = CASE
    WHEN TRIM(COALESCE(consent_status.zip, '')) = '' THEN excluded.zip
    ELSE consent_status.zip
  END,
  consent_version = CASE
    WHEN TRIM(COALESCE(consent_status.consent_version, '')) = '' THEN excluded.consent_version
    ELSE consent_status.consent_version
  END,
  user_agent = COALESCE(NULLIF(consent_status.user_agent, ''), excluded.user_agent),
  ip_hash = COALESCE(NULLIF(consent_status.ip_hash, ''), excluded.ip_hash),
  address1 = CASE
    WHEN TRIM(COALESCE(consent_status.address1, '')) = '' THEN excluded.address1
    ELSE consent_status.address1
  END,
  address2 = CASE
    WHEN TRIM(COALESCE(consent_status.address2, '')) = '' THEN excluded.address2
    ELSE consent_status.address2
  END,
  city = CASE
    WHEN TRIM(COALESCE(consent_status.city, '')) = '' THEN excluded.city
    ELSE consent_status.city
  END,
  state = CASE
    WHEN TRIM(COALESCE(consent_status.state, '')) = '' THEN excluded.state
    ELSE consent_status.state
  END,
  country = CASE
    WHEN TRIM(COALESCE(consent_status.country, '')) = '' THEN excluded.country
    ELSE consent_status.country
  END,
  state_house_district = CASE
    WHEN TRIM(COALESCE(consent_status.state_house_district, '')) = '' THEN excluded.state_house_district
    ELSE consent_status.state_house_district
  END,
  state_senate_district = CASE
    WHEN TRIM(COALESCE(consent_status.state_senate_district, '')) = '' THEN excluded.state_senate_district
    ELSE consent_status.state_senate_district
  END,
  updated_at = excluded.updated_at;`.trim();
}

function newsletterStatement(row) {
  return `
INSERT INTO newsletter_subscribers (
  email, email_norm, consent_email, consent_version, source, active, confirmed_at,
  user_agent, ip_hash, created_at, updated_at
)
VALUES (
  ${sqlValue(normalizeCsvNullable(row.email))},
  ${sqlValue(normalizeCsvNullable(row.email_norm))},
  ${sqlInteger(normalizeCsvInteger(row.consent_email), "1")},
  ${sqlValue(normalizeCsvNullable(row.consent_version))},
  ${sqlValue(normalizeCsvNullable(row.source))},
  ${sqlInteger(normalizeCsvInteger(row.active), "1")},
  ${sqlValue(normalizeCsvNullable(row.confirmed_at))},
  ${sqlValue(normalizeCsvNullable(row.user_agent))},
  ${sqlValue(normalizeCsvNullable(row.ip_hash))},
  ${sqlValue(normalizeCsvNullable(row.created_at))},
  ${sqlValue(normalizeCsvNullable(row.updated_at))}
)
ON CONFLICT(email_norm) DO UPDATE SET
  email = excluded.email,
  consent_email = CASE
    WHEN COALESCE(newsletter_subscribers.consent_email, 1) = 0 THEN newsletter_subscribers.consent_email
    ELSE excluded.consent_email
  END,
  consent_version = CASE
    WHEN TRIM(COALESCE(newsletter_subscribers.consent_version, '')) = '' THEN excluded.consent_version
    ELSE newsletter_subscribers.consent_version
  END,
  source = CASE
    WHEN TRIM(COALESCE(newsletter_subscribers.source, '')) = '' THEN excluded.source
    ELSE newsletter_subscribers.source
  END,
  active = CASE
    WHEN COALESCE(newsletter_subscribers.active, 1) = 0 THEN newsletter_subscribers.active
    ELSE excluded.active
  END,
  confirmed_at = COALESCE(newsletter_subscribers.confirmed_at, excluded.confirmed_at),
  user_agent = COALESCE(NULLIF(newsletter_subscribers.user_agent, ''), excluded.user_agent),
  ip_hash = COALESCE(NULLIF(newsletter_subscribers.ip_hash, ''), excluded.ip_hash),
  created_at = COALESCE(newsletter_subscribers.created_at, excluded.created_at),
  updated_at = excluded.updated_at;`.trim();
}

function smsOptinsStatement(row) {
  return `
INSERT INTO sms_optins (
  name, phone, consent, consent_version, source, user_agent, ip_hash, created_at,
  email, consent_email, wy_voter, county, zip, first_name, last_name, is_volunteer
)
VALUES (
  ${sqlValue(normalizeCsvNullable(row.name))},
  ${sqlValue(normalizeCsvNullable(row.phone))},
  ${sqlInteger(normalizeCsvInteger(row.consent), "0")},
  ${sqlValue(normalizeCsvNullable(row.consent_version))},
  ${sqlValue(normalizeCsvNullable(row.source))},
  ${sqlValue(normalizeCsvNullable(row.user_agent))},
  ${sqlValue(normalizeCsvNullable(row.ip_hash))},
  ${sqlValue(normalizeCsvNullable(row.created_at))},
  ${sqlValue(normalizeCsvNullable(row.email))},
  ${sqlInteger(normalizeCsvInteger(row.consent_email), "0")},
  ${sqlInteger(normalizeCsvInteger(row.wy_voter), "0")},
  ${sqlValue(normalizeCsvNullable(row.county))},
  ${sqlValue(normalizeCsvNullable(row.zip))},
  ${sqlValue(normalizeCsvNullable(row.first_name))},
  ${sqlValue(normalizeCsvNullable(row.last_name))},
  ${sqlInteger(normalizeCsvInteger(row.is_volunteer), "0")}
)
ON CONFLICT(phone) DO UPDATE SET
  name = CASE
    WHEN TRIM(COALESCE(sms_optins.name, '')) = '' THEN excluded.name
    ELSE sms_optins.name
  END,
  consent = CASE
    WHEN COALESCE(sms_optins.consent, 0) = 1 THEN sms_optins.consent
    ELSE excluded.consent
  END,
  consent_version = CASE
    WHEN TRIM(COALESCE(sms_optins.consent_version, '')) = '' THEN excluded.consent_version
    ELSE sms_optins.consent_version
  END,
  source = CASE
    WHEN TRIM(COALESCE(sms_optins.source, '')) = '' THEN excluded.source
    ELSE sms_optins.source
  END,
  user_agent = COALESCE(NULLIF(sms_optins.user_agent, ''), excluded.user_agent),
  ip_hash = COALESCE(NULLIF(sms_optins.ip_hash, ''), excluded.ip_hash),
  email = CASE
    WHEN TRIM(COALESCE(sms_optins.email, '')) = '' THEN excluded.email
    ELSE sms_optins.email
  END,
  consent_email = CASE
    WHEN COALESCE(sms_optins.consent_email, 0) = 1 THEN sms_optins.consent_email
    ELSE excluded.consent_email
  END,
  wy_voter = CASE
    WHEN COALESCE(sms_optins.wy_voter, 0) = 1 THEN sms_optins.wy_voter
    ELSE excluded.wy_voter
  END,
  county = CASE
    WHEN TRIM(COALESCE(sms_optins.county, '')) = '' THEN excluded.county
    ELSE sms_optins.county
  END,
  zip = CASE
    WHEN TRIM(COALESCE(sms_optins.zip, '')) = '' THEN excluded.zip
    ELSE sms_optins.zip
  END,
  first_name = CASE
    WHEN TRIM(COALESCE(sms_optins.first_name, '')) = '' THEN excluded.first_name
    ELSE sms_optins.first_name
  END,
  last_name = CASE
    WHEN TRIM(COALESCE(sms_optins.last_name, '')) = '' THEN excluded.last_name
    ELSE sms_optins.last_name
  END,
  is_volunteer = CASE
    WHEN COALESCE(sms_optins.is_volunteer, 0) = 1 OR COALESCE(excluded.is_volunteer, 0) = 1 THEN 1
    ELSE 0
  END;`.trim();
}

function volunteerStatement(row) {
  return `
INSERT INTO volunteers (
  id, first_name, last_name, email, phone, source, status, notes, tags_json, created_at, updated_at
)
VALUES (
  ${sqlValue(normalizeCsvNullable(row.id))},
  ${sqlValue(normalizeCsvNullable(row.first_name))},
  ${sqlValue(normalizeCsvNullable(row.last_name))},
  ${sqlValue(normalizeCsvNullable(row.email))},
  ${sqlValue(normalizeCsvNullable(row.phone))},
  ${sqlValue(normalizeCsvNullable(row.source))},
  ${sqlValue(normalizeCsvNullable(row.status))},
  ${sqlValue(normalizeCsvNullable(row.notes))},
  ${sqlValue(normalizeCsvNullable(row.tags_json) || "[]")},
  ${sqlValue(normalizeCsvNullable(row.created_at))},
  ${sqlValue(normalizeCsvNullable(row.updated_at))}
)
ON CONFLICT(id) DO UPDATE SET
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  source = excluded.source,
  status = excluded.status,
  notes = excluded.notes,
  tags_json = excluded.tags_json,
  created_at = COALESCE(volunteers.created_at, excluded.created_at),
  updated_at = excluded.updated_at;`.trim();
}

function buildSql(runData, target) {
  const { resolvedRows: volunteerRows, conflicts } = resolveVolunteerRows(runData.volunteerRows, target);
  if (conflicts.length) {
    throw new Error(`Volunteer conflict check failed:\n${conflicts.join("\n")}`);
  }

  const useTransaction = target.kind === "sqlite";
  const statements = ["-- Generated by scripts/optins/upsert-optin-data.mjs"];
  if (useTransaction) statements.push("BEGIN;");

  for (const row of runData.contactsRows) statements.push(contactsStatement(row));
  for (const row of runData.consentStatusRows) statements.push(consentStatusStatement(row));
  for (const row of runData.newsletterRows) statements.push(newsletterStatement(row));
  for (const row of runData.smsOptinsRows) statements.push(smsOptinsStatement(row));
  for (const row of volunteerRows) statements.push(volunteerStatement(row));

  if (useTransaction) statements.push("COMMIT;");
  return {
    sql: `${statements.join("\n\n")}\n`,
    counts: {
      contacts: runData.contactsRows.length,
      consent_status: runData.consentStatusRows.length,
      newsletter_subscribers: runData.newsletterRows.length,
      sms_optins: runData.smsOptinsRows.length,
      volunteers: volunteerRows.length,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.has("--help")) {
  usage();
  process.exit(0);
}

const inputDir = args.get("--input-dir");
if (!inputDir) {
  usage();
  process.exit(2);
}

const runDir = path.resolve(String(inputDir));
if (!fs.existsSync(runDir)) {
  throw new Error(`Input directory not found: ${runDir}`);
}

const sqlitePath = args.get("--sqlite") ? path.resolve(String(args.get("--sqlite"))) : "";
const target = sqlitePath
  ? { kind: "sqlite", sqlitePath }
  : {
      kind: "wrangler",
      mode: args.has("--remote") ? "--remote" : "--local",
      envName: args.get("--env") || "",
    };

if (target.kind === "wrangler" && !fs.existsSync(WRANGLER_BIN)) {
  throw new Error(`Wrangler binary not found: ${WRANGLER_BIN}`);
}
if (target.kind === "sqlite" && !fs.existsSync(target.sqlitePath)) {
  throw new Error(`SQLite file not found: ${target.sqlitePath}`);
}

const apply = args.has("--apply");
const runData = loadTransformedRun(runDir);

const missingFiles = Object.entries(OUTPUT_FILE_NAMES)
  .filter(([key]) => key !== "summary")
  .map(([_key, fileName]) => path.join(runDir, fileName))
  .filter((filePath) => !fs.existsSync(filePath));

if (missingFiles.length) {
  throw new Error(`Transform output missing required files:\n${missingFiles.join("\n")}`);
}

const { sql, counts } = buildSql(runData, target);
const sqlPath = path.join(runDir, "generated-upsert.sql");
fs.writeFileSync(sqlPath, sql, "utf8");

if (apply) {
  applySqlFile(sqlPath, target);
}

console.log(JSON.stringify({
  ok: true,
  mode: target.kind === "sqlite" ? "sqlite" : target.mode === "--remote" ? "remote" : "local",
  env: target.kind === "wrangler" ? target.envName || null : null,
  sqlitePath: target.kind === "sqlite" ? target.sqlitePath : null,
  applied: apply,
  inputDir: runDir,
  sqlPath,
  counts,
  summaryPath: path.join(runDir, OUTPUT_FILE_NAMES.summary),
}, null, 2));
