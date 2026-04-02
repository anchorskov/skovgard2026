#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker"
DEV_VARS_PATH="$WORKER_DIR/.dev.vars"
LOCAL_D1_DIR="$WORKER_DIR/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
TMP_DIR="/tmp/skovgard2026-admin-emails-$$"
PORT="${ADMIN_EMAILS_TEST_PORT:-8822}"
API_BASE="http://127.0.0.1:${PORT}"

TEST_EMAIL_READY="admin-email-ready-smoke+$$@example.com"
TEST_EMAIL_INACTIVE="admin-email-inactive-smoke+$$@example.com"
TEST_EMAIL_NO_CONSENT="admin-email-noconsent-smoke+$$@example.com"
TEST_PHONE_READY="+1307$(printf '%07d' "$((5100000 + ($$ % 1000)))")"
TEST_PHONE_NO_CONSENT="+1307$(printf '%07d' "$((5200000 + ($$ % 1000)))")"
TEST_CITY="SmokeCity$$"
TEST_HD="$((700 + ($$ % 200)))"
TEST_SD="$((300 + ($$ % 200)))"

mkdir -p "$TMP_DIR"

log() {
  printf 'i %s\n' "$1"
}

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

ADMIN_KEY="$(sed -n 's/^ADMIN_EXPORT_KEY=//p' "$DEV_VARS_PATH" | head -n 1 | sed 's/^"//; s/"$//')"
if [[ -z "$ADMIN_KEY" ]]; then
  fail "ADMIN_EXPORT_KEY missing from $DEV_VARS_PATH"
fi

find_local_db() {
  local candidate
  for candidate in "$LOCAL_D1_DIR"/*.sqlite; do
    [[ -e "$candidate" ]] || continue
    if [[ "$(sqlite3 "$candidate" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('newsletter_subscribers','consent_status');")" -ge 2 ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

DB_PATH="$(find_local_db)" || fail "No local D1 sqlite database with admin email tables found in $LOCAL_D1_DIR"

cleanup_sql() {
  cat <<SQL
DELETE FROM consent_status
 WHERE LOWER(TRIM(email)) IN (
   LOWER(TRIM('${TEST_EMAIL_READY}')),
   LOWER(TRIM('${TEST_EMAIL_INACTIVE}')),
   LOWER(TRIM('${TEST_EMAIL_NO_CONSENT}'))
 );
DELETE FROM newsletter_subscribers
 WHERE email_norm IN (
   LOWER(TRIM('${TEST_EMAIL_READY}')),
   LOWER(TRIM('${TEST_EMAIL_INACTIVE}')),
   LOWER(TRIM('${TEST_EMAIL_NO_CONSENT}'))
 );
SQL
}

seed_sql() {
  cat <<SQL
$(cleanup_sql)
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
  email,
  consent_email,
  consent_version,
  city,
  state,
  state_house_district,
  state_senate_district,
  created_at,
  updated_at
)
VALUES
  (
    '${TEST_PHONE_READY}',
    'opted_in',
    'admin_test',
    'admin_email_smoke',
    datetime('now'),
    NULL,
    'START',
    'Email',
    'Ready',
    '${TEST_EMAIL_READY}',
    1,
    'email-admin-smoke-v1',
    '${TEST_CITY}',
    'WY',
    '${TEST_HD}',
    '${TEST_SD}',
    datetime('now'),
    datetime('now')
  ),
  (
    '${TEST_PHONE_NO_CONSENT}',
    'opted_in',
    'admin_test',
    'admin_email_smoke',
    datetime('now'),
    NULL,
    'START',
    'Email',
    'NoConsent',
    '${TEST_EMAIL_NO_CONSENT}',
    0,
    'email-admin-smoke-v1',
    '${TEST_CITY}',
    'WY',
    '${TEST_HD}',
    '${TEST_SD}',
    datetime('now'),
    datetime('now')
  );

INSERT INTO newsletter_subscribers (
  email,
  email_norm,
  source,
  consent_email,
  consent_version,
  active,
  created_at,
  updated_at,
  confirmed_at
)
VALUES
  (
    '${TEST_EMAIL_READY}',
    LOWER(TRIM('${TEST_EMAIL_READY}')),
    'admin_email_smoke',
    1,
    'email-admin-smoke-v1',
    1,
    datetime('now'),
    datetime('now'),
    datetime('now')
  ),
  (
    '${TEST_EMAIL_INACTIVE}',
    LOWER(TRIM('${TEST_EMAIL_INACTIVE}')),
    'admin_email_smoke',
    1,
    'email-admin-smoke-v1',
    0,
    datetime('now'),
    datetime('now'),
    datetime('now')
  ),
  (
    '${TEST_EMAIL_NO_CONSENT}',
    LOWER(TRIM('${TEST_EMAIL_NO_CONSENT}')),
    'admin_email_smoke',
    0,
    'email-admin-smoke-v1',
    1,
    datetime('now'),
    datetime('now'),
    datetime('now')
  );
SQL
}

cleanup() {
  if [[ -n "${WRANGLER_PID:-}" ]] && kill -0 "$WRANGLER_PID" 2>/dev/null; then
    kill "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
  fi
  sqlite3 "$DB_PATH" "$(cleanup_sql)" >/dev/null 2>&1 || true
}

trap cleanup EXIT

log "Seeding local contacts for admin email smoke test"
sqlite3 "$DB_PATH" "$(seed_sql)"

log "Starting wrangler dev on ${API_BASE}"
(
  cd "$WORKER_DIR"
  WRANGLER_LOG_PATH="$TMP_DIR/wrangler.log" \
  XDG_CONFIG_HOME="$TMP_DIR" \
  npx wrangler dev --port "$PORT"
) >"$TMP_DIR/wrangler.stdout.log" 2>&1 &
WRANGLER_PID=$!

healthy=0
for _ in $(seq 1 120); do
  if curl -s "$API_BASE/api/health" >"$TMP_DIR/health.json" 2>/dev/null; then
    if node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.exit(data.ok===true?0:1);" "$TMP_DIR/health.json"; then
      healthy=1
      break
    fi
  fi
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
    cat "$TMP_DIR/wrangler.stdout.log" >&2 || true
    fail "wrangler dev exited before health check"
  fi
  sleep 0.25
done

if [[ "$healthy" -ne 1 ]]; then
  cat "$TMP_DIR/wrangler.stdout.log" >&2 || true
  fail "Worker did not become healthy on $API_BASE/api/health"
fi

curl -s -H "Authorization: Bearer $ADMIN_KEY" "$API_BASE/api/admin/emails/status" >"$TMP_DIR/status.json"
curl -s -H "Authorization: Bearer $ADMIN_KEY" "$API_BASE/api/admin/emails/contacts?filter=all&limit=10" >"$TMP_DIR/contacts.json"
curl -s -H "Authorization: Bearer $ADMIN_KEY" -H "content-type: application/json" \
  -d "{\"filter\":\"all\",\"limit\":10,\"city\":\"$TEST_CITY\",\"hd\":\"$TEST_HD\",\"sd\":\"$TEST_SD\",\"subject\":\"Smoke Test Subject\",\"body\":\"Smoke test body for admin email preview.\"}" \
  "$API_BASE/api/admin/emails/preview" >"$TMP_DIR/filter-preview.json"
curl -s -H "Authorization: Bearer $ADMIN_KEY" -H "content-type: application/json" \
  -d "{\"subject\":\"Explicit Tray Test\",\"body\":\"Testing the explicit recipient tray preview path.\",\"recipients\":[\"$TEST_EMAIL_READY\",\"$TEST_EMAIL_INACTIVE\",\"$TEST_EMAIL_NO_CONSENT\"]}" \
  "$API_BASE/api/admin/emails/preview" >"$TMP_DIR/explicit-preview.json"
curl -s -o "$TMP_DIR/send.json" -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "content-type: application/json" \
  -d '{"subject":"Disabled","body":"Disabled"}' \
  "$API_BASE/api/admin/emails/send" >"$TMP_DIR/send.status"

node - "$TMP_DIR/status.json" "$TMP_DIR/contacts.json" "$TMP_DIR/filter-preview.json" "$TMP_DIR/explicit-preview.json" "$TMP_DIR/send.json" "$TMP_DIR/send.status" "$TEST_EMAIL_READY" "$TEST_EMAIL_INACTIVE" "$TEST_EMAIL_NO_CONSENT" <<'NODE'
const fs = require("node:fs");

const [
  statusPath,
  contactsPath,
  filterPreviewPath,
  explicitPreviewPath,
  sendPath,
  sendStatusPath,
  readyEmail,
  inactiveEmail,
  noConsentEmail,
] = process.argv.slice(2);

const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const contacts = JSON.parse(fs.readFileSync(contactsPath, "utf8"));
const filterPreview = JSON.parse(fs.readFileSync(filterPreviewPath, "utf8"));
const explicitPreview = JSON.parse(fs.readFileSync(explicitPreviewPath, "utf8"));
const send = JSON.parse(fs.readFileSync(sendPath, "utf8"));
const sendStatus = Number(fs.readFileSync(sendStatusPath, "utf8"));

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

if (status.previewPathReady === true && status.sendPathReady === false && status.sender === "support@grassrootsmvt.org") {
  pass("admin email status route reports preview ready and send disabled");
} else {
  fail(`Unexpected status payload: ${JSON.stringify(status)}`);
}

const contactItems = Array.isArray(contacts.items) ? contacts.items : [];
const contactMap = new Map(contactItems.map((item) => [item.email, item]));
if (
  contactMap.get(readyEmail)?.email_status === "emailable" &&
  contactMap.get(inactiveEmail)?.email_status === "inactive" &&
  contactMap.get(noConsentEmail)?.email_status === "no_consent"
) {
  pass("contacts route returns emailable, inactive, and no_consent rows");
} else {
  fail(`Unexpected contacts payload: ${JSON.stringify(contacts)}`);
}

if (
  filterPreview.mode === "filter" &&
  Number(filterPreview.count) === 1 &&
  Number(filterPreview.skippedCount) >= 1 &&
  Array.isArray(filterPreview.previewRecipients) &&
  filterPreview.previewRecipients.some((item) => item.email === readyEmail)
) {
  pass("filter preview keeps only emailable recipients");
} else {
  fail(`Unexpected filter preview payload: ${JSON.stringify(filterPreview)}`);
}

if (
  explicitPreview.mode === "explicit" &&
  Number(explicitPreview.audienceCount) === 3 &&
  Number(explicitPreview.count) === 1 &&
  Array.isArray(explicitPreview.previewRecipients) &&
  explicitPreview.previewRecipients[0]?.email === readyEmail
) {
  pass("explicit tray preview respects email safeguards");
} else {
  fail(`Unexpected explicit preview payload: ${JSON.stringify(explicitPreview)}`);
}

if (sendStatus === 503 && /not enabled/i.test(String(send.error || ""))) {
  pass("send route is implemented but blocked while admin email sending is disabled");
} else {
  fail(`Unexpected send payload (${sendStatus}): ${JSON.stringify(send)}`);
}

console.log(JSON.stringify({
  status: {
    sender: status.sender || null,
    previewPathReady: status.previewPathReady === true,
    sendPathReady: status.sendPathReady === true,
  },
  contacts: contactItems
    .filter((item) => [readyEmail, inactiveEmail, noConsentEmail].includes(item.email))
    .map((item) => ({
      email: item.email,
      email_status: item.email_status,
      city: item.city,
      hd: item.state_house_district,
      sd: item.state_senate_district,
    })),
  filterPreview: {
    audienceCount: filterPreview.audienceCount,
    count: filterPreview.count,
    skippedCount: filterPreview.skippedCount,
  },
  explicitPreview: {
    audienceCount: explicitPreview.audienceCount,
    count: explicitPreview.count,
    skippedCount: explicitPreview.skippedCount,
  },
  send: {
    httpStatus: sendStatus,
    error: send.error || null,
  },
}, null, 2));
NODE
