#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = "/home/anchor/projects/skovgard2026";
const SOURCE_FILES = [
  "downloads/pulse-optins-2026-02-19.csv",
  "docs/db/data/March31optins.csv",
  "docs/db/data/March31optins_deduped_id.csv",
].map((file) => path.join(ROOT_DIR, file));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift() || [];
  return rows
    .filter((record) => record.length && record.some((value) => String(value || "").trim()))
    .map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""])));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const raw = normalizeText(value);
  if (!raw) return { raw: "", normalized: "" };
  return { raw, normalized: raw.toLowerCase() };
}

function normalizePhoneE164(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function normalizeZip(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function parseFlag(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (["1", "1.0", "true", "yes", "y"].includes(text)) return 1;
  if (["0", "0.0", "false", "no", "n"].includes(text)) return 0;
  return null;
}

function sqlString(value) {
  return String(value || "").replaceAll("'", "''");
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  if (!text.trim()) return "NULL";
  return `'${sqlString(text)}'`;
}

function sqlInteger(value, fallback = "NULL") {
  return value === null || value === undefined ? fallback : String(Number(value));
}

function sourceRank(detail) {
  switch (detail) {
    case "pulse":
      return 3;
    case "donate":
      return 2;
    default:
      return 1;
  }
}

function mapSource(rawSource) {
  const source = normalizeText(rawSource);
  if (source === "skovgard2026:pulse" || source === "pulse") {
    return {
      consentSource: "web_form",
      consentSourceDetail: "pulse",
      newsletterSource: "skovgard2026:pulse",
      detailRank: 3,
    };
  }
  if (source === "skovgard2026:donate" || source === "donate") {
    return {
      consentSource: "web_form",
      consentSourceDetail: "donate",
      newsletterSource: "skovgard2026:donate",
      detailRank: 2,
    };
  }
  if (source.startsWith("manual:")) {
    return {
      consentSource: "manual_import",
      consentSourceDetail: source.slice("manual:".length) || "manual_import",
      newsletterSource: source,
      detailRank: 1,
    };
  }
  return {
    consentSource: source || "manual_import",
    consentSourceDetail: source || "email_backfill",
    newsletterSource: source || "email_backfill",
    detailRank: 1,
  };
}

function coalesceBlank(current, incoming) {
  return normalizeText(current) ? current : incoming;
}

function mergeConsentRecord(current, incoming) {
  if (!current) {
    return {
      ...incoming,
      sourceRank: sourceRank(incoming.sourceDetail),
    };
  }

  const next = { ...current };
  next.firstName = coalesceBlank(next.firstName, incoming.firstName);
  next.lastName = coalesceBlank(next.lastName, incoming.lastName);
  next.city = coalesceBlank(next.city, incoming.city);
  next.county = coalesceBlank(next.county, incoming.county);
  next.zip = coalesceBlank(next.zip, incoming.zip);
  next.userAgent = coalesceBlank(next.userAgent, incoming.userAgent);
  next.ipHash = coalesceBlank(next.ipHash, incoming.ipHash);
  next.consentVersion = coalesceBlank(next.consentVersion, incoming.consentVersion);

  if (!next.emailNorm || (next.consentEmail !== 1 && incoming.consentEmail === 1)) {
    next.email = incoming.email;
    next.emailNorm = incoming.emailNorm;
  }

  if (next.consentEmail !== 1) {
    next.consentEmail = incoming.consentEmail ?? next.consentEmail;
  }
  if (next.wyVoter !== 1) {
    next.wyVoter = incoming.wyVoter ?? next.wyVoter;
  }
  if (next.status !== "opted_in" && incoming.status === "opted_in") {
    next.status = "opted_in";
  }
  if (!next.consentedAt && incoming.consentedAt) {
    next.consentedAt = incoming.consentedAt;
  }

  const incomingRank = sourceRank(incoming.sourceDetail);
  if (!next.source || incomingRank > (next.sourceRank || 0)) {
    next.source = incoming.source;
    next.sourceDetail = incoming.sourceDetail;
    next.sourceRank = incomingRank;
  }

  if (!next.createdAt || normalizeText(incoming.createdAt) > normalizeText(next.createdAt)) {
    next.createdAt = incoming.createdAt;
  }

  return next;
}

function mergeNewsletterRecord(current, incoming) {
  if (!current) return { ...incoming, sourceRank: sourceRank(incoming.sourceDetail) };
  const next = { ...current };
  const incomingRank = sourceRank(incoming.sourceDetail);

  if (incomingRank > (next.sourceRank || 0)) {
    next.source = incoming.source;
    next.sourceDetail = incoming.sourceDetail;
    next.newsletterSource = incoming.newsletterSource;
    next.sourceRank = incomingRank;
  }
  if (!next.consentVersion && incoming.consentVersion) {
    next.consentVersion = incoming.consentVersion;
  }
  if (!next.userAgent && incoming.userAgent) {
    next.userAgent = incoming.userAgent;
  }
  if (!next.ipHash && incoming.ipHash) {
    next.ipHash = incoming.ipHash;
  }
  if (!next.createdAt || normalizeText(incoming.createdAt) > normalizeText(next.createdAt)) {
    next.createdAt = incoming.createdAt;
  }
  return next;
}

function normalizeRow(row, filePath) {
  const { raw: email, normalized: emailNorm } = normalizeEmail(row.email);
  const sourceMeta = mapSource(row.source);
  const consent = parseFlag(row.consent) === 1 ? 1 : 0;
  const consentEmail = parseFlag(row.consent_email);
  const wyVoter = parseFlag(row.wy_voter);
  const createdAt = normalizeText(row.created_at) || null;
  const consentVersion = normalizeText(row.consent_version);

  return {
    filePath,
    source: sourceMeta.consentSource,
    sourceDetail: sourceMeta.consentSourceDetail,
    newsletterSource: sourceMeta.newsletterSource,
    firstName: normalizeText(row.first_name),
    lastName: normalizeText(row.last_name),
    phoneE164: normalizePhoneE164(row.phone),
    email,
    emailNorm,
    consentEmail,
    wyVoter,
    status: consent === 1 ? "opted_in" : "unknown",
    consentedAt: consent === 1 ? createdAt : null,
    createdAt,
    city: normalizeText(row.city),
    county: normalizeText(row.county),
    zip: normalizeZip(row.zip),
    consentVersion: consentVersion || (sourceMeta.consentSourceDetail === "March31list" ? "manual-email-backfill-2026-03-31" : ""),
    userAgent: normalizeText(row.user_agent),
    ipHash: normalizeText(row.ip_hash),
  };
}

function loadRows() {
  const rows = [];
  for (const filePath of SOURCE_FILES) {
    const text = fs.readFileSync(filePath, "utf8");
    for (const row of parseCsv(text)) {
      const normalized = normalizeRow(row, filePath);
      if (!normalized.phoneE164 || !normalized.emailNorm) continue;
      rows.push(normalized);
    }
  }
  return rows;
}

const consentByPhone = new Map();
const newsletterByEmail = new Map();
const rawRows = loadRows();

for (const row of rawRows) {
  consentByPhone.set(row.phoneE164, mergeConsentRecord(consentByPhone.get(row.phoneE164), row));
  if (row.consentEmail === 1) {
    newsletterByEmail.set(row.emailNorm, mergeNewsletterRecord(newsletterByEmail.get(row.emailNorm), row));
  }
}

const consentRows = [...consentByPhone.values()].sort((a, b) => a.phoneE164.localeCompare(b.phoneE164));
const newsletterRows = [...newsletterByEmail.values()].sort((a, b) => a.emailNorm.localeCompare(b.emailNorm));

const sourceSummary = rawRows.reduce((acc, row) => {
  const key = row.sourceDetail || row.source || "unknown";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const summary = {
  sourceFiles: SOURCE_FILES.map((filePath) => path.relative(ROOT_DIR, filePath)),
  rawRowsWithPhoneAndEmail: rawRows.length,
  consentStatusUpserts: consentRows.length,
  newsletterSubscriberUpserts: newsletterRows.length,
  sourceSummary,
  newsletterEmails: newsletterRows.map((row) => row.email),
};

console.error(JSON.stringify(summary, null, 2));

const statements = [];
statements.push("-- Generated by scripts/generate-email-backfill-sql.mjs");

for (const row of consentRows) {
  statements.push(`
INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at)
VALUES (${sqlValue(row.phoneE164)}, ${sqlValue(row.firstName)}, ${sqlValue(row.lastName)}, COALESCE(${sqlValue(row.createdAt)}, datetime('now')), datetime('now'))
ON CONFLICT(phone_e164) DO UPDATE SET
  first_name = CASE
    WHEN TRIM(COALESCE(contacts.first_name, '')) = '' THEN excluded.first_name
    ELSE contacts.first_name
  END,
  last_name = CASE
    WHEN TRIM(COALESCE(contacts.last_name, '')) = '' THEN excluded.last_name
    ELSE contacts.last_name
  END,
  updated_at = datetime('now');`.trim());

  statements.push(`
INSERT INTO consent_status (
  phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword,
  first_name, last_name, email, consent_email, wy_voter, county, zip,
  address1, address2, city, state, country, state_house_district, state_senate_district,
  consent_version, user_agent, ip_hash, created_at, updated_at
)
VALUES (
  ${sqlValue(row.phoneE164)}, ${sqlValue(row.status)}, ${sqlValue(row.source)}, ${sqlValue(row.sourceDetail)},
  ${sqlValue(row.consentedAt)}, NULL, NULL,
  ${sqlValue(row.firstName)}, ${sqlValue(row.lastName)}, ${sqlValue(row.email)}, ${sqlInteger(row.consentEmail)}, ${sqlInteger(row.wyVoter)},
  ${sqlValue(row.county)}, ${sqlValue(row.zip)},
  NULL, NULL, ${sqlValue(row.city)}, 'WY', 'US', NULL, NULL,
  ${sqlValue(row.consentVersion)}, ${sqlValue(row.userAgent)}, ${sqlValue(row.ipHash)},
  COALESCE(${sqlValue(row.createdAt)}, datetime('now')), datetime('now')
)
ON CONFLICT(phone_e164) DO UPDATE SET
  status = CASE
    WHEN consent_status.status = 'unknown' THEN excluded.status
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
  consented_at = COALESCE(consent_status.consented_at, excluded.consented_at),
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
    WHEN COALESCE(consent_status.consent_email, 0) = 1 THEN consent_status.consent_email
    WHEN excluded.consent_email IS NOT NULL THEN excluded.consent_email
    ELSE consent_status.consent_email
  END,
  wy_voter = CASE
    WHEN COALESCE(consent_status.wy_voter, 0) = 1 THEN consent_status.wy_voter
    WHEN excluded.wy_voter IS NOT NULL THEN excluded.wy_voter
    ELSE consent_status.wy_voter
  END,
  county = CASE
    WHEN TRIM(COALESCE(consent_status.county, '')) = '' THEN excluded.county
    ELSE consent_status.county
  END,
  zip = CASE
    WHEN TRIM(COALESCE(consent_status.zip, '')) = '' THEN excluded.zip
    ELSE consent_status.zip
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
  consent_version = COALESCE(NULLIF(consent_status.consent_version, ''), excluded.consent_version),
  user_agent = COALESCE(NULLIF(consent_status.user_agent, ''), excluded.user_agent),
  ip_hash = COALESCE(NULLIF(consent_status.ip_hash, ''), excluded.ip_hash),
  updated_at = datetime('now');`.trim());
}

for (const row of newsletterRows) {
  statements.push(`
INSERT INTO newsletter_subscribers (
  email, email_norm, consent_email, consent_version, source, active, confirmed_at,
  user_agent, ip_hash, created_at, updated_at
)
VALUES (
  ${sqlValue(row.email)}, ${sqlValue(row.emailNorm)}, 1,
  ${sqlValue(row.consentVersion || "email-backfill-2026-04-02")},
  ${sqlValue(row.newsletterSource)}, 1, COALESCE(${sqlValue(row.createdAt)}, datetime('now')),
  ${sqlValue(row.userAgent)}, ${sqlValue(row.ipHash)},
  COALESCE(${sqlValue(row.createdAt)}, datetime('now')), datetime('now')
)
ON CONFLICT(email_norm) DO UPDATE SET
  email = excluded.email,
  consent_email = CASE
    WHEN COALESCE(newsletter_subscribers.consent_email, 0) = 1 THEN newsletter_subscribers.consent_email
    ELSE excluded.consent_email
  END,
  consent_version = COALESCE(NULLIF(newsletter_subscribers.consent_version, ''), excluded.consent_version),
  source = COALESCE(NULLIF(newsletter_subscribers.source, ''), excluded.source),
  active = 1,
  confirmed_at = COALESCE(newsletter_subscribers.confirmed_at, excluded.confirmed_at),
  user_agent = COALESCE(NULLIF(newsletter_subscribers.user_agent, ''), excluded.user_agent),
  ip_hash = COALESCE(NULLIF(newsletter_subscribers.ip_hash, ''), excluded.ip_hash),
  updated_at = datetime('now');`.trim());
}
process.stdout.write(`${statements.join("\n\n")}\n`);
