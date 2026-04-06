// scripts/optins/lib.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const DEFAULT_WORKING_ROOT = path.join(ROOT_DIR, "docs", "db", "data", "optin-import");

export const SOURCE_COLUMNS = [
  "row",
  "name",
  "email",
  "phone",
  "city_town",
  "opt_in_text",
  "opt_in_email",
  "volunteer",
  "notes",
];

export const SOURCE_AUDIT_COLUMNS = [
  "source_row",
  "name_raw",
  "name_selected",
  "name_strategy",
  "first_name",
  "last_name",
  "email_normalized",
  "phone_e164",
  "phone_digits",
  "city_town",
  "opt_in_text",
  "opt_in_email",
  "volunteer",
  "notes",
  "targets",
  "skip_reasons",
];

export const CONTACTS_COLUMNS = [
  "phone_e164",
  "first_name",
  "last_name",
  "created_at",
  "updated_at",
  "tags",
  "welcome_sent_at",
];

export const CONSENT_STATUS_COLUMNS = [
  "phone_e164",
  "status",
  "source",
  "source_detail",
  "consented_at",
  "revoked_at",
  "last_inbound_keyword",
  "created_at",
  "updated_at",
  "first_name",
  "last_name",
  "email",
  "consent_email",
  "wy_voter",
  "county",
  "zip",
  "consent_version",
  "user_agent",
  "ip_hash",
  "address1",
  "address2",
  "city",
  "state",
  "country",
  "state_house_district",
  "state_senate_district",
];

export const NEWSLETTER_COLUMNS = [
  "email",
  "email_norm",
  "consent_email",
  "consent_version",
  "source",
  "active",
  "confirmed_at",
  "user_agent",
  "ip_hash",
  "created_at",
  "updated_at",
];

export const SMS_OPTINS_COLUMNS = [
  "name",
  "phone",
  "consent",
  "consent_version",
  "source",
  "user_agent",
  "ip_hash",
  "created_at",
  "email",
  "consent_email",
  "wy_voter",
  "county",
  "zip",
  "first_name",
  "last_name",
  "is_volunteer",
];

export const VOLUNTEERS_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "source",
  "status",
  "notes",
  "tags_json",
  "created_at",
  "updated_at",
];

export const OUTPUT_FILE_NAMES = {
  audit: "source-audit.csv",
  contacts: "contacts.csv",
  consentStatus: "consent_status.csv",
  newsletter: "newsletter_subscribers.csv",
  smsOptins: "sms_optins.csv",
  volunteers: "volunteers.csv",
  summary: "summary.json",
};

export function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value) {
  const text = normalizeWhitespace(value);
  return text || "";
}

export function normalizeEmail(value) {
  const email = normalizeWhitespace(value).toLowerCase();
  if (!email) return "";
  return /.+@.+\..+/.test(email) ? email : "";
}

export function normalizePhoneE164(raw) {
  const input = normalizeWhitespace(raw);
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function phoneDigitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function parseYesBlankFlag(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return false;
  return ["1", "true", "yes", "y"].includes(text);
}

export function csvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function rowsToCsv(columns, rows) {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((column) => csvField(row[column])).join(","));
  return `${[header, ...lines].join("\n")}\n`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
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

  const header = (rows.shift() || []).map((column) => normalizeWhitespace(column));
  return rows
    .filter((record) => record.some((value) => normalizeWhitespace(value)))
    .map((record) => Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])));
}

function splitNameParts(fullName) {
  const text = normalizeWhitespace(fullName);
  if (!text) return { firstName: "", lastName: "", fullName: "" };
  const parts = text.split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(" "),
  };
}

export function parsePrimaryPersonName(rawName) {
  const original = normalizeWhitespace(rawName);
  if (!original) {
    return {
      rawName: "",
      selectedName: "",
      firstName: "",
      lastName: "",
      strategy: "blank",
    };
  }

  const segments = original
    .split(/\s+(?:and|&|\/|\+)\s+/i)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);

  if (segments.length <= 1) {
    const name = splitNameParts(original);
    return {
      rawName: original,
      selectedName: name.fullName,
      firstName: name.firstName,
      lastName: name.lastName,
      strategy: "single_name",
    };
  }

  const firstSegment = splitNameParts(segments[0]);
  if (firstSegment.lastName) {
    return {
      rawName: original,
      selectedName: firstSegment.fullName,
      firstName: firstSegment.firstName,
      lastName: firstSegment.lastName,
      strategy: "first_segment_full_name",
    };
  }

  const tailTokens = segments[segments.length - 1].split(" ").filter(Boolean);
  if (tailTokens.length >= 2) {
    const selectedName = normalizeWhitespace(`${firstSegment.firstName} ${tailTokens[tailTokens.length - 1]}`);
    const parsed = splitNameParts(selectedName);
    return {
      rawName: original,
      selectedName: parsed.fullName,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      strategy: "shared_trailing_surname",
    };
  }

  return {
    rawName: original,
    selectedName: firstSegment.firstName,
    firstName: firstSegment.firstName,
    lastName: "",
    strategy: "first_segment_only",
  };
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = normalizeOptionalText(value);
    if (text) return text;
  }
  return "";
}

function mergeBooleanInt(current, incoming) {
  const currentNumber = current === "" ? null : Number(current);
  const incomingNumber = incoming === "" ? null : Number(incoming);
  if (currentNumber === 1 || incomingNumber === 1) return "1";
  if (currentNumber === 0 || incomingNumber === 0) return "0";
  return "";
}

function mergeNotes(current, incoming) {
  const values = [normalizeOptionalText(current), normalizeOptionalText(incoming)].filter(Boolean);
  return [...new Set(values)].join(" | ");
}

function dedupeByKey(rows, keyFn, mergeFn) {
  const byKey = new Map();
  const order = [];

  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, row);
      order.push(key);
      continue;
    }
    byKey.set(key, mergeFn(byKey.get(key), row));
  }

  return order.map((key) => byKey.get(key));
}

function mergeContactsRow(current, incoming) {
  return {
    ...current,
    first_name: firstNonBlank(current.first_name, incoming.first_name),
    last_name: firstNonBlank(current.last_name, incoming.last_name),
    created_at: firstNonBlank(current.created_at, incoming.created_at),
    updated_at: firstNonBlank(incoming.updated_at, current.updated_at),
    tags: firstNonBlank(current.tags, incoming.tags),
    welcome_sent_at: firstNonBlank(current.welcome_sent_at, incoming.welcome_sent_at),
  };
}

function mergeConsentStatusRow(current, incoming) {
  return {
    ...current,
    status: current.status === "opted_in" || incoming.status === "opted_in" ? "opted_in" : firstNonBlank(current.status, incoming.status),
    source: firstNonBlank(current.source, incoming.source),
    source_detail: firstNonBlank(current.source_detail, incoming.source_detail),
    consented_at: firstNonBlank(current.consented_at, incoming.consented_at),
    created_at: firstNonBlank(current.created_at, incoming.created_at),
    updated_at: firstNonBlank(incoming.updated_at, current.updated_at),
    first_name: firstNonBlank(current.first_name, incoming.first_name),
    last_name: firstNonBlank(current.last_name, incoming.last_name),
    email: firstNonBlank(current.email, incoming.email),
    consent_email: mergeBooleanInt(current.consent_email, incoming.consent_email),
    wy_voter: firstNonBlank(current.wy_voter, incoming.wy_voter),
    county: firstNonBlank(current.county, incoming.county),
    zip: firstNonBlank(current.zip, incoming.zip),
    consent_version: firstNonBlank(current.consent_version, incoming.consent_version),
    user_agent: firstNonBlank(current.user_agent, incoming.user_agent),
    ip_hash: firstNonBlank(current.ip_hash, incoming.ip_hash),
    address1: firstNonBlank(current.address1, incoming.address1),
    address2: firstNonBlank(current.address2, incoming.address2),
    city: firstNonBlank(current.city, incoming.city),
    state: firstNonBlank(current.state, incoming.state),
    country: firstNonBlank(current.country, incoming.country),
    state_house_district: firstNonBlank(current.state_house_district, incoming.state_house_district),
    state_senate_district: firstNonBlank(current.state_senate_district, incoming.state_senate_district),
  };
}

function mergeNewsletterRow(current, incoming) {
  return {
    ...current,
    email: firstNonBlank(current.email, incoming.email),
    email_norm: firstNonBlank(current.email_norm, incoming.email_norm),
    consent_email: mergeBooleanInt(current.consent_email, incoming.consent_email) || "1",
    consent_version: firstNonBlank(current.consent_version, incoming.consent_version),
    source: firstNonBlank(current.source, incoming.source),
    active: mergeBooleanInt(current.active, incoming.active) || "1",
    confirmed_at: firstNonBlank(current.confirmed_at, incoming.confirmed_at),
    user_agent: firstNonBlank(current.user_agent, incoming.user_agent),
    ip_hash: firstNonBlank(current.ip_hash, incoming.ip_hash),
    created_at: firstNonBlank(current.created_at, incoming.created_at),
    updated_at: firstNonBlank(incoming.updated_at, current.updated_at),
  };
}

function mergeSmsOptinsRow(current, incoming) {
  return {
    ...current,
    name: firstNonBlank(current.name, incoming.name),
    phone: firstNonBlank(current.phone, incoming.phone),
    consent: mergeBooleanInt(current.consent, incoming.consent) || "0",
    consent_version: firstNonBlank(current.consent_version, incoming.consent_version),
    source: firstNonBlank(current.source, incoming.source),
    user_agent: firstNonBlank(current.user_agent, incoming.user_agent),
    ip_hash: firstNonBlank(current.ip_hash, incoming.ip_hash),
    created_at: firstNonBlank(current.created_at, incoming.created_at),
    email: firstNonBlank(current.email, incoming.email),
    consent_email: mergeBooleanInt(current.consent_email, incoming.consent_email) || "0",
    wy_voter: firstNonBlank(current.wy_voter, incoming.wy_voter),
    county: firstNonBlank(current.county, incoming.county),
    zip: firstNonBlank(current.zip, incoming.zip),
    first_name: firstNonBlank(current.first_name, incoming.first_name),
    last_name: firstNonBlank(current.last_name, incoming.last_name),
    is_volunteer: mergeBooleanInt(current.is_volunteer, incoming.is_volunteer) || "1",
  };
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_value, index) => index);

  function find(index) {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  return { find, union };
}

function mergeVolunteerCandidate(current, incoming) {
  return {
    ...current,
    first_name: firstNonBlank(current.first_name, incoming.first_name),
    last_name: firstNonBlank(current.last_name, incoming.last_name),
    email: firstNonBlank(current.email, incoming.email),
    phone: firstNonBlank(current.phone, incoming.phone),
    source: firstNonBlank(current.source, incoming.source),
    status: firstNonBlank(current.status, incoming.status),
    notes: mergeNotes(current.notes, incoming.notes),
    tags_json: firstNonBlank(current.tags_json, incoming.tags_json),
    created_at: firstNonBlank(current.created_at, incoming.created_at),
    updated_at: firstNonBlank(incoming.updated_at, current.updated_at),
  };
}

export function deterministicVolunteerId(row) {
  const phone = normalizeOptionalText(row.phone);
  const email = normalizeEmail(row.email);
  const firstName = normalizeOptionalText(row.first_name);
  const lastName = normalizeOptionalText(row.last_name);
  const notes = normalizeOptionalText(row.notes);
  const baseKey = phone
    ? `phone:${phone}`
    : email
    ? `email:${email}`
    : `name:${firstName}|${lastName}|notes:${notes}`;
  return `optin-import-${createHash("sha256").update(baseKey).digest("hex").slice(0, 24)}`;
}

function dedupeVolunteerRows(rows) {
  if (!rows.length) return [];
  const unionFind = createUnionFind(rows.length);
  const phoneToIndex = new Map();
  const emailToIndex = new Map();

  rows.forEach((row, index) => {
    const phone = normalizeOptionalText(row.phone);
    const email = normalizeEmail(row.email);
    if (phone) {
      if (phoneToIndex.has(phone)) unionFind.union(index, phoneToIndex.get(phone));
      else phoneToIndex.set(phone, index);
    }
    if (email) {
      if (emailToIndex.has(email)) unionFind.union(index, emailToIndex.get(email));
      else emailToIndex.set(email, index);
    }
  });

  const grouped = new Map();
  rows.forEach((row, index) => {
    const root = unionFind.find(index);
    if (!grouped.has(root)) {
      grouped.set(root, row);
      return;
    }
    grouped.set(root, mergeVolunteerCandidate(grouped.get(root), row));
  });

  return [...grouped.values()].map((row) => ({
    ...row,
    id: deterministicVolunteerId(row),
  }));
}

function ensureExpectedSourceColumns(rows) {
  const firstRow = rows[0] || {};
  const missing = SOURCE_COLUMNS.filter((column) => !Object.prototype.hasOwnProperty.call(firstRow, column));
  if (missing.length) {
    throw new Error(`Source CSV missing required columns: ${missing.join(", ")}`);
  }
}

function makeAuditRow(normalized, targets, reasons) {
  return {
    source_row: normalized.sourceRow,
    name_raw: normalized.rawName,
    name_selected: normalized.selectedName,
    name_strategy: normalized.nameStrategy,
    first_name: normalized.firstName,
    last_name: normalized.lastName,
    email_normalized: normalized.email,
    phone_e164: normalized.phoneE164,
    phone_digits: normalized.phoneDigits,
    city_town: normalized.cityTown,
    opt_in_text: normalized.optInText ? "1" : "0",
    opt_in_email: normalized.optInEmail ? "1" : "0",
    volunteer: normalized.volunteer ? "1" : "0",
    notes: normalized.notes,
    targets: targets.join("|"),
    skip_reasons: reasons.join("|"),
  };
}

function summarizeSkipReasons(auditRows) {
  return auditRows.reduce((accumulator, row) => {
    const reasons = normalizeOptionalText(row.skip_reasons).split("|").filter(Boolean);
    for (const reason of reasons) {
      accumulator[reason] = (accumulator[reason] || 0) + 1;
    }
    return accumulator;
  }, {});
}

export function buildImportBundle(sourceRows, options = {}) {
  ensureExpectedSourceColumns(sourceRows);

  const generatedAt = normalizeOptionalText(options.generatedAt) || new Date().toISOString();
  const consentVersion =
    normalizeOptionalText(options.consentVersion) || `signup-sheet-import-v1-${generatedAt.slice(0, 10)}`;
  const consentSource = normalizeOptionalText(options.consentSource) || "manual_import";
  const consentSourceDetail = normalizeOptionalText(options.consentSourceDetail) || "signup_sheet_csv";
  const newsletterSource = normalizeOptionalText(options.newsletterSource) || "skovgard2026:signup_sheet_import";
  const smsOptinsSource = normalizeOptionalText(options.smsOptinsSource) || "skovgard2026:signup_sheet_import";
  const volunteerSource = normalizeOptionalText(options.volunteerSource) || "import";
  const volunteerStatus = normalizeOptionalText(options.volunteerStatus) || "new";
  const volunteerTagsJson = normalizeOptionalText(options.volunteerTagsJson) || "[]";

  const auditRows = [];
  const contactsRows = [];
  const consentStatusRows = [];
  const newsletterRows = [];
  const smsOptinsRows = [];
  const volunteerRows = [];

  sourceRows.forEach((row, index) => {
    const sourceRow = normalizeOptionalText(row.row) || String(index + 1);
    const rawName = normalizeOptionalText(row.name);
    const parsedName = parsePrimaryPersonName(rawName);
    const email = normalizeEmail(row.email);
    const phoneE164 = normalizePhoneE164(row.phone);
    const phoneDigits = phoneE164 ? phoneDigitsOnly(phoneE164) : "";
    const cityTown = normalizeOptionalText(row.city_town);
    const optInText = parseYesBlankFlag(row.opt_in_text);
    const optInEmail = parseYesBlankFlag(row.opt_in_email);
    const volunteer = parseYesBlankFlag(row.volunteer);
    const notes = normalizeOptionalText(row.notes);
    const normalized = {
      sourceRow,
      rawName,
      selectedName: parsedName.selectedName,
      nameStrategy: parsedName.strategy,
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      email,
      phoneE164,
      phoneDigits,
      cityTown,
      optInText,
      optInEmail,
      volunteer,
      notes,
    };

    const targets = [];
    const reasons = [];

    if (!rawName) reasons.push("missing_name");
    if (optInText && !phoneE164) reasons.push("text_yes_without_valid_phone");
    if (optInEmail && !email) reasons.push("email_yes_without_valid_email");
    if (volunteer && !phoneDigits) reasons.push("volunteer_yes_without_valid_phone_for_sms_optins");

    if (optInText && phoneE164) {
      targets.push("contacts", "consent_status");
      contactsRows.push({
        phone_e164: phoneE164,
        first_name: parsedName.firstName,
        last_name: parsedName.lastName,
        created_at: generatedAt,
        updated_at: generatedAt,
        tags: "",
        welcome_sent_at: "",
      });
      consentStatusRows.push({
        phone_e164: phoneE164,
        status: "opted_in",
        source: consentSource,
        source_detail: consentSourceDetail,
        consented_at: generatedAt,
        revoked_at: "",
        last_inbound_keyword: "",
        created_at: generatedAt,
        updated_at: generatedAt,
        first_name: parsedName.firstName,
        last_name: parsedName.lastName,
        email,
        consent_email: optInEmail ? "1" : "0",
        wy_voter: "",
        county: "",
        zip: "",
        consent_version: consentVersion,
        user_agent: "",
        ip_hash: "",
        address1: "",
        address2: "",
        city: cityTown,
        state: "",
        country: "",
        state_house_district: "",
        state_senate_district: "",
      });
    }

    if (optInEmail && email) {
      targets.push("newsletter_subscribers");
      newsletterRows.push({
        email,
        email_norm: email,
        consent_email: "1",
        consent_version: consentVersion,
        source: newsletterSource,
        active: "1",
        confirmed_at: "",
        user_agent: "",
        ip_hash: "",
        created_at: generatedAt,
        updated_at: generatedAt,
      });
    }

    if (volunteer) {
      targets.push("volunteers");
      volunteerRows.push({
        id: "",
        first_name: parsedName.firstName,
        last_name: parsedName.lastName,
        email,
        phone: phoneE164,
        source: volunteerSource,
        status: volunteerStatus,
        notes,
        tags_json: volunteerTagsJson,
        created_at: generatedAt,
        updated_at: generatedAt,
      });
      if (phoneDigits) {
        targets.push("sms_optins");
        smsOptinsRows.push({
          name: parsedName.selectedName,
          phone: phoneDigits,
          consent: optInText ? "1" : "0",
          consent_version: consentVersion,
          source: smsOptinsSource,
          user_agent: "",
          ip_hash: "",
          created_at: generatedAt,
          email,
          consent_email: optInEmail ? "1" : "0",
          wy_voter: "",
          county: "",
          zip: "",
          first_name: parsedName.firstName,
          last_name: parsedName.lastName,
          is_volunteer: "1",
        });
      }
    }

    if (!targets.length) reasons.push("no_import_targets");
    auditRows.push(makeAuditRow(normalized, targets, reasons));
  });

  const dedupedContacts = dedupeByKey(contactsRows, (row) => row.phone_e164, mergeContactsRow);
  const dedupedConsentStatus = dedupeByKey(consentStatusRows, (row) => row.phone_e164, mergeConsentStatusRow);
  const dedupedNewsletter = dedupeByKey(newsletterRows, (row) => row.email_norm, mergeNewsletterRow);
  const dedupedSmsOptins = dedupeByKey(smsOptinsRows, (row) => row.phone, mergeSmsOptinsRow);
  const dedupedVolunteers = dedupeVolunteerRows(volunteerRows);

  const summary = {
    generatedAt,
    consentVersion,
    sourceRowCount: sourceRows.length,
    auditRowCount: auditRows.length,
    contactsRows: dedupedContacts.length,
    consentStatusRows: dedupedConsentStatus.length,
    newsletterRows: dedupedNewsletter.length,
    smsOptinsRows: dedupedSmsOptins.length,
    volunteerRows: dedupedVolunteers.length,
    skipReasons: summarizeSkipReasons(auditRows),
  };

  return {
    summary,
    auditRows,
    contactsRows: dedupedContacts,
    consentStatusRows: dedupedConsentStatus,
    newsletterRows: dedupedNewsletter,
    smsOptinsRows: dedupedSmsOptins,
    volunteerRows: dedupedVolunteers,
  };
}

export function readCsvFile(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function sanitizeRunName(value) {
  return normalizeOptionalText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function defaultRunName(sourcePath, generatedAt) {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const cleanBase = sanitizeRunName(base) || "source";
  return `${stamp}-${cleanBase}`;
}

export function loadTransformedRun(runDir) {
  const readIfPresent = (fileName) => {
    const filePath = path.join(runDir, fileName);
    return fs.existsSync(filePath) ? readCsvFile(filePath) : [];
  };

  const summaryPath = path.join(runDir, OUTPUT_FILE_NAMES.summary);
  return {
    runDir,
    summary: fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")) : {},
    auditRows: readIfPresent(OUTPUT_FILE_NAMES.audit),
    contactsRows: readIfPresent(OUTPUT_FILE_NAMES.contacts),
    consentStatusRows: readIfPresent(OUTPUT_FILE_NAMES.consentStatus),
    newsletterRows: readIfPresent(OUTPUT_FILE_NAMES.newsletter),
    smsOptinsRows: readIfPresent(OUTPUT_FILE_NAMES.smsOptins),
    volunteerRows: readIfPresent(OUTPUT_FILE_NAMES.volunteers),
  };
}
