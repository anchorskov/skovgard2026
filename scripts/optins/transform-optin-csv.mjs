// scripts/optins/transform-optin-csv.mjs
import fs from "node:fs";
import path from "node:path";
import {
  ROOT_DIR,
  DEFAULT_WORKING_ROOT,
  OUTPUT_FILE_NAMES,
  SOURCE_AUDIT_COLUMNS,
  CONTACTS_COLUMNS,
  CONSENT_STATUS_COLUMNS,
  NEWSLETTER_COLUMNS,
  SMS_OPTINS_COLUMNS,
  VOLUNTEERS_COLUMNS,
  buildImportBundle,
  defaultRunName,
  ensureDirectory,
  readCsvFile,
  rowsToCsv,
  sanitizeRunName,
  writeJson,
} from "./lib.mjs";

function usage() {
  console.log(`Usage:
  node scripts/optins/transform-optin-csv.mjs --source /abs/path/source.csv [options]

Options:
  --source PATH           Source CSV with signup rows
  --output-root PATH      Ignored working root for generated files
                          Default: ${path.relative(ROOT_DIR, DEFAULT_WORKING_ROOT)}
  --run-name NAME         Optional run directory name under output-root
  --generated-at ISO      Fixed timestamp for deterministic output
  --consent-version TEXT  Consent/import version stamp
  --help                  Show this message
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

const args = parseArgs(process.argv.slice(2));
if (args.has("--help")) {
  usage();
  process.exit(0);
}

const sourcePath = args.get("--source");
if (!sourcePath) {
  usage();
  process.exit(2);
}

const resolvedSourcePath = path.resolve(sourcePath);
if (!fs.existsSync(resolvedSourcePath)) {
  throw new Error(`Source CSV not found: ${resolvedSourcePath}`);
}

const generatedAt = String(args.get("--generated-at") || "").trim() || new Date().toISOString();
const outputRoot = path.resolve(String(args.get("--output-root") || DEFAULT_WORKING_ROOT));
const requestedRunName = sanitizeRunName(String(args.get("--run-name") || ""));
const runName = requestedRunName || defaultRunName(resolvedSourcePath, generatedAt);
const runDir = path.join(outputRoot, runName);

if (fs.existsSync(runDir)) {
  throw new Error(`Run directory already exists: ${runDir}`);
}

ensureDirectory(runDir);

const bundle = buildImportBundle(readCsvFile(resolvedSourcePath), {
  generatedAt,
  consentVersion: args.get("--consent-version") || "",
});

fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.audit),
  rowsToCsv(SOURCE_AUDIT_COLUMNS, bundle.auditRows),
  "utf8"
);
fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.contacts),
  rowsToCsv(CONTACTS_COLUMNS, bundle.contactsRows),
  "utf8"
);
fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.consentStatus),
  rowsToCsv(CONSENT_STATUS_COLUMNS, bundle.consentStatusRows),
  "utf8"
);
fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.newsletter),
  rowsToCsv(NEWSLETTER_COLUMNS, bundle.newsletterRows),
  "utf8"
);
fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.smsOptins),
  rowsToCsv(SMS_OPTINS_COLUMNS, bundle.smsOptinsRows),
  "utf8"
);
fs.writeFileSync(
  path.join(runDir, OUTPUT_FILE_NAMES.volunteers),
  rowsToCsv(VOLUNTEERS_COLUMNS, bundle.volunteerRows),
  "utf8"
);

writeJson(path.join(runDir, OUTPUT_FILE_NAMES.summary), {
  ...bundle.summary,
  sourcePath: resolvedSourcePath,
  outputRoot,
  runDir,
  files: Object.fromEntries(
    Object.entries(OUTPUT_FILE_NAMES).map(([key, fileName]) => [key, path.join(runDir, fileName)])
  ),
});

console.log(JSON.stringify({
  ok: true,
  runDir,
  ...bundle.summary,
}, null, 2));
