#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const WORKER_DIR = path.join(ROOT_DIR, "worker");
const DEV_VARS_PATH = path.join(WORKER_DIR, ".dev.vars");
const TMP_WRANGLER_DIR = path.join("/tmp", `skovgard2026-admin-texting-${process.pid}`);
const LOCAL_D1_DIR = path.join(
  WORKER_DIR,
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject"
);

const PORT = Number(process.env.ADMIN_TEXTING_TEST_PORT || (8800 + (process.pid % 500)));
const API_BASE = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${API_BASE}/api/health`;

mkdirSync(TMP_WRANGLER_DIR, { recursive: true });

const WRANGLER_ENV_OVERRIDES = {
  WRANGLER_LOG_PATH: path.join(TMP_WRANGLER_DIR, "wrangler.log"),
  XDG_CONFIG_HOME: TMP_WRANGLER_DIR,
};

const TEST_CITY = `Tray City ${process.pid}`;
const TEST_HD = `HD${process.pid % 1000}`;
const TEST_SD = `SD${(process.pid + 1) % 1000}`;
const TEST_SD_ALT = `SD${(process.pid + 2) % 1000}`;
const ELIGIBLE_PHONE = `+1307${String(3000000 + (process.pid % 1000)).padStart(7, "0")}`;
const BLOCKED_PHONE = `+1307${String(4000000 + (process.pid % 1000)).padStart(7, "0")}`;

let wranglerProcess = null;
let failures = 0;

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

function warn(message) {
  console.log(`WARN ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripQuotes(value) {
  const text = String(value || "").trim();
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function loadDevVars() {
  const out = {};
  const raw = readFileSync(DEV_VARS_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    out[key] = stripQuotes(trimmed.slice(eq + 1));
  }
  return out;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: options.env || { ...process.env, ...WRANGLER_ENV_OVERRIDES },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function localDbPath() {
  const entry = readdirSync(LOCAL_D1_DIR).find((name) => name.endsWith(".sqlite"));
  if (!entry) {
    throw new Error(`No local D1 sqlite database found in ${LOCAL_D1_DIR}`);
  }
  return path.join(LOCAL_D1_DIR, entry);
}

function runSqlite(sql) {
  const result = spawnSync("sqlite3", [localDbPath(), sql], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed:\n${result.stderr || result.stdout}`);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}

async function waitForHealth(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { response, data } = await fetchJson(HEALTH_URL);
      if (response.ok && data?.ok === true) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Worker did not become healthy on ${HEALTH_URL}`);
}

function cleanupSql() {
  return `
    DELETE FROM consent_status WHERE phone_e164 IN ('${sqlString(ELIGIBLE_PHONE)}', '${sqlString(BLOCKED_PHONE)}');
    DELETE FROM contacts WHERE phone_e164 IN ('${sqlString(ELIGIBLE_PHONE)}', '${sqlString(BLOCKED_PHONE)}');
  `;
}

function seedSql() {
  return `
    ${cleanupSql()}

    INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at)
    VALUES
      ('${sqlString(ELIGIBLE_PHONE)}', 'Tray', 'Eligible', datetime('now'), datetime('now')),
      ('${sqlString(BLOCKED_PHONE)}', 'Tray', 'Blocked', datetime('now'), datetime('now'));

    INSERT INTO consent_status (
      phone_e164,
      status,
      source,
      source_detail,
      consented_at,
      revoked_at,
      last_inbound_keyword,
      first_name,
      last_name,
      city,
      state,
      state_house_district,
      state_senate_district,
      created_at,
      updated_at
    )
    VALUES
      (
        '${sqlString(ELIGIBLE_PHONE)}',
        'opted_in',
        'admin_test',
        'tray_smoke',
        datetime('now'),
        NULL,
        'START',
        'Tray',
        'Eligible',
        '${sqlString(TEST_CITY)}',
        'WY',
        '${sqlString(TEST_HD)}',
        '${sqlString(TEST_SD)}',
        datetime('now'),
        datetime('now')
      ),
      (
        '${sqlString(BLOCKED_PHONE)}',
        'opted_out',
        'admin_test',
        'tray_smoke',
        NULL,
        datetime('now'),
        'STOP',
        'Tray',
        'Blocked',
        '${sqlString(TEST_CITY)}',
        'WY',
        '${sqlString(TEST_HD)}',
        '${sqlString(TEST_SD_ALT)}',
        datetime('now'),
        datetime('now')
      );
  `;
}

function applyLocalMigrations() {
  info("Applying local D1 migrations");
  try {
    runCommand("npx", ["wrangler", "d1", "migrations", "apply", "ballot_sources", "--local"], {
      cwd: WORKER_DIR,
    });
  } catch (error) {
    warn(`Skipping local migration apply: ${error.message.split("\n")[0]}`);
  }
}

function seedLocalData() {
  info("Seeding local contacts for admin texting smoke test");
  runSqlite(seedSql());
}

function cleanupLocalData() {
  runSqlite(cleanupSql());
}

async function startWrangler() {
  info(`Starting wrangler dev on ${API_BASE}`);
  wranglerProcess = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
    cwd: WORKER_DIR,
    env: { ...process.env, ...WRANGLER_ENV_OVERRIDES },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  wranglerProcess.stdout.on("data", () => {});
  wranglerProcess.stderr.on("data", () => {});

  await waitForHealth();
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }
    const onExit = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.on("exit", onExit);
  });
}

async function stopWrangler() {
  if (!wranglerProcess) return;
  const child = wranglerProcess;
  wranglerProcess = null;
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  if (await waitForChildExit(child, 1500)) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await waitForChildExit(child, 1500);
}

async function testCityAndHdFilter(adminKey) {
  const url = `${API_BASE}/api/admin/texting/contacts?key=${encodeURIComponent(adminKey)}&filter=all&city=${encodeURIComponent(TEST_CITY)}&hd=${encodeURIComponent(TEST_HD)}&limit=10`;
  const { response, data, text } = await fetchJson(url);
  if (!response.ok) {
    fail(`City/HD filter request failed (${response.status}): ${text}`);
    return;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const phones = items.map((item) => item.phone_e164);
  const includesEligible = phones.includes(ELIGIBLE_PHONE);
  const includesBlocked = phones.includes(BLOCKED_PHONE);
  const countyHidden = items.every((item) => !Object.prototype.hasOwnProperty.call(item, "county"));

  if (includesEligible && includesBlocked && countyHidden) {
    pass("city + HD filtering returned the seeded contacts without exposing county");
  } else {
    fail(`Unexpected city/HD filter result: ${JSON.stringify(items)}`);
  }
}

async function testSdFilter(adminKey) {
  const url = `${API_BASE}/api/admin/texting/contacts?key=${encodeURIComponent(adminKey)}&filter=all&sd=${encodeURIComponent(TEST_SD)}&limit=10`;
  const { response, data, text } = await fetchJson(url);
  if (!response.ok) {
    fail(`SD filter request failed (${response.status}): ${text}`);
    return;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 1 && items[0]?.phone_e164 === ELIGIBLE_PHONE) {
    pass("SD filtering isolated the seeded opted-in contact");
  } else {
    fail(`Unexpected SD filter result: ${JSON.stringify(items)}`);
  }
}

async function testExplicitRecipientPreview(adminKey) {
  const { response, data, text } = await fetchJson(
    `${API_BASE}/api/admin/texting/send-batch?key=${encodeURIComponent(adminKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dry_run: true,
        text: "Tray preview smoke test",
        recipients: [ELIGIBLE_PHONE, BLOCKED_PHONE],
      }),
    }
  );

  if (!response.ok) {
    fail(`Explicit tray preview failed (${response.status}): ${text}`);
    return;
  }

  const previewPhone = data?.previewRecipients?.[0]?.phone_e164 || "";
  if (
    data?.mode === "explicit" &&
    data?.audienceCount === 2 &&
    data?.count === 1 &&
    data?.skippedCount === 1 &&
    previewPhone === ELIGIBLE_PHONE &&
    data?.approval?.token
  ) {
    pass("explicit-recipient preview enforced opted-in-only delivery while preserving preview approval");
  } else {
    fail(`Unexpected explicit tray preview result: ${JSON.stringify(data)}`);
  }
}

async function main() {
  const adminKey = loadDevVars().ADMIN_EXPORT_KEY;
  if (!adminKey) {
    throw new Error("ADMIN_EXPORT_KEY missing from worker/.dev.vars");
  }

  applyLocalMigrations();
  seedLocalData();
  await startWrangler();

  try {
    await testCityAndHdFilter(adminKey);
    await testSdFilter(adminKey);
    await testExplicitRecipientPreview(adminKey);
  } finally {
    await stopWrangler();
    cleanupLocalData();
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  info("Admin texting tray smoke test passed");
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  try {
    await stopWrangler();
  } finally {
    try {
      cleanupLocalData();
    } catch {}
  }
  process.exitCode = 1;
});
