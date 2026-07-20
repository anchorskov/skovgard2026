// scripts/optins/reset-pulse-test-contact.mjs
//
// Resets the two things that gate repeat sends from the /pulse opt-in flow
// (worker/src/index.js's shouldSendStaffEmail/shouldSendConfirmationEmail and
// telnyx.js's maybeSendWelcomeText welcome_sent_at check) for one phone
// number, so the next /pulse submission from that number looks like a
// brand-new opt-in and re-triggers the staff email, confirmation email, and
// SMS welcome text. Does not touch newsletter_subscribers/email_contacts --
// those aren't part of the send-gating logic and don't need resetting.
//
// KNOWN GAP (found 2026-07-19): clearing welcome_sent_at is NOT always
// enough to re-trigger the welcome SMS. maybeSendWelcomeText (telnyx.js)
// also checks the delivery status of the most recent pulse_welcome_send
// message for this phone -- if that prior send shows "delivered", it
// no-ops with reason "pending_or_delivered" regardless of welcome_sent_at.
// This script does not (yet) account for that. Also does not clear
// consent_status.poll_link_sent_at (migration 032) -- moot for this script
// since it deletes the whole consent_status row, but worth knowing if you
// adapt this logic elsewhere. See docs/pulse_flow.md §8 and docs/test_data.md.
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT_DIR, normalizePhoneE164 } from "./lib.mjs";

const WRANGLER_BIN = path.join(ROOT_DIR, "worker", "node_modules", ".bin", "wrangler");
const WRANGLER_CONFIG = path.join(ROOT_DIR, "worker", "wrangler.toml");

function usage() {
  console.log(`Usage:
  node scripts/optins/reset-pulse-test-contact.mjs --phone 3072772260 [--env production]

Options:
  --phone NUMBER   Required. Test phone number (any format; normalized to E.164).
  --env NAME       Wrangler environment (default: production -- /pulse only runs there).
  --help           Show this message
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

function runWrangler(sqlArgs, envName) {
  const args = [...sqlArgs, "--config", WRANGLER_CONFIG, "--remote"];
  if (envName) args.push("--env", envName);
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
  return result.stdout;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("--help")) {
    usage();
    return;
  }

  const phoneE164 = normalizePhoneE164(args.get("--phone"));
  if (!phoneE164) {
    usage();
    throw new Error("A valid --phone value is required.");
  }
  const envName = args.get("--env") || "production";

  console.log(`Resetting Pulse send-gating state for ${phoneE164} (env: ${envName})...`);

  runWrangler(
    ["d1", "execute", "ballot_sources", "--command", `DELETE FROM consent_status WHERE phone_e164 = '${phoneE164}';`],
    envName
  );
  console.log("  consent_status row deleted (staff + confirmation email will re-fire).");

  runWrangler(
    [
      "d1",
      "execute",
      "ballot_sources",
      "--command",
      `UPDATE contacts SET welcome_sent_at = NULL, updated_at = datetime('now') WHERE phone_e164 = '${phoneE164}';`,
    ],
    envName
  );
  console.log("  contacts.welcome_sent_at cleared (SMS welcome text will re-fire).");

  console.log(`\nDone. Submit the /pulse form again with ${phoneE164} to see a fresh staff email, confirmation email, and welcome text.`);
}

main();
