// scripts/wy_email_pipeline/sync_to_d1.mjs
//
// Syncs the email/demographics linkage pipeline from the standalone
// voterdata/wyoming wy.sqlite into the shared "wy" D1 database. Run
// migrations/023_wy_email_demographics_pipeline.sql first so the target
// tables/views exist.
//
// Usage:
//   node scripts/wy_email_pipeline/sync_to_d1.mjs --table voter_registry_detail [options]
//
// Options:
//   --table NAME      One of: voter_registry_detail, people, deliverable_stage_norm,
//                      voter_demographics, voter_emails_senate_district (backfill only)
//   --source PATH     Path to the standalone wy.sqlite (default: voterdata/wyoming/wy.sqlite)
//   --local            Target the local D1 database (default)
//   --remote           Target the remote D1 database
//   --env NAME         Wrangler environment for --remote, e.g. production
//   --batch-size N     Rows per INSERT statement (default 500)
//   --apply            Execute the generated SQL after writing it
//   --out-dir PATH     Where to write generated SQL (default: scratch dir, not committed)

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const WRANGLER_BIN = path.join(ROOT_DIR, "worker", "node_modules", ".bin", "wrangler");
const WRANGLER_CONFIG = path.join(ROOT_DIR, "worker", "wrangler.toml");
const DEFAULT_SOURCE = "/home/anchor/projects/voterdata/wyoming/wy.sqlite";

const TABLES = {
  voter_registry_detail: {
    sourceTable: "voters",
    columns: [
      "voter_id", "last_name", "first_name", "middle_name", "name_suffix",
      "county", "precinct", "split_code", "political_party", "eff_reg_date",
      "house_district", "senate_district", "status",
    ],
    conflictKey: "voter_id",
    mode: "insert_or_ignore",
  },
  people: {
    sourceTable: "people",
    columns: ["person_id", "first_name", "last_name", "email", "phone"],
    conflictKey: "person_id",
    mode: "insert_or_ignore",
  },
  deliverable_stage_norm: {
    sourceTable: "deliverable_stage_norm",
    columns: [
      "sequence", "lalvoterid", "voters_first_name", "voters_middle_name",
      "voters_last_name", "voters_name_suffix", "age", "birth_date",
      "birth_month", "email_raw", "email_norm",
    ],
    mode: "insert_no_guard",
  },
  voter_demographics: {
    sourceTable: "voter_demographics",
    columns: [
      "voter_id", "lalvoterid", "age", "birth_date", "birth_month", "source",
      "import_batch", "observed_at", "imported_at", "is_stale", "stale_reason",
      "stale_as_of",
    ],
    mode: "insert_no_guard",
  },
  voter_emails: {
    sourceTable: "voter_emails",
    columns: [
      "voter_id", "email_raw", "email_norm", "confidence_code", "source",
      "import_batch", "observed_at", "imported_at", "zip", "senate_district",
    ],
    conflictKeys: ["voter_id", "email_norm"],
    mode: "upsert_senate_district",
  },
};

function usage() {
  console.log(`Usage:
  node scripts/wy_email_pipeline/sync_to_d1.mjs --table NAME [options]

Tables: ${Object.keys(TABLES).join(", ")}

Options:
  --source PATH     Path to standalone wy.sqlite (default: ${DEFAULT_SOURCE})
  --local           Target the local D1 database (default)
  --remote          Target the remote D1 database
  --env NAME        Wrangler environment for --remote, e.g. production
  --batch-size N    Rows per INSERT statement (default 500)
  --apply           Execute the generated SQL after writing it
  --out-dir PATH    Where to write generated SQL (default: OS tmp dir)
  --help            Show this message
`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(token, true);
      continue;
    }
    args.set(token, next);
    i += 1;
  }
  return args;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  const text = String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function runSqlite(sqlitePath, sql) {
  const result = spawnSync("sqlite3", ["-json", sqlitePath, sql], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`sqlite3 query failed:\n${result.stderr || result.stdout}`);
  }
  const out = result.stdout.trim();
  return out ? JSON.parse(out) : [];
}

function runWrangler(args) {
  const result = spawnSync(WRANGLER_BIN, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: { ...process.env, XDG_CONFIG_HOME: "/tmp", WRANGLER_LOG_PATH: "/tmp/skovgard2026-wrangler.log" },
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function targetCount(target, tableName) {
  const sql = `SELECT COUNT(*) AS n FROM ${tableName};`;
  const wranglerArgs = ["d1", "execute", "wy", "--json", "--command", sql, "--config", WRANGLER_CONFIG, target.mode];
  if (target.envName) wranglerArgs.push("--env", target.envName);
  const out = runWrangler(wranglerArgs);
  const parsed = JSON.parse(out);
  const results = parsed?.[0]?.results || [];
  return results[0]?.n ?? 0;
}

function buildInsertBatches(rows, columns, tableName, { mode, conflictKey, conflictKeys }, batchSize) {
  const statements = [];
  const verb = mode === "upsert_senate_district" ? "INSERT" : "INSERT OR IGNORE";

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const valuesSql = chunk
      .map((row) => `(${columns.map((col) => sqlValue(row[col])).join(", ")})`)
      .join(",\n  ");

    let statement = `${verb} INTO ${tableName} (${columns.join(", ")})\nVALUES\n  ${valuesSql}`;

    if (mode === "upsert_senate_district") {
      const keys = conflictKeys.join(", ");
      statement += `\nON CONFLICT(${keys}) DO UPDATE SET\n  senate_district = COALESCE(${tableName}.senate_district, excluded.senate_district)`;
    }

    statements.push(`${statement};`);
  }
  return statements;
}

const args = parseArgs(process.argv.slice(2));
if (args.has("--help") || !args.has("--table")) {
  usage();
  process.exit(args.has("--help") ? 0 : 2);
}

const tableName = String(args.get("--table"));
const tableSpec = TABLES[tableName];
if (!tableSpec) {
  console.error(`Unknown --table "${tableName}". Options: ${Object.keys(TABLES).join(", ")}`);
  process.exit(2);
}

const sourcePath = args.get("--source") ? path.resolve(String(args.get("--source"))) : DEFAULT_SOURCE;
if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source sqlite file not found: ${sourcePath}`);
}
if (!fs.existsSync(WRANGLER_BIN)) {
  throw new Error(`Wrangler binary not found: ${WRANGLER_BIN}`);
}

const target = {
  mode: args.has("--remote") ? "--remote" : "--local",
  envName: args.get("--env") || "",
};

const batchSize = Number(args.get("--batch-size")) || 500;
const outDir = args.get("--out-dir") ? path.resolve(String(args.get("--out-dir"))) : fs.mkdtempSync(path.join(os.tmpdir(), "wy-email-sync-"));
fs.mkdirSync(outDir, { recursive: true });

// Guard: for tables with no unique constraint in D1, refuse to double-load.
if (tableSpec.mode === "insert_no_guard") {
  const existing = targetCount(target, tableName);
  if (existing > 0) {
    console.error(
      `Target ${tableName} already has ${existing} rows and has no unique constraint to dedupe against. ` +
      `Refusing to run again -- verify intent, then truncate or pass a different --table before retrying.`
    );
    process.exit(1);
  }
}

console.log(`Reading ${tableSpec.sourceTable} from ${sourcePath} ...`);
const rows = runSqlite(sourcePath, `SELECT ${tableSpec.columns.join(", ")} FROM ${tableSpec.sourceTable};`);
console.log(`Read ${rows.length} rows.`);

const statements = buildInsertBatches(rows, tableSpec.columns, tableName, tableSpec, batchSize);
const sqlPath = path.join(outDir, `${tableName}.sql`);
fs.writeFileSync(sqlPath, `${statements.join("\n\n")}\n`, "utf8");
console.log(`Wrote ${statements.length} batched statements (batch size ${batchSize}) to ${sqlPath}`);

if (args.has("--apply")) {
  console.log(`Applying to ${target.mode === "--remote" ? `remote (${target.envName || "default"})` : "local"} ...`);
  const wranglerArgs = ["d1", "execute", "wy", "--file", sqlPath, "--config", WRANGLER_CONFIG, target.mode];
  if (target.envName) wranglerArgs.push("--env", target.envName);
  runWrangler(wranglerArgs);
  console.log("Applied.");
  console.log(`New row count: ${targetCount(target, tableName)}`);
} else {
  console.log("Dry run only -- pass --apply to execute against the target database.");
}
