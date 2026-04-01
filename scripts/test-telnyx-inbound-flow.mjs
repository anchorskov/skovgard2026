#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const WORKER_DIR = path.join(ROOT_DIR, "worker");
const FIXTURE_DIR = path.join(__dirname, "fixtures", "telnyx-inbound");
const TMP_WRANGLER_DIR = path.join("/tmp", `skovgard2026-wrangler-${process.pid}`);
const DEV_VARS_PATH = path.join(WORKER_DIR, ".dev.vars");

const PORT = Number(process.env.TEXTING_WEBHOOK_TEST_PORT || (8700 + (process.pid % 1000)));
const API_BASE = process.env.TEXTING_WEBHOOK_TEST_API_BASE || `http://127.0.0.1:${PORT}`;
const WEBHOOK_URL = `${API_BASE}/api/telnyx/webhook`;
const HEALTH_URL = `${API_BASE}/api/health`;

mkdirSync(TMP_WRANGLER_DIR, { recursive: true });

const WRANGLER_ENV_OVERRIDES = {
  WRANGLER_LOG_PATH: path.join(TMP_WRANGLER_DIR, "wrangler.log"),
  XDG_CONFIG_HOME: TMP_WRANGLER_DIR,
};

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const BLUE = "\u001b[34m";
const RESET = "\u001b[0m";

let failures = 0;
let wranglerProcess = null;
let originalDevVars = null;

function info(message) {
  console.log(`${BLUE}i${RESET} ${message}`);
}

function pass(message) {
  console.log(`${GREEN}PASS${RESET} ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`${RED}FAIL${RESET} ${message}`);
}

function warn(message) {
  console.log(`${YELLOW}WARN${RESET} ${message}`);
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
    const value = trimmed.slice(eq + 1);
    out[key] = stripQuotes(value);
  }
  return out;
}

function applyLocalReactivationOverride() {
  if (originalDevVars !== null) return;
  originalDevVars = readFileSync(DEV_VARS_PATH, "utf8");
  let updated = originalDevVars;
  if (/^TELNYX_ALLOW_REACTIVATION=.*/m.test(updated)) {
    updated = updated.replace(/^TELNYX_ALLOW_REACTIVATION=.*/m, "TELNYX_ALLOW_REACTIVATION=1");
  } else {
    updated = `${updated.trimEnd()}\nTELNYX_ALLOW_REACTIVATION=1\n`;
  }
  writeFileSync(DEV_VARS_PATH, updated, "utf8");
}

function restoreLocalReactivationOverride() {
  if (originalDevVars === null) return;
  writeFileSync(DEV_VARS_PATH, originalDevVars, "utf8");
  originalDevVars = null;
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

function parseWranglerJson(output) {
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

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function queryDb(sql) {
  const output = runCommand(
    "npx",
    ["wrangler", "d1", "execute", "ballot_sources", "--local", "--json", "--command", sql],
    { cwd: WORKER_DIR }
  );
  return parseWranglerJson(output);
}

function queryOne(sql) {
  return queryDb(sql)[0] || null;
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
      if (response.ok && data && data.ok === true) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Worker did not become healthy on ${HEALTH_URL}`);
}

async function startWrangler() {
  applyLocalReactivationOverride();
  info("Applying local D1 migrations");
  runCommand("npx", ["wrangler", "d1", "migrations", "apply", "ballot_sources", "--local"], {
    cwd: WORKER_DIR,
  });

  info(`Starting wrangler dev on ${API_BASE}`);
  wranglerProcess = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--var", "TELNYX_ALLOW_REACTIVATION=1"], {
    cwd: WORKER_DIR,
    env: {
      ...process.env,
      ...WRANGLER_ENV_OVERRIDES,
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  wranglerProcess.stdout.on("data", () => {});
  wranglerProcess.stderr.on("data", () => {});

  wranglerProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      warn(`wrangler dev exited with code ${code}`);
    }
  });

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

function buildPhone(seed) {
  return `+1307${String(seed).padStart(7, "0")}`;
}

function renderFixture(name, replacements) {
  const filePath = path.join(FIXTURE_DIR, `${name}.json`);
  let raw = readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    raw = raw.replaceAll(`__${key}__`, String(value));
  }
  return JSON.parse(raw);
}

async function postFixture(name, replacements) {
  const payload = renderFixture(name, replacements);
  const { response, data, text } = await fetchJson(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${name} webhook failed (${response.status}): ${typeof data === "string" ? text : JSON.stringify(data)}`);
  }
}

async function waitFor(assertion, label, timeoutMs = 8000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await assertion();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  if (lastError) throw lastError;
  throw new Error(`Timed out waiting for ${label}`);
}

function requireCount(row, field, expected, label) {
  const actual = Number(row?.[field] ?? NaN);
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function fetchConversation(phone, adminKey) {
  const url = new URL(`${API_BASE}/api/admin/texting/conversations`);
  url.searchParams.set("phone", phone);
  url.searchParams.set("key", adminKey);
  const { response, data, text } = await fetchJson(url.toString());
  if (!response.ok) {
    throw new Error(`conversation fetch failed (${response.status}): ${typeof data === "string" ? text : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const devVars = loadDevVars();
  const adminKey = stripQuotes(process.env.ADMIN_EXPORT_KEY || devVars.ADMIN_EXPORT_KEY || "");
  const toNumber = stripQuotes(process.env.TELNYX_FROM_NUMBER || devVars.TELNYX_FROM_NUMBER || "");
  if (!adminKey) throw new Error("Missing ADMIN_EXPORT_KEY in worker/.dev.vars");
  if (!toNumber) throw new Error("Missing TELNYX_FROM_NUMBER in worker/.dev.vars");

  const seed = Date.now() % 10000000;
  const normalPhone = buildPhone(seed);
  const keywordPhone = buildPhone((seed + 1) % 10000000);

  const replacements = (name, fromNumber) => {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    return {
      EVENT_ID: `evt-${suffix}`,
      MESSAGE_ID: `msg-${suffix}`,
      FROM_NUMBER: fromNumber,
      TO_NUMBER: toNumber,
      OCCURRED_AT: timestamp,
      RECEIVED_AT: timestamp,
    };
  };

  await startWrangler();
  pass("Worker health check passed");

  info("Posting normal inbound webhook fixture");
  await postFixture("normal", replacements("normal", normalPhone));
  await waitFor(async () => {
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM contacts WHERE phone_e164='${sqlString(normalPhone)}'`), "n", 1, "normal contact");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM inbound_messages WHERE phone_from='${sqlString(normalPhone)}'`), "n", 1, "normal inbound message");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM texting_audit_log WHERE target_phone='${sqlString(normalPhone)}' AND action='inbound_message_received'`), "n", 1, "normal inbound audit");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM outbound_messages WHERE phone_to='${sqlString(normalPhone)}'`), "n", 0, "normal outbound mirror");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM consent_status WHERE phone_e164='${sqlString(normalPhone)}'`), "n", 0, "normal consent row");
    const conversation = await fetchConversation(normalPhone, adminKey);
    if (!Array.isArray(conversation.items) || conversation.items.length !== 1) {
      throw new Error(`normal conversation expected 1 item, got ${conversation.items?.length ?? 0}`);
    }
    return true;
  }, "normal inbound verification");
  pass("Normal inbound text mirrored into contacts, inbound_messages, audit log, and admin conversation");

  info("Posting STOP webhook fixture");
  await postFixture("stop", replacements("stop", keywordPhone));
  await waitFor(async () => {
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM contacts WHERE phone_e164='${sqlString(keywordPhone)}'`), "n", 1, "STOP contact");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM inbound_messages WHERE phone_from='${sqlString(keywordPhone)}'`), "n", 1, "STOP inbound message");
    const consent = queryOne(`SELECT status, last_inbound_keyword FROM consent_status WHERE phone_e164='${sqlString(keywordPhone)}'`);
    if (!consent || consent.status !== "opted_out" || consent.last_inbound_keyword !== "STOP") {
      throw new Error(`STOP consent mismatch: ${JSON.stringify(consent)}`);
    }
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM texting_audit_log WHERE target_phone='${sqlString(keywordPhone)}' AND action='inbound_opt_out'`), "n", 1, "STOP audit");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM outbound_messages WHERE phone_to='${sqlString(keywordPhone)}'`), "n", 0, "STOP outbound mirror");
    const conversation = await fetchConversation(keywordPhone, adminKey);
    if (!Array.isArray(conversation.items) || conversation.items.length !== 1) {
      throw new Error(`STOP conversation expected 1 item, got ${conversation.items?.length ?? 0}`);
    }
    return true;
  }, "STOP verification");
  pass("STOP mirrored to local opted_out state without app-side outbound reply");

  info("Posting HELP webhook fixture");
  await postFixture("help", replacements("help", keywordPhone));
  await waitFor(async () => {
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM inbound_messages WHERE phone_from='${sqlString(keywordPhone)}'`), "n", 2, "HELP inbound message count");
    const consent = queryOne(`SELECT status, last_inbound_keyword FROM consent_status WHERE phone_e164='${sqlString(keywordPhone)}'`);
    if (!consent || consent.status !== "opted_out" || consent.last_inbound_keyword !== "HELP") {
      throw new Error(`HELP consent mismatch: ${JSON.stringify(consent)}`);
    }
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM texting_audit_log WHERE target_phone='${sqlString(keywordPhone)}' AND action='inbound_help'`), "n", 1, "HELP audit");
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM outbound_messages WHERE phone_to='${sqlString(keywordPhone)}'`), "n", 0, "HELP outbound mirror");
    const conversation = await fetchConversation(keywordPhone, adminKey);
    if (!Array.isArray(conversation.items) || conversation.items.length !== 2) {
      throw new Error(`HELP conversation expected 2 items, got ${conversation.items?.length ?? 0}`);
    }
    return true;
  }, "HELP verification");
  pass("HELP updated only the keyword/audit state and preserved opted_out status");

  info("Posting START webhook fixture");
  await postFixture("start", replacements("start", keywordPhone));
  await waitFor(async () => {
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM inbound_messages WHERE phone_from='${sqlString(keywordPhone)}'`), "n", 3, "START inbound message count");
    const consent = queryOne(`SELECT status, last_inbound_keyword FROM consent_status WHERE phone_e164='${sqlString(keywordPhone)}'`);
    if (!consent || consent.status !== "opted_in" || consent.last_inbound_keyword !== "START") {
      throw new Error(`START consent mismatch: ${JSON.stringify(consent)}`);
    }
    const optInAudit = queryOne(
      `SELECT COUNT(*) AS n
         FROM texting_audit_log
        WHERE target_phone='${sqlString(keywordPhone)}'
          AND action IN ('inbound_opt_in', 'inbound_opt_in_reactivated')`
    );
    if (Number(optInAudit?.n ?? 0) < 1) {
      throw new Error("START audit row missing");
    }
    requireCount(queryOne(`SELECT COUNT(*) AS n FROM outbound_messages WHERE phone_to='${sqlString(keywordPhone)}'`), "n", 0, "START outbound mirror");
    const conversation = await fetchConversation(keywordPhone, adminKey);
    if (!Array.isArray(conversation.items) || conversation.items.length !== 3) {
      throw new Error(`START conversation expected 3 items, got ${conversation.items?.length ?? 0}`);
    }
    if (!conversation.consent || conversation.consent.status !== "opted_in") {
      throw new Error(`START conversation consent mismatch: ${JSON.stringify(conversation.consent)}`);
    }
    return true;
  }, "START verification");
  pass("START reactivated the number locally and preserved a single admin thread");

  console.log("");
  console.log("Phones used:");
  console.log(`  normal:  ${normalPhone}`);
  console.log(`  keyword: ${keywordPhone}`);
}

process.on("SIGINT", () => {
  void stopWrangler();
  restoreLocalReactivationOverride();
  process.exit(130);
});

process.on("SIGTERM", () => {
  void stopWrangler();
  restoreLocalReactivationOverride();
  process.exit(143);
});

main()
  .catch((error) => {
    fail(error.message);
  })
  .finally(async () => {
    await stopWrangler();
    restoreLocalReactivationOverride();
    if (failures > 0) process.exitCode = 1;
  });
