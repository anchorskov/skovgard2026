// worker/src/index.js
import {
  isOutboundSendBlocked,
  insertTextingAuditLog,
  logTelnyxEvent,
  maybeSendWelcomeText,
  normalizePhoneNumber,
  phoneDigitsOnly,
  processTelnyxWebhookEvent,
  sendSmsWithTelnyx,
  sendPollLinkText,
  upsertConsentStatus,
  verifyTelnyxSignature,
} from "./telnyx.js";
import {
  getAdminEmailConfig,
  insertAdminEmailAuditLog,
  sendAdminOutreachEmail,
} from "./admin-email.js";
import { lookupWyLegislativeDistricts, geocodeAddress } from "./address-districts.js";
import { resolvePrecinct } from "./precinct-lookup.js";
import { sendPulseOptInEmails, sendPollLinkEmail, sendPulseReviewNeededEmail, sendPulseFollowUpDigest } from "./pulse-email.js";
import { sendResendEmail } from "./resend.js";
import {
  processResendWebhookEvent,
  verifyResendWebhookSignature,
  computeAccountDeliverabilityRates,
  computeBlastJobDeliverabilityRates,
} from "./resend-webhooks.js";
import { buildShareEmailHtml, buildShareEmailText, SHARE_MESSAGES, escHtml } from "./email-template.js";
import {
  DEFAULT_SMS_RATES,
  estimateSmsCost,
  estimatePersonalizedSmsCost,
  calcBlastCost,
} from "./sms-cost.js";
import { promoteDeliveredOptInPhone } from "./voter-phone.js";

// Fixed engineering enum, not staff-editable -- see migrations 036/037.
const PULSE_CALL_STATUSES = new Set([
  "not_called",
  "left_voicemail",
  "reached_confirmed",
  "reached_declined",
  "bad_number",
  "do_not_call",
]);

function pulseWelcomeConfig(env) {
  return {
    enabled: env.PULSE_TEXT_WELCOME_ENABLED,
    text: env.PULSE_TEXT_WELCOME_TEXT,
    auditAction: "pulse_welcome_send",
  };
}
// --- CORS helpers ------------------------------------------------------------
function allowOrigin(env, req) {
  const origin = req.headers.get("origin") || "";

  // Default allow-list (apex + www + Pages + local)
  const defaults =
    "http://localhost:1313,http://127.0.0.1:1313,https://skovgard2026.org,https://www.skovgard2026.org,https://skovgard2026.pages.dev";

  const allow = (env.CORS_ORIGINS || defaults)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Exact match if configured
  if (allow.includes(origin)) return origin;

  // Safety net: always allow our production domains even if env drifted
  if (/^https:\/\/(?:www\.)?skovgard2026\.org$/.test(origin)) return origin;

  // Otherwise, strict: no ACAO
  return "";
}

function corsHeaders(env, req) {
  const originHeader = allowOrigin(env, req);
  const base = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, cf-turnstile-response, authorization",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
  return originHeader
    ? { "access-control-allow-origin": originHeader, ...base }
    : base;
}

function parseSubstackRSS(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
      const x = raw.match(r);
      return x ? x[1].trim() : "";
    };
    const linkM = raw.match(/<link>([^<]+)<\/link>/i) || raw.match(/<guid[^>]*>([^<]+)<\/guid>/i);
    const encM  = raw.match(/<enclosure[^>]+url="([^"]+)"/i);
    const durM  = raw.match(/<itunes:duration>([^<]+)<\/itunes:duration>/i);
    const desc  = get("description")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();
    items.push({
      title: get("title").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      link: linkM ? linkM[1].trim() : "",
      date: get("pubDate"),
      description: desc.length > 220 ? desc.slice(0, 220) + "…" : desc,
      audio: encM ? encM[1] : null,
      duration: durM ? durM[1].trim() : null,
    });
  }
  return items.filter(i => i.title && i.link).slice(0, 20);
}

function json(req, env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(env, req),
      ...extra,
    },
  });
}

// --- Utilities ---------------------------------------------------------------
function mediaBaseUrl(env) {
  const raw = String(env.MEDIA_BASE_URL || "").trim();
  const base = raw || "https://media.skovgard2026.org";
  return base.replace(/\/+$/, "");
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(s) {
  const bytes = new TextEncoder().encode(s || "");
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return hexFromBuffer(h);
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload || "")
  );
  return hexFromBuffer(sig);
}

// Cloudflare Turnstile: server-side validation (returns full response)
async function verifyTurnstile(secret, token, ip) {
  if (!secret || !token)
    return { success: false, "error-codes": ["missing-secret-or-token"] };
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip || "",
        }),
      }
    ).then((r) => r.json());
    // r: { success, challenge_ts, hostname, action?, "error-codes"? }
    return r;
  } catch {
    return { success: false, "error-codes": ["fetch-error"] };
  }
}

// Validate Turnstile-reported hostname against allow-list
function tsHostAllowed(env, h) {
  const base = String(h || "").trim().split(":")[0]; // normalize
  if (!base) return true; // if Turnstile didn't return a host, don't fail hard
  const list = String(
    env.TS_ALLOWED_HOSTNAMES ||
      "skovgard2026.org,www.skovgard2026.org,localhost,127.0.0.1,skovgard2026.pages.dev"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(base);
}

// Simple IP-based rate limiting; soft-fails open if table missing
async function rateLimitOk(env, ipHash, windowMin = 15, maxReq = 3) {
  try {
    await env.DB.prepare(
      "INSERT INTO rl_submissions (ip_hash) VALUES (?1)"
    )
      .bind(ipHash)
      .run();
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rl_submissions WHERE ip_hash=?1 AND created_at >= datetime('now', ?2)"
    )
      .bind(ipHash, `-${windowMin} minutes`)
      .first();
    return (row?.n || 0) <= maxReq;
  } catch {
    return true;
  }
}

// --- Time-trap helpers -------------------------------------------------------
function parseClientEpochMs(raw, now = Date.now()) {
  let ms = 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    ms = Math.trunc(raw);
  } else if (typeof raw === "string") {
    if (/^\d{13}$/.test(raw)) ms = parseInt(raw, 10);
    else if (/^\d{10}$/.test(raw)) ms = parseInt(raw, 10) * 1000;
    else {
      const d = Date.parse(raw);
      if (Number.isFinite(d)) ms = d;
    }
  }
  // Clamp to sane window
  const FIVE_MIN = 5 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (!ms) return 0;
  if (ms > now + FIVE_MIN) return 0;
  if (now - ms > SEVEN_DAYS) return 0;
  return ms;
}

function getElapsedMsFromBody(b, now = Date.now()) {
  const startMs = Number(b.ts_start_ms) || 0;
  const elapsedMs = Number(b.ts_elapsed_ms) || 0;
  if (elapsedMs > 0) return elapsedMs;
  if (startMs > 0) {
    const diff = now - startMs;
    return diff > 0 ? diff : 0;
  }
  const tsClient = parseClientEpochMs(b.ts_client, now);
  return tsClient > 0 ? now - tsClient : 0;
}

// --- Donate helpers ---------------------------------------------------------
function normalizeText(value) {
  return String(value || "").trim();
}

function isNonEmpty(value) {
  return normalizeText(value).length > 0;
}

function isAffirmative(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

function parseAmountToCents(raw) {
  const text = normalizeText(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "Invalid amount." };
  const amount = Number(text);
  if (!Number.isFinite(amount)) return { error: "Invalid amount." };
  const cents = Math.round(amount * 100);
  return { amount, cents };
}

function isValidEmail(email) {
  return /.+@.+\..+/.test(String(email || "").trim());
}

function normalizeEmailForStorage(email) {
  const raw = normalizeText(email);
  return {
    raw,
    normalized: raw.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Email opt-in/opt-out confirmation links (Yes/No buttons in admin-sent emails)
// ---------------------------------------------------------------------------
const OPTIN_PLACEHOLDER_RE = /\{optin_yes_url\}|\{optin_no_url\}/;
const FIRST_NAME_PLACEHOLDER_RE = /\{first(?:_|\s+)name\}/i;

function bodyNeedsOptinPlaceholders(bodyHtml) {
  return OPTIN_PLACEHOLDER_RE.test(String(bodyHtml || ""));
}

// Voter-file-sourced first names arrive ALL CAPS ("TYLER"); title-case them
// the same way the SMS path already does (personalizeSmsFirstName below).
// No "there"/generic fallback when a contact has no name on file -- the
// template's ", {first_name}" is dropped entirely (via the first .replace
// below) so a blank name reads as "Hi," instead of "Hi, ," or "Hi, there,".
export function substitutePersonalization(text, { firstName = "", optinYesUrl = "", optinNoUrl = "", pollLink = "" } = {}) {
  const name = titleCase(String(firstName || "").trim());
  return String(text || "")
    .replace(/\{first(?:_|\s+)name\}(\s*),/gi, name ? `${name}$1,` : "")
    .replace(/,(\s*)\{first(?:_|\s+)name\}/gi, name ? `,$1${name}` : "")
    .replace(/\{first(?:_|\s+)name\}/gi, name)
    .replace(/\{optin_yes_url\}/g, optinYesUrl)
    .replace(/\{optin_no_url\}/g, optinNoUrl)
    .replace(/\{poll_link\}/g, pollLink);
}

async function lookupAdminEmailFirstName(db, emailNorm) {
  try {
    const row = await db.prepare(
      `SELECT first_name
         FROM (
           SELECT first_name, 1 AS priority
             FROM email_contacts
            WHERE email_norm = ?1 AND TRIM(COALESCE(first_name, '')) <> ''
           UNION ALL
           SELECT first_name, 2 AS priority
             FROM consent_status
            WHERE LOWER(TRIM(COALESCE(email, ''))) = ?1 AND TRIM(COALESCE(first_name, '')) <> ''
           UNION ALL
           SELECT first_name, 3 AS priority
             FROM sms_optins
            WHERE LOWER(TRIM(COALESCE(email, ''))) = ?1 AND TRIM(COALESCE(first_name, '')) <> ''
         )
        ORDER BY priority
        LIMIT 1`
    ).bind(emailNorm).first();
    return normalizeText(row?.first_name || "");
  } catch (error) {
    console.error("lookupAdminEmailFirstName failed", String(error?.message || error));
    return "";
  }
}

async function createEmailOptinToken(db, { email, emailNorm, messageSlug, batchId }) {
  const token = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO email_optin_tokens (token, email, email_norm, message_slug, batch_id)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(token, email, emailNorm, messageSlug, batchId || null).run();
  const base = "https://skovgard2026.org";
  return {
    token,
    yesUrl: `${base}/api/email/optin-response?token=${token}&choice=yes`,
    noUrl: `${base}/api/email/optin-response?token=${token}&choice=no`,
  };
}

// Phase 3 dual-write (docs/db/EmailConsolidationPlan.md): keeps the
// canonical email_contacts/email_contact_purposes table fresh from the
// places an email's consent state or purpose genuinely, unambiguously
// changes. `purpose`/`priority` default to 'subscriber'/4 (the system max) --
// upsertNewsletterSubscriber and applyOptinResponse both call this at those
// defaults, so it always wins conflicts against lower-priority backfilled
// data (candidate/voter_file/purged_voter) -- except a sticky opted_out,
// matching the backfill scripts' rule that an explicit opt-out is never
// silently overwritten. The live volunteer-toggle dual-write (Phase 4,
// 2026-08-10) passes purpose='volunteer', priority=3, matching the priority
// order the Phase 2 backfill already established
// (scripts/email_contacts_backfill/01_same_db_sources.sql) -- kept below
// subscriber priority so marking someone a volunteer can never downgrade an
// existing confirmed newsletter opt-in. Errors are swallowed (logged only)
// so a failure writing to the new table can never break the primary,
// already-working flow that triggered it.
async function upsertEmailContactSubscriber(db, { email, emailNorm, consentStatus, source, purpose = "subscriber", priority = 4 }) {
  try {
    await db.prepare(
      `INSERT INTO email_contacts (email, email_norm, consent_status, source, source_detail, source_priority, first_seen_at, updated_at)
       VALUES (?1, ?2, ?3, 'email_contacts_dual_write', ?4, ?5, datetime('now'), datetime('now'))
       ON CONFLICT(email_norm) DO UPDATE SET
         consent_status = CASE
           WHEN email_contacts.consent_status = 'opted_out' THEN 'opted_out'
           WHEN excluded.consent_status = 'opted_out' THEN 'opted_out'
           WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.consent_status
           ELSE email_contacts.consent_status
         END,
         source = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source ELSE email_contacts.source END,
         source_detail = CASE WHEN excluded.source_priority >= email_contacts.source_priority THEN excluded.source_detail ELSE email_contacts.source_detail END,
         source_priority = MAX(email_contacts.source_priority, excluded.source_priority),
         updated_at = datetime('now')`
    ).bind(email, emailNorm, consentStatus, source, priority).run();

    await db.prepare(
      `INSERT OR IGNORE INTO email_contact_purposes (email_contact_id, purpose, source)
       SELECT id, ?3, ?2 FROM email_contacts WHERE email_norm = ?1`
    ).bind(emailNorm, source, purpose).run();
  } catch (error) {
    console.error("upsertEmailContactSubscriber dual-write failed", { emailNorm, purpose, error: String(error?.message || error) });
  }
}

async function applyOptinResponse(db, { email, emailNorm, choice }) {
  const consentEmail = choice === "yes" ? 1 : 0;
  const active = choice === "yes" ? 1 : 0;
  const confirmedAt = choice === "yes" ? new Date().toISOString() : null;
  await db.prepare(
    `INSERT INTO newsletter_subscribers
       (email, email_norm, consent_email, consent_version, source, active, confirmed_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'email-optin-response-v1', 'email_optin_response', ?4, ?5, datetime('now'), datetime('now'))
     ON CONFLICT(email_norm) DO UPDATE SET
       email = excluded.email,
       consent_email = excluded.consent_email,
       active = excluded.active,
       confirmed_at = excluded.confirmed_at,
       updated_at = excluded.updated_at`
  ).bind(email, emailNorm, consentEmail, active, confirmedAt).run();

  await upsertEmailContactSubscriber(db, {
    email,
    emailNorm,
    consentStatus: choice === "yes" ? "opted_in" : "opted_out",
    source: "email_contacts_dual_write:email_optin_response",
  });
}

// The "yes" link used to record consent on a bare GET, which is exactly
// what corporate email security scanners (Microsoft Safe Links, Proofpoint,
// Mimecast, etc.) do to every link in an incoming email within seconds of
// delivery to check it isn't malicious, completely independent of whether
// a human ever opened the email. Found 2026-08-12: 90 of ~100 "yes"
// responses on one campaign landed within 5 minutes of the link being
// generated, far too fast and too consistent across 100+ different
// institutional email domains to be real people. This page requires an
// actual button click (a real POST) before consent is recorded, so a
// scanner fetching the link no longer silently opts someone in. "No"
// deliberately stays a one-click GET below. A false-positive unsubscribe
// is low-harm and matches normal one-click-unsubscribe UX, unlike a false
// opt-in, which risks real complaints and sender-reputation damage.
function optinConfirmPage({ token }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirm your subscription: Skovgard 2026</title>
</head>
<body style="margin:0;background:#f1ece1;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
  <div style="max-width:480px;margin:64px auto;padding:0 20px;text-align:center;">
    <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#b22234;font-weight:700;margin:0 0 12px;">
      Skovgard for Wyoming
    </p>
    <h1 style="font-size:24px;margin:0 0 16px;color:#2b2b2b;">One more step</h1>
    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 24px;">
      Click below to confirm you would like to keep receiving campaign updates.
    </p>
    <form method="post" action="/api/email/optin-response/confirm">
      <input type="hidden" name="token" value="${escHtml(token)}">
      <button type="submit" style="background:#b22234;color:#f1ece1;border:none;border-radius:8px;padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer;">
        Yes, sign me up
      </button>
    </form>
  </div>
</body>
</html>`;
}

function optinResponsePage({ title, message, tone }) {
  const accent = tone === "error" ? "#8b1a26" : "#b22234";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)} — Skovgard 2026</title>
</head>
<body style="margin:0;background:#f1ece1;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
  <div style="max-width:480px;margin:64px auto;padding:0 20px;text-align:center;">
    <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${accent};font-weight:700;margin:0 0 12px;">
      Skovgard for Wyoming
    </p>
    <h1 style="font-size:24px;margin:0 0 16px;color:#2b2b2b;">${escHtml(title)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 24px;">${escHtml(message)}</p>
    <a href="https://skovgard2026.org/" style="color:${accent};font-weight:700;font-size:14px;text-decoration:none;">
      Return to skovgard2026.org &#8594;
    </a>
  </div>
</body>
</html>`;
}


// ---------------------------------------------------------------------------
// FEC election-period helpers
// Primary:  now  -> Aug 18 2026 (end of day UTC)
// General:  Aug 19 2026 -> Nov 3 2026 (end of day UTC)
// ---------------------------------------------------------------------------
function getFecElectionPeriod(now = new Date()) {
  const PRIMARY_END = new Date('2026-08-19T06:00:00Z'); // midnight MT Aug 18 -> 06:00 UTC
  const GENERAL_END = new Date('2026-11-04T07:00:00Z'); // midnight MT Nov 3  -> 07:00 UTC
  if (now < PRIMARY_END) return 'primary';
  if (now < GENERAL_END) return 'general';
  return null; // election cycle closed
}

const FEC_PERIOD_LIMIT_CENTS = 350000; // $3,500 per election period

async function getDonorPeriodTotalCents(db, email, period) {
  if (!email) return 0;
  const sql = [
    "SELECT COALESCE(SUM(c.amount_cents), 0) AS total",
    "FROM contributions c JOIN donors d ON c.donor_id = d.id",
    "WHERE lower(d.email) = lower(?1) AND c.election_period = ?2",
    "  AND c.status IN ('pending', 'succeeded', 'succeeded_webhook')",
  ].join(" ");
  const row = await db.prepare(sql).bind(email.toLowerCase(), period).first();
  return row?.total ?? 0;
}

async function upsertDonor(db, donor) {
  if (donor.email) {
    const existing = await db.prepare(
      "SELECT id FROM donors WHERE lower(email) = lower(?1) LIMIT 1"
    ).bind(donor.email).first();
    if (existing) {
      await db.prepare(
        "UPDATE donors SET first_name=?2, last_name=?3, address1=?4," +
        " city=?5, state=?6, zip=?7, employer=?8, occupation=?9 WHERE id=?1"
      ).bind(
        existing.id,
        donor.first_name, donor.last_name,
        donor.address1, donor.city, donor.state, donor.zip,
        donor.employer || '', donor.occupation || ''
      ).run();
      return existing.id;
    }
  }
  const ins = await db.prepare(
    "INSERT INTO donors (first_name, last_name, email, phone, address1, address2," +
    " city, state, zip, country, employer, occupation)" +
    " VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)"
  ).bind(
    donor.first_name, donor.last_name, donor.email || '', donor.phone || '',
    donor.address1, donor.address2 || '',
    donor.city, donor.state, donor.zip, donor.country,
    donor.employer || '', donor.occupation || ''
  ).run();
  return ins.meta.last_row_id;
}

async function upsertNewsletterSubscriber(db, input) {
  const { raw: emailRaw, normalized: email } = normalizeEmailForStorage(input?.email);
  const consentEmail = input?.consentEmail === true || input?.consentEmail === 1;
  const consentVersion = normalizeText(input?.consentVersion || "email-v1-2026-02-19");
  const source = normalizeText(input?.source || "skovgard2026:updates");
  const userAgent = normalizeText(input?.userAgent);
  const ipHash = normalizeText(input?.ipHash);

  if (!email || !isValidEmail(email)) {
    throw new Error("Valid email is required");
  }
  if (!consentEmail) {
    throw new Error("Email consent required");
  }

  await db.prepare(
    `INSERT INTO newsletter_subscribers
       (email, email_norm, consent_email, consent_version, source, active, user_agent, ip_hash, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, datetime('now'))
     ON CONFLICT(email_norm) DO UPDATE SET
       email=excluded.email,
       consent_email=excluded.consent_email,
       consent_version=excluded.consent_version,
       source=excluded.source,
       active=1,
       user_agent=excluded.user_agent,
       ip_hash=excluded.ip_hash,
       updated_at=datetime('now')`
  )
    .bind(emailRaw, email, consentEmail ? 1 : 0, consentVersion, source, userAgent, ipHash)
    .run();

  // This function throws above if !consentEmail, so reaching here always
  // means consent was just granted -- always 'opted_in', never 'opted_out'.
  await upsertEmailContactSubscriber(db, {
    email: emailRaw,
    emailNorm: email,
    consentStatus: "opted_in",
    source: `email_contacts_dual_write:${source}`,
  });
}

function normalizeLookupText(value) {
  return normalizeText(value).replace(/\s+/g, " ").toUpperCase();
}

function normalizeZip5(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function normalizePhone10(raw) {
  const digits = phoneDigitsOnly(raw);
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return "";
}

// Wyoming is one of the few states with a single area code for the entire
// state, and its ZIP codes fall in one contiguous range -- so a submitted
// phone/ZIP outside either is a useful (not proof-positive: real WY
// residents keep out-of-state cell numbers all the time) signal worth
// surfacing to staff reviewing an ambiguous/no_match row. Recomputed
// server-side rather than trusted from the client.
const WY_PHONE_AREA_CODE = "307";

export function isWyAreaCodePhone10(phone10) {
  return phone10.length === 10 && phone10.startsWith(WY_PHONE_AREA_CODE);
}

export function isWyZip5(zip5) {
  const n = Number(zip5);
  return Number.isFinite(n) && n >= 82001 && n <= 83128;
}

async function wyObjectExists(db, type, name) {
  const row = await db.prepare(
    `SELECT 1 AS ok
       FROM sqlite_master
      WHERE type = ?1
        AND name = ?2
      LIMIT 1`
  )
    .bind(type, name)
    .first()
    .catch(() => null);
  return Boolean(row?.ok);
}

// Row cap for every ambiguity-detection query below. Only ever needs to be
// ">1 row" to detect ambiguity, but the actual rows are also what gets
// stored as candidate_voter_ids for staff review -- capping at 2 (the old
// value) meant a review row for a 5-way collision only ever showed 2
// candidates, understating how ambiguous the case really was. 25 is
// generous enough that a real collision in a low-population voter file is
// never truncated in practice.
const WY_MATCH_CANDIDATE_LIMIT = 25;

async function findWyVoterIdByPhone(wyDb, phoneE164) {
  if (!phoneE164) return [];
  return wyDb.prepare(
    `SELECT DISTINCT voter_id FROM (
       SELECT voter_id FROM v_best_phone WHERE phone_e164 = ?1
       UNION
       SELECT voter_id FROM voter_phones WHERE phone_e164 = ?1
     )
     WHERE voter_id IS NOT NULL
     LIMIT ?2`
  )
    .bind(phoneE164, WY_MATCH_CANDIDATE_LIMIT)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);
}

async function findWyVoterIdByEmail(wyDb, emailNorm) {
  if (!emailNorm) return [];
  return wyDb.prepare(
    `SELECT DISTINCT voter_id FROM voter_emails
      WHERE voter_id IS NOT NULL AND email_norm = ?1
      LIMIT ?2`
  )
    .bind(emailNorm, WY_MATCH_CANDIDATE_LIMIT)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);
}

async function loadWyTargetingRowsByVoterIds(wyDb, voterIds) {
  const ids = [...new Set(voterIds.filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map((_v, i) => `?${i + 1}`).join(", ");
  return wyDb.prepare(
    `SELECT voter_id, first_name, last_name, city, zip, addr1, addr_raw
       FROM v_voter_targeting
      WHERE voter_id IN (${placeholders})`
  )
    .bind(...ids)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);
}

// Cascading match, tried in this order, first unique hit wins:
//   0. submitted phone already uniquely linked to a WY voter (voter_phones/
//      v_best_phone) -- may include numbers from other sources, e.g. a
//      vendor cell-append, not just this repo's own writes.
//   1. submitted email already uniquely linked to a WY voter (voter_emails)
//   2. name + city + zip + address1
//   3. name + city + zip
//   4. name + zip only (city dropped -- mailing city often differs from
//      the voter file's registered city)
//   5. name + city only, zip missing -- NEVER auto-accepted even when
//      unique (too many people can share a name within one city for a
//      ZIP-less match to stand on its own); always routed to staff review.
// Zero hits at a tier with no further tier to try -> no_match. More than
// one hit at any tier -> ambiguous_*. Both land in pulse_voter_match_review.
// Reduces raw v_voter_targeting rows (voter_id, first_name, last_name,
// city, zip, addr1, addr_raw) down to what's worth persisting in
// pulse_voter_match_review.candidate_voter_ids -- previously this stored
// bare voter_id numbers only, leaving the admin review UI with nothing to
// show staff but an anonymous ID list (found 2026-07-19 reviewing why a
// real, correct candidate for "Keith Goodenough" was invisible in the
// dropdown). Keeping first_name/last_name/city/zip/addr1 lets the UI
// render "8543 -- 333 S SOCONY PL, CASPER 82609" next to the submitted
// address so staff can actually compare them.
function summarizeMatchCandidates(candidates) {
  return (candidates || [])
    .filter((row) => row?.voter_id)
    .map((row) => ({
      voter_id: row.voter_id,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      city: row.city || null,
      zip: row.zip || null,
      addr1: row.addr1 || row.addr_raw || null,
    }));
}

export async function findUniqueWyTargetMatch(wyDb, input) {
  const firstName = normalizeLookupText(input.firstName);
  const lastName = normalizeLookupText(input.lastName);
  const city = normalizeLookupText(input.city);
  const zip = normalizeZip5(input.zip);
  const address1 = normalizeLookupText(input.address1);
  const phoneE164 = normalizePhoneNumber(input.phone || input.phoneE164 || "");
  const emailNorm = normalizeText(input.email).toLowerCase();

  if (phoneE164) {
    const phoneRows = await findWyVoterIdByPhone(wyDb, phoneE164);
    if (phoneRows.length === 1) {
      const rows = await loadWyTargetingRowsByVoterIds(wyDb, [phoneRows[0].voter_id]);
      return { match: rows[0] || { voter_id: phoneRows[0].voter_id }, mode: "phone_match" };
    }
    if (phoneRows.length > 1) {
      return { match: null, mode: "ambiguous_phone", candidates: phoneRows };
    }
  }

  if (emailNorm) {
    const emailRows = await findWyVoterIdByEmail(wyDb, emailNorm);
    if (emailRows.length === 1) {
      const rows = await loadWyTargetingRowsByVoterIds(wyDb, [emailRows[0].voter_id]);
      return { match: rows[0] || { voter_id: emailRows[0].voter_id }, mode: "email_match" };
    }
    if (emailRows.length > 1) {
      return { match: null, mode: "ambiguous_email", candidates: emailRows };
    }
  }

  if (!firstName || !lastName || (!city && !zip)) {
    return { match: null, mode: "missing_lookup_fields" };
  }

  // Shared by both the "zip never submitted" tier below and the
  // zip-anchored cascade's final fallback -- name+city alone is too weak a
  // signal to ever auto-accept, even when it turns up exactly one hit, so
  // every caller of this always routes to staff review, never a match.
  const findByNameCity = () =>
    wyDb.prepare(
      `SELECT voter_id, first_name, last_name, city, zip, addr1, addr_raw
         FROM v_voter_targeting
        WHERE UPPER(TRIM(first_name)) = ?1
          AND UPPER(TRIM(last_name)) = ?2
          AND UPPER(TRIM(city)) = ?3
        LIMIT ?4`
    )
      .bind(firstName, lastName, city, WY_MATCH_CANDIDATE_LIMIT)
      .all()
      .then((result) => result?.results || [])
      .catch(() => []);

  if (!zip) {
    // City present, zip missing -- weaker signal than any zip-anchored
    // tier below, so it's always sent to staff review, even when the
    // name+city pair happens to be unique.
    const cityOnlyRows = await findByNameCity();
    if (!cityOnlyRows.length) return { match: null, mode: "no_match" };
    return { match: null, mode: "ambiguous_name_city", candidates: cityOnlyRows };
  }

  const baseSql = `
    SELECT voter_id, first_name, last_name, city, zip, addr1, addr_raw
      FROM v_voter_targeting
     WHERE UPPER(TRIM(first_name)) = ?1
       AND UPPER(TRIM(last_name)) = ?2
       AND UPPER(TRIM(city)) = ?3
       AND zip = ?4
  `;

  if (address1) {
    const addressRows = await wyDb.prepare(
      `${baseSql}
        AND (
          UPPER(TRIM(COALESCE(addr1, ''))) = ?5
          OR UPPER(TRIM(COALESCE(addr_raw, ''))) = ?5
        )
      LIMIT ?6`
    )
      .bind(firstName, lastName, city, zip, address1, WY_MATCH_CANDIDATE_LIMIT)
      .all()
      .then((result) => result?.results || [])
      .catch(() => []);

    if (addressRows.length === 1) {
      return { match: addressRows[0], mode: "name_city_zip_address" };
    }
    if (addressRows.length > 1) {
      return { match: null, mode: "ambiguous_address", candidates: addressRows };
    }
  }

  const rows = await wyDb.prepare(`${baseSql} LIMIT ?5`)
    .bind(firstName, lastName, city, zip, WY_MATCH_CANDIDATE_LIMIT)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);

  if (rows.length === 1) {
    return { match: rows[0], mode: "name_city_zip" };
  }
  if (rows.length > 1) {
    return { match: null, mode: "ambiguous_name_city_zip", candidates: rows };
  }

  // City-scoped queries found nobody -- fall back to name+zip alone, dropping
  // city entirely. Real-world mailing city often differs from the voter
  // file's registered city (e.g. Mills/Evansville/Bar Nunn vs Casper, all
  // sharing zip codes) without meaning the person isn't a real match.
  // Zip alone is still a meaningful constraint in a low-population state; if
  // it turns up more than one person, that's the existing ambiguous path,
  // not a silent wrong match -- so this only ever helps, never mis-matches.
  const zipOnlySql = `
    SELECT voter_id, first_name, last_name, city, zip, addr1, addr_raw
      FROM v_voter_targeting
     WHERE UPPER(TRIM(first_name)) = ?1
       AND UPPER(TRIM(last_name)) = ?2
       AND zip = ?3
     LIMIT ?4
  `;
  const zipOnlyRows = await wyDb.prepare(zipOnlySql)
    .bind(firstName, lastName, zip, WY_MATCH_CANDIDATE_LIMIT)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);

  if (zipOnlyRows.length === 1) {
    return { match: zipOnlyRows[0], mode: "name_zip" };
  }
  if (zipOnlyRows.length > 1) {
    return { match: null, mode: "ambiguous_name_zip", candidates: zipOnlyRows };
  }

  // Every zip-anchored tier above struck out. A wrong-but-plausible ZIP
  // (e.g. a different real ZIP in the same city -- Casper alone spans
  // several) silently killed all of them despite name+city being a clean
  // match, previously landing here as a bare no_match with zero candidates
  // for staff to work from (found 2026-07-19, "Keith Goodenough" case: real
  // voter, city matched exactly, submitted ZIP was a different real Casper
  // ZIP than the one on file). Retry name+city with the zip dropped
  // entirely -- same as the "zip never submitted" tier above, so still
  // never auto-accepted, always routed to review, just with real
  // candidates attached instead of none. Distinct mode from
  // ambiguous_name_city (which means "no zip was ever given") since a
  // submitted-but-wrong zip is a different, worth-flagging-differently
  // situation for the reviewer.
  const nameCityFallbackRows = await findByNameCity();
  if (nameCityFallbackRows.length) {
    return { match: null, mode: "ambiguous_name_city_zip_conflict", candidates: nameCityFallbackRows };
  }

  return { match: null, mode: "no_match" };
}

export async function syncSubmittedPhoneToWyVoter(env, input) {
  const wyDb = env.WY_DB;
  if (!wyDb) return { ok: false, skipped: "missing_binding" };

  const phoneE164 = normalizePhoneNumber(input.phone);
  const phone10 = normalizePhone10(phoneE164);
  if (!phoneE164 || !phone10) return { ok: false, skipped: "invalid_phone" };

  const hasTargetView = await wyObjectExists(wyDb, "view", "v_voter_targeting");
  const hasPhonesTable = await wyObjectExists(wyDb, "table", "voter_phones");
  const hasBestPhoneTable = await wyObjectExists(wyDb, "table", "v_best_phone");
  if (!hasTargetView || !hasPhonesTable || !hasBestPhoneTable) {
    return { ok: false, skipped: "missing_wy_tables" };
  }

  const { match, mode, candidates } = await findUniqueWyTargetMatch(wyDb, input);
  if (!match?.voter_id) {
    return { ok: false, skipped: mode, candidates };
  }

  const conflicts = await wyDb.prepare(
    `SELECT DISTINCT voter_id
       FROM (
         SELECT voter_id FROM v_best_phone WHERE phone_e164 = ?1
         UNION ALL
         SELECT voter_id FROM voter_phones WHERE phone_e164 = ?1
       )
      LIMIT 2`
  )
    .bind(phoneE164)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);

  const conflictingVoter = conflicts.find(
    (row) => String(row?.voter_id || "").trim() && String(row.voter_id) !== String(match.voter_id)
  );
  if (conflictingVoter) {
    // The name/city/zip (or phone/email) match itself was clean and
    // unique -- `match` IS the right candidate, staff just needs to
    // confirm it isn't a coincidence (shared household phone, hand-me-down
    // number, wrong number on file). Previously this whole case was
    // dropped with only a console.log -- a correct match thrown away
    // silently, worse than a genuine ambiguous case.
    return {
      ok: false,
      skipped: "phone_belongs_to_other_voter",
      voterId: match.voter_id,
      candidates: [match],
    };
  }

  return {
    ok: true,
    voterId: match.voter_id,
    matchedBy: mode,
    phoneE164,
  };
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseStripeSignature(header) {
  const parts = String(header || "").split(",").map((p) => p.trim());
  const signatures = [];
  let timestamp = "";
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

function getAdminBearerToken(req) {
  const header = String(req.headers.get("authorization") || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

// Failed-admin-auth lockout: only failed attempts count, so normal admin use is never
// throttled. Fails open (does not lock out) if the DB is unavailable — a DB hiccup
// should not block all admin access.
const ADMIN_AUTH_LOCKOUT_WINDOW_MIN = 15;
const ADMIN_AUTH_LOCKOUT_MAX_FAILURES = 10;

async function adminAuthLockedOut(env, ipHash) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM admin_auth_failures WHERE ip_hash = ?1 AND created_at >= datetime('now', ?2)"
    )
      .bind(ipHash, `-${ADMIN_AUTH_LOCKOUT_WINDOW_MIN} minutes`)
      .first();
    return (row?.n || 0) >= ADMIN_AUTH_LOCKOUT_MAX_FAILURES;
  } catch {
    return false;
  }
}

async function recordAdminAuthFailure(env, ipHash) {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO admin_auth_failures (ip_hash) VALUES (?1)").bind(ipHash).run();
  } catch {
    /* best effort */
  }
}

async function isAdminAuthorized(req, env, url) {
  const configured = String(env.ADMIN_EXPORT_KEY || "").trim();
  if (!configured) return false;

  const ipHash = await sha256Hex(req.headers.get("cf-connecting-ip") || "");
  if (await adminAuthLockedOut(env, ipHash)) return false;

  const bearer = getAdminBearerToken(req);
  const query = String(url.searchParams.get("key") || "").trim();
  const provided = bearer || query;
  const ok = timingSafeEqual(provided, configured);
  if (!ok) await recordAdminAuthFailure(env, ipHash);
  return ok;
}

function getAdminActor(req) {
  const url = new URL(req.url);
  const actorEmail = String(
    req.headers.get("x-admin-email") || url.searchParams.get("actor_email") || ""
  ).trim() || null;
  const actorUserId = String(
    req.headers.get("x-admin-user-id") || url.searchParams.get("actor_user_id") || ""
  ).trim() || null;
  return { actorEmail, actorUserId };
}

function csvField(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(columns, rows) {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvField(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

function pulseExportPhone(phoneE164) {
  const digits = phoneDigitsOnly(phoneE164);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function pulseExportConsent(row) {
  const status = String(row?.status || "").trim();
  if (status === "opted_in") return 1;
  if (status === "opted_out") return 0;
  const consentedAt = String(row?.consented_at || "").trim();
  const revokedAt = String(row?.revoked_at || "").trim();
  if (!consentedAt) return 0;
  if (!revokedAt) return 1;
  return consentedAt >= revokedAt ? 1 : 0;
}

function pulseExportSource(row) {
  const consentVersion = String(row?.consent_version || "").trim();
  if (consentVersion.startsWith("inbound-sms-")) return "skovgard2026:inbound_sms";
  if (consentVersion.startsWith("donate-")) return "skovgard2026:donate";
  if (row?.county || row?.zip || row?.address1 || row?.city || Number(row?.wy_voter || 0) === 1) {
    return "skovgard2026:pulse";
  }
  const source = String(row?.source || "").trim();
  const detail = String(row?.source_detail || "").trim();
  if (source === "web_form" && detail === "pulse") return "skovgard2026:pulse";
  if (source === "web_form" && detail === "donate") return "skovgard2026:donate";
  if (source === "inbound_sms") return "skovgard2026:inbound_sms";
  return detail || source;
}

function pulseExportName(row) {
  return [row?.first_name, row?.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function legacySmsOptinPhoneSql(alias = "sms_optins") {
  const phoneExpr = `REPLACE(TRIM(${alias}.phone), '+', '')`;
  return `CASE
    WHEN ${alias}.phone IS NULL OR TRIM(${alias}.phone) = '' THEN NULL
    WHEN LENGTH(${phoneExpr}) = 10 THEN '+1' || ${phoneExpr}
    WHEN LENGTH(${phoneExpr}) = 11 AND SUBSTR(${phoneExpr}, 1, 1) = '1' THEN '+' || ${phoneExpr}
    ELSE '+' || ${phoneExpr}
  END`;
}

function normalizeLegacySmsOptinPhone(raw) {
  const phone = normalizePhoneNumber(raw);
  return phone ? phoneDigitsOnly(phone) : "";
}

async function lookupLegacySmsOptinByPhone(db, phone) {
  const phoneE164 = normalizePhoneNumber(phone);
  if (!phoneE164) return null;

  return db.prepare(
    `SELECT id, phone
       FROM sms_optins
      WHERE ${legacySmsOptinPhoneSql("sms_optins")} = ?1
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1`
  )
    .bind(phoneE164)
    .first()
    .catch(() => null);
}

async function setLegacySmsOptinVolunteerByPhone(db, phone, isVolunteer) {
  const existing = await lookupLegacySmsOptinByPhone(db, phone);
  if (!existing?.id) return null;

  await db.prepare(
    `UPDATE sms_optins
        SET is_volunteer = ?1
      WHERE id = ?2`
  )
    .bind(isVolunteer ? 1 : 0, existing.id)
    .run();

  return { id: existing.id, result: "updated" };
}

async function upsertLegacySmsOptin(db, input = {}) {
  const phoneE164 = normalizePhoneNumber(input?.phoneE164 || input?.phone || "");
  const phone = normalizeLegacySmsOptinPhone(phoneE164);
  if (!phoneE164 || !phone) throw new Error("Valid phone required");

  const firstName = normalizeText(input?.firstName ?? input?.first_name) || null;
  const lastName = normalizeText(input?.lastName ?? input?.last_name) || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  const email = normalizeText(input?.email) || null;
  const consent = isAffirmative(input?.consent ?? 1) ? 1 : 0;
  const consentEmail = isAffirmative(input?.consentEmail ?? input?.consent_email) ? 1 : 0;
  const wyVoter = isAffirmative(input?.wyVoter ?? input?.wy_voter) ? 1 : 0;
  const zip = normalizeText(input?.zip) || null;
  const consentVersion =
    normalizeText(input?.consentVersion ?? input?.consent_version)
    || `admin-texting-v1-${new Date().toISOString().slice(0, 10)}`;
  const source = normalizeText(input?.source) || "skovgard2026:admin_texting";
  const userAgent = normalizeText(input?.userAgent ?? input?.user_agent) || null;
  const ipHash = normalizeText(input?.ipHash ?? input?.ip_hash) || null;
  const isVolunteer = isAffirmative(input?.isVolunteer ?? input?.is_volunteer) ? 1 : 0;

  const existing = await lookupLegacySmsOptinByPhone(db, phoneE164);
  if (existing?.id) {
    await db.prepare(
      `UPDATE sms_optins
          SET name = ?1,
              phone = ?2,
              consent = ?3,
              consent_version = ?4,
              source = ?5,
              user_agent = COALESCE(?6, user_agent),
              ip_hash = COALESCE(?7, ip_hash),
              email = COALESCE(?8, email),
              consent_email = ?9,
              wy_voter = ?10,
              zip = COALESCE(?11, zip),
              first_name = ?12,
              last_name = ?13,
              is_volunteer = ?14
        WHERE id = ?15`
    )
      .bind(
        name,
        phone,
        consent,
        consentVersion,
        source,
        userAgent,
        ipHash,
        email,
        consentEmail,
        wyVoter,
        zip,
        firstName,
        lastName,
        isVolunteer,
        existing.id
      )
      .run();

    return { id: existing.id, result: "updated" };
  }

  const inserted = await db.prepare(
    `INSERT INTO sms_optins
       (name, phone, consent, consent_version, source, user_agent, ip_hash,
        email, consent_email, wy_voter, zip, first_name, last_name, is_volunteer)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
  )
    .bind(
      name,
      phone,
      consent,
      consentVersion,
      source,
      userAgent,
      ipHash,
      email,
      consentEmail,
      wyVoter,
      zip,
      firstName,
      lastName,
      isVolunteer
    )
    .run();

  return { id: inserted?.meta?.last_row_id || null, result: "created" };
}

async function loadContactVolunteerSeed(db, phone) {
  const phoneE164 = normalizePhoneNumber(phone);
  if (!phoneE164) return null;

  return db.prepare(
    `SELECT c.phone_e164,
            COALESCE(NULLIF(c.first_name, ''), NULLIF(cs.first_name, '')) AS first_name,
            COALESCE(NULLIF(c.last_name, ''), NULLIF(cs.last_name, '')) AS last_name,
            cs.status,
            cs.email,
            cs.consent_email,
            cs.wy_voter,
            cs.consent_version
       FROM contacts c
       LEFT JOIN consent_status cs ON cs.phone_e164 = c.phone_e164
      WHERE c.phone_e164 = ?1
      LIMIT 1`
  )
    .bind(phoneE164)
    .first()
    .catch(() => null);
}

function mapPulseExportRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row.id,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      name: pulseExportName(row),
      phone: pulseExportPhone(row.phone_e164 || ""),
      email: row.email || "",
      consent: pulseExportConsent(row),
      consent_email: Number(row.consent_email || 0),
      wy_voter: Number(row.wy_voter || 0),
      county: row.county || "",
      zip: row.zip || "",
      consent_version: row.consent_version || "",
      source: pulseExportSource(row),
      created_at: row.created_at || "",
      address1: row.address1 || "",
      address2: row.address2 || "",
      city: row.city || "",
      state: row.state || "",
      country: row.country || "",
      state_house_district: row.state_house_district || "",
      state_senate_district: row.state_senate_district || "",
    }))
    .filter((row) => row.phone && row.consent_version);
}

function csvResponse(req, env, filename, csv) {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      ...corsHeaders(env, req),
    },
  });
}

function normalizeMessageText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCase(str) {
  return String(str || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function personalizeSmsFirstName(text, firstName) {
  return String(text || "").replace(/\{first_name\}/gi, titleCase(firstName || "there"));
}

// SMS segment counting and cost estimation now live in ./sms-cost.js
// (imported above), shared by this route and /api/admin/texting/send and
// /api/admin/texting/send-batch.

function buildVoterBlastPreviewSeed({ county, city, party, districtType, district, text }) {
  return ["voter_blast", county || "", city || "", party || "", districtType || "", district || "", text].join("|");
}

function buildVoterBlastWhere(job) {
  const conditions = ["vbp.phone_e164 IS NOT NULL"];
  const bindings = [];
  if (job.county) { conditions.push(`v.county = ?${bindings.length + 1}`); bindings.push(job.county); }
  if (job.city)   { conditions.push(`van.city = ?${bindings.length + 1}`); bindings.push(job.city); }
  if (job.party)  { conditions.push(`v.political_party = ?${bindings.length + 1}`); bindings.push(job.party); }
  // District numbers are stored as zero-padded 2-char strings in WY_DB ("01".."62")
  if (job.district_type === "senate" && job.district) { conditions.push(`v.senate = ?${bindings.length + 1}`); bindings.push(String(job.district).padStart(2, "0")); }
  if (job.district_type === "house"  && job.district) { conditions.push(`v.house = ?${bindings.length + 1}`);  bindings.push(String(job.district).padStart(2, "0")); }
  return { where: `WHERE ${conditions.join(" AND ")}`, bindings };
}

function positiveInt(value, fallback, max = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function contactStatusWhereClause(filter, sinceHours = 24) {
  switch (filter) {
    case "opted_in":
      return {
        clause: "COALESCE(cs.status, 'unknown') = 'opted_in'",
        bind: [],
      };
    case "opted_out":
      return {
        clause: "COALESCE(cs.status, 'unknown') = 'opted_out'",
        bind: [],
      };
    case "pending":
      return {
        clause: "COALESCE(cs.status, 'unknown') = 'pending'",
        bind: [],
      };
    case "unknown":
      return {
        clause: "COALESCE(cs.status, 'unknown') = 'unknown'",
        bind: [],
      };
    case "new_opt_ins":
      return {
        clause: "COALESCE(cs.status, 'unknown') = 'opted_in' AND datetime(cs.consented_at) >= datetime('now', ?1)",
        bind: [`-${sinceHours} hours`],
      };
    case "volunteer":
    case "volunteers":
      return {
        clause: `${CONTACT_IS_VOLUNTEER_SQL} = 1`,
        bind: [],
      };
    default:
      return { clause: "1=1", bind: [] };
  }
}

function normalizeContactFilterValue(value) {
  return String(value || "").trim();
}

function normalizeRecipientPhones(value, maxRecipients = 250) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const raw =
      typeof entry === "string"
        ? entry
        : entry?.phone_e164 || entry?.phone || "";
    const phone = normalizePhoneNumber(raw);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    normalized.push(phone);
    if (normalized.length >= maxRecipients) break;
  }
  return normalized;
}

const CONTACT_IS_VOLUNTEER_SQL = `COALESCE((
                                     SELECT so.is_volunteer
                                       FROM sms_optins so
                                      WHERE ${legacySmsOptinPhoneSql("so")} = c.phone_e164
                                      ORDER BY datetime(so.created_at) DESC, so.id DESC
                                      LIMIT 1
                                   ), 0)`;

const CONTACT_SELECT_SQL = `SELECT c.phone_e164,
                                   COALESCE(NULLIF(c.first_name, ''), NULLIF(cs.first_name, '')) AS first_name,
                                   COALESCE(NULLIF(c.last_name, ''), NULLIF(cs.last_name, '')) AS last_name,
                                   cs.email,
                                   c.tags,
                                   c.welcome_sent_at,
                                   cs.status,
                                   cs.source,
                                   cs.source_detail,
                                   cs.consented_at,
                                   cs.revoked_at,
                                   cs.last_inbound_keyword,
                                   cs.city,
                                   cs.state_house_district,
                                   cs.state_senate_district,
                                   ${CONTACT_IS_VOLUNTEER_SQL} AS is_volunteer
                              FROM contacts c
                              LEFT JOIN consent_status cs ON cs.phone_e164 = c.phone_e164`;

async function queryAudienceContacts(
  db,
  {
    filter = "opted_in",
    q = "",
    city = "",
    hd = "",
    sd = "",
    limit = 250,
    sinceHours = 24,
  } = {}
) {
  const normalizedFilter = String(filter || "opted_in").trim();
  const statusFilter = contactStatusWhereClause(normalizedFilter, sinceHours);
  const search = String(q || "").trim();
  const cityFilter = normalizeContactFilterValue(city);
  const hdFilter = normalizeContactFilterValue(hd);
  const sdFilter = normalizeContactFilterValue(sd);
  const binds = [];
  let where = statusFilter.clause;

  for (const value of statusFilter.bind) binds.push(value);

  if (search) {
    binds.push(`%${search}%`);
    const idx = binds.length;
    where += ` AND (
      c.phone_e164 LIKE ?${idx}
      OR COALESCE(c.first_name, cs.first_name, '') LIKE ?${idx}
      OR COALESCE(c.last_name, cs.last_name, '') LIKE ?${idx}
    )`;
  }

  if (cityFilter) {
    binds.push(cityFilter);
    const idx = binds.length;
    where += ` AND LOWER(TRIM(COALESCE(cs.city, ''))) = LOWER(TRIM(?${idx}))`;
  }

  if (hdFilter) {
    binds.push(hdFilter);
    const idx = binds.length;
    where += ` AND LOWER(TRIM(COALESCE(cs.state_house_district, ''))) = LOWER(TRIM(?${idx}))`;
  }

  if (sdFilter) {
    binds.push(sdFilter);
    const idx = binds.length;
    where += ` AND LOWER(TRIM(COALESCE(cs.state_senate_district, ''))) = LOWER(TRIM(?${idx}))`;
  }

  binds.push(limit);
  const limitIdx = binds.length;

  const sql = `${CONTACT_SELECT_SQL}
                WHERE ${where}
                ORDER BY datetime(COALESCE(cs.updated_at, c.updated_at)) DESC
                LIMIT ?${limitIdx}`;
  return ((await db.prepare(sql).bind(...binds).all())?.results || []);
}

async function queryContactsByPhones(db, phoneList = []) {
  const phones = normalizeRecipientPhones(phoneList);
  if (!phones.length) return [];

  const placeholders = phones.map((_value, index) => `?${index + 1}`).join(", ");
  const sql = `${CONTACT_SELECT_SQL}
                WHERE c.phone_e164 IN (${placeholders})`;
  const results = ((await db.prepare(sql).bind(...phones).all())?.results || []);
  const byPhone = new Map(results.map((item) => [item.phone_e164, item]));
  return phones.map((phone) => byPhone.get(phone)).filter(Boolean);
}

function emailContactStatusWhereClause(filter, sinceHours = 24) {
  switch (String(filter || "emailable").trim()) {
    case "emailable":
      return {
        clause: "email_status = 'emailable'",
        bind: [],
      };
    case "inactive":
      return {
        clause: "email_status = 'inactive'",
        bind: [],
      };
    case "no_consent":
      return {
        clause: "email_status = 'no_consent'",
        bind: [],
      };
    case "suppressed":
      return {
        clause: "email_status = 'suppressed'",
        bind: [],
      };
    case "new_opt_ins":
      return {
        clause: "email_status = 'emailable' AND datetime(COALESCE(updated_at, created_at)) >= datetime('now', ?1)",
        bind: [`-${sinceHours} hours`],
      };
    case "volunteer":
    case "volunteers":
      return {
        clause: "COALESCE(is_volunteer, 0) = 1",
        bind: [],
      };
    default:
      return { clause: "1=1", bind: [] };
  }
}

function normalizeRecipientEmails(value, maxRecipients = 250) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const raw =
      typeof entry === "string"
        ? entry
        : entry?.email_norm || entry?.email || "";
    const email = normalizeEmailForStorage(raw).normalized;
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
    if (normalized.length >= maxRecipients) break;
  }
  return normalized;
}

const ADMIN_EMAIL_CONTACTS_CTE = `WITH email_candidates AS (
                                    SELECT LOWER(TRIM(cs.email)) AS email_norm,
                                           TRIM(cs.email) AS email,
                                           COALESCE(TRIM(cs.phone_e164), '') AS phone_e164,
                                           COALESCE(NULLIF(cs.first_name, ''), '') AS first_name,
                                           COALESCE(NULLIF(cs.last_name, ''), '') AS last_name,
                                           COALESCE(TRIM(cs.city), '') AS city,
                                           COALESCE(TRIM(cs.state_house_district), '') AS state_house_district,
                                           COALESCE(TRIM(cs.state_senate_district), '') AS state_senate_district,
                                           COALESCE(ns.consent_email, cs.consent_email, 0) AS consent_email,
                                           COALESCE(ns.active, CASE WHEN COALESCE(ns.consent_email, cs.consent_email, 0) = 1 THEN 1 ELSE 0 END) AS active,
                                           COALESCE(ns.source, cs.source_detail, cs.source, '') AS source,
                                           COALESCE(ns.consent_version, cs.consent_version, '') AS consent_version,
                                           COALESCE(ns.created_at, cs.consented_at, cs.created_at) AS created_at,
                                           COALESCE(ns.updated_at, cs.updated_at, cs.created_at) AS updated_at,
                                           es.reason AS suppression_reason,
                                           COALESCE((
                                             SELECT so.is_volunteer
                                               FROM sms_optins so
                                              WHERE ${legacySmsOptinPhoneSql("so")} = cs.phone_e164
                                              ORDER BY datetime(so.created_at) DESC, so.id DESC
                                              LIMIT 1
                                           ), 0) AS is_volunteer,
                                           CASE
                                             WHEN COALESCE(
                                               NULLIF(cs.first_name, ''),
                                               NULLIF(cs.last_name, ''),
                                               NULLIF(cs.city, ''),
                                               NULLIF(cs.state_house_district, ''),
                                               NULLIF(cs.state_senate_district, '')
                                             ) IS NOT NULL THEN 1
                                             ELSE 0
                                           END AS has_profile
                                      FROM consent_status cs
                                      LEFT JOIN newsletter_subscribers ns
                                        ON ns.email_norm = LOWER(TRIM(cs.email))
                                      LEFT JOIN email_suppressions es
                                        ON es.email_norm = LOWER(TRIM(cs.email))
                                     WHERE TRIM(COALESCE(cs.email, '')) <> ''

                                    UNION ALL

                                    SELECT ns.email_norm AS email_norm,
                                           TRIM(ns.email) AS email,
                                           '' AS phone_e164,
                                           '' AS first_name,
                                           '' AS last_name,
                                           '' AS city,
                                           '' AS state_house_district,
                                           '' AS state_senate_district,
                                           COALESCE(ns.consent_email, 0) AS consent_email,
                                           COALESCE(ns.active, 0) AS active,
                                           COALESCE(ns.source, '') AS source,
                                           COALESCE(ns.consent_version, '') AS consent_version,
                                           ns.created_at AS created_at,
                                           COALESCE(ns.updated_at, ns.created_at) AS updated_at,
                                           es.reason AS suppression_reason,
                                           0 AS is_volunteer,
                                           0 AS has_profile
                                      FROM newsletter_subscribers ns
                                      LEFT JOIN email_suppressions es
                                        ON es.email_norm = ns.email_norm
                                     WHERE NOT EXISTS (
                                       SELECT 1
                                         FROM consent_status cs
                                        WHERE LOWER(TRIM(COALESCE(cs.email, ''))) = ns.email_norm
                                     )
                                  ),
                                  ranked_email_contacts AS (
                                    SELECT email_norm,
                                           email,
                                           phone_e164,
                                           first_name,
                                           last_name,
                                           city,
                                           state_house_district,
                                           state_senate_district,
                                           consent_email,
                                           active,
                                           source,
                                           consent_version,
                                           created_at,
                                           updated_at,
                                           is_volunteer,
                                           CASE
                                             WHEN TRIM(COALESCE(suppression_reason, '')) <> '' THEN 'suppressed'
                                             WHEN COALESCE(consent_email, 0) != 1 THEN 'no_consent'
                                             WHEN COALESCE(active, 0) != 1 THEN 'inactive'
                                             ELSE 'emailable'
                                           END AS email_status,
                                           ROW_NUMBER() OVER (
                                             PARTITION BY email_norm
                                             ORDER BY has_profile DESC,
                                                      datetime(COALESCE(updated_at, created_at)) DESC,
                                                      datetime(created_at) DESC
                                           ) AS rn
                                      FROM email_candidates
                                     WHERE TRIM(COALESCE(email_norm, '')) <> ''
                                       AND TRIM(COALESCE(email, '')) <> ''
                                  )`;

// New canonical query layer over email_contacts/email_contact_purposes
// (docs/db/EmailConsolidationPlan.md Phase 3). Lives alongside
// ADMIN_EMAIL_CONTACTS_CTE rather than replacing it -- additive rollout,
// filters migrate one at a time. purged_voter became a sendable Blast
// audience ("Unlinked") on 2026-07-08 -- see the entry and its comment
// below for the data-quality caveats that still apply. 'emailable' is kept
// as an alias of 'opted_in' so the server-side default (filter ||
// "emailable") and the renamed frontend option both route through the new
// path identically.
const EMAIL_CONTACTS_FILTERS = {
  opted_in: { purpose: null, consentStatus: "opted_in" },
  emailable: { purpose: null, consentStatus: "opted_in" },
  volunteers: { purpose: "volunteer", consentStatus: null },
  candidate: { purpose: "candidate", consentStatus: null },
  voter_file: { purpose: "voter_file", consentStatus: null },
  every_email: { purpose: null, consentStatus: null },
  // "Unlinked" -- emails that never resolved to any voter registration match
  // (or matched an ID no longer active in the Aug 2025 snapshot) during the
  // 2026-07-07 purged_voter backfill (docs/db/EmailConsolidationPlan.md
  // §3a). 47,111 total, no district data (never had an address to derive one
  // from for most of this bucket) -- see the geo guard in
  // countBlastAudienceTotal/queryBlastAudienceChunk below.
  purged_voter: { purpose: "purged_voter", consentStatus: null },
};

function buildEmailContactsWhere({ filter, q = "" } = {}) {
  const def = EMAIL_CONTACTS_FILTERS[String(filter || "").trim()];
  if (!def) return null;
  const binds = [];
  let where = "ec.consent_status != 'opted_out' AND es.email_norm IS NULL";
  if (def.consentStatus) {
    binds.push(def.consentStatus);
    where += ` AND ec.consent_status = ?${binds.length}`;
  }
  if (def.purpose) {
    binds.push(def.purpose);
    where += ` AND p.purpose = ?${binds.length}`;
  } else {
    // Exclude a contact only if its ENTIRE purpose set is purged_voter --
    // not "has no non-purged purpose", which would wrongly exclude a
    // contact with zero purpose rows. purged_voter contacts carry
    // consent_status='no_signal', so without this they'd leak into
    // every_email/opted_in-style purpose-agnostic filters.
    where += ` AND NOT (
      EXISTS (SELECT 1 FROM email_contact_purposes pv WHERE pv.email_contact_id = ec.id AND pv.purpose = 'purged_voter')
      AND NOT EXISTS (SELECT 1 FROM email_contact_purposes pv2 WHERE pv2.email_contact_id = ec.id AND pv2.purpose != 'purged_voter')
    )`;
  }
  const search = String(q || "").trim();
  if (search) {
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    const idx = binds.length - 3;
    where += ` AND (
      ec.email LIKE ?${idx}
      OR ec.email_norm LIKE ?${idx + 1}
      OR ec.first_name LIKE ?${idx + 2}
      OR ec.last_name LIKE ?${idx + 3}
    )`;
  }
  return { where, binds };
}

// LEFT JOIN is correct for every filter, not just convenient: purpose-scoped
// filters neutralize it via `p.purpose = ?` in the WHERE clause (UNIQUE
// (email_contact_id, purpose) means at most one matching row anyway);
// purpose-agnostic filters need the DISTINCT below specifically because a
// contact can hold more than one purpose (e.g. subscriber + volunteer).
const EMAIL_CONTACTS_BASE_SQL = `
  FROM email_contacts ec
  LEFT JOIN email_contact_purposes p ON p.email_contact_id = ec.id
  LEFT JOIN email_suppressions es ON es.email_norm = ec.email_norm
`;

async function countEmailContacts(db, opts) {
  const built = buildEmailContactsWhere(opts);
  if (!built) return null;
  const row = await db
    .prepare(`SELECT COUNT(DISTINCT ec.id) AS n ${EMAIL_CONTACTS_BASE_SQL} WHERE ${built.where}`)
    .bind(...built.binds)
    .first();
  return Number(row?.n || 0);
}

async function queryEmailContacts(db, { limit = 250, offset = 0, ...opts } = {}) {
  const built = buildEmailContactsWhere(opts);
  if (!built) return null;
  const binds = [...built.binds, limit, Math.max(0, Number(offset) || 0)];
  // ORDER BY email_norm is required, not arbitrary -- same reason as the
  // legacy path's stableOrder flag below: offset pagination across blast
  // chunks needs a sort key that can't reshuffle mid-blast. email_status is
  // synthesized 'emailable' because the WHERE above has already filtered to
  // sendable rows, same pattern queryVoterFileAudience uses below -- any
  // future filter added to EMAIL_CONTACTS_FILTERS must keep its WHERE-side
  // exclusions in sync with this assumption.
  const sql = `SELECT DISTINCT ec.email, ec.email_norm, ec.first_name, ec.last_name, 'emailable' AS email_status
               ${EMAIL_CONTACTS_BASE_SQL} WHERE ${built.where}
               ORDER BY ec.email_norm ASC LIMIT ?${binds.length - 1} OFFSET ?${binds.length}`;
  const rows = await db.prepare(sql).bind(...binds).all();
  return rows.results || [];
}

// Shared 4-way routing for the Blast handlers (audience-count, blast/job,
// blast/send-chunk): every_email + geo goes through fetchEveryEmailGeoUnion
// (the WY_DB voter file ∪ the local subscriber table -- email_contacts can't
// serve this because it stores no district data, by design); new
// email_contacts path when the filter has migrated AND no geo-narrowing is
// requested (every_email with no geo already gets this union's effect via
// the Phase 2 backfill baked into email_contacts); WY_DB voter_file path
// retained for any already-created jobs still referencing the retired
// standalone voter_file option; the legacy CTE path for everything else
// (unmigrated filters, or migrated filters + geo, e.g. "opted_in" narrowed
// by HD -- consent_status still carries district columns, email_contacts
// doesn't).
// countVoterFileAudience/queryVoterFileAudience/countAdminEmailContacts/
// queryAdminEmailContacts/fetchEveryEmailGeoUnion are `function` declarations
// defined later in this file; hoisting makes them safe to reference here.
async function countBlastAudienceTotal(env, { filter, city = "", hd = "", sd = "", sinceHours = 24, q = "" } = {}) {
  const noGeo = !city && !hd && !sd;
  if (filter === "every_email" && !noGeo) {
    return await countEveryEmailAudienceGeo(env, { city, hd, sd });
  }
  // purged_voter has no district data anywhere -- most of it never matched a
  // voter record to derive one from, and email_contacts stores no district
  // column by design. Without this guard, filter+geo would silently fall
  // through to countAdminEmailContacts below and return an unrelated count
  // from the small legacy table (the exact bug class fixed for every_email
  // above). The UI hides HD/SD for this filter; this is the server-side
  // backstop for any direct API call that bypasses it.
  if (filter === "purged_voter" && !noGeo) {
    return 0;
  }
  // Same "no geo data" shape as purged_voter above -- see VERIFIED_UNSENT_WHERE.
  if (filter === "verified_unsent") {
    return noGeo ? await countVerifiedUnsentAudience(env.DB) : 0;
  }
  // Same "no geo data" shape -- see pollInviteWhereClause.
  if (filter === "poll_invite_2026") {
    return noGeo ? await countPollInviteAudience(env.DB) : 0;
  }
  if (noGeo && EMAIL_CONTACTS_FILTERS[filter]) {
    return await countEmailContacts(env.DB, { filter, q });
  }
  if (filter === "voter_file") {
    return env.WY_DB ? await countVoterFileAudience(env, { county: city, hd, sd }) : 0;
  }
  return await countAdminEmailContacts(env.DB, { filter, city, hd, sd, sinceHours });
}

async function queryBlastAudienceChunk(env, { filter, city = "", hd = "", sd = "", sinceHours = 24, limit, offset, blastId } = {}) {
  const noGeo = !city && !hd && !sd;
  if (filter === "every_email" && !noGeo) {
    return await queryEveryEmailAudienceGeoChunk(env, { city, hd, sd, limit, offset });
  }
  if (filter === "purged_voter" && !noGeo) {
    return [];
  }
  if (filter === "verified_unsent") {
    // offset intentionally not passed -- see queryVerifiedUnsentAudienceChunk.
    return noGeo ? await queryVerifiedUnsentAudienceChunk(env.DB, { limit }) : [];
  }
  if (filter === "poll_invite_2026") {
    // offset intentionally not passed -- see queryPollInviteAudienceChunk.
    return noGeo ? await queryPollInviteAudienceChunk(env, blastId, { limit }) : [];
  }
  if (noGeo && EMAIL_CONTACTS_FILTERS[filter]) {
    return await queryEmailContacts(env.DB, { filter, limit, offset });
  }
  if (filter === "voter_file") {
    return (await queryVoterFileAudience(env, { county: city, hd, sd, limit, offset })).map((r) => ({
      email: r.email_norm,
      email_norm: r.email_norm,
      first_name: r.first_name,
      email_status: "emailable", // opt-outs already excluded in the SQL query itself
    }));
  }
  return await queryAdminEmailContacts(env.DB, {
    filter, city, hd, sd, sinceHours, limit, offset, stableOrder: true,
  });
}

// Same new-path/legacy-path routing as queryBlastAudienceChunk, but for the
// single-shot (<=250 recipient, no pagination, no voter_file) admin-emails
// endpoints: the contacts table, preview, and send. voter_file was never
// selectable from these endpoints' dropdowns, so no WY_DB branch is needed
// here.
async function queryAdminEmailContactsRouted(db, { filter, q = "", city = "", hd = "", sd = "", limit, sinceHours = 24 } = {}) {
  const noGeo = !city && !hd && !sd;
  // Same purged_voter-has-no-district guard as queryBlastAudienceChunk --
  // not reachable from either admin UI's dropdown today, but a direct API
  // call with city/hd/sd would otherwise silently fall through to the
  // unrelated legacy-table result below.
  if (filter === "purged_voter" && !noGeo) {
    return [];
  }
  if (noGeo && EMAIL_CONTACTS_FILTERS[filter]) {
    return await queryEmailContacts(db, { filter, q, limit, offset: 0 });
  }
  return await queryAdminEmailContacts(db, { filter, q, city, hd, sd, limit, sinceHours });
}

function buildAdminEmailContactsWhere({
  filter = "emailable",
  q = "",
  city = "",
  hd = "",
  sd = "",
  sinceHours = 24,
} = {}) {
  const normalizedFilter = String(filter || "emailable").trim();
  const statusFilter = emailContactStatusWhereClause(normalizedFilter, sinceHours);
  const search = String(q || "").trim();
  const cityFilter = normalizeContactFilterValue(city);
  const hdFilter = normalizeContactFilterValue(hd);
  const sdFilter = normalizeContactFilterValue(sd);
  const binds = [];
  let where = `rn = 1 AND ${statusFilter.clause}`;

  for (const value of statusFilter.bind) binds.push(value);

  if (search) {
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    const idx = binds.length - 3;
    where += ` AND (
      email LIKE ?${idx}
      OR email_norm LIKE ?${idx + 1}
      OR first_name LIKE ?${idx + 2}
      OR last_name LIKE ?${idx + 3}
    )`;
  }

  if (cityFilter) {
    binds.push(cityFilter);
    const idx = binds.length;
    where += ` AND LOWER(TRIM(COALESCE(city, ''))) = LOWER(TRIM(?${idx}))`;
  }

  if (hdFilter) {
    binds.push(hdFilter);
    const idx = binds.length;
    // Numeric compare, not string compare: consent_status stores unpadded
    // district numbers ("6"), while the Blast dropdown sends zero-padded
    // values ("06") to match WY_DB's voter-file format. CAST(...AS INTEGER)
    // makes both representations match; a blank/non-numeric value like the
    // stray "WY" seen in production data casts to 0, which never collides
    // with a real 1-62/1-31 selection.
    where += ` AND CAST(state_house_district AS INTEGER) = CAST(?${idx} AS INTEGER)`;
  }

  if (sdFilter) {
    binds.push(sdFilter);
    const idx = binds.length;
    where += ` AND CAST(state_senate_district AS INTEGER) = CAST(?${idx} AS INTEGER)`;
  }

  return { where, binds };
}

async function queryAdminEmailContacts(
  db,
  {
    filter = "emailable",
    q = "",
    city = "",
    hd = "",
    sd = "",
    limit = 250,
    offset = 0,
    sinceHours = 24,
    // Blast pagination needs an order that can't shift between chunk fetches
    // (recency order can reshuffle rows across OFFSET pages as updated_at
    // changes mid-blast, causing skipped or duplicated recipients).
    stableOrder = false,
  } = {}
) {
  const { where, binds } = buildAdminEmailContactsWhere({ filter, q, city, hd, sd, sinceHours });

  binds.push(limit);
  const limitIdx = binds.length;
  binds.push(Math.max(0, Number(offset) || 0));
  const offsetIdx = binds.length;

  const orderBy = stableOrder
    ? "email_norm ASC"
    : "datetime(COALESCE(updated_at, created_at)) DESC, email_norm ASC";

  const sql = `${ADMIN_EMAIL_CONTACTS_CTE}
                SELECT email_norm,
                       email,
                       phone_e164,
                       first_name,
                       last_name,
                       city,
                       state_house_district,
                       state_senate_district,
                       consent_email,
                       active,
                       source,
                       consent_version,
                       created_at,
                       updated_at,
                       is_volunteer,
                       email_status
                  FROM ranked_email_contacts
                 WHERE ${where}
                 ORDER BY ${orderBy}
                 LIMIT ?${limitIdx} OFFSET ?${offsetIdx}`;
  return ((await db.prepare(sql).bind(...binds).all())?.results || []);
}

async function countAdminEmailContacts(db, { filter = "emailable", q = "", city = "", hd = "", sd = "", sinceHours = 24 } = {}) {
  const { where, binds } = buildAdminEmailContactsWhere({ filter, q, city, hd, sd, sinceHours });
  const sql = `${ADMIN_EMAIL_CONTACTS_CTE}
                SELECT COUNT(*) AS n
                  FROM ranked_email_contacts
                 WHERE ${where}`;
  const row = await db.prepare(sql).bind(...binds).first();
  return Number(row?.n || 0);
}

// ---------------------------------------------------------------------------
// Voter-file email audience ("everyone except explicit opt-outs") -- sourced
// from the wy database's v_unique_name_email_not_stale (the full deliverable
// voter-file email pipeline, ~61k addresses), cross-referenced against the
// small opt-out set in ballot_sources (env.DB). Unlike ADMIN_EMAIL_CONTACTS_CTE
// this is NOT opt-in gated -- it's the SMS voter_blast_jobs model applied to
// email: send to everyone on file who hasn't explicitly said no.
// ---------------------------------------------------------------------------

// D1/SQLite bind-parameter limit is ~999. The opt-out list is currently tiny
// (ballot_sources has a few dozen contacts) but this will need chunking if
// opt-outs ever approach that count.
async function fetchEmailOptoutList(db) {
  const rows = await db.prepare(`
    SELECT LOWER(TRIM(email)) AS email_norm FROM consent_status
     WHERE consent_email = 0 AND TRIM(COALESCE(email, '')) != ''
    UNION
    SELECT email_norm FROM newsletter_subscribers WHERE consent_email = 0 OR active = 0
    UNION
    SELECT email_norm FROM email_suppressions
  `).all();
  return [...new Set((rows.results || []).map((r) => r.email_norm).filter(Boolean))];
}

// Geo-only WHERE -- opt-out exclusion deliberately isn't here (see below).
function buildVoterFileWhere({ county = "", hd = "", sd = "" } = {}) {
  const binds = [];
  const clauses = ["1=1"];
  if (county) {
    binds.push(county);
    clauses.push(`UPPER(TRIM(county)) = UPPER(TRIM(?${binds.length}))`);
  }
  if (hd) {
    binds.push(hd);
    // Numeric compare for consistency with buildAdminEmailContactsWhere --
    // this view already stores zero-padded values so a string compare would
    // also work today, but CAST keeps both paths robust the same way.
    clauses.push(`CAST(house_district AS INTEGER) = CAST(?${binds.length} AS INTEGER)`);
  }
  if (sd) {
    binds.push(sd);
    clauses.push(`CAST(senate_district AS INTEGER) = CAST(?${binds.length} AS INTEGER)`);
  }
  return { where: clauses.join(" AND "), binds };
}

// Opt-out exclusion moved to JS (not a SQL `NOT IN (?1...?N)`) 2026-07-09.
// D1 caps bound parameters at 100 PER STATEMENT (not per-clause -- an
// earlier attempt to split into multiple ANDed NOT IN clauses still hit the
// same ceiling) -- broke with "variable number must be between ?1 and ?100"
// resuming the HD01 blast once email_suppressions + opt-outs grew past 100,
// which the day's own suppression cleanup caused. optoutList has no size
// limit once filtering happens in JS via a Set.
async function countVoterFileAudience(env, { county = "", hd = "", sd = "" } = {}) {
  const [optoutList, { where, binds }] = [await fetchEmailOptoutList(env.DB), buildVoterFileWhere({ county, hd, sd })];
  const optoutSet = new Set(optoutList);
  const rows = await env.WY_DB.prepare(
    `SELECT email_norm FROM v_unique_name_email_not_stale WHERE ${where}`
  ).bind(...binds).all();
  return (rows.results || []).filter((r) => !optoutSet.has(r.email_norm)).length;
}

// NOTE: because opt-out filtering now happens after the SQL LIMIT/OFFSET
// slice, a chunk can come back shorter than `limit` even when more real
// recipients exist further down the list (if several opted-out rows land
// in that slice) -- callers using `chunk.length < chunkSize` as an
// end-of-audience signal (queryBlastAudienceChunk's standalone `voter_file`
// filter) could stop a legacy job slightly early in that edge case. Accepted
// tradeoff: `voter_file` is documented as a retired/legacy option (superseded
// by `every_email`+geo, see fetchEveryEmailGeoUnion below) kept only for
// jobs already created against it, so a rare early-stop there is a minor
// completeness gap, not a compliance issue -- opted-out people are still
// never sent to either way. fetchEveryEmailGeoUnion's own caller
// (queryEveryEmailAudienceGeoChunk) is unaffected: it fetches essentially
// everything in one shot (EVERY_EMAIL_GEO_FETCH_LIMIT) and paginates in JS
// against the already-fully-filtered result, so this edge case can't occur
// there.
async function queryVoterFileAudience(env, { county = "", hd = "", sd = "", limit = 250, offset = 0 } = {}) {
  const optoutList = await fetchEmailOptoutList(env.DB);
  const optoutSet = new Set(optoutList);
  const { where, binds } = buildVoterFileWhere({ county, hd, sd });
  binds.push(limit);
  const limitIdx = binds.length;
  binds.push(Math.max(0, Number(offset) || 0));
  const offsetIdx = binds.length;
  const sql = `SELECT first_name, last_name, full_name, email_norm, county, house_district, senate_district
                 FROM v_unique_name_email_not_stale
                WHERE ${where}
                ORDER BY email_norm ASC
                LIMIT ?${limitIdx} OFFSET ?${offsetIdx}`;
  const rows = await env.WY_DB.prepare(sql).bind(...binds).all();
  return (rows.results || []).filter((r) => !optoutSet.has(r.email_norm));
}

// "every_email" narrowed by city/HD/SD -- union of the WY_DB voter file
// (v_unique_name_email_not_stale, ~61.6k rows, the "large file") and the local
// ballot_sources subscriber/volunteer table, minus confirmed opt-outs. Same
// "opt-outs excluded, not opt-in gated" philosophy already documented for
// voter_file -- per 2026-07-08 decision, every_email now IS that union and
// supersedes voter_file as a standalone audience option. A district-scoped
// result set is bounded (at most a few hundred rows even for the largest
// district), so both sources are fetched in full and merged/deduped here in
// application code rather than paginated at the SQL layer -- OFFSET/LIMIT
// across two separate D1 databases isn't expressible in one query. Doesn't
// include the `candidate` purpose (WY_DB `candidates` carries no district
// column in this shape) -- same gap voter_file already had.
const EVERY_EMAIL_GEO_FETCH_LIMIT = 100000;

async function fetchEveryEmailGeoUnion(env, { city = "", hd = "", sd = "" } = {}) {
  const optoutList = await fetchEmailOptoutList(env.DB);
  const optoutSet = new Set(optoutList);

  const voterRows = env.WY_DB
    ? await queryVoterFileAudience(env, { county: city, hd, sd, limit: EVERY_EMAIL_GEO_FETCH_LIMIT, offset: 0 })
    : [];

  const { where, binds } = buildAdminEmailContactsWhere({ filter: "every_email", city, hd, sd });
  const legacySql = `${ADMIN_EMAIL_CONTACTS_CTE}
                SELECT email_norm, email, first_name, last_name
                  FROM ranked_email_contacts
                 WHERE ${where}`;
  const legacyRows = ((await env.DB.prepare(legacySql).bind(...binds).all())?.results || []);

  const merged = new Map();
  for (const r of voterRows) {
    if (optoutSet.has(r.email_norm)) continue;
    merged.set(r.email_norm, {
      email: r.email_norm,
      email_norm: r.email_norm,
      first_name: r.first_name || "",
      email_status: "emailable",
    });
  }
  for (const r of legacyRows) {
    if (optoutSet.has(r.email_norm) || merged.has(r.email_norm)) continue;
    merged.set(r.email_norm, {
      email: r.email,
      email_norm: r.email_norm,
      first_name: r.first_name || "",
      email_status: "emailable",
    });
  }
  return [...merged.values()].sort((a, b) => a.email_norm.localeCompare(b.email_norm));
}

async function countEveryEmailAudienceGeo(env, { city = "", hd = "", sd = "" } = {}) {
  return (await fetchEveryEmailGeoUnion(env, { city, hd, sd })).length;
}

async function queryEveryEmailAudienceGeoChunk(env, { city = "", hd = "", sd = "", limit = 250, offset = 0 } = {}) {
  const all = await fetchEveryEmailGeoUnion(env, { city, hd, sd });
  return all.slice(offset, offset + limit);
}

// WY_DB counterpart to queryVoterFileAudience, but keyed by an explicit
// address list instead of geo filters -- lets an explicit-recipient send
// find voter-file-sourced addresses (e.g. from a fetchEveryEmailGeoUnion
// blast audience) the same way queryVoterFileAudience does for geo queries.
// Batched into groups of <=90: D1 caps bound parameters at 100 PER
// STATEMENT, and emailList can be up to 251 (normalizeRecipientEmails' cap)
// -- found 2026-07-09 alongside the identical ceiling breaking
// queryVoterFileAudience's opt-out NOT IN. Unlike that one, this is a
// straightforward IN-lookup with no pagination involved, so separate
// batched queries (merged below) are the correct fix, not a JS-side filter.
async function queryVoterFileAudienceByAddress(env, emailList = []) {
  if (!env.WY_DB || !emailList.length) return [];
  const BATCH_SIZE = 90;
  const results = [];
  for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
    const batch = emailList.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_value, index) => `?${index + 1}`).join(", ");
    const sql = `SELECT first_name, last_name, full_name, email_norm, county, house_district, senate_district
                   FROM v_unique_name_email_not_stale
                  WHERE email_norm IN (${placeholders})`;
    const rows = await env.WY_DB.prepare(sql).bind(...batch).all();
    results.push(...(rows.results || []));
  }
  return results;
}

// "Screened — Not Yet Sent" (filter=verified_unsent): the email_verification_queue
// backlog (migration 029, the scheduled EmailListVerify job) filtered to
// verdict='good', minus anyone email_blast_log already shows as attempted
// by ANY blast ever (not just one), minus anyone who's opted out or been
// suppressed since being verified. Self-refreshing by design -- no separate
// "already sent" tracking needed, since email_blast_log keeps growing with
// every blast run, so re-running this filter later automatically only
// picks up newly-verified-and-still-unsent addresses. No geo/district data
// exists in email_verification_queue (it merges WY_DB + legacy +
// purged_voter sources into flat email_norm rows), so this filter doesn't
// support city/hd/sd narrowing -- same "no geo data" shape as purged_voter.
const VERIFIED_UNSENT_WHERE = `
  q.verdict = 'good'
  AND NOT EXISTS (SELECT 1 FROM email_blast_log l WHERE l.email_norm = q.email_norm)
  AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email_norm = q.email_norm)
  AND NOT EXISTS (
    SELECT 1 FROM consent_status cs
     WHERE LOWER(TRIM(COALESCE(cs.email, ''))) = q.email_norm AND cs.consent_email = 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM newsletter_subscribers ns
     WHERE ns.email_norm = q.email_norm AND (ns.consent_email = 0 OR ns.active = 0)
  )
`;

async function countVerifiedUnsentAudience(db) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM email_verification_queue q WHERE ${VERIFIED_UNSENT_WHERE}`
  ).first();
  return Number(row?.n || 0);
}

// Deliberately ignores `offset` -- found 2026-07-09 that OFFSET-based
// paging silently drops roughly half the audience here. VERIFIED_UNSENT_WHERE
// excludes anyone already in email_blast_log, and every chunk this filter
// sends gets written to email_blast_log immediately, so the eligible set
// shrinks by exactly one chunk's worth *between* calls. OFFSET N then means
// "skip the first N of an already-shrunk list" -- i.e. skip N people who
// were never actually sent to, not N people who were. Since the exclusion
// itself already advances the front of the queue as sends happen, always
// querying from position 0 is correct and sufficient: whoever's still
// there IS the next batch, full stop -- same pattern as the scheduled
// email_verification_queue cron handler (WHERE checked_at IS NULL, no
// OFFSET, for the identical reason).
async function queryVerifiedUnsentAudienceChunk(db, { limit = 250 } = {}) {
  const rows = await db.prepare(
    `SELECT q.email_norm
       FROM email_verification_queue q
      WHERE ${VERIFIED_UNSENT_WHERE}
      ORDER BY q.email_norm ASC
      LIMIT ?1`
  ).bind(limit).all();
  return (rows.results || []).map((r) => ({
    email: r.email_norm,
    email_norm: r.email_norm,
    first_name: "",
    email_status: "emailable", // opt-outs/suppressions already excluded in the SQL query itself
  }));
}

// Mirrors grassmvt_survey's formatDistrictNumber -- voters_addr_norm (the
// Candidates sub-project's own canonical district source, see
// race_poll_data_plan.md) stores house/senate unpadded ("3"), but
// race_candidates.district_number is zero-padded ("03"). Pad here so poll_invite_2026
// recipients resolve districts the exact same way Candidates does, not just from
// the same table.
function padDistrictNumber(value, width = 2) {
  const parsed = parseInt(String(value || "").trim(), 10);
  if (Number.isNaN(parsed)) return null;
  return String(parsed).padStart(width, "0");
}

// "poll_invite_2026" (filter=poll_invite_2026): invites Wyoming voters with a
// verified-good email (email_verification_queue verdict='good') to the informal
// 2026 primary candidate-choice poll (grassmvt_survey). Exclusion is job-scoped
// (this blast_id's own email_blast_log rows) rather than global-ever like
// VERIFIED_UNSENT_WHERE -- someone who already received some other campaign blast
// should still get this one-time poll invite; only a retry of THIS job should skip
// someone it already sent to. No geo/district data in email_verification_queue
// itself (same as verified_unsent) -- district/party come from a WY_DB
// voter_emails/voters join at query time instead, so this filter doesn't support
// city/hd/sd narrowing at the job-creation level.
function pollInviteWhereClause(blastId) {
  const scopeClause = blastId
    ? `NOT EXISTS (SELECT 1 FROM email_blast_log l WHERE l.blast_id = ?1 AND l.email_norm = q.email_norm)`
    : `1=1`;
  const binds = blastId ? [blastId] : [];
  return {
    sql: `
      q.verdict = 'good'
      AND ${scopeClause}
      AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email_norm = q.email_norm)
      AND NOT EXISTS (
        SELECT 1 FROM consent_status cs
         WHERE LOWER(TRIM(COALESCE(cs.email, ''))) = q.email_norm AND cs.consent_email = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM newsletter_subscribers ns
         WHERE ns.email_norm = q.email_norm AND (ns.consent_email = 0 OR ns.active = 0)
      )
    `,
    binds,
  };
}

async function countPollInviteAudience(db) {
  const { sql, binds } = pollInviteWhereClause(null);
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM email_verification_queue q WHERE ${sql}`
  ).bind(...binds).first();
  return Number(row?.n || 0);
}

// Same no-OFFSET discipline as queryVerifiedUnsentAudienceChunk, but job-scoped:
// each call excludes only this blast_id's own email_blast_log rows, which grow as
// this job sends -- so always querying from position 0 within that job-scoped
// exclusion is correct and sufficient (same reasoning, narrower scope).
//
// After the email_verification_queue slice, batch-joins WY_DB voter_emails ->
// voters/voters_addr_norm (<=90 per batch, same D1 100-bound-param ceiling as
// queryVoterFileAudienceByAddress) to get voter_id/political_party/address --
// the poll needs a voter_id to mint a token against, so an address with no voter
// match is dropped rather than sent with no poll link.
//
// House/senate districts are resolved via lookupWyLegislativeDistricts
// (address-districts.js) -- the exact same canonical resolver already used by
// this worker's own Telnyx SMS opt-in address handling, and the same
// wy_address_district_lookup mirror + Census-geocoder-polygon fallback the
// Candidates sub-project's ballot-lookup flow uses. This must resolve districts
// the same way those flows do, not independently from voters.house/senate or
// voters_addr_norm.house/senate directly -- confirmed 2026-07-11 (caught by a
// real test send showing the wrong district) that both of those raw columns
// diverge from this canonical resolution for a meaningful share of real voters.
// political_party has no equivalent in the district-lookup path, so that still
// comes from voters.
async function queryPollInviteAudienceChunk(env, blastId, { limit = 250 } = {}) {
  const { sql, binds } = pollInviteWhereClause(blastId);
  const rows = await env.DB.prepare(
    `SELECT q.email_norm
       FROM email_verification_queue q
      WHERE ${sql}
      ORDER BY q.email_norm ASC
      LIMIT ?${binds.length + 1}`
  ).bind(...binds, limit).all();
  const emailNorms = (rows.results || []).map((r) => r.email_norm);
  if (!emailNorms.length || !env.WY_DB) return [];

  const BATCH_SIZE = 90;
  const voterIdByEmail = new Map();
  for (let i = 0; i < emailNorms.length; i += BATCH_SIZE) {
    const batch = emailNorms.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_v, idx) => `?${idx + 1}`).join(", ");
    const veRows = await env.WY_DB.prepare(
      `SELECT voter_id, email_norm FROM voter_emails WHERE email_norm IN (${placeholders})`
    ).bind(...batch).all();
    for (const r of veRows.results || []) {
      if (r.voter_id && !voterIdByEmail.has(r.email_norm)) voterIdByEmail.set(r.email_norm, r.voter_id);
    }
  }
  if (!voterIdByEmail.size) return [];

  const voterIds = [...new Set(voterIdByEmail.values())];
  const votersByVoterId = new Map();
  for (let i = 0; i < voterIds.length; i += BATCH_SIZE) {
    const batch = voterIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_v, idx) => `?${idx + 1}`).join(", ");
    const vRows = await env.WY_DB.prepare(
      `SELECT v.voter_id, v.political_party, van.addr_raw, van.city, van.zip
         FROM voters v
         LEFT JOIN voters_addr_norm van ON van.voter_id = v.voter_id
        WHERE v.voter_id IN (${placeholders})`
    ).bind(...batch).all();
    for (const r of vRows.results || []) votersByVoterId.set(r.voter_id, r);
  }

  // One resolveDistrictAndPrecinctForAddress call per voter -- not batchable like
  // the SQL joins above, since it has its own internal cascade (local mirror,
  // then a Census API fetch only when the local mirror has no unique match).
  // Chunk sizes are small (<=MAX_SEND_CHUNK_SIZE, 20) so this is a handful of
  // calls per chunk, not hundreds. Also reused by resolveVoterDistrictAndPrecinct
  // (below) for a single /pulse opt-in outside the blast path.
  const districtsByVoterId = new Map();
  const precinctByVoterId = new Map();
  for (const voterId of voterIds) {
    const voter = votersByVoterId.get(voterId);
    if (!voter?.addr_raw) continue;
    const resolved = await resolveDistrictAndPrecinctForAddress(env, voter);
    if (resolved?.districts) districtsByVoterId.set(voterId, resolved.districts);
    if (resolved?.precinct) precinctByVoterId.set(voterId, resolved.precinct);
  }

  const recipients = [];
  for (const emailNorm of emailNorms) {
    const voterId = voterIdByEmail.get(emailNorm);
    if (!voterId) continue; // dropped: no voter_emails match
    const voter = votersByVoterId.get(voterId);
    const districts = districtsByVoterId.get(voterId);
    const precinct = precinctByVoterId.get(voterId);
    recipients.push({
      email: emailNorm,
      email_norm: emailNorm,
      first_name: "",
      email_status: "emailable",
      voter_id: voterId,
      // lookupWyLegislativeDistricts normalizes to unpadded digits ("3", not
      // "03") -- pad to 2 digits here the same way grassmvt_survey's
      // formatDistrictNumber does, so this matches race_candidates.district_number's
      // zero-padded format.
      house_district: padDistrictNumber(districts?.stateHouseDistrict),
      senate_district: padDistrictNumber(districts?.stateSenateDistrict),
      political_party: voter?.political_party || null,
      county: districts?.county || null,
      city: voter?.city || null,
      precinct_code: precinct?.precinctCode || null,
    });
  }
  return recipients;
}

// Precinct resolution needs coordinates independently -- a wy_address_district_lookup
// hit for HD/SD involves no geocoding at all (voters_addr_norm.lat/lng are 0%
// populated, confirmed 2026-07-11), so every voter needs its own live geocode call
// here regardless of how house/senate resolved. This is the same live-per-recipient
// cost tradeoff accepted for the real send (~14,200 recipients) -- revisit
// throughput/rate-limiting when step 7 is actually scheduled, per Jimmy's direction.
// Takes an already-fetched voter row ({addr_raw, city, zip}) so batch callers
// (queryPollInviteAudienceChunk) don't pay for a second per-voter SQL query.
async function resolveDistrictAndPrecinctForAddress(env, voter) {
  try {
    const districts = await lookupWyLegislativeDistricts(env.DB, {
      address1: voter.addr_raw,
      city: voter.city,
      zip: voter.zip,
      state: "WY",
    });

    let precinct = null;
    const county = districts?.county;
    if (county) {
      const coords = await geocodeAddress({
        address1: voter.addr_raw,
        city: voter.city,
        zip: voter.zip,
      });
      if (coords?.lat != null && coords?.lon != null) {
        precinct = await resolvePrecinct(env.WY_DB, county, coords.lat, coords.lon);
      }
    }
    return { districts, precinct };
  } catch (error) {
    console.error("[resolveDistrictAndPrecinctForAddress] district/precinct lookup failed", {
      message: error?.message,
    });
    return { districts: null, precinct: null };
  }
}

// Single-voter counterpart to queryPollInviteAudienceChunk's batched voter/address
// lookup -- used when a /pulse opt-in resolves to a WY voter_id via phone match
// (syncSubmittedPhoneToWyVoter) and needs the same district/party/precinct fields
// mintPollInviteLinksForChunk expects, without waiting for a blast job.
async function resolveVoterDistrictAndPrecinct(env, voterId) {
  if (!env.WY_DB) return null;
  const voter = await env.WY_DB.prepare(
    `SELECT v.voter_id, v.political_party, van.addr_raw, van.city, van.zip
       FROM voters v
       LEFT JOIN voters_addr_norm van ON van.voter_id = v.voter_id
      WHERE v.voter_id = ?1`
  ).bind(voterId).first();
  if (!voter?.addr_raw) return null;

  const { districts, precinct } = await resolveDistrictAndPrecinctForAddress(env, voter);
  return {
    political_party: voter.political_party || null,
    city: voter.city || null,
    house_district: padDistrictNumber(districts?.stateHouseDistrict),
    senate_district: padDistrictNumber(districts?.stateSenateDistrict),
    county: districts?.county || null,
    precinct_code: precinct?.precinctCode || null,
  };
}

// Resolves an explicit recipient list against every source a Blast audience
// can be drawn from -- not just ADMIN_EMAIL_CONTACTS_CTE (ballot_sources'
// consent_status/newsletter_subscribers). Without the WY_DB fallback below,
// an explicit-recipient send/preview could never find addresses that only
// exist in the WY_DB voter file, e.g. a fetchEveryEmailGeoUnion ("every_email"
// + geo) blast audience -- every one of those addresses would report as
// "skipped" here even though they're real, reachable, non-suppressed
// recipients. (Found 2026-07-09 recovering missed recipients from the
// 2026-07-08 HD01 incident -- see docs/blast_tracking.md.) Legacy-CTE rows
// win when an address exists in both, since that source carries richer
// consent/profile data; WY_DB only fills in addresses the legacy CTE has no
// row for at all.
// Batched into groups of <=90: D1 caps bound parameters at 100 PER
// STATEMENT, and emailList can be up to 251 (normalizeRecipientEmails' cap)
// -- same ceiling found 2026-07-09 in queryVoterFileAudience/
// queryVoterFileAudienceByAddress; fixed here the same way.
async function queryAdminEmailContactsByAddress(env, emailList = []) {
  const db = env.DB;
  const emails = normalizeRecipientEmails(emailList);
  if (!emails.length) return [];

  const BATCH_SIZE = 90;
  const legacyResults = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_value, index) => `?${index + 1}`).join(", ");
    const sql = `${ADMIN_EMAIL_CONTACTS_CTE}
                  SELECT email_norm,
                         email,
                         phone_e164,
                         first_name,
                         last_name,
                         city,
                         state_house_district,
                         state_senate_district,
                         consent_email,
                         active,
                         source,
                         consent_version,
                         created_at,
                         updated_at,
                         is_volunteer,
                         email_status
                    FROM ranked_email_contacts
                   WHERE rn = 1
                     AND email_norm IN (${placeholders})`;
    legacyResults.push(...((await db.prepare(sql).bind(...batch).all())?.results || []));
  }
  const byEmail = new Map(legacyResults.map((item) => [item.email_norm, item]));

  const unresolved = emails.filter((email) => !byEmail.has(email));
  if (unresolved.length) {
    const [optoutList, voterRows] = await Promise.all([
      fetchEmailOptoutList(db),
      queryVoterFileAudienceByAddress(env, unresolved),
    ]);
    const optoutSet = new Set(optoutList);
    for (const r of voterRows) {
      byEmail.set(r.email_norm, {
        email_norm: r.email_norm,
        email: r.email_norm,
        phone_e164: "",
        first_name: r.first_name || "",
        last_name: r.last_name || "",
        city: r.county || "",
        state_house_district: r.house_district || "",
        state_senate_district: r.senate_district || "",
        consent_email: 1,
        active: 1,
        source: "wy_voter_file",
        consent_version: "",
        created_at: null,
        updated_at: null,
        is_volunteer: 0,
        // Not opt-in gated, same "everyone except explicit opt-outs" model
        // fetchEveryEmailGeoUnion/queryVoterFileAudience use -- only real
        // suppressions/opt-outs mark it unsendable here.
        email_status: optoutSet.has(r.email_norm) ? "suppressed" : "emailable",
      });
    }
  }

  return emails.map((email) => byEmail.get(email)).filter(Boolean);
}

async function queryAdminEmailContactCounts(db) {
  const row = await db.prepare(
    `${ADMIN_EMAIL_CONTACTS_CTE}
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN email_status = 'emailable' THEN 1 ELSE 0 END) AS emailable_count,
             SUM(CASE WHEN email_status = 'inactive' THEN 1 ELSE 0 END) AS inactive_count,
             SUM(CASE WHEN email_status = 'no_consent' THEN 1 ELSE 0 END) AS no_consent_count,
             SUM(CASE WHEN email_status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed_count,
             SUM(
               CASE
                 WHEN email_status = 'emailable'
                  AND datetime(COALESCE(updated_at, created_at)) >= datetime('now', '-24 hours')
                 THEN 1
                 ELSE 0
               END
             ) AS new_opt_ins_24h,
             MAX(datetime(COALESCE(updated_at, created_at))) AS last_updated_at
        FROM ranked_email_contacts
       WHERE rn = 1`
  ).first();
  return row || {};
}

function buildAdminEmailPreviewRecipients(items) {
  return items.slice(0, 10).map((item) => ({
    email: item.email,
    first_name: item.first_name,
    last_name: item.last_name,
    city: item.city || "",
    hd: item.state_house_district || "",
    sd: item.state_senate_district || "",
    email_status: item.email_status || "unknown",
  }));
}

function normalizeAdminEmailSubject(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAdminEmailBody(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function buildAdminEmailPreviewSeed({
  mode,
  filter,
  city,
  hd,
  sd,
  subject,
  body,
  limit,
  sinceHours,
  audienceCount,
  audienceHash,
  recipientCount,
  recipientHash,
}) {
  return [
    "admin_email_preview",
    mode,
    filter,
    city,
    hd,
    sd,
    String(limit),
    String(sinceHours),
    String(audienceCount),
    audienceHash,
    String(recipientCount),
    recipientHash,
    subject,
    body,
  ].join("|");
}

async function mapWithConcurrency(items, limit, worker) {
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function mapInBatches(items, batchSize, pauseMs, worker) {
  const size = Math.max(1, Number(batchSize) || 1);
  const results = [];

  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    const batchResults = await Promise.all(
      batch.map((item, index) => worker(item, start + index))
    );
    results.push(...batchResults);
    if (start + size < items.length) {
      await sleep(pauseMs);
    }
  }

  return results;
}

// filter=poll_invite_2026 only: mints a poll_invite_tokens row on grassmvt_survey
// per recipient (server-to-server, POLL_MINT_SERVICE_KEY -- not the human admin-key
// path) and attaches poll_link. A recipient whose mint call fails is excluded from
// the send entirely (never emailed with no real link) and reported back as a
// distinct failure so send-chunk can log it instead of silently dropping them.
// Concurrency capped like the send step itself, but with no delay -- this hits our
// own service, not a rate-limited external API like Resend.
const POLL_MINT_BATCH_SIZE = 5;

async function mintPollInviteLinksForChunk(env, recipients) {
  const baseUrl = String(env.GRASSMVT_SURVEY_BASE_URL || "").trim();
  const serviceKey = String(env.POLL_MINT_SERVICE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    return {
      withLinks: [],
      mintFailures: recipients.map((recipient) => ({
        recipient,
        error: "GRASSMVT_SURVEY_BASE_URL or POLL_MINT_SERVICE_KEY not configured",
      })),
    };
  }

  const settled = await mapInBatches(recipients, POLL_MINT_BATCH_SIZE, 0, async (recipient) => {
    try {
      const res = await fetch(`${baseUrl}/api/poll/admin/mint-invite-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_key: serviceKey,
          voter_id: recipient.voter_id,
          email_norm: recipient.email_norm,
          house_district: recipient.house_district || undefined,
          senate_district: recipient.senate_district || undefined,
          political_party: recipient.political_party || undefined,
          county: recipient.county || undefined,
          city: recipient.city || undefined,
          precinct_code: recipient.precinct_code || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.poll_link) {
        return { recipient, error: data.error || `mint failed (${res.status})` };
      }
      return { recipient: { ...recipient, poll_link: data.poll_link } };
    } catch (err) {
      return { recipient, error: String(err?.message || err) };
    }
  });

  const withLinks = [];
  const mintFailures = [];
  for (const result of settled) {
    if (result.error) mintFailures.push(result);
    else withLinks.push(result.recipient);
  }
  return { withLinks, mintFailures };
}

function parseRetryAfterMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 0;
}

function resolveResendRetryDelayMs(error, fallbackMs = ADMIN_EMAIL_RATE_LIMIT_FALLBACK_MS) {
  const headers = error?.headers && typeof error.headers === "object" ? error.headers : {};

  const retryAfterMs = parseRetryAfterMs(headers["retry-after"]);
  if (retryAfterMs > 0) return retryAfterMs;

  const resetHeader = headers["x-ratelimit-reset"] || headers["ratelimit-reset"] || "";
  const resetValue = Number(resetHeader);
  if (Number.isFinite(resetValue) && resetValue > 0) {
    const resetMs = resetValue > 1e12 ? resetValue : resetValue * 1000;
    return Math.max(0, resetMs - Date.now());
  }

  return fallbackMs;
}

async function deleteMessageRowsByIds(db, tableName, rowIds = []) {
  const ids = [...new Set((Array.isArray(rowIds) ? rowIds : [])
    .map((value) => positiveInt(value, 0, Number.MAX_SAFE_INTEGER))
    .filter((value) => value > 0))];
  if (!ids.length) return 0;

  const sql = tableName === "inbound_messages"
    ? `DELETE FROM inbound_messages WHERE id IN (${ids.map((_value, index) => `?${index + 1}`).join(", ")})`
    : tableName === "outbound_messages"
      ? `DELETE FROM outbound_messages WHERE id IN (${ids.map((_value, index) => `?${index + 1}`).join(", ")})`
      : "";
  if (!sql) throw new Error(`Unsupported delete table: ${tableName}`);

  const result = await db.prepare(sql).bind(...ids).run();
  return Number(result?.meta?.changes || 0);
}

async function clearConversationMessagesByPhone(db, phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return { inboundDeleted: 0, outboundDeleted: 0 };

  const inboundResult = await db.prepare(
    `DELETE FROM inbound_messages
      WHERE phone_from = ?1 OR phone_to = ?1`
  ).bind(normalizedPhone).run();
  const outboundResult = await db.prepare(
    `DELETE FROM outbound_messages
      WHERE phone_from = ?1 OR phone_to = ?1`
  ).bind(normalizedPhone).run();

  return {
    inboundDeleted: Number(inboundResult?.meta?.changes || 0),
    outboundDeleted: Number(outboundResult?.meta?.changes || 0),
  };
}

async function clearMessagesBySearch(db, q = "") {
  const search = String(q || "").trim();
  if (!search) {
    const inboundResult = await db.prepare(`DELETE FROM inbound_messages`).run();
    const outboundResult = await db.prepare(`DELETE FROM outbound_messages`).run();
    return {
      inboundDeleted: Number(inboundResult?.meta?.changes || 0),
      outboundDeleted: Number(outboundResult?.meta?.changes || 0),
    };
  }

  const qLike = `%${search}%`;
  const inboundResult = await db.prepare(
    `DELETE FROM inbound_messages
      WHERE phone_from LIKE ?1 OR phone_to LIKE ?1 OR text LIKE ?1`
  ).bind(qLike).run();
  const outboundResult = await db.prepare(
    `DELETE FROM outbound_messages
      WHERE phone_from LIKE ?1 OR phone_to LIKE ?1 OR text LIKE ?1`
  ).bind(qLike).run();

  return {
    inboundDeleted: Number(inboundResult?.meta?.changes || 0),
    outboundDeleted: Number(outboundResult?.meta?.changes || 0),
  };
}

async function deleteTextingContactRecord(db, phone) {
  const phoneE164 = normalizePhoneNumber(phone);
  if (!phoneE164) {
    return {
      phoneE164: "",
      contactsDeleted: 0,
      consentStatusDeleted: 0,
      smsOptinsDeleted: 0,
      deletedCount: 0,
    };
  }

  const contactResult = await db.prepare(
    `DELETE FROM contacts
      WHERE phone_e164 = ?1`
  ).bind(phoneE164).run();

  const consentResult = await db.prepare(
    `DELETE FROM consent_status
      WHERE phone_e164 = ?1`
  ).bind(phoneE164).run();

  let smsOptinsDeleted = 0;
  const legacyPhone = normalizeLegacySmsOptinPhone(phoneE164);
  if (legacyPhone) {
    const smsResult = await db.prepare(
      `DELETE FROM sms_optins
        WHERE phone = ?1
           OR ${legacySmsOptinPhoneSql("sms_optins")} = ?2`
    ).bind(legacyPhone, phoneE164).run();
    smsOptinsDeleted = Number(smsResult?.meta?.changes || 0);
  }

  const contactsDeleted = Number(contactResult?.meta?.changes || 0);
  const consentStatusDeleted = Number(consentResult?.meta?.changes || 0);

  return {
    phoneE164,
    contactsDeleted,
    consentStatusDeleted,
    smsOptinsDeleted,
    deletedCount: contactsDeleted + consentStatusDeleted + smsOptinsDeleted,
  };
}

function buildBatchPreviewRecipients(items) {
  return items.slice(0, 10).map((item) => ({
    phone_e164: item.phone_e164,
    first_name: item.first_name,
    last_name: item.last_name,
    city: item.city || "",
    hd: item.state_house_district || "",
    sd: item.state_senate_district || "",
    status: item.status || "unknown",
  }));
}

async function mustBeAdmin(req, env, url) {
  if (!String(env.ADMIN_EXPORT_KEY || "").trim()) {
    return { ok: false, response: json(req, env, { error: "Admin export key not configured" }, 503) };
  }
  if (!(await isAdminAuthorized(req, env, url))) {
    return { ok: false, response: json(req, env, { error: "Unauthorized" }, 401) };
  }
  return { ok: true };
}

async function tableExists(db, tableName) {
  const row = await db.prepare(
    `SELECT name
       FROM sqlite_master
      WHERE type = 'table' AND name = ?1`
  )
    .bind(tableName)
    .first();
  return Boolean(row?.name);
}

async function verifyStripeSignature(secret, payload, header) {
  if (!secret || !header) return false;
  const { timestamp, signatures } = parseStripeSignature(header);
  if (!timestamp || signatures.length === 0) return false;
  const tsNumber = Number(timestamp);
  if (!Number.isFinite(tsNumber)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNumber) > 300) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

async function buildIdempotencyKey({ email, amountCents, address1, zip }) {
  const minute = Math.floor(Date.now() / 60000) * 60000;
  const seed = `${email}|${amountCents}|${address1}|${zip}|${minute}`;
  return sha256Hex(seed);
}

const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;
// A broadcast is delivered across multiple HTTP requests. Keeping each request
// small stays below Cloudflare's per-invocation subrequest limit while retaining
// the preview token's audience and personalization checks.
const ADMIN_TEXTING_BROADCAST_SEND_CHUNK_SIZE = 10;
const ADMIN_EMAIL_SEND_BATCH_SIZE = 1;
const ADMIN_EMAIL_SEND_BATCH_DELAY_MS = 340;
const ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT = 2;
const ADMIN_EMAIL_RATE_LIMIT_FALLBACK_MS = 1500;

// Deliverability circuit breaker (send-chunk) -- thresholds roughly follow
// Gmail Postmaster Tools' own framing (it flags accounts around 0.3%
// complaints) and general ESP guidance on bounce rate. Don't judge a job's
// rate off a handful of sends -- a 1-in-10 bounce in the first chunk is
// noise, not signal.
const DELIVERABILITY_MIN_SAMPLE = 50;
const DELIVERABILITY_BOUNCE_WARN_RATE = 0.02;
const DELIVERABILITY_BOUNCE_PAUSE_RATE = 0.05;
const DELIVERABILITY_COMPLAINT_WARN_RATE = 0.001;
const DELIVERABILITY_COMPLAINT_PAUSE_RATE = 0.003;

// Per-job bounce-rate ceiling an admin can explicitly opt into via PATCH
// /api/admin/emails/blast/override (email_blast_jobs.bounce_pause_rate_override,
// migration 028) when a specific job's list is known to run hotter than
// DELIVERABILITY_BOUNCE_PAUSE_RATE -- e.g. a stale voter-file audience --
// and the admin has decided that's an acceptable, deliberate risk for that
// one job. Deliberately NOT a change to the default above: every other job,
// and this job's own complaint-rate check, still uses the normal thresholds.
// 2026-07-09 decision: 10%, not higher -- stays under the ~10-15% range
// most mailbox providers treat as a domain-reputation red flag, while still
// giving real headroom over a single elevated list. See
// docs/blast_tracking.md.
const BLAST_OVERRIDE_BOUNCE_PAUSE_RATE = 0.10;

// Hard ceiling on how many recipients a single send-chunk invocation will
// actually attempt, independent of whatever chunk_size a job was created
// with. Each recipient costs ~3 Cloudflare subrequests (email_optin_tokens
// insert, the Resend API fetch, the email_blast_log insert), and Cloudflare
// caps subrequests per Worker invocation. A chunk_size of 200 (the old
// default/max) blows past that mid-chunk -- discovered 2026-07-08 when a
// real 1,135-recipient blast hit "Too many subrequests by single Worker
// invocation" on 300 real recipients, all clustered after the same point in
// each chunk. Critically, the offset still advanced past them, so they were
// never retried -- this cap prevents that recurrence for any job, including
// ones already created with a larger chunk_size, since it's applied here at
// send time, not at job-creation time.
const MAX_SEND_CHUNK_SIZE = 20;

// TEMPORARY skip list -- domains whose mail filter has rejected this
// campaign's content wholesale (identical `554 5.7.1 [VI-101] Message
// blocked due to spam content` from every recipient behind it, a Vircom-
// style filter appliance both small WY regional ISPs appear to share), not
// individual dead mailboxes. Found 2026-07-09 recovering the 2026-07-08 HD01
// blast -- see docs/blast_tracking.md. Skipping here (not suppressing --
// these aren't bad addresses) avoids repeating the same rejection on every
// remaining recipient at these domains until someone reaches out to the
// ISPs' admins to find out what in the content triggers it. Remove once
// that's resolved or the affected domains are known-good again.
const BLAST_CONTENT_FILTER_SKIP_DOMAINS = new Set(["rtconnect.net", "rangeweb.net"]);

// TEMPORARY skip list -- domains a third-party pre-send verification pass
// (EmailListVerify, 2026-07-09) could not get a real answer for. Yahoo/AOL
// actively resist SMTP-probe verification and returned "ok_for_all"
// (inconclusive) on nearly every address tested, including ones already
// confirmed dead via a real Resend bounce -- see docs/blast_tracking.md.
// Not a suppression (most yahoo.com/aol.com addresses are probably fine,
// this list isn't evidence they're bad) -- just deferring the unverifiable
// slice of this specific blast rather than repeating the exact bounce
// pattern already seen. Revisit/remove once there's a way to actually
// confirm these, or just accept sending to them blind again later.
const BLAST_UNVERIFIED_SKIP_DOMAINS = new Set(["yahoo.com", "aol.com"]);

// Shared by /api/admin/emails/send and the email blast chunk endpoint so both
// paths retry/audit-log/idempotency-key identically -- only the caller's
// batchId/idempotencySeed and audit bookkeeping differ.
async function sendOneAdminEmail(env, {
  actor,
  batchId,
  idempotencySeed,
  recipient,
  subject,
  emailMode,
  shareSlug,
  shareIntroText,
  messageBody,
  emailConfig,
}) {
  const idempotencyKey = await sha256Hex([
    "admin_email_send",
    idempotencySeed,
    recipient.email_norm,
  ].join("|"));

  // RFC 8058 one-click unsubscribe: every admin/blast send carries a
  // List-Unsubscribe header pointing at this recipient's own token, whatever
  // the email_mode -- Gmail/Yahoo/Outlook show a native "Unsubscribe" link
  // next to the sender and POST here silently (see the POST handler on
  // /api/email/optin-response) with no page render or further clicks. The
  // same token is reused below for the Yes/No body placeholders when the
  // share message body needs them, so one send mints one token, not two.
  // Created once, outside the retry loop, so a rate-limit retry doesn't mint
  // a fresh token (and thus a fresh unsubscribe link) on every attempt.
  const recipientEmail = normalizeText(recipient?.email || recipient);
  const recipientEmailNorm = recipient?.email_norm || recipientEmail.toLowerCase();
  const recipientFirstName = recipient?.first_name || "";
  const personalizedSubject = substitutePersonalization(subject, { firstName: recipientFirstName });
  const optinToken = await createEmailOptinToken(env.DB, {
    email: recipientEmail,
    emailNorm: recipientEmailNorm,
    messageSlug: emailMode !== "custom" ? shareSlug : "admin_email",
    batchId,
  });
  // Feedback-ID: <id1>:<id2>:<esp> -- Gmail associates this header with the
  // message and attributes any later "Report spam" click back to these
  // identifiers, surfaced in Postmaster Tools' per-campaign Feedback Loop
  // report (currently "0%, zero identifiers" domain-wide because no send has
  // ever carried this header -- added 2026-07-12 after that report showed an
  // 8.8% domain-wide complaint rate with no per-campaign breakdown to
  // diagnose it). batchId ties directly to email_blast_jobs for filter/
  // subject context; no separate Resend or Google enrollment needed, Gmail
  // parses whatever header is present on an authenticated message.
  const listUnsubscribeHeaders = {
    "List-Unsubscribe": `<${optinToken.noUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Feedback-ID": `${batchId}:${emailMode}:resend`,
  };

  let attempt = 0;
  while (attempt <= ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT) {
    attempt += 1;
    try {
      let result;
      if (emailMode !== "custom") {
        const shareMsg = SHARE_MESSAGES[shareSlug];
        const introHtml = shareIntroText
          ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">${escHtml(shareIntroText).replace(/\n/g, "<br>")}</p>\n              <hr style="margin:0 0 22px;border:0;border-top:1px solid #e5e7eb;">\n              `
          : "";
        const htmlBody = buildShareEmailHtml({
          sender_name: "Skovgard for Wyoming",
          sender_intro: shareMsg.intro(),
          body_html: introHtml + shareMsg.body_html,
          preview_text: shareMsg.preview_text,
          title: shareMsg.title,
        });
        let textBody = buildShareEmailText({
          sender_name: "Skovgard for Wyoming",
          sender_intro: shareMsg.intro(),
          slug: shareSlug,
        });
        let finalHtmlBody = htmlBody;

        const personalize = (text) => substitutePersonalization(text, {
          firstName: recipientFirstName,
          optinYesUrl: optinToken.yesUrl,
          optinNoUrl: optinToken.noUrl,
        });
        finalHtmlBody = personalize(finalHtmlBody);
        textBody = personalize(textBody);
        const personalizedShareIntroText = personalize(shareIntroText);

        const shareMessage = {
          from: emailConfig.from,
          to: [recipientEmail],
          reply_to: emailConfig.from,
          subject: personalizedSubject,
          text: personalizedShareIntroText ? `${personalizedShareIntroText}\n\n---\n\n${textBody}` : textBody,
          html: finalHtmlBody,
          headers: listUnsubscribeHeaders,
          tags: [
            { name: "source", value: "admin_emails" },
            { name: "kind", value: "share_blast" },
            { name: "share_slug", value: shareSlug.slice(0, 200) },
            { name: "batch_id", value: batchId.slice(0, 200) },
          ],
        };
        const resendResult = await sendResendEmail(emailConfig.apiKey, shareMessage, idempotencyKey);
        result = { sent: true, id: resendResult?.id || null, to: recipientEmail };
      } else {
        const personalizedBody = substitutePersonalization(messageBody, {
          firstName: recipientFirstName,
          optinYesUrl: optinToken.yesUrl,
          optinNoUrl: optinToken.noUrl,
          pollLink: recipient?.poll_link || "",
        });
        result = await sendAdminOutreachEmail(
          env,
          recipient,
          personalizedSubject,
          personalizedBody,
          {
            batchId,
            idempotencyKey,
            replyTo: emailConfig.from,
            headers: listUnsubscribeHeaders,
          }
        );
      }
      await insertAdminEmailAuditLog(env.DB, {
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        action: "send_email",
        targetEmail: recipient.email,
        subject,
        messageId: result.id,
        detailsJson: JSON.stringify({
          batchId,
          email: recipient.email,
          emailNorm: recipient.email_norm,
          source: recipient.source || "",
          attempt,
        }),
      });
      return {
        ok: true,
        email: recipient.email,
        messageId: result.id,
        attempt,
      };
    } catch (error) {
      const rateLimited = Number(error?.status || 0) === 429;
      const shouldRetry = rateLimited && attempt <= ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT;
      const retryDelayMs = shouldRetry
        ? resolveResendRetryDelayMs(error)
        : 0;

      if (shouldRetry) {
        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "send_email_rate_limited",
          targetEmail: recipient.email,
          subject,
          detailsJson: JSON.stringify({
            batchId,
            email: recipient.email,
            emailNorm: recipient.email_norm,
            attempt,
            retryDelayMs,
            error: String(error?.message || error || "Unknown email error"),
            status: error?.status || null,
          }),
        });
        await sleep(retryDelayMs);
        continue;
      }

      await insertAdminEmailAuditLog(env.DB, {
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        action: "send_email_failed",
        targetEmail: recipient.email,
        subject,
        detailsJson: JSON.stringify({
          batchId,
          email: recipient.email,
          emailNorm: recipient.email_norm,
          attempt,
          error: String(error?.message || error || "Unknown email error"),
          status: error?.status || null,
          body: error?.body || null,
        }),
      });
      return {
        ok: false,
        email: recipient.email,
        error: String(error?.message || error || "Unknown email error"),
        status: error?.status || null,
        // Resend returns this specific error only when the exact same
        // idempotency key (sha256 of blastId+email_norm, deterministic --
        // see idempotencyKey above) already succeeded once within the last
        // 24 hours. It surfaces here when OUR OWN email_blast_log has no
        // 'sent' row for this recipient -- confirmed 2026-07-10 this happens
        // when a prior send-chunk invocation was killed by Cloudflare's
        // CPU-time limit (error 1102) after Resend accepted the send but
        // before the D1 write recording it ran. Treat as "already delivered,
        // not a real failure" -- confirmed by re-checking recipients from an
        // earlier incident: deleting their email_blast_log row and letting
        // them be re-selected just reproduces the identical Resend rejection
        // every time, proving no duplicate was ever actually sent.
        likelyAlreadySent: error?.body?.name === "invalid_idempotent_request",
        attempt,
      };
    }
  }

  return {
    ok: false,
    email: recipient.email,
    error: "Email send exhausted retries.",
    status: 429,
    attempt: ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT + 1,
  };
}

function normalizePreviewIssuedAt(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isPreviewExpired(issuedAt) {
  const normalized = normalizePreviewIssuedAt(issuedAt);
  if (!normalized) return true;
  return Date.now() - Date.parse(normalized) > PREVIEW_TOKEN_TTL_MS;
}

function buildSingleSendPreviewSeed({ to, text }) {
  return ["single_send", to, text].join("|");
}

function buildBatchSendPreviewSeed({
  mode,
  filter,
  city,
  hd,
  sd,
  text,
  limit,
  sinceHours,
  audienceCount,
  audienceHash,
  recipientCount,
  recipientHash,
  personalizationHash,
}) {
  return [
    "batch_send",
    mode,
    filter,
    city,
    hd,
    sd,
    String(limit),
    String(sinceHours),
    String(audienceCount),
    audienceHash,
    String(recipientCount),
    recipientHash,
    personalizationHash,
    text,
  ].join("|");
}

async function createPreviewApprovalToken(env, seed, issuedAt) {
  const secret = String(env.ADMIN_EXPORT_KEY || "").trim();
  return hmacSha256Hex(secret, `${seed}|${issuedAt}`);
}

async function createStripePaymentIntent(env, data, metadata = {}) {
  if (!env.STRIPE_SECRET_KEY) return { error: "Stripe not configured." };
  const { amountCents, email, address1, zip } = data;
  const idempotencyKey = await buildIdempotencyKey({
    email,
    amountCents,
    address1,
    zip,
  });

  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    receipt_email: email,
    "automatic_payment_methods[enabled]": "true",
  });

  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.append(`metadata[${key}]`, String(value));
  });

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": idempotencyKey,
    },
    body,
  });

  const stripeResult = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = stripeResult?.error?.message || "Stripe error.";
    return { error: message };
  }

  return stripeResult;
}

// ---------------------------------------------------------------------------
// Reconcile stale `pending` contributions against Stripe.
//
// The /api/donate/webhook handler only ever moves a contribution off
// "pending" when Stripe delivers payment_intent.succeeded or
// payment_intent.payment_failed. If a donor abandons checkout (closes the
// tab, never completes 3DS, etc.) Stripe frequently never fires a failed
// event at all -- the PaymentIntent just sits in requires_payment_method /
// requires_action forever, and so does our row. This polls Stripe directly
// (source of truth) for any contribution still "pending" after a grace
// window, rather than waiting on a webhook that may never arrive.
// See docs/DonationsFlow.md.
// ---------------------------------------------------------------------------
const DONATION_RECONCILE_GRACE_MINUTES = 60;

function mapStripeStatusToContributionStatus(stripeStatus) {
  if (stripeStatus === "succeeded") return "succeeded_webhook";
  if (stripeStatus === "canceled") return "failed";
  // requires_payment_method after the grace window means the customer
  // abandoned the checkout without a successful attempt -- treat as failed.
  if (stripeStatus === "requires_payment_method") return "failed";
  // requires_action / requires_confirmation / processing: still genuinely
  // in flight (e.g. slow bank transfer). Leave as pending and re-check later.
  return null;
}

async function reconcilePendingDonations(env) {
  if (!env.DB) return { ran: false, reason: "no_db" };
  if (!env.STRIPE_SECRET_KEY) return { ran: false, reason: "no_stripe_key" };

  const stale = (await env.DB.prepare(
    `SELECT id, payment_intent_id
       FROM contributions
      WHERE status = 'pending'
        AND created_at <= datetime('now', ?1)`
  ).bind(`-${DONATION_RECONCILE_GRACE_MINUTES} minutes`).all())?.results || [];

  let checked = 0;
  let updated = 0;
  const errors = [];

  for (const row of stale) {
    checked += 1;
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/payment_intents/${row.payment_intent_id}`,
        { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
      );
      const intent = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push({ id: row.id, error: intent?.error?.message || "Stripe error" });
        continue;
      }

      const newStatus = mapStripeStatusToContributionStatus(intent.status);
      if (!newStatus) continue;

      await env.DB.prepare(
        `UPDATE contributions
            SET status = ?1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?2 AND status = 'pending'`
      ).bind(newStatus, row.id).run();
      updated += 1;
    } catch (e) {
      errors.push({ id: row.id, error: e.message });
    }
  }

  return { ran: true, checked, updated, errors };
}

// ---------------------------------------------------------------------------
// Scheduled (Cron Trigger) email verification -- runs unattended on
// Cloudflare's own infrastructure, not dependent on a local machine/session.
// Ports the same logic as scripts/verify_district_emails.mjs (status
// classification, spamtrap handling, suppression-on-bad) but reads its
// queue from email_verification_queue (migration 029) instead of a local
// .state.json, so progress survives across cron ticks with no separate
// file. See docs/blast_tracking.md for the full backstory -- especially why
// EmailListVerify's response is a bare plain-text status string (not JSON)
// and why "spamtrap"/"smtp_protocol"/"antispam_system" exist at all (none
// are in EmailListVerify's own docs; found by manually curling the live
// endpoint).
// ---------------------------------------------------------------------------
// Reduced from 45 to 30 on 2026-07-11 -- monitoring after the 45 change showed a
// real tick running 110-130s (close to/over the 120s cron interval), with a second
// tick's rows visibly interleaved with the first tick's tail end starting right at
// the next */2 boundary. Two concurrent invocations pacing at ~0.83 req/s each can
// combine to ~1.66 req/s against EmailListVerify, over its real ~1/s limit during
// the overlap window. 30 kept a tick comfortably under 120s (observed ~2.4s/item
// average cycle time -- pacing plus real request latency -- put 30 items at ~75s).
// Raised to 36 on 2026-07-11 -- at the same ~2.4s/item pace that's ~86s, still with
// real margin under 120s. Re-verify with a couple of real ticks after deploying,
// same as the 30 change.
const EMAIL_VERIFICATION_BATCH_SIZE = 36;
const EMAIL_VERIFICATION_REQUEST_PAUSE_MS = 1200;
const EMAIL_VERIFICATION_REQUEST_TIMEOUT_MS = 10000;
const EMAIL_VERIFICATION_ENDPOINT = "https://apps.emaillistverify.com/api/verifyEmail";
const EMAIL_VERIFICATION_BAD_STATUSES = new Set(["invalid", "invalid_mx", "dead_server", "email_disabled", "spamtrap"]);
const EMAIL_VERIFICATION_GOOD_STATUSES = new Set(["ok"]);

function classifyVerificationStatus(status) {
  if (EMAIL_VERIFICATION_BAD_STATUSES.has(status)) return "bad";
  if (EMAIL_VERIFICATION_GOOD_STATUSES.has(status)) return "good";
  return "risky";
}

async function verifyEmailListVerify(apiKey, email) {
  const url = `${EMAIL_VERIFICATION_ENDPOINT}?secret=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(EMAIL_VERIFICATION_REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`verifyEmail HTTP ${res.status}`);
  return (await res.text()).trim();
}

// Claims up to EMAIL_VERIFICATION_BATCH_SIZE unchecked rows and verifies
// them, pacing at EMAIL_VERIFICATION_REQUEST_PAUSE_MS between requests
// (EmailListVerify's real rate limit is ~1/sec -- confirmed via response
// headers, not documented). A request that fails (network error, non-200)
// is left unchecked (checked_at stays NULL) so it's retried next tick,
// rather than being marked with a fake result -- UNLESS it's already
// failed EMAIL_VERIFICATION_MAX_ATTEMPTS times, in which case it's marked
// checked with status='verify_timeout'/verdict='risky' (not suppressed,
// not claimed good -- an honest "we gave up," distinct from any real
// EmailListVerify status) so it stops permanently occupying the front of
// the unchecked queue. Found 2026-07-15: a handful of slow/small mail
// servers timed out every tick forever, halving effective batch throughput
// since ORDER BY email_norm ASC always reselected the same stuck rows.
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 3;

async function runEmailVerificationBatch(env) {
  if (!env.DB) return { ran: false, reason: "DB not configured" };
  if (!env.EMAILLISTVERIFY_API_KEY) return { ran: false, reason: "EMAILLISTVERIFY_API_KEY not configured" };

  const rows = await env.DB.prepare(
    `SELECT email_norm, attempt_count FROM email_verification_queue WHERE checked_at IS NULL ORDER BY email_norm ASC LIMIT ?1`
  ).bind(EMAIL_VERIFICATION_BATCH_SIZE).all();
  const batch = rows.results || [];
  if (!batch.length) return { ran: true, checked: 0, bad: 0, queueEmpty: true };

  let checked = 0;
  let bad = 0;
  let gaveUp = 0;
  let creditExhausted = false;
  for (let i = 0; i < batch.length; i++) {
    const emailNorm = batch[i].email_norm;
    const attemptCount = Number(batch[i].attempt_count || 0);
    let status;
    try {
      status = await verifyEmailListVerify(env.EMAILLISTVERIFY_API_KEY, emailNorm);
    } catch (e) {
      console.error(`email verification failed for ${emailNorm}: ${e.message}`);
      const nextAttemptCount = attemptCount + 1;
      if (nextAttemptCount >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
        console.error(`email verification giving up on ${emailNorm} after ${nextAttemptCount} failed attempts`);
        await env.DB.prepare(
          `UPDATE email_verification_queue
              SET status='verify_timeout', verdict='risky', checked_at=datetime('now'),
                  attempt_count=?2, last_attempted_at=datetime('now')
            WHERE email_norm=?1`
        ).bind(emailNorm, nextAttemptCount).run();
        gaveUp++;
      } else {
        await env.DB.prepare(
          `UPDATE email_verification_queue SET attempt_count=?2, last_attempted_at=datetime('now') WHERE email_norm=?1`
        ).bind(emailNorm, nextAttemptCount).run();
      }
      if (i + 1 < batch.length) await new Promise((r) => setTimeout(r, EMAIL_VERIFICATION_REQUEST_PAUSE_MS));
      continue;
    }
    // "error_credit" (found 2026-07-09 when the account ran out mid-run) and
    // presumably other "error_*" values are EmailListVerify-side failures,
    // not a real verification verdict -- leaving checked_at NULL keeps the
    // row queued for retry once credits are restored. Treating this as a
    // normal verdict (an earlier version of this code did) silently
    // corrupts the queue: rows get marked "checked" with a fake "risky"
    // result despite never actually being verified. Stop the whole batch
    // early on the first one -- once credits are gone, every remaining
    // request in this batch (and every future tick) will hit the same
    // wall, so there's no reason to keep burning through it.
    if (status.startsWith("error_")) {
      console.error(`email verification account error for ${emailNorm}: ${status} -- stopping batch, will retry next tick`);
      creditExhausted = true;
      break;
    }
    const verdict = classifyVerificationStatus(status);
    await env.DB.prepare(
      `UPDATE email_verification_queue SET status=?2, verdict=?3, checked_at=datetime('now') WHERE email_norm=?1`
    ).bind(emailNorm, status, verdict).run();
    checked++;

    if (verdict === "bad") {
      bad++;
      await env.DB.prepare(
        `INSERT INTO email_suppressions (email_norm, email, reason, event_type, suppressed_at, details_json)
         VALUES (?1, ?1, ?2, 'third_party_verification', datetime('now'), ?3)
         ON CONFLICT(email_norm) DO NOTHING`
      ).bind(
        emailNorm,
        `EmailListVerify: ${status}`,
        JSON.stringify({ vendor: "EmailListVerify", status, source: "scheduled_queue" })
      ).run();
    }

    if (i + 1 < batch.length) await new Promise((r) => setTimeout(r, EMAIL_VERIFICATION_REQUEST_PAUSE_MS));
  }
  return { ran: true, checked, bad, gaveUp, queueEmpty: false, creditExhausted };
}

// Daily cron (wrangler.toml [env.production.triggers]) -- see
// docs/who_needs_to_know.md recommendation 3. Summarizes the two Pulse
// admin call queues that don't otherwise page anyone: unresolved
// pulse_voter_match_review rows and open pulse_abandoned_signups rows.
async function runPulseFollowUpDigest(env) {
  if (!env.DB) return { ran: false, reason: "no_db" };

  const reviewRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN created_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END) AS stale
       FROM pulse_voter_match_review
      WHERE resolved_at IS NULL`
  ).first().catch(() => null);

  const abandonedRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN captured_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END) AS stale
       FROM pulse_abandoned_signups
      WHERE do_not_call = 0 AND completed_phone_e164 IS NULL`
  ).first().catch(() => null);

  const counts = {
    reviewTotal: Number(reviewRow?.total || 0),
    reviewStale: Number(reviewRow?.stale || 0),
    abandonedTotal: Number(abandonedRow?.total || 0),
    abandonedStale: Number(abandonedRow?.stale || 0),
  };

  const result = await sendPulseFollowUpDigest(env, counts);
  return { ran: true, counts, ...result };
}

// Daily cron (piggybacked on the same "0 14 * * *" trigger as the Pulse
// follow-up digest above) -- Phase 4 of docs/db/EmailConsolidationPlan.md,
// added 2026-08-10 after a real incident: a grassrootsmvt.org DNS/DKIM gap
// silently blocked every Pulse opt-in email for ~2.5 weeks with nothing to
// surface it. Two independent, differently-caused checks, both reported in
// one alert:
//  (a) Canonical parity: newsletter_subscribers rows with no email_contacts
//      row are reported separately from rows whose canonical consent status
//      conflicts. The latter must be reviewed rather than auto-repaired.
//  (b) Pulse delivery health: mature new Pulse contacts in the last 24 hours
//      are compared with matching staff_notification sends. Using created_at
//      avoids treating a repeat submission from an already opted-in contact
//      as a newly expected staff notification.
// Query failures are never converted to zero counts. They produce a generic
// failure alert without contact details and are written to Worker error logs.
// Sent from ADMIN_EMAIL_FROM (the already-verified updates.grassrootsmvt.org
// subdomain), not PULSE_EMAIL_FROM. This prevents the alert from sharing
// a blind spot with the exact outage class it exists to catch: if
// grassrootsmvt.org's domain verification breaks again, an alert sent from
// pulse@grassrootsmvt.org would silently fail right alongside the thing it's
// reporting on.
export async function runEmailConsentReconciliation(env) {
  if (!env.DB) return { ran: false, reason: "no_db" };

  const config = {
    enabled: String(env.ADMIN_EMAIL_ENABLED || "0") === "1",
    apiKey: String(env.RESEND_API_KEY || "").trim(),
    from: String(env.ADMIN_EMAIL_FROM || "").trim(),
    to: String(env.PULSE_STAFF_NOTIFY_TO || env.INBOUND_SMS_NOTIFY_TO || "").trim(),
  };

  let missingContactRow;
  let statusConflictRow;
  let pulseNewContactRow;
  let staffSentRow;
  try {
    [missingContactRow, statusConflictRow, pulseNewContactRow, staffSentRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS n
           FROM newsletter_subscribers ns
          WHERE ns.active = 1 AND ns.consent_email = 1
            AND ns.updated_at <= datetime('now', '-15 minutes')
            AND NOT EXISTS (
              SELECT 1 FROM email_contacts ec WHERE ec.email_norm = ns.email_norm
            )`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n,
                SUM(CASE WHEN ec.consent_status = 'no_signal' THEN 1 ELSE 0 END) AS no_signal,
                SUM(CASE WHEN ec.consent_status = 'opted_out' THEN 1 ELSE 0 END) AS opted_out,
                SUM(CASE WHEN ec.consent_status NOT IN ('no_signal', 'opted_out', 'opted_in') THEN 1 ELSE 0 END) AS other
           FROM newsletter_subscribers ns
           JOIN email_contacts ec ON ec.email_norm = ns.email_norm
          WHERE ns.active = 1 AND ns.consent_email = 1
            AND ns.updated_at <= datetime('now', '-15 minutes')
            AND ec.consent_status <> 'opted_in'`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n
           FROM consent_status
          WHERE source_detail = 'pulse' AND status = 'opted_in'
            AND created_at >= datetime('now', '-24 hours')
            AND created_at <= datetime('now', '-15 minutes')`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n
           FROM resend_webhook_events
          WHERE source = 'pulse' AND kind = 'staff_notification' AND event_type = 'email.sent'
            AND processed_at >= datetime('now', '-24 hours')`
      ).first(),
    ]);
  } catch (error) {
    const reason = String(error?.message || error);
    console.error("runEmailConsentReconciliation: query failed", reason);

    if (!config.enabled || !config.apiKey || !config.from || !config.to) {
      throw error;
    }

    try {
      const data = await sendResendEmail(config.apiKey, {
        from: config.from,
        to: [config.to],
        subject: "Email consent reconciliation: check failed",
        text: "The daily email-consent reconciliation queries failed. Review the skovgard2026-api Worker logs before treating email consent or Pulse delivery as healthy.",
        tags: [
          { name: "source", value: "reconciliation" },
          { name: "kind", value: "check_failure" },
        ],
      });
      return { ran: false, sent: true, reason: "query_failed", id: data?.id || null };
    } catch (alertError) {
      console.error("runEmailConsentReconciliation: query-failure alert failed", String(alertError?.message || alertError));
      throw error;
    }
  }

  const missingContacts = Number(missingContactRow?.n || 0);
  const statusConflicts = Number(statusConflictRow?.n || 0);
  const statusConflictNoSignal = Number(statusConflictRow?.no_signal || 0);
  const statusConflictOptedOut = Number(statusConflictRow?.opted_out || 0);
  const statusConflictOther = Number(statusConflictRow?.other || 0);
  const dualWriteGap = missingContacts + statusConflicts;
  const pulseNewContacts = Number(pulseNewContactRow?.n || 0);
  const pulseStaffSent = Number(staffSentRow?.n || 0);
  const pulseDeliveryGap = pulseStaffSent < pulseNewContacts;

  if (dualWriteGap === 0 && !pulseDeliveryGap) {
    return { ran: true, dualWriteGap, missingContacts, statusConflicts, pulseNewContacts, pulseStaffSent, sent: false, reason: "nothing_to_report" };
  }

  if (!config.enabled || !config.apiKey || !config.from || !config.to) {
    return { ran: true, dualWriteGap, missingContacts, statusConflicts, pulseNewContacts, pulseStaffSent, sent: false, reason: "disabled_or_missing_config" };
  }

  const lines = ["Daily email-consent reconciliation check found something to flag.", ""];
  if (missingContacts > 0) {
    lines.push(`- ${missingContacts} active newsletter subscriber(s) have no email_contacts row (missing dual-write).`);
  }
  if (statusConflicts > 0) {
    lines.push(`- ${statusConflicts} active newsletter subscriber(s) have a non-opted-in email_contacts status (${statusConflictNoSignal} no_signal, ${statusConflictOptedOut} opted_out, ${statusConflictOther} other). Review the consent evidence; do not auto-repair.`);
  }
  if (pulseDeliveryGap) {
    lines.push(`- ${pulseNewContacts} new Pulse contact(s) in the last 24h were old enough to expect a staff notification, but only ${pulseStaffSent} staff_notification email(s) were sent. Check grassrootsmvt.org's domain status in Resend and review Worker logs.`);
  }

  try {
    const data = await sendResendEmail(config.apiKey, {
      from: config.from,
      to: [config.to],
      subject: "Email consent reconciliation: drift detected",
      text: lines.join("\n"),
      tags: [
        { name: "source", value: "reconciliation" },
        { name: "kind", value: "drift_alert" },
      ],
    });
    return { ran: true, dualWriteGap, missingContacts, statusConflicts, pulseNewContacts, pulseStaffSent, sent: true, id: data?.id || null };
  } catch (error) {
    console.error("runEmailConsentReconciliation: alert send failed", String(error?.message || error));
    return { ran: true, dualWriteGap, missingContacts, statusConflicts, pulseNewContacts, pulseStaffSent, sent: false, reason: String(error?.message || error) };
  }
}

// --- Worker ------------------------------------------------------------------
export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, ""); // strip trailing slash

      // CORS preflight
      if (req.method === "OPTIONS" && path.startsWith("/api")) {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(env, req),
        });
      }

      // Health check
      if (req.method === "GET" && path === "/api/health") {
        return json(req, env, { ok: true, d1Bound: Boolean(env.DB) });
      }

      // ---------------------------------------------------------------
      // Admin: donation tracking & FEC limit reporting
      // ---------------------------------------------------------------

      // GET /api/admin/donations/summary
      // Returns per-donor totals grouped by election_period.
      // Query params: ?period=primary|general  (default: current period)
      //               ?limit=N (default 200, max 500)
      if (req.method === "GET" && path === "/api/admin/donations/summary") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const period = url.searchParams.get("period") || getFecElectionPeriod() || "primary";
        const lim = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 500);

        const rows = (await env.DB.prepare(
          "SELECT d.first_name, d.last_name, d.email, d.city, d.state," +
          " c.election_period," +
          " COUNT(*) AS num_contributions," +
          " COALESCE(SUM(CASE WHEN c.status IN ('succeeded','succeeded_webhook') THEN c.amount_cents ELSE 0 END),0) AS confirmed_cents," +
          " COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.amount_cents ELSE 0 END),0) AS pending_cents," +
          " COALESCE(SUM(CASE WHEN c.status IN ('succeeded','succeeded_webhook','pending') THEN c.amount_cents ELSE 0 END),0) AS gross_cents," +
          " (350000 - COALESCE(SUM(CASE WHEN c.status IN ('succeeded','succeeded_webhook','pending') THEN c.amount_cents ELSE 0 END),0)) AS remaining_cents" +
          " FROM donors d JOIN contributions c ON c.donor_id = d.id" +
          " WHERE c.election_period = ?1" +
          " GROUP BY d.email, c.election_period" +
          " ORDER BY gross_cents DESC LIMIT ?2"
        ).bind(period, lim).all())?.results || [];

        const currentPeriod = getFecElectionPeriod();
        const atLimit = rows.filter(r => r.gross_cents >= 350000);
        const nearLimit = rows.filter(r => r.gross_cents >= 300000 && r.gross_cents < 350000);

        return json(req, env, {
          period,
          current_period: currentPeriod,
          fec_limit_cents: 350000,
          fec_limit_display: "$3,500",
          donor_count: rows.length,
          at_limit_count: atLimit.length,
          near_limit_count: nearLimit.length,
          donors: rows.map(r => ({
            name: r.first_name + " " + r.last_name,
            email: r.email,
            city: r.city,
            state: r.state,
            election_period: r.election_period,
            contributions: r.num_contributions,
            confirmed: "$" + (r.confirmed_cents / 100).toFixed(2),
            pending: "$" + (r.pending_cents / 100).toFixed(2),
            gross: "$" + (r.gross_cents / 100).toFixed(2),
            remaining: "$" + (Math.max(0, r.remaining_cents) / 100).toFixed(2),
            at_limit: r.gross_cents >= 350000,
            near_limit: r.gross_cents >= 300000,
          })),
        });
      }

      // GET /api/admin/donations/donor?email=X
      // Returns full contribution history for a single donor across both periods.
      if (req.method === "GET" && path === "/api/admin/donations/donor") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const email = (url.searchParams.get("email") || "").toLowerCase().trim();
        if (!email) return json(req, env, { error: "email param required." }, 400);

        const contribs = (await env.DB.prepare(
          "SELECT c.id, c.amount_cents, c.status, c.election_period, c.created_at, c.payment_intent_id" +
          " FROM contributions c JOIN donors d ON c.donor_id = d.id" +
          " WHERE lower(d.email) = ?1 ORDER BY c.created_at DESC"
        ).bind(email).all())?.results || [];

        const donor = await env.DB.prepare(
          "SELECT first_name, last_name, email, city, state, zip, employer, occupation, created_at FROM donors WHERE lower(email) = ?1 LIMIT 1"
        ).bind(email).first();

        const totalsBySql = (
          "SELECT election_period," +
          " COALESCE(SUM(CASE WHEN status IN ('succeeded','succeeded_webhook','pending') THEN amount_cents ELSE 0 END),0) AS gross_cents" +
          " FROM contributions c JOIN donors d ON c.donor_id = d.id" +
          " WHERE lower(d.email) = ?1 GROUP BY election_period"
        );
        const periodTotals = (await env.DB.prepare(totalsBySql).bind(email).all())?.results || [];

        return json(req, env, {
          donor,
          fec_limit_cents: 350000,
          period_totals: Object.fromEntries(periodTotals.map(r => [
            r.election_period,
            { gross_cents: r.gross_cents, gross: "$" + (r.gross_cents / 100).toFixed(2), remaining: "$" + (Math.max(0, 350000 - r.gross_cents) / 100).toFixed(2) }
          ])),
          contributions: contribs.map(c => ({
            id: c.id,
            amount: "$" + (c.amount_cents / 100).toFixed(2),
            status: c.status,
            period: c.election_period,
            date: c.created_at,
            payment_intent_id: c.payment_intent_id,
          })),
        });
      }

      if (req.method === "GET" && path === "/api/admin/telnyx/status") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const lastWebhookRow = await env.DB.prepare(
          `SELECT MAX(processed_at) AS ts
             FROM telnyx_events`
        ).first();
        const lastInvalidRow = await env.DB.prepare(
          `SELECT MAX(processed_at) AS ts
             FROM telnyx_events
            WHERE signature_valid = 0`
        ).first();

        const tables = {};
        for (const name of ["contacts", "consent_status", "inbound_messages", "outbound_messages", "telnyx_events", "texting_audit_log"]) {
          tables[name] = await tableExists(env.DB, name);
        }

        return json(req, env, {
          ok: true,
          webhookRouteLive: true,
          lastWebhookReceivedAt: lastWebhookRow?.ts || null,
          lastInvalidSignatureAt: lastInvalidRow?.ts || null,
          envPresent: {
            telnyxPublicKey: Boolean(String(env.TELNYX_PUBLIC_KEY || "").trim()),
            telnyxApiKey: Boolean(String(env.TELNYX_API_KEY || "").trim()),
            telnyxFromNumber: Boolean(String(env.TELNYX_FROM_NUMBER || "").trim()),
            adminExportKey: Boolean(String(env.ADMIN_EXPORT_KEY || "").trim()),
            resendApiKey: Boolean(String(env.RESEND_API_KEY || "").trim()),
            pulseEmailEnabled: String(env.PULSE_EMAIL_ENABLED || "0") === "1",
            pulseEmailFrom: Boolean(String(env.PULSE_EMAIL_FROM || "").trim()),
            pulseStaffNotifyTo: Boolean(String(env.PULSE_STAFF_NOTIFY_TO || "").trim()),
            d1: Boolean(env.DB),
          },
          tables,
        });
      }

      // Public ICS proxy (same-origin, avoids browser CORS issues)
      if (req.method === "GET" && path === "/api/events.ics") {
        const icsUrl = String(env.GCAL_PUBLIC_ICS_URL || "").trim();
        if (!icsUrl) {
          return json(req, env, { error: "GCAL_PUBLIC_ICS_URL not set" }, 500);
        }

        const upstream = await fetch(icsUrl, {
          cf: { cacheTtl: 300, cacheEverything: true },
        });

        if (!upstream.ok) {
          const msg = await upstream.text().catch(() => "");
          return new Response(msg || "Upstream calendar fetch failed", {
            status: 502,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              ...corsHeaders(env, req),
            },
          });
        }

        const body = await upstream.text();

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=300",
            ...corsHeaders(env, req),
          },
        });
      }

      if (req.method === "GET" && path === "/api/config") {
        const key = String(env.STRIPE_PUBLISHABLE_KEY || "").trim();
        if (!key) {
          return json(
            req,
            env,
            { error: "Payment service temporarily unavailable. Please try again later or email skovgard2026@gmail.com for support." },
            503
          );
        }
        return json(req, env, { stripePublishableKey: key });
      }

      if (req.method === "POST" && path === "/api/telnyx/webhook") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);

        const rawBody = await req.text();
        const hostHdr = String(req.headers.get("host") || "").trim();
        const requestHost = String(url.hostname || "").trim();
        const allowInsecureLocal =
          String(env.TELNYX_ALLOW_INSECURE_LOCAL_WEBHOOKS || "0") === "1";

        const validSignature = allowInsecureLocal
          ? true
          : await verifyTelnyxSignature(
              rawBody,
              req.headers,
              env.TELNYX_PUBLIC_KEY,
              { toleranceSeconds: Number(env.TELNYX_WEBHOOK_TOLERANCE_SECONDS || 300) }
            );

        if (!validSignature) {
          ctx.waitUntil(
            logTelnyxEvent(env.DB, {
              eventType: "invalid_signature",
              signatureValid: false,
              rawJson: rawBody,
            })
          );
          return json(req, env, { error: "Invalid signature." }, 401);
        }

        let event = {};
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json(req, env, { error: "Invalid payload." }, 400);
        }

        ctx.waitUntil(processTelnyxWebhookEvent(env.DB, rawBody, event, env));
        return json(req, env, { ok: true, accepted: true });
      }

      if (req.method === "POST" && path === "/api/resend/webhook") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);
        if (!String(env.RESEND_WEBHOOK_SECRET || "").trim()) {
          return json(req, env, { error: "Resend webhook secret not configured." }, 503);
        }

        const rawBody = await req.text();
        const validSignature = await verifyResendWebhookSignature(
          rawBody,
          req.headers,
          env.RESEND_WEBHOOK_SECRET,
          { toleranceSeconds: Number(env.RESEND_WEBHOOK_TOLERANCE_SECONDS || 300) }
        );
        if (!validSignature) {
          return json(req, env, { error: "Invalid signature." }, 401);
        }

        let event = {};
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json(req, env, { error: "Invalid payload." }, 400);
        }

        try {
          const result = await processResendWebhookEvent(env.DB, rawBody, event, req.headers);
          return json(req, env, result);
        } catch (error) {
          console.error("[resend-webhook] processing failed:", error?.message || error);
          return json(req, env, { error: "Webhook processing failed." }, 500);
        }
      }

      if (req.method === "POST" && path === "/api/donate/create-intent") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);
        if (!env.STRIPE_SECRET_KEY) return json(req, env, { error: "Stripe not configured." }, 500);

        const body = await req.json().catch(() => ({}));
        const donor = {
          first_name: normalizeText(body.first_name),
          last_name: normalizeText(body.last_name),
          email: normalizeText(body.email),
          phone: normalizeText(body.phone),
          address1: normalizeText(body.address1),
          address2: normalizeText(body.address2),
          city: normalizeText(body.city),
          state: normalizeText(body.state),
          zip: normalizeText(body.zip),
          country: normalizeText(body.country || "US"),
          employer: normalizeText(body.employer),
          occupation: normalizeText(body.occupation),
        };

        const attest = body.attestations || {};
        const attestation = {
          us_citizen: isAffirmative(attest.us_citizen),
          personal_funds: isAffirmative(attest.personal_funds),
          age_18: isAffirmative(attest.age_18),
          not_federal_contractor: isAffirmative(attest.not_federal_contractor),
          personal_card: isAffirmative(attest.personal_card),
        };

        if (!isNonEmpty(donor.first_name)) return json(req, env, { error: "First name is required." }, 400);
        if (!isNonEmpty(donor.last_name)) return json(req, env, { error: "Last name is required." }, 400);
        if (donor.email && !isValidEmail(donor.email)) return json(req, env, { error: "Email is not valid." }, 400);
        if (!isNonEmpty(donor.address1)) return json(req, env, { error: "Address line 1 is required." }, 400);
        if (!isNonEmpty(donor.city)) return json(req, env, { error: "City is required." }, 400);
        if (!isNonEmpty(donor.state)) return json(req, env, { error: "State is required." }, 400);
        if (!isNonEmpty(donor.zip)) return json(req, env, { error: "ZIP is required." }, 400);
        if (!isNonEmpty(donor.country)) return json(req, env, { error: "Country is required." }, 400);

        const { amount, cents, error: amountError } = parseAmountToCents(body.amount);
        if (amountError) return json(req, env, { error: amountError }, 400);
        if (amount < 1 || amount > 3500) return json(req, env, { error: "Amount must be between $1 and $3,500." }, 400);

        if (amount > 200) {
          if (!isNonEmpty(donor.employer)) return json(req, env, { error: "Employer is required for contributions over $200." }, 400);
          if (!isNonEmpty(donor.occupation)) return json(req, env, { error: "Occupation is required for contributions over $200." }, 400);
        }

        const attestationOk = attestation.us_citizen && attestation.personal_funds && attestation.age_18 && attestation.not_federal_contractor && attestation.personal_card;
        if (!attestationOk) return json(req, env, { error: "All attestations are required." }, 400);

        // FEC election-period enforcement
        const fecPeriod = getFecElectionPeriod();
        if (!fecPeriod) return json(req, env, { error: "The contribution window for this election cycle has closed." }, 400);

        if (donor.email) {
          const priorCents = await getDonorPeriodTotalCents(env.DB, donor.email, fecPeriod);
          const remainingCents = FEC_PERIOD_LIMIT_CENTS - priorCents;
          if (cents > remainingCents) {
            if (remainingCents <= 0) {
              return json(req, env, {
                error: "You have reached the $3,500 FEC contribution limit for the " + fecPeriod + " election. No additional contributions may be accepted.",
              }, 400);
            }
            const remainingDollars = (remainingCents / 100).toFixed(2);
            return json(req, env, {
              error: "This contribution would exceed your $3,500 FEC limit for the " + fecPeriod + " election. You may contribute up to $" + remainingDollars + " more.",
              remaining_cents: remainingCents,
            }, 400);
          }
        }

        const stripeResult = await createStripePaymentIntent(
          env,
          {
            amountCents: cents,
            email: donor.email,
            address1: donor.address1,
            zip: donor.zip,
          },
          {
            source: "donateV1",
            donor_email: donor.email,
          }
        );
        if (stripeResult.error) return json(req, env, { error: stripeResult.error }, 502);

        const ua = req.headers.get("user-agent") || "";
        const ip = req.headers.get("cf-connecting-ip") || "";

        try {
          const donorId = await upsertDonor(env.DB, donor);

          const contributionInsert = await env.DB.prepare(
            "INSERT INTO contributions" +
            " (donor_id, amount_cents, currency, payment_intent_id, status, election_period, updated_at)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)"
          ).bind(
            donorId,
            cents,
            "usd",
            stripeResult.id,
            "pending",
            fecPeriod
          ).run();

          const contributionId = contributionInsert.meta.last_row_id;

          await env.DB.prepare(
            "INSERT INTO contribution_attestations" +
            " (contribution_id, us_citizen, personal_funds, age_18, not_federal_contractor, personal_card, ip, user_agent)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
          ).bind(
            contributionId,
            attestation.us_citizen ? 1 : 0,
            attestation.personal_funds ? 1 : 0,
            attestation.age_18 ? 1 : 0,
            attestation.not_federal_contractor ? 1 : 0,
            attestation.personal_card ? 1 : 0,
            ip,
            ua
          ).run();
        } catch (error) {
          return json(req, env, { error: "Database error." }, 500);
        }

        return json(req, env, { client_secret: stripeResult.client_secret });
      }

      if (req.method === "POST" && path === "/api/donate/sms-optin") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);

        const body = await req.json().catch(() => ({}));
        const firstName = normalizeText(body.first_name);
        const lastName = normalizeText(body.last_name);
        const phone = normalizeText(body.phone).replace(/[^\d]/g, "");
        const email = normalizeText(body.email);
        const address1 = normalizeText(body.address1);
        const address2 = normalizeText(body.address2);
        const city = normalizeText(body.city);
        const state = normalizeText(body.state).toUpperCase();
        const zip = normalizeText(body.zip);
        const country = normalizeText(body.country || "US").toUpperCase();
        const consentSMS = body.consent_sms === true || body.consent_sms === 1;
        const consentVersion = normalizeText(body.consent_version)
          || `donate-v1-${new Date().toISOString().slice(0, 10)}`;

        if (!isNonEmpty(firstName)) return json(req, env, { error: "First name is required." }, 400);
        if (!isNonEmpty(lastName)) return json(req, env, { error: "Last name is required." }, 400);
        if (!phone || phone.length < 10) return json(req, env, { error: "Valid 10-digit mobile required." }, 400);
        if (!consentSMS) return json(req, env, { error: "SMS consent required." }, 400);

        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);
        const ua = req.headers.get("user-agent") || "";

        await upsertConsentStatus(env.DB, {
          phone,
          status: "opted_in",
          source: "web_form",
          sourceDetail: "donate",
          consentedAt: new Date().toISOString(),
          firstName,
          lastName,
          email: email || null,
          address1: address1 || null,
          address2: address2 || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          country: country || null,
          consentEmail: 0,
          consentVersion,
          userAgent: ua,
          ipHash,
          overwriteProfile: true,
        });

        await maybeSendWelcomeText(env.DB, env, phone);

        return json(req, env, { ok: true });
      }

      // POST /api/admin/donations/reconcile
      // Manually runs the same stale-pending-vs-Stripe reconciliation as the
      // hourly cron (see reconcilePendingDonations, docs/DonationsFlow.md).
      // Lets an admin re-check immediately instead of waiting for the next tick.
      if (req.method === "POST" && path === "/api/admin/donations/reconcile") {
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const result = await reconcilePendingDonations(env);
        return json(req, env, result);
      }

      if (req.method === "POST" && path === "/api/donate/webhook") {
        if (!env.STRIPE_WEBHOOK_SECRET) {
          return json(
            req,
            env,
            { error: "Stripe webhook secret not configured." },
            501
          );
        }
        if (!env.DB) return json(req, env, { error: "Database not configured." }, 500);

        const payload = await req.text();
        const signature = req.headers.get("stripe-signature") || "";
        const valid = await verifyStripeSignature(
          env.STRIPE_WEBHOOK_SECRET,
          payload,
          signature
        );

        if (!valid) {
          return json(req, env, { error: "Invalid signature." }, 400);
        }

        let event = {};
        try {
          event = JSON.parse(payload);
        } catch {
          return json(req, env, { error: "Invalid payload." }, 400);
        }

        const eventType = event.type || "";
        const intent = event.data?.object || {};
        const paymentIntentId = intent.id || "";
        if (!paymentIntentId) return json(req, env, { ok: true });

        let newStatus = "";
        if (eventType === "payment_intent.succeeded") newStatus = "succeeded_webhook";
        if (eventType === "payment_intent.payment_failed") newStatus = "failed";

        if (newStatus) {
          await env.DB.prepare(
            `UPDATE contributions
             SET status = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE payment_intent_id = ?2`
          )
            .bind(newStatus, paymentIntentId)
            .run();
        }

        // Donation notification email on confirmed payment
        if (newStatus === "succeeded_webhook" && env.RESEND_API_KEY) {
          const notifyEmail = async () => {
            try {
              const row = await env.DB.prepare(
                "SELECT d.first_name, d.last_name, d.email, d.city, d.state," +
                " d.employer, d.occupation," +
                " c.amount_cents, c.election_period, c.created_at" +
                " FROM contributions c JOIN donors d ON c.donor_id = d.id" +
                " WHERE c.payment_intent_id = ?1 LIMIT 1"
              ).bind(paymentIntentId).first();

              if (!row) return;

              const amount = "$" + (row.amount_cents / 100).toFixed(2);
              const donorName = row.first_name + " " + row.last_name;
              const location = [row.city, row.state].filter(Boolean).join(", ");
              const period = row.election_period || "primary";
              const priorCents = await getDonorPeriodTotalCents(env.DB, row.email, period);
              const remainingCents = Math.max(0, 350000 - priorCents);
              const remaining = "$" + (remainingCents / 100).toFixed(2);
              const fromAddr = normalizeText(env.ADMIN_EMAIL_FROM) || "support@grassrootsmvt.org";

              const htmlBody = [
                "<div style=\"font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1B2A4A;\">",
                "<h2 style=\"background:#C8973A;color:#fff;padding:16px 20px;margin:0;border-radius:6px 6px 0 0\">",
                "New Donation Received</h2>",
                "<div style=\"border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;padding:20px\">",
                "<table style=\"width:100%;border-collapse:collapse\">",
                "<tr><td style=\"padding:8px 0;color:#6b7280;width:140px\">Donor</td>",
                "<td style=\"padding:8px 0;font-weight:bold\">" + donorName + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Email</td>",
                "<td style=\"padding:8px 0\">" + (row.email || "—") + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Location</td>",
                "<td style=\"padding:8px 0\">" + (location || "—") + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Amount</td>",
                "<td style=\"padding:8px 0;font-weight:bold;font-size:1.2em;color:#15803d\">" + amount + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Period</td>",
                "<td style=\"padding:8px 0;text-transform:capitalize\">" + period + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">FEC Remaining</td>",
                "<td style=\"padding:8px 0\">" + remaining + " of $3,500 left (" + period + ")</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Employer</td>",
                "<td style=\"padding:8px 0\">" + (row.employer || "—") + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Occupation</td>",
                "<td style=\"padding:8px 0\">" + (row.occupation || "—") + "</td></tr>",
                "<tr><td style=\"padding:8px 0;color:#6b7280\">Payment ID</td>",
                "<td style=\"padding:8px 0;font-size:0.8em;color:#6b7280\">" + paymentIntentId + "</td></tr>",
                "</table>",
                "<hr style=\"margin:16px 0;border:none;border-top:1px solid #e5e7eb\">",
                "<p style=\"font-size:0.75em;color:#9ca3af;margin:0\">",
                "Skovgard for Senate &mdash; contributions tracked in D1 ballot_sources database.",
                "</p></div></div>",
              ].join("\n");

              const textBody = [
                "New donation received — Skovgard 2026",
                "---",
                "Donor:      " + donorName,
                "Email:      " + (row.email || "—"),
                "Location:   " + (location || "—"),
                "Amount:     " + amount,
                "Period:     " + period,
                "FEC left:   " + remaining + " of $3,500 (" + period + ")",
                "Employer:   " + (row.employer || "—"),
                "Occupation: " + (row.occupation || "—"),
                "Payment ID: " + paymentIntentId,
              ].join("\n");

              const donateNotifyTo = normalizeText(env.DONATE_NOTIFY_TO);
              if (!donateNotifyTo) return;
              await sendResendEmail(env.RESEND_API_KEY, {
                from: "Skovgard 2026 <" + fromAddr + ">",
                to: [donateNotifyTo],
                subject: "Donation " + amount + " from " + donorName + " (" + period + ")",
                html: htmlBody,
                text: textBody,
                tags: [
                  { name: "source", value: "donation_notify" },
                  { name: "period", value: period },
                ],
              }, paymentIntentId + ":donation-notify");
            } catch (e) {
              console.error("Donation notification email failed:", e.message);
            }
          };

          if (ctx?.waitUntil) ctx.waitUntil(notifyEmail());
          else await notifyEmail();
        }

        return json(req, env, { ok: true });
      }

      // Podcast metadata (public)
      if (req.method === "GET" && path === "/api/podcasts") {
        if (!env.DB) {
          return json(req, env, { error: "Database not configured" }, 500);
        }
        try {
          const base = mediaBaseUrl(env);
          const { results = [] } =
            (await env.DB.prepare(
              `SELECT guest_slug, episode_date, part_number, r2_key, sha256, bytes, uploaded_at, summary
                 FROM podcast_uploads
                 ORDER BY episode_date DESC, part_number ASC`
            ).all()) || {};

          const episodes = results.map((r) => {
            const key = String(r.r2_key || "").replace(/^\/+/, "");
            const url = key ? `${base}/${key}` : null;
            return {
              guest_slug: r.guest_slug,
              episode_date: r.episode_date,
              part_number: r.part_number,
              r2_key: key,
              url,
              sha256: r.sha256,
              bytes: r.bytes,
              uploaded_at: r.uploaded_at,
              summary: r.summary,
            };
          });

          return json(req, env, { mediaBaseUrl: base, episodes });
        } catch (err) {
          return json(req, env, { error: "Failed to load podcasts" }, 500);
        }
      }

      // Substack RSS proxy (public, cached 1 hour). Called client-side on
      // every page load of both index.astro and podcast/index.astro with no
      // dedup -- the response cache-control header only caps how often a
      // single browser re-fetches, not how often this Worker re-fetches
      // Substack across every visitor. Every unique page load was a fresh
      // live fetch to Substack; found 2026-07-16 hitting an intermittent
      // 429 from Substack against this Worker's shared egress IPs.
      // cacheTtlByStatus caches only real 2xx responses at Cloudflare's
      // edge -- deliberately NOT a blanket `cacheEverything: true`
      // (see docs/PODCAST_WORKFLOW.md and docs/podcast_notes.md): that
      // option caches whatever came back regardless of status, so a
      // transient 429/5xx (or an empty body) gets cached and served to
      // every visitor for the full TTL instead of just this one request --
      // a real incident already documented before this file existed.
      if (req.method === "GET" && path === "/api/podcast-feed") {
        try {
          const upstream = await fetch("https://jimskovgard.substack.com/feed", {
            headers: {
              "Accept": "application/rss+xml, application/xml, text/xml",
              "User-Agent": "Mozilla/5.0 (compatible; skovgard2026-bot/1.0)",
            },
            cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
          });
          if (!upstream.ok) return json(req, env, { error: "Feed unavailable", status: upstream.status }, 502);
          const xml = await upstream.text();
          const episodes = parseSubstackRSS(xml);
          return new Response(JSON.stringify({ episodes }), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
              "access-control-allow-origin": "*",
            },
          });
        } catch (e) {
          return json(req, env, { error: String(e) }, 500);
        }
      }

      // GET /api/surveys — active Wyoming-scoped surveys for civ-tech page dropdown
      if (req.method === "GET" && path === "/api/surveys") {
        if (!env.WY_DB) {
          return json(req, env, { error: "Survey database unavailable." }, 503);
        }
        try {
          const { results = [] } = await env.WY_DB.prepare(
            "SELECT slug, title FROM surveys WHERE status = 'active' AND scope = 'wy' ORDER BY id DESC"
          ).all();
          return new Response(JSON.stringify({ surveys: results }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300",
              "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
            },
          });
        } catch (err) {
          return json(req, env, { error: "Failed to load surveys." }, 500);
        }
      }

      // ---------------- SMS OPT-IN ----------------
      if (req.method === "POST" && path === "/api/optin") {
        const b = await req.json().catch(() => ({}));

        const firstName = String(b.first_name || "").trim();
        const lastName = String(b.last_name || "").trim();
        const address1 = normalizeText(b.address1);
        const address2 = normalizeText(b.address2);
        const city = normalizeText(b.city);
        const state = normalizeText(b.state || "WY").toUpperCase();
        const country = normalizeText(b.country || "US").toUpperCase();
        const zip = String(b.zip || "").replace(/\D/g, "");
        const requestedWyVoter = b.wy_voter === true || b.wy_voter === 1;

        const phone = String(b.phone || "").replace(/[^\d]/g, "");
        const email = String(b.email || "").trim();
        const phoneE164 = normalizePhoneNumber(phone);

        const consentSMS = b.consent_sms === true || b.consent === 1;
        const consentEmail = b.consent_email === true;
        const consentVer = String(b.consent_version || "v3-2026-03-31");
        const requestCallback = b.request_callback === true;

        // Token: prefer header (official), fallback to body for older clients
        const tsToken = (
          req.headers.get("cf-turnstile-response") ||
          String(b.turnstile_token || "")
        ).trim();

        // Server-side time trap (align with client)
        const now = Date.now();
        const elapsed = getElapsedMsFromBody(b, now);
        const MIN_WAIT = 1200;
        if (elapsed > 0 && elapsed < MIN_WAIT) {
          return json(
            req,
            env,
            { error: "Please wait a moment and try again." },
            400
          );
        }

        // Required fields
        if (!firstName)
          return json(req, env, { error: "First name is required" }, 400);
        if (!lastName)
          return json(req, env, { error: "Last name is required" }, 400);
        if (zip && !/^\d{5}$/.test(zip))
          return json(req, env, { error: "Enter a valid 5-digit ZIP." }, 400);
        if (!phoneE164)
          return json(
            req,
            env,
            { error: "Valid 10-digit mobile required" },
            400
          );
        if (!consentSMS) {
          return json(req, env, { error: "SMS consent required" }, 400);
        }
        if (email && !isValidEmail(email)) {
          return json(req, env, { error: "Email is not valid." }, 400);
        }
        if (email && !consentEmail) {
          return json(req, env, { error: "Email consent required to save email." }, 400);
        }
        // Bot protections
        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);
        const priorConsent = await env.DB.prepare(
          `SELECT status, consent_email, wy_voter, poll_link_sent_at
             FROM consent_status
            WHERE phone_e164 = ?1`
        )
          .bind(phoneE164)
          .first()
          .catch(() => null);
        const pollLinkAlreadySent = Boolean(priorConsent?.poll_link_sent_at);

        const wyVoter =
          b.wy_voter === undefined
            ? (Number(priorConsent?.wy_voter || 0) === 1 ? 1 : 0)
            : (requestedWyVoter ? 1 : 0);

        const origin = req.headers.get("origin") || "";
        const hostHdr = req.headers.get("host") || "";
        const isLocalHost =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          hostHdr.startsWith("localhost") ||
          hostHdr.startsWith("127.0.0.1");

        // Turnstile verify (bypass in local dev)
        const sv = isLocalHost
          ? { success: true, hostname: "localhost", action: "optin" }
          : await verifyTurnstile(env.TURNSTILE_SECRET, tsToken, ip);

        // Temporary logging while stabilizing; remove later
        console.log("turnstile", {
          success: sv.success,
          hostname: sv.hostname,
          action: sv.action,
          ts: sv.challenge_ts,
          errors: sv["error-codes"],
        });

        // Optional host/action assertions (skip for local bypass)
        if (!isLocalHost && sv.hostname && !tsHostAllowed(env, sv.hostname)) {
          console.log("Turnstile hostname rejected:", sv.hostname);
          return json(req, env, { error: "Verification failed. Please try again." }, 400);
        }
        if (!isLocalHost && sv.action && sv.action !== "optin") {
          return json(req, env, { error: "Verification failed. Please try again." }, 400);
        }
        if (!sv.success) {
          const code = String((sv["error-codes"] || [])[0] || "");
          const msg = code.includes("timeout-or-duplicate")
            ? "Verification timed out. Please try again."
            : code.includes("invalid-input-response")
            ? "Verification failed. Please refresh and try again."
            : "Verification failed. Please try again.";
          return json(req, env, { error: msg }, 400);
        }

        // Rate limiting. Was 3; the redesigned /pulse flow makes two real
        // calls per legitimate session (join, then poll-or-callback), so 3
        // left almost no room for a retry. 5 keeps meaningful abuse
        // protection while covering that plus one retry.
        const okRl = await rateLimitOk(env, ipHash, 15, 5);
        if (!okRl)
          return json(
            req,
            env,
            { error: "Too many requests, please try later" },
            429
          );

        const ua = req.headers.get("user-agent") || "";
        await upsertConsentStatus(env.DB, {
          phone,
          status: "opted_in",
          source: "web_form",
          sourceDetail: "pulse",
          consentedAt: new Date().toISOString(),
          firstName,
          lastName,
          email: email || null,
          consentEmail: consentEmail ? 1 : 0,
          wyVoter,
          zip,
          address1: address1 || null,
          address2: address2 || null,
          city: city || null,
          state,
          country,
          stateHouseDistrict: null,
          stateSenateDistrict: null,
          consentVersion: consentVer,
          userAgent: ua,
          ipHash,
          overwriteProfile: true,
        });

        if (consentEmail && email) {
          await upsertNewsletterSubscriber(env.DB, {
            email,
            consentEmail: true,
            consentVersion: consentVer,
            source: "skovgard2026:pulse",
            userAgent: req.headers.get("user-agent") || "",
            ipHash,
          });
        }

        // Voter verification is independent of email -- attempted whenever the
        // /pulse "verify your voter registration" section was used (signaled
        // by `city`, since findUniqueWyTargetMatch hard-requires it). Poll-link
        // minting additionally requires an email (grassmvt_survey's mint
        // endpoint hard-requires email_norm), so a matched-but-no-email
        // submission is recorded as verified without a link.
        let pollLink = null;
        let verification = { status: "not_attempted" };
        let matchedVoterForPhone = null;
        if (city) {
          try {
            const syncResult = await syncSubmittedPhoneToWyVoter(env, {
              phone,
              firstName,
              lastName,
              address1,
              city,
              zip,
              email,
            });
            if (syncResult?.ok) {
              matchedVoterForPhone = {
                voterId: syncResult.voterId,
                matchedBy: syncResult.matchedBy,
              };
              console.log("[/api/optin] matched submitted phone to WY voter; awaiting SMS delivery", {
                voterId: syncResult.voterId,
                matchedBy: syncResult.matchedBy,
              });
              await env.DB.prepare(
                `UPDATE consent_status SET voter_id = COALESCE(voter_id, ?2), updated_at = datetime('now') WHERE phone_e164 = ?1`
              ).bind(phoneE164, syncResult.voterId).run();
              if (email && pollLinkAlreadySent) {
                // grassmvt_survey's mint endpoint replaces the existing
                // token on every call (see its own comment: "re-minting
                // ... replaces the token ... so a resend doesn't create
                // orphan rows") -- re-minting here without also
                // re-delivering would silently invalidate the link already
                // sitting in this person's inbox/texts. Once delivered,
                // leave it alone rather than mint-and-drop a replacement.
                verification = { status: "already_sent" };
              } else if (email) {
                const resolved = await resolveVoterDistrictAndPrecinct(env, syncResult.voterId);
                const recipient = {
                  voter_id: syncResult.voterId,
                  email_norm: email.toLowerCase(),
                  house_district: resolved?.house_district || undefined,
                  senate_district: resolved?.senate_district || undefined,
                  political_party: resolved?.political_party || undefined,
                  county: resolved?.county || undefined,
                  city: resolved?.city || undefined,
                  precinct_code: resolved?.precinct_code || undefined,
                };
                const { withLinks, mintFailures } = await mintPollInviteLinksForChunk(env, [recipient]);
                if (withLinks?.[0]?.poll_link) {
                  pollLink = withLinks[0].poll_link;
                } else if (mintFailures?.length) {
                  console.log("[/api/optin] poll link mint skipped", {
                    reason: mintFailures[0]?.error,
                  });
                }
                verification = { status: "matched", pollLink };
              } else {
                verification = { status: "matched_no_email" };
              }
            } else {
              const mode = syncResult?.skipped;
              // Every non-ok outcome except a genuine local/infra gap gets a
              // review row now -- previously only the ambiguous_*/no_match
              // modes did, silently dropping `missing_lookup_fields` (city
              // was submitted, so this path was entered at all, but
              // zip/name didn't resolve to anything queryable) and
              // `phone_belongs_to_other_voter` (a clean, unique name/email/
              // phone match thrown away over an unrelated phone collision)
              // with nothing but a console.log.
              const infraSkip = mode === "missing_wy_tables" || mode === "invalid_phone" || mode === "missing_binding";
              if (!infraSkip) {
                const candidateVoterIds = summarizeMatchCandidates(syncResult.candidates);
                const phone10ForFlag = normalizePhone10(phone);
                const phoneAreaFlag = phone10ForFlag.length === 10 && !isWyAreaCodePhone10(phone10ForFlag);
                const zipRangeFlag = Boolean(zip) && !isWyZip5(zip);
                await env.DB.prepare(
                  `INSERT INTO pulse_voter_match_review
                     (phone_e164, submitted_first_name, submitted_last_name, submitted_address1, submitted_city, submitted_zip, match_mode, candidate_voter_ids, phone_area_flag, zip_range_flag)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
                ).bind(
                  phoneE164,
                  firstName,
                  lastName,
                  address1 || null,
                  city || null,
                  zip || null,
                  mode,
                  candidateVoterIds.length ? JSON.stringify(candidateVoterIds) : null,
                  phoneAreaFlag ? 1 : 0,
                  zipRangeFlag ? 1 : 0
                ).run();
                verification = { status: mode === "no_match" || mode === "missing_lookup_fields" ? "no_match" : "ambiguous" };

                const reviewNeededWork = sendPulseReviewNeededEmail(env, {
                  phoneE164, firstName, lastName, address1, city, zip, matchMode: mode,
                }).catch((error) => {
                  console.error("[/api/optin] review-needed email failed", String(error?.message || error));
                });
                if (ctx?.waitUntil) ctx.waitUntil(reviewNeededWork);
                else await reviewNeededWork;
              } else {
                console.log("[/api/optin] skipped WY phone mirror", { reason: mode });
              }
            }
          } catch (error) {
            console.error("[/api/optin] WY phone mirror or poll mint failed", String(error?.message || error));
          }

          // The wy_voter flag set by upsertConsentStatus above is a
          // self-report field with no corresponding input in the current
          // two-step /pulse form (removed when the poll-verification step
          // was built) -- it always defaults to whatever was previously
          // stored (0/"No" for a fresh contact), regardless of whether the
          // real voter-file match just above -- including the tier-3
          // name+zip fallback -- actually succeeded. Correct it here now
          // that the real outcome is known: matchedVoterForPhone is only
          // set on a genuine unique match via any tier; a real
          // no-match/ambiguous result (already routed to
          // pulse_voter_match_review above) correctly stays "No".
          const realWyVoter = matchedVoterForPhone ? 1 : 0;
          if (realWyVoter !== wyVoter) {
            await env.DB.prepare(
              `UPDATE consent_status SET wy_voter = ?2, updated_at = datetime('now') WHERE phone_e164 = ?1`
            ).bind(phoneE164, realWyVoter).run();
          }
        } else if (requestCallback) {
          // Step-1-only submission ("join updates without voting") where the
          // submitter checked "call me back ASAP". They still want the
          // Citizen Poll but don't have their address handy. No `city` means
          // findUniqueWyTargetMatch was never attempted (§4a requires it), so
          // this is not a match failure. It's a request for staff to call
          // and collect the address verbally, same review queue as an
          // ambiguous/no-match row but with an immediate notify rather than
          // waiting for the daily digest.
          const phone10ForFlag = normalizePhone10(phone);
          const phoneAreaFlag = phone10ForFlag.length === 10 && !isWyAreaCodePhone10(phone10ForFlag);
          await env.DB.prepare(
            `INSERT INTO pulse_voter_match_review
               (phone_e164, submitted_first_name, submitted_last_name, match_mode, phone_area_flag, zip_range_flag)
             VALUES (?1, ?2, ?3, 'callback_requested_no_address', ?4, 0)`
          ).bind(phoneE164, firstName, lastName, phoneAreaFlag ? 1 : 0).run();

          verification = { status: "callback_requested" };

          const callbackNeededWork = sendPulseReviewNeededEmail(env, {
            phoneE164, firstName, lastName, matchMode: "callback_requested_no_address",
          }).catch((error) => {
            console.error("[/api/optin] callback-requested email failed", String(error?.message || error));
          });
          if (ctx?.waitUntil) ctx.waitUntil(callbackNeededWork);
          else await callbackNeededWork;
        }

        const welcomeConfig = pulseWelcomeConfig(env);
        const welcomeBaseText = String(welcomeConfig.text || "").trim();
        const welcomeText = pollLink
          ? `${welcomeBaseText} Cast your vote in our Citizen Poll: ${pollLink}`
          : welcomeBaseText;
        // Awaited (not fire-and-forget) because the dedicated poll-link
        // delivery below needs to know whether this already covered it --
        // maybeSendWelcomeText only fires once ever per phone
        // (contacts.welcome_sent_at), so a real result here is the only way
        // to tell "just sent, poll link included" from "skipped, contact
        // already welcomed before poll-link support existed".
        const welcomeResult = await maybeSendWelcomeText(
          env.DB,
          env,
          phone,
          {
            ...welcomeConfig,
            text: welcomeText,
            auditDetails: matchedVoterForPhone || {},
          }
        ).catch((error) => {
          console.error("[/api/optin] pulse welcome text failed", String(error?.message || error));
          return { sent: false, reason: "error" };
        });

        const currentConsent = await env.DB.prepare(
          `SELECT phone_e164, status, consented_at, source, source_detail,
                  first_name, last_name, email, consent_email, wy_voter,
                  address1, address2, city, state, zip, country,
                  state_house_district, state_senate_district, consent_version
             FROM consent_status
            WHERE phone_e164 = ?1`
        )
          .bind(phoneE164)
          .first()
          .catch(() => null);

        const wasOptedIn = String(priorConsent?.status || "").trim() === "opted_in";
        const hadEmailConsent = Number(priorConsent?.consent_email || 0) === 1;
        const shouldSendStaffEmail = !wasOptedIn;
        const shouldSendConfirmationEmail = Boolean(email && consentEmail && (!wasOptedIn || !hadEmailConsent));

        if ((shouldSendStaffEmail || shouldSendConfirmationEmail) && currentConsent) {
          const baseKey = await hmacSha256Hex(
            consentVer || "pulse-optin",
            [
              "pulse",
              currentConsent.phone_e164 || phoneE164,
              currentConsent.consented_at || new Date().toISOString(),
              shouldSendStaffEmail ? "staff" : "no-staff",
              shouldSendConfirmationEmail ? "confirm" : "no-confirm",
            ].join("|")
          );

          const sendEmailWork = sendPulseOptInEmails(env, {
            firstName: currentConsent.first_name,
            lastName: currentConsent.last_name,
            phoneE164: currentConsent.phone_e164,
            email: currentConsent.email,
            consentSms: String(currentConsent.status || "").trim() === "opted_in",
            consentEmail: Number(currentConsent.consent_email || 0) === 1,
            wyVoter: Number(currentConsent.wy_voter || 0) === 1,
            address1: currentConsent.address1,
            address2: currentConsent.address2,
            city: currentConsent.city,
            state: currentConsent.state,
            zip: currentConsent.zip,
            country: currentConsent.country,
            stateHouseDistrict: currentConsent.state_house_district,
            stateSenateDistrict: currentConsent.state_senate_district,
            consentedAt: currentConsent.consented_at,
            consentVersion: currentConsent.consent_version,
            source: currentConsent.source,
            sourceDetail: currentConsent.source_detail,
            pollLink,
          }, {
            sendStaff: shouldSendStaffEmail,
            sendConfirmation: shouldSendConfirmationEmail,
            staffIdempotencyKey: `${baseKey}:staff`,
            confirmationIdempotencyKey: `${baseKey}:confirmation`,
          }).catch((error) => {
            console.error("[/api/optin] pulse email send failed", String(error?.message || error));
          });

          if (ctx?.waitUntil) ctx.waitUntil(sendEmailWork);
          else await sendEmailWork;
        }

        // Dedicated poll-link delivery -- independent of the general
        // welcome-text/confirmation-email "first time subscribing" gates
        // above, which exist to avoid re-welcoming an existing subscriber
        // and have nothing to do with poll delivery. Only runs once ever
        // per contact (pollLinkAlreadySent), and skips a channel the
        // general sends above already covered (welcomeResult.sent already
        // embedded the link in the welcome text; shouldSendConfirmationEmail
        // means the confirmation email above already embedded it too) so a
        // first-time subscriber who also wants the poll doesn't get the
        // link twice on the same channel.
        if (pollLink && !pollLinkAlreadySent) {
          const needsSms = !welcomeResult?.sent;
          const needsEmail = !shouldSendConfirmationEmail && Boolean(email && consentEmail);

          const pollLinkDeliveryWork = (async () => {
            const [smsResult, emailResult] = await Promise.all([
              needsSms
                ? sendPollLinkText(env, phoneE164, pollLink, { auditDetails: matchedVoterForPhone || {} }).catch((error) => {
                    console.error("[/api/optin] poll link SMS failed", String(error?.message || error));
                    return { sent: false, reason: "error" };
                  })
                : Promise.resolve({ sent: false, reason: "covered_by_welcome_text" }),
              needsEmail
                ? (async () => {
                    const pollLinkKey = await hmacSha256Hex(consentVer || "pulse-optin", ["pulse-poll-link", phoneE164, pollLink].join("|"));
                    return sendPollLinkEmail(env, { firstName, email, consentEmail: true, pollLink }, pollLinkKey).catch((error) => {
                      console.error("[/api/optin] poll link email failed", String(error?.message || error));
                      return { sent: false, reason: "error" };
                    });
                  })()
                : Promise.resolve({ sent: false, reason: "covered_by_confirmation_email" }),
            ]);

            const delivered =
              smsResult?.sent || emailResult?.sent ||
              (!needsSms && welcomeResult?.sent) ||
              (!needsEmail && shouldSendConfirmationEmail);

            if (delivered) {
              await env.DB.prepare(
                `UPDATE consent_status SET poll_link_sent_at = datetime('now') WHERE phone_e164 = ?1`
              ).bind(phoneE164).run();
            } else {
              console.error("[/api/optin] poll link delivery failed on all channels", { sms: smsResult, email: emailResult });
            }
          })();

          if (ctx?.waitUntil) ctx.waitUntil(pollLinkDeliveryWork);
          else await pollLinkDeliveryWork;
        }

        return json(req, env, { ok: true, verification });
      }

      // POST /api/pulse/progress — best-effort capture of a /pulse form
      // that hasn't reached a real submission yet (see
      // static/js/pulse-optin.js). Fired once the SMS-consent checkbox is
      // checked with a valid phone, and again on "Continue to Citizen
      // Poll". This is NOT a consent record -- no row here is ever read as
      // an opt-in (see pulse_abandoned_signups, migration 037); it exists
      // purely so staff can call and try to complete a real opt-in
      // verbally. Silently no-ops for a phone that already has a real
      // opt-in on file, so the call queue doesn't fill with noise from
      // people re-visiting a form they already completed.
      if (req.method === "POST" && path === "/api/pulse/progress") {
        if (!env.DB) return json(req, env, { ok: true });

        const b = await req.json().catch(() => ({}));
        const phoneE164 = normalizePhoneNumber(b?.phone || "");
        const stepReached = String(b?.step_reached || "").trim();
        const consentSms = b?.consent_sms === true;
        const firstName = normalizeText(b?.first_name) || null;

        if (!phoneE164 || !consentSms) return json(req, env, { ok: true });
        if (!["consent_checked", "step2_reached"].includes(stepReached)) {
          return json(req, env, { ok: true });
        }

        const ip = req.headers.get("cf-connecting-ip") || "";
        // rl_submissions has no per-endpoint bucket column. rateLimitOk
        // just counts every row for a given ip_hash regardless of which
        // endpoint wrote it. Hashing a distinct string here keeps this
        // beacon's own budget from eating into /api/optin's real-submission
        // limit below (found after the redesigned /pulse flow, which needs
        // two real /api/optin calls per session, started tripping that
        // limit on ordinary use).
        const progressIpHash = await sha256Hex(`${ip}:pulse-progress`);
        const okRl = await rateLimitOk(env, progressIpHash, 15, 10);
        if (!okRl) return json(req, env, { ok: true });

        const alreadyOptedIn = await env.DB.prepare(
          `SELECT 1 FROM consent_status WHERE phone_e164 = ?1 AND status = 'opted_in'`
        ).bind(phoneE164).first().catch(() => null);
        if (alreadyOptedIn) return json(req, env, { ok: true });

        await env.DB.prepare(
          `INSERT INTO pulse_abandoned_signups (phone_e164, first_name, step_reached)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(phone_e164) DO UPDATE SET
             first_name = COALESCE(excluded.first_name, pulse_abandoned_signups.first_name),
             step_reached = excluded.step_reached,
             updated_at = datetime('now')`
        ).bind(phoneE164, firstName, stepReached).run().catch(() => null);

        return json(req, env, { ok: true });
      }

      // POST /api/share — visitor-initiated "share with a friend" sends
      if (req.method === "POST" && path === "/api/share") {
        const shareEnabled = String(env.SHARE_ENABLED || "0") === "1";
        const apiKey = String(env.RESEND_API_KEY || "").trim();
        const adminFromAddr = String(env.ADMIN_EMAIL_FROM || "").trim();
        const shareFromAddr = String(env.SHARE_EMAIL_FROM || "").trim() || adminFromAddr;

        if (!shareEnabled || !apiKey || !adminFromAddr || !shareFromAddr) {
          return json(req, env, { error: "Share feature is not currently available." }, 503);
        }

        const b = await req.json().catch(() => ({}));

        // Honeypot — silent drop for bots
        if (String(b._trap || "").trim()) {
          return json(req, env, { ok: true, sent: 0 });
        }

        // IP rate limit — max 50 sends per IP per 60 minutes
        // Admin key bypass: if SHARE_ADMIN_KEY is set and request includes matching admin_key, skip rate limit
        const adminKey = String(env.SHARE_ADMIN_KEY || "").trim();
        const providedAdminKey = String(b.admin_key || "").trim();

        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);

        // Only a non-empty admin_key counts as an admin-auth attempt for lockout
        // purposes — ordinary public shares never send one, so they never trip it.
        let isAdminSend = false;
        if (adminKey && providedAdminKey && !(await adminAuthLockedOut(env, ipHash))) {
          isAdminSend = timingSafeEqual(providedAdminKey, adminKey);
          if (!isAdminSend) await recordAdminAuthFailure(env, ipHash);
        }

        if (!isAdminSend && env.DB) {
          try {
            const rlRow = await env.DB.prepare(
              "SELECT COUNT(*) AS n FROM share_sends WHERE sender_ip_hash = ?1 AND is_admin_send = 0 AND created_at >= datetime('now', '-60 minutes')"
            ).bind(ipHash).first();
            if ((rlRow?.n || 0) >= 50) {
              return json(req, env, { error: "Too many requests. Please try again later." }, 429);
            }
          } catch (_) { /* fail open if table not yet created */ }
        }

        const senderName = String(b.sender_name || "").trim().slice(0, 80);

        if (/[\r\n\x00]/.test(senderName)) {
          return json(req, env, { error: "Invalid sender name." }, 400);
        }

        const isCustomAdminEmail = String(b.email_mode || "") === "custom";
        if (isCustomAdminEmail && !isAdminSend) {
          return json(req, env, { error: "Regular email requires the admin key." }, 403);
        }

        // Custom admin-composed emails (Blast) keep their own reputation-isolated
        // identity; predefined SHARE_MESSAGES sends use the identity every /share
        // page's own preview UI actually promises.
        const fromAddr = isCustomAdminEmail ? adminFromAddr : shareFromAddr;

        const messageSlug = isCustomAdminEmail
          ? "admin-regular-email"
          : String(b.message_slug || "jimmys-story").trim();
        const msg = isCustomAdminEmail ? null : SHARE_MESSAGES[messageSlug];
        if (!isCustomAdminEmail && !msg) {
          return json(req, env, { error: "Unknown message." }, 400);
        }

        const rawRecipients = Array.isArray(b.recipients) ? b.recipients : [];
        const recipients = rawRecipients
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
          .slice(0, 10);

        if (recipients.length === 0) {
          return json(req, env, { error: "At least one valid email address is required." }, 400);
        }

        let subject;
        let htmlBody;
        let textBody;
        if (isCustomAdminEmail) {
          subject = normalizeAdminEmailSubject(b.subject);
          textBody = normalizeAdminEmailBody(b.body);
          if (!subject || /[\r\n\x00]/.test(subject)) {
            return json(req, env, { error: "A valid email subject is required." }, 400);
          }
          if (subject.length > 180) {
            return json(req, env, { error: "Email subject too long." }, 400);
          }
          if (!textBody) {
            return json(req, env, { error: "An email body is required." }, 400);
          }
          if (textBody.length > 20000) {
            return json(req, env, { error: "Email body too long." }, 400);
          }
          htmlBody = `<div style="font-family:Georgia, 'Times New Roman', serif;color:#2b2b2b;line-height:1.6;">${escHtml(textBody).replace(/\n/g, "<br>")}</div>`;
        } else {
          const senderIntro = msg.intro(senderName);
          subject = msg.subject(senderName);
          htmlBody = buildShareEmailHtml({
            sender_name:  senderName,
            sender_intro: senderIntro,
            body_html:    msg.body_html,
            preview_text: msg.preview_text,
            title:        msg.title,
          });
          textBody = buildShareEmailText({
            sender_name:  senderName,
            sender_intro: senderIntro,
            slug:         messageSlug,
          });
        }

        // Use "Display Name <addr>" format; bare address from env stays as-is if already formatted
        const fromFormatted = fromAddr.includes('<')
          ? fromAddr
          : `${isCustomAdminEmail ? "The Integrity Project" : "Jimmy Skovgard for Wyoming"} <${fromAddr}>`;

        // Pre-fetch first names for {first_name} substitution (custom emails, or a
        // share message like primary-candidates whose body_html itself has the tag)
        const firstNameByEmail = {};
        const needsFirstName = /\{first_name\}/i.test(subject + textBody);
        if (env.DB && needsFirstName) {
          const emailNorms = recipients.map(e => e.toLowerCase().trim());
          const ph = emailNorms.map((_, i) => `?${i + 1}`).join(", ");
          try {
            const [r1, r2] = await Promise.all([
              env.DB.prepare(`SELECT lower(trim(email)) AS en, COALESCE(NULLIF(first_name,''),'') AS fn FROM sms_optins WHERE lower(trim(email)) IN (${ph})`).bind(...emailNorms).all(),
              env.DB.prepare(`SELECT lower(trim(email)) AS en, COALESCE(NULLIF(first_name,''),'') AS fn FROM consent_status WHERE lower(trim(email)) IN (${ph})`).bind(...emailNorms).all(),
            ]);
            r1.results.forEach(r => { if (r.en && r.fn) firstNameByEmail[r.en] = r.fn; });
            r2.results.forEach(r => { if (r.en && r.fn && !firstNameByEmail[r.en]) firstNameByEmail[r.en] = r.fn; });
          } catch (_) {}
        }

        const needsOptinPlaceholders = !isCustomAdminEmail && bodyNeedsOptinPlaceholders(msg.body_html);
        // Every send through this endpoint gets a List-Unsubscribe header now,
        // not just messages with visible Yes/No buttons in the body -- this
        // path previously sent zero unsubscribe headers at all, unlike the
        // admin Blast/test-send paths (sendOneAdminEmail). One token per
        // recipient serves both purposes: its noUrl backs the header always,
        // and its yesUrl/noUrl back the {optin_yes_url}/{optin_no_url}
        // placeholders when the body needs them.
        const shareBatchId = env.DB ? `share-${crypto.randomUUID()}` : null;

        // Send sequentially with 200ms gap to avoid Resend rate-limit bursts
        const results = [];
        for (const [idx, to] of recipients.entries()) {
          if (idx > 0) await new Promise(r => setTimeout(r, 200));
          let sendSubject = subject;
          let sendText = textBody;
          let sendHtml = htmlBody;
          const fn = titleCase(firstNameByEmail[to.toLowerCase().trim()] || "all");
          if (needsFirstName) {
            sendSubject = subject.replace(/\{first_name\}/gi, fn);
            sendText    = textBody.replace(/\{first_name\}/gi, fn);
            sendHtml    = htmlBody.replace(/\{first_name\}/gi, isCustomAdminEmail ? fn : escHtml(fn));
          }
          let shareUnsubscribeHeaders = {};
          if (env.DB) {
            const { yesUrl, noUrl } = await createEmailOptinToken(env.DB, {
              email: to,
              emailNorm: to.toLowerCase().trim(),
              messageSlug,
              batchId: shareBatchId,
            });
            shareUnsubscribeHeaders = {
              "List-Unsubscribe": `<${noUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              // See sendOneAdminEmail's Feedback-ID comment -- same domain-wide
              // reputation pool, so this path needs it too, not just admin blasts.
              "Feedback-ID": `${shareBatchId}:${messageSlug}:resend`,
            };
            if (needsOptinPlaceholders) {
              sendText = substitutePersonalization(sendText, { optinYesUrl: yesUrl, optinNoUrl: noUrl });
              sendHtml = substitutePersonalization(sendHtml, { optinYesUrl: yesUrl, optinNoUrl: noUrl });
            }
          }
          const res = await sendResendEmail(apiKey, {
            from: fromFormatted,
            to: [to],
            subject: sendSubject,
            text: sendText,
            html: sendHtml,
            reply_to: fromAddr,
            ...(Object.keys(shareUnsubscribeHeaders).length ? { headers: shareUnsubscribeHeaders } : {}),
            tags: [
              { name: "source", value: isAdminSend ? "admin_share" : "share" },
              { name: "kind", value: isCustomAdminEmail ? "regular_email" : "friend_share" },
              ...(shareBatchId ? [{ name: "batch_id", value: shareBatchId.slice(0, 200) }] : []),
            ],
          })
            .then((r) => ({ ok: true,  email: to, resendId: r?.id || null }))
            .catch((err) => {
              console.error(`[share] Resend error for ${to} (slug=${messageSlug}):`, err?.message, JSON.stringify(err?.body ?? {}));
              return { ok: false, email: to, error: String(err?.message || err) };
            });
          results.push(res);
        }
        const sent   = results.filter((r) => r.ok).length;
        const failed = results.length - sent;

        // Persist every send attempt — audit log + rate-limit source
        if (env.DB) {
          const logWork = Promise.all(
            results.map((r) =>
              env.DB.prepare(
                `INSERT INTO share_sends
                   (message_slug, recipient_email, sender_name, sender_ip_hash,
                    resend_message_id, status, error_message, is_admin_send)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
              )
                .bind(
                  messageSlug,
                  r.email,
                  senderName || null,
                  ipHash,
                  r.resendId || null,
                  r.ok ? "sent" : "failed",
                  r.ok ? null : (r.error || null),
                  isAdminSend ? 1 : 0
                )
                .run()
                .catch(() => {})
            )
          );
          if (ctx?.waitUntil) ctx.waitUntil(logWork);
          else await logWork;
        }

        if (sent === 0) {
          console.error(`[share] All sends failed for slug=${messageSlug}. Errors:`, JSON.stringify(results.map(r => r.error)));
          return json(req, env, { error: "We could not send the email right now. Please try again or copy the share text manually." }, 500);
        }

        const failedEmails = results.filter(r => !r.ok).map(r => r.email);
        return json(req, env, { ok: true, sent, failed, failed_emails: failedEmails });
      }

      // GET /api/email/optin-response: public link a recipient clicks from an admin-sent
      // email's Yes/No buttons. No admin auth: the unguessable token IS the authorization,
      // and a click can only ever affect that one token's own email address. "no" acts
      // immediately here; "yes" only shows a confirmation page (see optinConfirmPage).
      if (req.method === "GET" && path === "/api/email/optin-response") {
        const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
        if (!env.DB) {
          return new Response(optinResponsePage({
            title: "Not available",
            message: "This service isn't configured right now. Please try again later.",
            tone: "error",
          }), { status: 503, headers: htmlHeaders });
        }

        const token = normalizeText(url.searchParams.get("token") || "");
        const choice = normalizeText(url.searchParams.get("choice") || "").toLowerCase();
        if (!token || !["yes", "no"].includes(choice)) {
          return new Response(optinResponsePage({
            title: "Invalid link",
            message: "This link is missing required information. Please use the link from your email exactly as sent.",
            tone: "error",
          }), { status: 400, headers: htmlHeaders });
        }

        const row = await env.DB.prepare(
          `SELECT token, email, email_norm FROM email_optin_tokens WHERE token = ?1`
        ).bind(token).first();

        if (!row) {
          return new Response(optinResponsePage({
            title: "Link no longer valid",
            message: "We couldn't find this confirmation link. It may have already been used or expired.",
            tone: "error",
          }), { status: 404, headers: htmlHeaders });
        }

        // "yes" no longer records anything on this bare GET (see
        // optinConfirmPage's comment above). Just show the confirmation
        // page. A real click on its button is what POSTs to /confirm below.
        if (choice === "yes") {
          return new Response(optinConfirmPage({ token }), { headers: htmlHeaders });
        }

        await env.DB.prepare(
          `UPDATE email_optin_tokens SET response = ?2, responded_at = datetime('now') WHERE token = ?1`
        ).bind(token, choice).run();

        await applyOptinResponse(env.DB, { email: row.email, emailNorm: row.email_norm, choice });

        return new Response(
          optinResponsePage({
            title: "You've been unsubscribed",
            message: "You will no longer receive campaign emails. If this was a mistake, you can opt back in anytime from a future email or by contacting the campaign.",
            tone: "success",
          }),
          { headers: htmlHeaders }
        );
      }

      // POST /api/email/optin-response/confirm: the real "yes" action,
      // reached only by clicking the button on optinConfirmPage above (a
      // genuine form POST, not a bare GET), so an email security scanner
      // pre-fetching the original link can no longer silently record
      // consent nobody actually gave. Same unguessable-token-is-the-
      // authorization model as the GET handler.
      if (req.method === "POST" && path === "/api/email/optin-response/confirm") {
        const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
        if (!env.DB) {
          return new Response(optinResponsePage({
            title: "Not available",
            message: "This service isn't configured right now. Please try again later.",
            tone: "error",
          }), { status: 503, headers: htmlHeaders });
        }

        const form = await req.formData().catch(() => null);
        const token = normalizeText(form?.get("token") || "");
        if (!token) {
          return new Response(optinResponsePage({
            title: "Invalid link",
            message: "This link is missing required information. Please use the link from your email exactly as sent.",
            tone: "error",
          }), { status: 400, headers: htmlHeaders });
        }

        const row = await env.DB.prepare(
          `SELECT token, email, email_norm FROM email_optin_tokens WHERE token = ?1`
        ).bind(token).first();

        if (!row) {
          return new Response(optinResponsePage({
            title: "Link no longer valid",
            message: "We couldn't find this confirmation link. It may have already been used or expired.",
            tone: "error",
          }), { status: 404, headers: htmlHeaders });
        }

        await env.DB.prepare(
          `UPDATE email_optin_tokens SET response = 'yes', responded_at = datetime('now') WHERE token = ?1`
        ).bind(token).run();

        await applyOptinResponse(env.DB, { email: row.email, emailNorm: row.email_norm, choice: "yes" });

        return new Response(
          optinResponsePage({
            title: "You're all set!",
            message: "Thank you. You'll continue to hear occasional campaign updates, candidate information, and ways to take part.",
            tone: "success",
          }),
          { headers: htmlHeaders }
        );
      }

      // POST /api/email/optin-response — RFC 8058 one-click unsubscribe target for
      // the List-Unsubscribe/List-Unsubscribe-Post headers set on admin/blast sends.
      // Mail clients that support one-click (Gmail, Yahoo, Outlook) POST here
      // automatically when the recipient clicks the native "Unsubscribe" link next
      // to the sender name -- no page render, no further clicks, always means
      // unsubscribe (there's no "yes" equivalent for a header-triggered POST).
      // Same unguessable-token-is-the-authorization model as the GET handler above.
      if (req.method === "POST" && path === "/api/email/optin-response") {
        if (!env.DB) return new Response(null, { status: 503 });

        const token = normalizeText(url.searchParams.get("token") || "");
        if (!token) return new Response(null, { status: 400 });

        const row = await env.DB.prepare(
          `SELECT token, email, email_norm FROM email_optin_tokens WHERE token = ?1`
        ).bind(token).first();
        if (!row) return new Response(null, { status: 404 });

        await env.DB.prepare(
          `UPDATE email_optin_tokens SET response = 'no', responded_at = datetime('now') WHERE token = ?1`
        ).bind(token).run();

        await applyOptinResponse(env.DB, { email: row.email, emailNorm: row.email_norm, choice: "no" });

        return new Response(null, { status: 200 });
      }

      // GET /api/share/preview — returns the full rendered HTML email for iframe preview
      // No auth required; SHARE_ENABLED not required (preview always works in dev).
      if (req.method === "GET" && path === "/api/share/preview") {
        const slug       = (url.searchParams.get("slug") || "jimmys-story").trim();
        const senderName = String(url.searchParams.get("sender_name") || "").trim().slice(0, 80);
        const msg        = SHARE_MESSAGES[slug];
        if (!msg) {
          return new Response("Unknown message slug.", { status: 400, headers: { "Content-Type": "text/plain" } });
        }
        const senderIntro = msg.intro(senderName);
        const html = buildShareEmailHtml({
          sender_name:  senderName,
          sender_intro: senderIntro,
          body_html:    msg.body_html,
          preview_text: msg.preview_text,
          title:        msg.title,
        });
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      // GET /api/share/stats — public per-slug send counts for the share index page
      if (req.method === "GET" && path === "/api/share/stats") {
        if (!env.DB) return json(req, env, { stats: {} });
        try {
          const { results = [] } = await env.DB.prepare(
            "SELECT message_slug, COUNT(*) AS total FROM share_sends WHERE status = 'sent' GROUP BY message_slug"
          ).all();
          const stats = {};
          for (const row of results) stats[row.message_slug] = row.total;
          return new Response(JSON.stringify({ stats }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=120",
              "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
            },
          });
        } catch {
          return new Response(JSON.stringify({ stats: {} }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // GET /api/share/messages — ordered slug+title list derived from SHARE_MESSAGES registry
      if (req.method === "GET" && path === "/api/share/messages") {
        const messages = Object.entries(SHARE_MESSAGES).map(([slug, m]) => ({ slug, title: m.title }));
        return new Response(JSON.stringify({ ok: true, messages }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
          },
        });
      }

      // GET /api/admin/share/audit — share send log with optional filters
      if (req.method === "GET" && path === "/api/admin/share/audit") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
        const since = url.searchParams.get("since")     || null;
        const rcpt  = url.searchParams.get("recipient") || null;
        const slug  = url.searchParams.get("slug")      || null;

        let query = `SELECT id, message_slug, recipient_email, sender_name, sender_ip_hash,
                            resend_message_id, status, error_message, created_at
                       FROM share_sends`;
        const conds = [];
        const binds = [];
        if (since) { conds.push(`created_at >= ?${binds.length + 1}`);     binds.push(since); }
        if (rcpt)  { conds.push(`recipient_email = ?${binds.length + 1}`); binds.push(rcpt.toLowerCase().trim()); }
        if (slug)  { conds.push(`message_slug = ?${binds.length + 1}`);   binds.push(slug); }
        if (conds.length) query += ` WHERE ${conds.join(" AND ")}`;
        query += ` ORDER BY created_at DESC LIMIT ?${binds.length + 1}`;
        binds.push(limit);

        try {
          const rows   = await env.DB.prepare(query).bind(...binds).all();
          const totals = await env.DB.prepare(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END) AS sent_count,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
               FROM share_sends`
          ).first();
          return json(req, env, {
            ok:           true,
            total:        totals?.total        || 0,
            total_sent:   totals?.sent_count   || 0,
            total_failed: totals?.failed_count || 0,
            sends:        rows.results || [],
          });
        } catch (err) {
          return json(req, env, { error: "Query failed: " + String(err?.message || err) }, 500);
        }
      }

      if (req.method === "GET" && path === "/api/admin/telnyx/can-send") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const phone = String(url.searchParams.get("phone") || "").trim();
        const phoneE164 = normalizePhoneNumber(phone);
        if (!phoneE164) {
          return json(req, env, { error: "Valid phone query parameter required" }, 400);
        }

        const blocked = await isOutboundSendBlocked(env.DB, phoneE164);
        return json(req, env, {
          ok: true,
          phone: phoneE164,
          canSend: !blocked,
          blocked,
          // TODO(worker/src/index.js): call this guard from the future Telnyx send endpoint before any outbound API request.
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/status") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const [
          lastOutboundRow,
          lastInboundRow,
          lastDeliveryUpdateRow,
          failedRow,
          sentTodayRow,
          optedInRow,
          optedOutRow,
          suppressedRow,
          newOptInRow,
          lastOutboundSummaryRow,
          lastInboundSummaryRow,
        ] = await Promise.all([
          env.DB.prepare(
            `SELECT MAX(created_at) AS ts FROM outbound_messages`
          ).first(),
          env.DB.prepare(
            `SELECT MAX(received_at) AS ts FROM inbound_messages`
          ).first(),
          env.DB.prepare(
            `SELECT MAX(COALESCE(occurred_at, processed_at)) AS ts
               FROM telnyx_events
              WHERE event_type IN ('message.sent', 'message.delivered', 'message.finalized', 'message.delivery_failed')`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n FROM outbound_messages WHERE status IN ('failed', 'delivery_failed')`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n
               FROM outbound_messages
              WHERE datetime(created_at) >= datetime('now', 'start of day')`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n FROM consent_status WHERE status = 'opted_in'`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n FROM consent_status WHERE status = 'opted_out'`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n
               FROM contacts c
               LEFT JOIN consent_status cs ON cs.phone_e164 = c.phone_e164
              WHERE COALESCE(cs.status, 'unknown') = 'opted_out'`
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS n
               FROM consent_status
              WHERE status = 'opted_in'
                AND datetime(consented_at) >= datetime('now', '-24 hours')`
          ).first(),
          env.DB.prepare(
            `SELECT phone_to, text, status, created_at AS at, updated_at
               FROM outbound_messages
              ORDER BY datetime(created_at) DESC, id DESC
              LIMIT 1`
          ).first(),
          env.DB.prepare(
            `SELECT phone_from, text, direction AS status, received_at AS at
               FROM inbound_messages
              ORDER BY datetime(received_at) DESC, id DESC
              LIMIT 1`
          ).first(),
        ]);

        const internalUrl = new URL(req.url);
        internalUrl.pathname = "/api/admin/telnyx/status";
        internalUrl.search = url.search;
        const statusReq = new Request(internalUrl.toString(), {
          method: "GET",
          headers: req.headers,
        });
        const telnyxStatusResp = await this.fetch(statusReq, env, ctx);
        let telnyxStatus = await telnyxStatusResp.json().catch(() => null);
        if (!telnyxStatus || typeof telnyxStatus !== "object") {
          telnyxStatus = {};
        }
        if (!telnyxStatusResp.ok) {
          telnyxStatus = {
            ok: false,
            error: telnyxStatus.error || `Telnyx status request failed (${telnyxStatusResp.status})`,
          };
        }

        const envPresent = telnyxStatus?.envPresent && typeof telnyxStatus.envPresent === "object"
          ? telnyxStatus.envPresent
          : {};
        const tables = telnyxStatus?.tables && typeof telnyxStatus.tables === "object"
          ? telnyxStatus.tables
          : {};
        const sendPathIssues = [];
        if (telnyxStatus?.ok === false && telnyxStatus?.error) {
          sendPathIssues.push(String(telnyxStatus.error));
        }
        if (!envPresent.telnyxApiKey) sendPathIssues.push("Telnyx API key missing");
        if (!envPresent.telnyxFromNumber) sendPathIssues.push("Telnyx from number missing");
        if (!envPresent.adminExportKey) sendPathIssues.push("Admin key missing");
        if (!envPresent.d1) sendPathIssues.push("Database not configured");
        if (tables.contacts === false) sendPathIssues.push("Contacts table missing");
        if (tables.outbound_messages === false) sendPathIssues.push("Outbound message table missing");
        if (tables.texting_audit_log === false) sendPathIssues.push("Texting audit log table missing");
        const sendPathReady = sendPathIssues.length === 0;
        const webhookRouteLive = telnyxStatus?.webhookRouteLive === true;

        return json(req, env, {
          ok: true,
          lastOutboundAt: lastOutboundRow?.ts || null,
          lastInboundAt: lastInboundRow?.ts || null,
          lastDeliveryUpdateAt: lastDeliveryUpdateRow?.ts || null,
          messagesSentToday: Number(sentTodayRow?.n || 0),
          failedDeliveries: Number(failedRow?.n || 0),
          optedInCount: Number(optedInRow?.n || 0),
          optedOutCount: Number(optedOutRow?.n || 0),
          suppressedCount: Number(suppressedRow?.n || 0),
          newOptIns24h: Number(newOptInRow?.n || 0),
          sendPathReady,
          sendPathIssues,
          webhookRouteLive,
          lastWebhookReceivedAt: telnyxStatus?.lastWebhookReceivedAt || null,
          lastInvalidSignatureAt: telnyxStatus?.lastInvalidSignatureAt || null,
          lastOutboundSummary: lastOutboundSummaryRow
            ? {
                at: lastOutboundSummaryRow.at || null,
                updatedAt: lastOutboundSummaryRow.updated_at || null,
                status: lastOutboundSummaryRow.status || "unknown",
                phone: lastOutboundSummaryRow.phone_to || null,
                text: lastOutboundSummaryRow.text || "",
              }
            : null,
          lastInboundSummary: lastInboundSummaryRow
            ? {
                at: lastInboundSummaryRow.at || null,
                status: lastInboundSummaryRow.status || "inbound",
                phone: lastInboundSummaryRow.phone_from || null,
                text: lastInboundSummaryRow.text || "",
              }
            : null,
          telnyx: telnyxStatus,
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/messages") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
        const q = String(url.searchParams.get("q") || "").trim();
        const qLike = q ? `%${q}%` : null;

        const outboundSql = q
          ? `SELECT id AS row_id, 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    status, created_at AS at, updated_at, raw_json
               FROM outbound_messages
              WHERE phone_to LIKE ?1 OR phone_from LIKE ?1 OR text LIKE ?1`
          : `SELECT id AS row_id, 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    status, created_at AS at, updated_at, raw_json
               FROM outbound_messages`;

        const inboundSql = q
          ? `SELECT id AS row_id, 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    direction AS status, received_at AS at, received_at AS updated_at, raw_json
               FROM inbound_messages
              WHERE phone_from LIKE ?1 OR phone_to LIKE ?1 OR text LIKE ?1`
          : `SELECT id AS row_id, 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    direction AS status, received_at AS at, received_at AS updated_at, raw_json
               FROM inbound_messages`;

        const outbound = q
          ? ((await env.DB.prepare(`${outboundSql} ORDER BY datetime(updated_at) DESC LIMIT ?2`).bind(qLike, limit).all())?.results || [])
          : ((await env.DB.prepare(`${outboundSql} ORDER BY datetime(updated_at) DESC LIMIT ?1`).bind(limit).all())?.results || []);
        const inbound = q
          ? ((await env.DB.prepare(`${inboundSql} ORDER BY datetime(updated_at) DESC LIMIT ?2`).bind(qLike, limit).all())?.results || [])
          : ((await env.DB.prepare(`${inboundSql} ORDER BY datetime(updated_at) DESC LIMIT ?1`).bind(limit).all())?.results || []);

        const items = [...outbound, ...inbound]
          .sort((a, b) => String(b.updated_at || b.at).localeCompare(String(a.updated_at || a.at)))
          .slice(0, limit);

        return json(req, env, { ok: true, items });
      }

      if (req.method === "POST" && path === "/api/admin/texting/messages/delete") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const requestedItems = Array.isArray(body?.items) ? body.items : [];
        const deleteItems = requestedItems
          .map((item) => ({
            direction: String(item?.direction || "").trim().toLowerCase(),
            rowId: positiveInt(item?.row_id, 0, Number.MAX_SAFE_INTEGER),
          }))
          .filter((item) => (item.direction === "inbound" || item.direction === "outbound") && item.rowId > 0);

        if (!deleteItems.length) {
          return json(req, env, { error: "No valid message rows supplied" }, 400);
        }
        if (deleteItems.length > 500) {
          return json(req, env, { error: "Too many message rows requested" }, 400);
        }

        const inboundRowIds = [...new Set(deleteItems.filter((item) => item.direction === "inbound").map((item) => item.rowId))];
        const outboundRowIds = [...new Set(deleteItems.filter((item) => item.direction === "outbound").map((item) => item.rowId))];
        const inboundDeleted = await deleteMessageRowsByIds(env.DB, "inbound_messages", inboundRowIds);
        const outboundDeleted = await deleteMessageRowsByIds(env.DB, "outbound_messages", outboundRowIds);
        const deletedCount = inboundDeleted + outboundDeleted;

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_delete_messages",
          detailsJson: JSON.stringify({
            requestedCount: deleteItems.length,
            deletedCount,
            inboundRowIds,
            outboundRowIds,
            inboundDeleted,
            outboundDeleted,
          }),
        });

        return json(req, env, {
          ok: true,
          deletedCount,
          inboundDeleted,
          outboundDeleted,
        });
      }

      if (req.method === "POST" && path === "/api/admin/texting/messages/clear") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const q = String(body?.q || "").trim();
        const { inboundDeleted, outboundDeleted } = await clearMessagesBySearch(env.DB, q);
        const deletedCount = inboundDeleted + outboundDeleted;

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_clear_messages",
          detailsJson: JSON.stringify({
            q,
            deletedCount,
            inboundDeleted,
            outboundDeleted,
          }),
        });

        return json(req, env, {
          ok: true,
          q,
          deletedCount,
          inboundDeleted,
          outboundDeleted,
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/contacts") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 5000);
        const q = String(url.searchParams.get("q") || "").trim();
        const filter = String(url.searchParams.get("filter") || "all").trim();
        const city = normalizeContactFilterValue(url.searchParams.get("city") || "");
        const hd = normalizeContactFilterValue(url.searchParams.get("hd") || "");
        const sd = normalizeContactFilterValue(url.searchParams.get("sd") || "");
        const sinceHours = positiveInt(url.searchParams.get("since_hours"), 24, 24 * 30);
        const results = await queryAudienceContacts(env.DB, {
          filter,
          q,
          city,
          hd,
          sd,
          limit,
          sinceHours,
        });

        return json(req, env, { ok: true, items: results });
      }

      if (req.method === "GET" && path === "/api/admin/texting/voter-lookup") {
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        if (!env.WY_DB) {
          return json(req, env, { match: null, mode: "no_db" });
        }

        const firstName = normalizeText(url.searchParams.get("first_name"));
        const lastName = normalizeText(url.searchParams.get("last_name"));
        const cityInput = normalizeText(url.searchParams.get("city"));

        if (!firstName || !lastName) {
          return json(req, env, { error: "first_name and last_name are required." }, 400);
        }

        // Resolve city name to county via wy_city_county lookup table
        let county = "";
        if (cityInput) {
          const mapping = await env.WY_DB.prepare(
            `SELECT county FROM wy_city_county WHERE UPPER(TRIM(city)) = UPPER(TRIM(?1)) LIMIT 1`
          ).bind(cityInput).first().catch(() => null);
          county = mapping?.county || cityInput; // fall back to raw input (may be a county name already)
        }

        let rows;
        const showAll = url.searchParams.get("all") === "1";
        const rowLimit = showAll ? 50 : 5;
        const baseQuery = `SELECT van.house AS house_district, van.senate AS senate_district, v.county
          FROM voters_addr_norm van
          JOIN voters v ON van.voter_id = v.voter_id
          WHERE UPPER(TRIM(van.fn)) = UPPER(TRIM(?1))
            AND UPPER(TRIM(van.ln))  = UPPER(TRIM(?2))`;
        const countQuery = `SELECT COUNT(*) as cnt
          FROM voters_addr_norm van
          JOIN voters v ON van.voter_id = v.voter_id
          WHERE UPPER(TRIM(van.fn)) = UPPER(TRIM(?1))
            AND UPPER(TRIM(van.ln))  = UPPER(TRIM(?2))`;

        // Last-name fallback: when exact first+last returns nothing, find similar voters
        // Requires county to narrow suggestions; without it just return "none"
        async function lastNameFallback() {
          if (!county) return json(req, env, { match: null, mode: "none" });

          const surnameQuery = `SELECT van.fn AS first_name, van.house AS house_district, van.senate AS senate_district, v.county,
                 CASE WHEN UPPER(van.fn) = UPPER(?3) THEN 0
                      WHEN UPPER(SUBSTR(van.fn,1,LENGTH(?3))) = UPPER(?3) THEN 1
                      WHEN UPPER(SUBSTR(van.fn,1,1)) = UPPER(SUBSTR(?3,1,1)) THEN 2
                      ELSE 3 END AS rank
               FROM voters_addr_norm van
               JOIN voters v ON van.voter_id = v.voter_id
               WHERE UPPER(TRIM(van.ln)) = UPPER(TRIM(?1))
                 AND UPPER(TRIM(v.county)) = UPPER(TRIM(?2))
               ORDER BY rank, van.fn`;
          const similar = await env.WY_DB.prepare(surnameQuery)
            .bind(lastName, county, firstName).all().then(r => r.results).catch(() => []);
          if (similar.length) {
            const suggestions = similar.map(r => ({
              first_name: r.first_name, hd: r.house_district,
              sd: r.senate_district, county: r.county,
            }));
            return json(req, env, { match: null, mode: "suggestions", suggestions });
          }
          return json(req, env, { match: null, mode: "none" });
        }

        if (county) {
          rows = await env.WY_DB.prepare(
            baseQuery + ` AND UPPER(TRIM(v.county)) = UPPER(TRIM(?3)) LIMIT ${rowLimit}`
          ).bind(firstName, lastName, county).all().then(r => r.results).catch(() => []);

          if (rows.length === 0) {
            const total = await env.WY_DB.prepare(countQuery)
              .bind(firstName, lastName).first().then(r => r?.cnt || 0).catch(() => 0);
            rows = await env.WY_DB.prepare(
              baseQuery + ` LIMIT ${rowLimit}`
            ).bind(firstName, lastName).all().then(r => r.results).catch(() => []);

            if (rows.length === 1) {
              return json(req, env, {
                match: { hd: rows[0].house_district, sd: rows[0].senate_district, county: rows[0].county },
                mode: "name_only",
              });
            }
            if (rows.length > 1) {
              const candidates = rows.map(r => ({ hd: r.house_district, sd: r.senate_district, county: r.county }));
              return json(req, env, { match: null, mode: "ambiguous", count: total, candidates });
            }
            return lastNameFallback();
          }
          // county-filtered rows found — get filtered count
          const total = await env.WY_DB.prepare(
            countQuery + ` AND UPPER(TRIM(v.county)) = UPPER(TRIM(?3))`
          ).bind(firstName, lastName, county).first().then(r => r?.cnt || 0).catch(() => rows.length);

          if (rows.length === 1 && total === 1) {
            return json(req, env, {
              match: { hd: rows[0].house_district, sd: rows[0].senate_district, county: rows[0].county },
              mode: "unique",
            });
          }
          const candidates = rows.map(r => ({ hd: r.house_district, sd: r.senate_district, county: r.county }));
          return json(req, env, { match: null, mode: "ambiguous", count: total, candidates });
        } else {
          const total = await env.WY_DB.prepare(countQuery)
            .bind(firstName, lastName).first().then(r => r?.cnt || 0).catch(() => 0);
          rows = await env.WY_DB.prepare(
            baseQuery + ` LIMIT ${rowLimit}`
          ).bind(firstName, lastName).all().then(r => r.results).catch(() => []);

          if (rows.length === 1 && total === 1) {
            return json(req, env, {
              match: { hd: rows[0].house_district, sd: rows[0].senate_district, county: rows[0].county },
              mode: "unique",
            });
          }
          if (rows.length > 1) {
            const candidates = rows.map(r => ({ hd: r.house_district, sd: r.senate_district, county: r.county }));
            return json(req, env, { match: null, mode: "ambiguous", count: total, candidates });
          }
          return lastNameFallback();
        }
      }

      if (req.method === "POST" && path === "/api/admin/texting/optins") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const firstName = normalizeText(body?.first_name);
        const lastName = normalizeText(body?.last_name);
        const phoneRaw = normalizeText(body?.phone);
        const phoneE164 = normalizePhoneNumber(phoneRaw);
        const email = normalizeText(body?.email);
        const city = normalizeText(body?.city);
        const stateHouseDistrict = normalizeText(body?.state_house_district);
        const stateSenateDistrict = normalizeText(body?.state_senate_district);
        const consentEmail = isAffirmative(body?.consent_email) ? 1 : 0;
        const wyVoter = isAffirmative(body?.wy_voter) ? 1 : 0;
        const isVolunteer = isAffirmative(body?.is_volunteer) ? 1 : 0;
        const consentVersion =
          normalizeText(body?.consent_version)
          || `admin-texting-v1-${new Date().toISOString().slice(0, 10)}`;

        if (!firstName) {
          return json(req, env, { error: "First name is required." }, 400);
        }
        if (!lastName) {
          return json(req, env, { error: "Last name is required." }, 400);
        }
        if (!phoneE164) {
          return json(req, env, { error: "Valid 10-digit mobile required." }, 400);
        }
        if (email && !isValidEmail(email)) {
          return json(req, env, { error: "Email is not valid." }, 400);
        }

        const existingConsent = await env.DB.prepare(
          `SELECT phone_e164, status
             FROM consent_status
            WHERE phone_e164 = ?1`
        )
          .bind(phoneE164)
          .first()
          .catch(() => null);

        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = ip ? await sha256Hex(ip) : null;
        const userAgent = req.headers.get("user-agent") || "";
        const result = existingConsent?.phone_e164 ? "updated" : "created";

        await upsertConsentStatus(env.DB, {
          phoneE164,
          status: "opted_in",
          source: "admin",
          sourceDetail: "texting_portal",
          consentedAt: new Date().toISOString(),
          firstName,
          lastName,
          email: email || null,
          consentEmail,
          wyVoter,
          consentVersion,
          userAgent,
          ipHash,
          overwriteProfile: false,
          city: city || null,
          stateHouseDistrict: stateHouseDistrict || null,
          stateSenateDistrict: stateSenateDistrict || null,
        });

        if (email && consentEmail) {
          await upsertNewsletterSubscriber(env.DB, {
            email,
            consentEmail: true,
            consentVersion,
            source: "skovgard2026:admin_texting",
            userAgent,
            ipHash: ipHash || "",
          });
        }

        const legacyOptin = await upsertLegacySmsOptin(env.DB, {
          phoneE164,
          firstName,
          lastName,
          email: email || null,
          consent: 1,
          consentEmail,
          wyVoter,
          consentVersion,
          source: "skovgard2026:admin_texting",
          userAgent,
          ipHash,
          isVolunteer,
        });

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: result === "created" ? "admin_create_optin" : "admin_update_optin",
          targetPhone: phoneE164,
          detailsJson: JSON.stringify({
            result,
            legacyOptinId: legacyOptin.id,
            legacyOptinResult: legacyOptin.result,
            consentEmail,
            wyVoter,
            isVolunteer,
            email: email || null,
            city: city || null,
            state_house_district: stateHouseDistrict || null,
            state_senate_district: stateSenateDistrict || null,
          }),
        });

        const item = (await queryContactsByPhones(env.DB, [phoneE164]))[0] || null;
        return json(req, env, {
          ok: true,
          result,
          phoneE164,
          isVolunteer,
          item,
        });
      }

      if (req.method === "POST" && path === "/api/admin/texting/volunteers") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const firstName = normalizeText(body?.first_name);
        const lastName  = normalizeText(body?.last_name);
        const email     = normalizeText(body?.email);
        const city      = normalizeText(body?.city);

        if (!firstName) return json(req, env, { error: "First name is required." }, 400);
        if (!lastName)  return json(req, env, { error: "Last name is required." }, 400);
        if (email && !isValidEmail(email)) return json(req, env, { error: "Email is not valid." }, 400);

        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO volunteers (id, first_name, last_name, email, source, status, notes)
           VALUES (?1, ?2, ?3, ?4, 'admin', 'new', ?5)`
        ).bind(
          id,
          firstName,
          lastName,
          email || null,
          city ? `City: ${city}` : null
        ).run();

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_create_volunteer",
          detailsJson: JSON.stringify({ id, firstName, lastName, email: email || null, city: city || null }),
        });

        return json(req, env, { ok: true, result: "created", id, firstName, lastName });
      }

      if (req.method === "POST" && path === "/api/admin/texting/contacts/volunteer") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const phoneE164 = normalizePhoneNumber(body?.phone || "");
        const isVolunteer = isAffirmative(body?.is_volunteer) ? 1 : 0;

        if (!phoneE164) {
          return json(req, env, { error: "Valid phone required." }, 400);
        }

        const seed = await loadContactVolunteerSeed(env.DB, phoneE164);
        if (!seed?.phone_e164) {
          return json(req, env, { error: "Contact not found." }, 404);
        }

        let legacyOptin = await setLegacySmsOptinVolunteerByPhone(env.DB, phoneE164, isVolunteer);
        if (!legacyOptin) {
          if (String(seed.status || "").trim() !== "opted_in") {
            return json(req, env, { error: "Only opted-in contacts can be marked as volunteers." }, 409);
          }

          legacyOptin = await upsertLegacySmsOptin(env.DB, {
            phoneE164,
            firstName: seed.first_name,
            lastName: seed.last_name,
            email: seed.email,
            consent: 1,
            consentEmail: Number(seed.consent_email || 0) === 1,
            wyVoter: Number(seed.wy_voter || 0) === 1,
            consentVersion: seed.consent_version,
            source: "skovgard2026:admin_texting",
            isVolunteer,
          });
        }

        // Phase 4 dual-write (docs/db/EmailConsolidationPlan.md, 2026-08-10):
        // this toggle was the last live path that set is_volunteer without
        // ever reaching email_contact_purposes -- only the one-time Phase 2
        // backfill covered it before. Only fires on the way *in* (matches
        // the existing purpose-tagging model, which accumulates purposes
        // rather than removing them); a seed.email-less contact has nothing
        // to tag.
        if (isVolunteer && seed.email) {
          const { raw: volunteerEmailRaw, normalized: volunteerEmailNorm } = normalizeEmailForStorage(seed.email);
          if (volunteerEmailNorm) {
            await upsertEmailContactSubscriber(env.DB, {
              email: volunteerEmailRaw,
              emailNorm: volunteerEmailNorm,
              consentStatus: Number(seed.consent_email || 0) === 1 ? "opted_in" : "no_signal",
              source: "skovgard2026:admin_texting",
              purpose: "volunteer",
              priority: 3,
            });
          }
        }

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_set_contact_volunteer",
          targetPhone: phoneE164,
          detailsJson: JSON.stringify({
            isVolunteer,
            legacyOptinId: legacyOptin.id,
            legacyOptinResult: legacyOptin.result,
          }),
        });

        const item = (await queryContactsByPhones(env.DB, [phoneE164]))[0] || null;
        return json(req, env, {
          ok: true,
          phoneE164,
          isVolunteer,
          item,
        });
      }

      if (req.method === "POST" && path === "/api/admin/texting/contacts/update") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const phoneE164 = normalizePhoneNumber(body?.phone || "");

        if (!phoneE164) {
          return json(req, env, { error: "Valid phone required." }, 400);
        }

        const seed = await loadContactVolunteerSeed(env.DB, phoneE164);
        if (!seed?.phone_e164) {
          return json(req, env, { error: "Contact not found." }, 404);
        }

        // Editable fields — only touch the keys the client actually sent.
        // Empty string or null clears the value; undefined leaves it alone.
        const editableKeys = [
          "first_name",
          "last_name",
          "city",
          "state_house_district",
          "state_senate_district",
          "email",
        ];
        const updates = {};
        for (const key of editableKeys) {
          if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
          const raw = body[key];
          updates[key] = normalizeText(raw) || null;
        }

        if (!Object.keys(updates).length) {
          return json(req, env, { error: "No fields to update." }, 400);
        }

        // Update consent_status in-place with only the fields provided.
        const csFields = [];
        const csBinds = [];
        let idx = 1;
        for (const [key, value] of Object.entries(updates)) {
          csFields.push(`${key} = ?${idx}`);
          csBinds.push(value);
          idx += 1;
        }
        csFields.push(`updated_at = datetime('now')`);
        csBinds.push(phoneE164);
        const csSql = `UPDATE consent_status SET ${csFields.join(", ")} WHERE phone_e164 = ?${idx}`;
        await env.DB.prepare(csSql).bind(...csBinds).run();

        // Mirror first_name/last_name into contacts table so the list view reflects the edit.
        if ("first_name" in updates || "last_name" in updates) {
          const cFields = [];
          const cBinds = [];
          let cIdx = 1;
          if ("first_name" in updates) {
            cFields.push(`first_name = ?${cIdx}`);
            cBinds.push(updates.first_name);
            cIdx += 1;
          }
          if ("last_name" in updates) {
            cFields.push(`last_name = ?${cIdx}`);
            cBinds.push(updates.last_name);
            cIdx += 1;
          }
          cFields.push(`updated_at = datetime('now')`);
          cBinds.push(phoneE164);
          await env.DB.prepare(
            `UPDATE contacts SET ${cFields.join(", ")} WHERE phone_e164 = ?${cIdx}`
          ).bind(...cBinds).run();
        }

        // Keep the legacy sms_optins backup roughly in sync for opted-in contacts.
        if (String(seed.status || "").trim() === "opted_in") {
          await upsertLegacySmsOptin(env.DB, {
            phoneE164,
            firstName: "first_name" in updates ? updates.first_name : seed.first_name,
            lastName: "last_name" in updates ? updates.last_name : seed.last_name,
            email: "email" in updates ? updates.email : seed.email,
            consent: 1,
            consentEmail: Number(seed.consent_email || 0) === 1,
            wyVoter: Number(seed.wy_voter || 0) === 1,
            consentVersion: seed.consent_version,
            source: "skovgard2026:admin_texting",
          }).catch(() => null);
        }

        // Phase 4 dual-write (docs/db/EmailConsolidationPlan.md, 2026-08-10):
        // a corrected email address here previously only reached
        // consent_status/sms_optins, leaving email_contacts and
        // newsletter_subscribers pointed at the stale address. Only fires
        // when there's real email consent on file to correct -- an
        // address-only edit on a contact with no consent_email isn't a
        // subscription event, and the old email_contacts row (if any) is
        // left alone rather than merged/renamed, matching how this repo
        // already handles corrections (see the phone-typo admin_correction
        // pattern in consent_status).
        if ("email" in updates && updates.email && Number(seed.consent_email || 0) === 1) {
          await upsertNewsletterSubscriber(env.DB, {
            email: updates.email,
            consentEmail: true,
            consentVersion: seed.consent_version,
            source: "skovgard2026:admin_texting_correction",
            userAgent: "",
            ipHash: "",
          }).catch(() => null);
        }

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_update_contact_info",
          targetPhone: phoneE164,
          detailsJson: JSON.stringify({ updates }),
        });

        const item = (await queryContactsByPhones(env.DB, [phoneE164]))[0] || null;
        return json(req, env, {
          ok: true,
          phoneE164,
          item,
        });
      }

      // GET /api/admin/pulse-voter-review?unresolved=1
      // Review queue for /pulse opt-ins whose voter-verification fields
      // (city/zip, optionally address1) didn't cleanly resolve to exactly one
      // WY voter record -- see pulse_voter_match_review (migration 031) and
      // the ambiguous/no_match handling in POST /api/optin.
      if (req.method === "GET" && path === "/api/admin/pulse-voter-review") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const unresolvedOnly = url.searchParams.get("unresolved") === "1";
        const rows = await env.DB.prepare(
          `SELECT id, phone_e164, submitted_first_name, submitted_last_name,
                  submitted_address1, submitted_city, submitted_zip,
                  match_mode, candidate_voter_ids, resolved_voter_id,
                  resolved_at, resolved_by, created_at,
                  phone_area_flag, zip_range_flag
             FROM pulse_voter_match_review
            ${unresolvedOnly ? "WHERE resolved_at IS NULL" : ""}
            ORDER BY created_at DESC
            LIMIT 200`
        ).all();

        return json(req, env, {
          ok: true,
          items: (rows.results || []).map((row) => ({
            ...row,
            candidate_voter_ids: row.candidate_voter_ids ? JSON.parse(row.candidate_voter_ids) : [],
          })),
        });
      }

      // POST /api/admin/pulse-voter-review/resolve
      // Body: {id, voter_id} to confirm a candidate (records the association;
      // the opt-in phone is promoted only after confirmed welcome delivery), or
      // {id, dismiss:true} when no real match exists. Record-only -- no
      // message is sent; staff follow up manually via the existing admin
      // texting/email tools.
      if (req.method === "POST" && path === "/api/admin/pulse-voter-review/resolve") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        const voterId = String(body?.voter_id || "").trim();
        const dismiss = body?.dismiss === true;

        if (!id) return json(req, env, { error: "Valid id required." }, 400);
        if (!voterId && !dismiss) {
          return json(req, env, { error: "voter_id or dismiss required." }, 400);
        }

        const row = await env.DB.prepare(
          `SELECT id, phone_e164, resolved_at FROM pulse_voter_match_review WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Review row not found." }, 404);
        if (row.resolved_at) return json(req, env, { error: "Already resolved." }, 409);

        await env.DB.prepare(
          `UPDATE pulse_voter_match_review
              SET resolved_voter_id = ?1, resolved_at = datetime('now'), resolved_by = ?2
            WHERE id = ?3`
        ).bind(voterId || null, actor.actorEmail || null, id).run();

        const phoneE164 = normalizePhoneNumber(row.phone_e164);
        if (voterId) {
          await env.DB.prepare(
            `UPDATE consent_status SET voter_id = COALESCE(voter_id, ?2), updated_at = datetime('now') WHERE phone_e164 = ?1`
          ).bind(phoneE164, voterId).run();
        }

        let phonePromotion = null;
        if (voterId && env.WY_DB) {
          const deliveredWelcome = await env.DB.prepare(
            `SELECT 1 AS delivered
               FROM texting_audit_log tal
               JOIN outbound_messages om ON om.telnyx_message_id = tal.message_id
              WHERE tal.action = 'pulse_welcome_send'
                AND tal.target_phone = ?1
                AND om.status = 'delivered'
              ORDER BY tal.id DESC
              LIMIT 1`
          ).bind(phoneE164).first().catch(() => null);

          if (phoneE164 && deliveredWelcome?.delivered) {
            phonePromotion = await promoteDeliveredOptInPhone(env.WY_DB, {
              voterId,
              phoneE164,
            });
          } else {
            phonePromotion = { promoted: false, reason: "welcome_not_delivered" };
          }
        }

        return json(req, env, {
          ok: true,
          id,
          resolvedVoterId: voterId || null,
          phonePromotion,
        });
      }

      // POST /api/admin/pulse-voter-review/mint-and-send
      // Body: {id} for an already-resolved review row (see /resolve above).
      // Mints a Citizen Poll invite token for the confirmed voter and
      // delivers it by SMS/email in the same call -- grassmvt_survey's mint
      // endpoint replaces any existing token on every call, so a mint that
      // isn't immediately followed by delivery would silently invalidate a
      // link already sitting in someone's inbox/texts (the same hazard the
      // auto-mint path in POST /api/optin already guards against). Current
      // SMS/email consent is re-checked here, at send time, rather than
      // trusting whatever was true when the original /pulse form was
      // submitted -- consent can have changed in between.
      if (req.method === "POST" && path === "/api/admin/pulse-voter-review/mint-and-send") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        if (!id) return json(req, env, { error: "Valid id required." }, 400);

        const row = await env.DB.prepare(
          `SELECT id, phone_e164, resolved_voter_id, resolved_at FROM pulse_voter_match_review WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Review row not found." }, 404);
        if (!row.resolved_voter_id || !row.resolved_at) {
          return json(req, env, { error: "Row is not resolved to a voter yet." }, 409);
        }

        const phoneE164 = normalizePhoneNumber(row.phone_e164);
        const consent = await env.DB.prepare(
          `SELECT phone_e164, status, first_name, email, consent_email, poll_link_sent_at
             FROM consent_status
            WHERE phone_e164 = ?1`
        ).bind(phoneE164).first();
        if (!consent) {
          return json(req, env, { error: "No consent_status record for this contact." }, 404);
        }
        if (String(consent.status || "").trim() !== "opted_in") {
          return json(req, env, { error: "Contact is not currently opted in to SMS." }, 409);
        }
        if (!consent.email || Number(consent.consent_email || 0) !== 1) {
          return json(req, env, { error: "Contact has no current email consent -- cannot mint a ballot link." }, 409);
        }
        if (consent.poll_link_sent_at) {
          return json(req, env, { error: "A poll link was already sent to this contact." }, 409);
        }

        const voterId = row.resolved_voter_id;
        await env.DB.prepare(
          `UPDATE consent_status SET voter_id = COALESCE(voter_id, ?2), updated_at = datetime('now') WHERE phone_e164 = ?1`
        ).bind(phoneE164, voterId).run();

        const resolved = await resolveVoterDistrictAndPrecinct(env, voterId);
        const recipient = {
          voter_id: voterId,
          email_norm: String(consent.email).toLowerCase(),
          house_district: resolved?.house_district || undefined,
          senate_district: resolved?.senate_district || undefined,
          political_party: resolved?.political_party || undefined,
          county: resolved?.county || undefined,
          city: resolved?.city || undefined,
          precinct_code: resolved?.precinct_code || undefined,
        };
        const { withLinks, mintFailures } = await mintPollInviteLinksForChunk(env, [recipient]);
        const pollLink = withLinks?.[0]?.poll_link || null;
        if (!pollLink) {
          return json(req, env, { error: mintFailures?.[0]?.error || "Mint failed." }, 502);
        }

        const [smsResult, emailResult] = await Promise.all([
          sendPollLinkText(env, phoneE164, pollLink, {
            auditDetails: { voterId, matchedBy: "admin_review" },
          }).catch((error) => ({ sent: false, reason: String(error?.message || error) })),
          sendPollLinkEmail(env, {
            firstName: consent.first_name,
            email: consent.email,
            consentEmail: true,
            pollLink,
          }).catch((error) => ({ sent: false, reason: String(error?.message || error) })),
        ]);

        const delivered = Boolean(smsResult?.sent || emailResult?.sent);
        if (delivered) {
          await env.DB.prepare(
            `UPDATE consent_status SET poll_link_sent_at = datetime('now') WHERE phone_e164 = ?1`
          ).bind(phoneE164).run();
        }

        return json(req, env, {
          ok: delivered,
          pollLink: delivered ? pollLink : null,
          sms: smsResult,
          email: emailResult,
        });
      }

      // POST /api/admin/pulse-voter-review/log-call
      // Body: {id, call_status, call_notes}. Records a staff phone-call
      // attempt against an unresolved/ambiguous review row -- these
      // contacts already have real SMS/email consent on file (they
      // submitted /pulse for real); the call is to verbally confirm the
      // address that resolves the voter match, not to obtain new consent.
      // Record-only, same as /resolve -- does not itself resolve the row;
      // staff still call /resolve separately once the call confirms a
      // voter_id.
      if (req.method === "POST" && path === "/api/admin/pulse-voter-review/log-call") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        const callStatus = String(body?.call_status || "").trim();
        const callNotes = normalizeText(body?.call_notes) || null;

        if (!id) return json(req, env, { error: "Valid id required." }, 400);
        if (!PULSE_CALL_STATUSES.has(callStatus)) {
          return json(req, env, { error: `call_status must be one of: ${[...PULSE_CALL_STATUSES].join(", ")}` }, 400);
        }

        const row = await env.DB.prepare(
          `SELECT id FROM pulse_voter_match_review WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Review row not found." }, 404);

        await env.DB.prepare(
          `UPDATE pulse_voter_match_review
              SET call_status = ?1, call_attempts = call_attempts + 1, call_notes = ?2,
                  called_at = datetime('now'), called_by = ?3
            WHERE id = ?4`
        ).bind(callStatus, callNotes, actor.actorEmail || null, id).run();

        return json(req, env, { ok: true, id, callStatus });
      }

      // POST /api/admin/pulse-voter-review/recheck
      // Body: {id}. pulse_voter_match_review rows are write-once snapshots
      // of what the matching cascade found at submission time -- nothing
      // ever re-runs it, so a row written before a matching-logic fix (or
      // before a WY_DB data update) stays stuck showing its stale result
      // forever (found 2026-07-19: the "Keith Goodenough" review row still
      // showed zero candidates well after the fallback tier that would now
      // find him shipped). Re-runs findUniqueWyTargetMatch against the
      // row's already-stored submitted_* fields and refreshes match_mode/
      // candidate_voter_ids in place. Record-only, same as /resolve --
      // never writes to consent_status and never auto-resolves the row,
      // even if this now finds a single clean match; staff still confirm
      // via the existing Resolve action.
      if (req.method === "POST" && path === "/api/admin/pulse-voter-review/recheck") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        if (!env.WY_DB) return json(req, env, { error: "WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        if (!id) return json(req, env, { error: "Valid id required." }, 400);

        const row = await env.DB.prepare(
          `SELECT id, phone_e164, submitted_first_name, submitted_last_name, submitted_address1, submitted_city, submitted_zip, resolved_at
             FROM pulse_voter_match_review WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Review row not found." }, 404);
        if (row.resolved_at) return json(req, env, { error: "Already resolved." }, 409);

        const result = await findUniqueWyTargetMatch(env.WY_DB, {
          phone: row.phone_e164,
          firstName: row.submitted_first_name,
          lastName: row.submitted_last_name,
          address1: row.submitted_address1,
          city: row.submitted_city,
          zip: row.submitted_zip,
        });

        const candidateRows = result.match ? [result.match] : (result.candidates || []);
        const candidateVoterIds = summarizeMatchCandidates(candidateRows);

        await env.DB.prepare(
          `UPDATE pulse_voter_match_review SET match_mode = ?1, candidate_voter_ids = ?2 WHERE id = ?3`
        ).bind(
          result.mode,
          candidateVoterIds.length ? JSON.stringify(candidateVoterIds) : null,
          id
        ).run();

        return json(req, env, { ok: true, id, matchMode: result.mode, candidates: candidateVoterIds });
      }

      // GET /api/admin/pulse-voter-review/search-voters?q=...
      // Manual last-resort lookup for the review UI: a free-text search
      // across v_voter_targeting (name/city/address), independent of the
      // automated matching cascade in findUniqueWyTargetMatch. Exists
      // because that cascade only ever matches on exact-normalized
      // signals (see docs/pulse_flow.md §4a) -- deliberately, since
      // typo-tolerant/fuzzy matching against a voter registration risks
      // false positives. This is the alternative: put a human in the loop
      // with a real search box instead of teaching the algorithm to guess.
      // Every token in q must appear somewhere in name/city/address for a
      // row to match (bounded to 6 tokens to keep the query cheap).
      if (req.method === "GET" && path === "/api/admin/pulse-voter-review/search-voters") {
        if (!env.WY_DB) return json(req, env, { error: "WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const q = String(url.searchParams.get("q") || "").trim();
        const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
        if (!tokens.length) return json(req, env, { ok: true, items: [] });

        const clauses = tokens
          .map((_t, i) => {
            const p = i + 1;
            return `(UPPER(first_name) LIKE ?${p} OR UPPER(last_name) LIKE ?${p} OR UPPER(city) LIKE ?${p} OR UPPER(COALESCE(addr1, '')) LIKE ?${p} OR UPPER(COALESCE(addr_raw, '')) LIKE ?${p})`;
          })
          .join(" AND ");
        const binds = tokens.map((t) => `%${t.toUpperCase()}%`);

        const rows = await env.WY_DB.prepare(
          `SELECT voter_id, first_name, last_name, city, zip, addr1, addr_raw
             FROM v_voter_targeting
            WHERE ${clauses}
            LIMIT 25`
        )
          .bind(...binds)
          .all()
          .then((result) => result?.results || [])
          .catch(() => []);

        return json(req, env, { ok: true, items: summarizeMatchCandidates(rows) });
      }

      // GET /api/admin/pulse-abandoned-signups?open=1
      // Call queue for /pulse form starts that never reached a real
      // submission (migration 037). `open=1` hides do-not-call and
      // already-completed rows.
      if (req.method === "GET" && path === "/api/admin/pulse-abandoned-signups") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const openOnly = url.searchParams.get("open") === "1";
        const rows = await env.DB.prepare(
          `SELECT id, phone_e164, first_name, step_reached, captured_at, updated_at,
                  call_status, call_attempts, call_notes, called_at, called_by,
                  do_not_call, completed_phone_e164
             FROM pulse_abandoned_signups
            ${openOnly ? "WHERE do_not_call = 0 AND completed_phone_e164 IS NULL" : ""}
            ORDER BY captured_at DESC
            LIMIT 200`
        ).all();

        return json(req, env, { ok: true, items: rows.results || [] });
      }

      // POST /api/admin/pulse-abandoned-signups/log-call
      // Body: {id, call_status, call_notes}. Records a staff attempt to
      // reach someone who started (but never finished) the /pulse form.
      if (req.method === "POST" && path === "/api/admin/pulse-abandoned-signups/log-call") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        const callStatus = String(body?.call_status || "").trim();
        const callNotes = normalizeText(body?.call_notes) || null;

        if (!id) return json(req, env, { error: "Valid id required." }, 400);
        if (!PULSE_CALL_STATUSES.has(callStatus)) {
          return json(req, env, { error: `call_status must be one of: ${[...PULSE_CALL_STATUSES].join(", ")}` }, 400);
        }

        const row = await env.DB.prepare(
          `SELECT id FROM pulse_abandoned_signups WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Row not found." }, 404);

        const doNotCall = callStatus === "do_not_call" ? 1 : 0;
        await env.DB.prepare(
          `UPDATE pulse_abandoned_signups
              SET call_status = ?1, call_attempts = call_attempts + 1, call_notes = ?2,
                  called_at = datetime('now'), called_by = ?3,
                  do_not_call = MAX(do_not_call, ?4), updated_at = datetime('now')
            WHERE id = ?5`
        ).bind(callStatus, callNotes, actor.actorEmail || null, doNotCall, id).run();

        return json(req, env, { ok: true, id, callStatus });
      }

      // POST /api/admin/pulse-abandoned-signups/complete-optin
      // Body: {id, first_name, last_name, email, consent_email, address1,
      // city, zip}. Staff obtained real SMS consent (and optionally email
      // consent + voter-verification fields) on the call -- writes it
      // through the same upsertConsentStatus path a real /pulse submission
      // uses, tagged source='staff_call'/consent_version='verbal-callback-v1'
      // so it's auditable as staff-obtained rather than self-submitted (see
      // docs/pulse_flow.md). If city was captured, runs the same
      // voter-matching cascade a real step-2 submission would: mints and
      // sends a poll link on a clean match, or files a
      // pulse_voter_match_review row on an ambiguous/no-match result --
      // identical outcome to what would have happened had this person
      // actually finished the web form themselves. Does NOT re-fire the
      // automated welcome-text/confirmation-email flow -- the phone call
      // itself was the welcome; those are for self-service submissions.
      if (req.method === "POST" && path === "/api/admin/pulse-abandoned-signups/complete-optin") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const id = Number(body?.id);
        if (!id) return json(req, env, { error: "Valid id required." }, 400);

        const row = await env.DB.prepare(
          `SELECT id, phone_e164 FROM pulse_abandoned_signups WHERE id = ?1`
        ).bind(id).first();
        if (!row) return json(req, env, { error: "Row not found." }, 404);

        const phoneE164 = normalizePhoneNumber(row.phone_e164);
        const firstName = normalizeText(body?.first_name);
        const lastName = normalizeText(body?.last_name);
        const email = normalizeText(body?.email) || null;
        const consentEmail = body?.consent_email === true;
        const address1 = normalizeText(body?.address1) || null;
        const city = normalizeText(body?.city) || null;
        const zip = normalizeZip5(body?.zip) || null;

        if (!firstName || !lastName) {
          return json(req, env, { error: "First and last name are required." }, 400);
        }
        if (email && !isValidEmail(email)) {
          return json(req, env, { error: "Email is not valid." }, 400);
        }
        if (email && !consentEmail) {
          return json(req, env, { error: "Email consent required to save email." }, 400);
        }

        await upsertConsentStatus(env.DB, {
          phone: phoneE164,
          status: "opted_in",
          source: "staff_call",
          sourceDetail: "pulse_verbal_followup",
          consentedAt: new Date().toISOString(),
          firstName,
          lastName,
          email,
          consentEmail: consentEmail ? 1 : 0,
          zip,
          address1,
          city,
          consentVersion: "verbal-callback-v1",
          overwriteProfile: true,
        });

        if (consentEmail && email) {
          await upsertNewsletterSubscriber(env.DB, {
            email,
            consentEmail: true,
            consentVersion: "verbal-callback-v1",
            source: "skovgard2026:pulse_verbal_followup",
          }).catch((error) => {
            console.error("[pulse-abandoned-signups/complete-optin] newsletter upsert failed", String(error?.message || error));
          });
        }

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "pulse_verbal_optin_completed",
          targetPhone: phoneE164,
          detailsJson: JSON.stringify({ abandonedSignupId: id }),
        });

        let matchResult = { attempted: false };
        let pollLink = null;
        let smsResult = null;
        let emailResult = null;
        if (city) {
          const syncResult = await syncSubmittedPhoneToWyVoter(env, {
            phone: phoneE164, firstName, lastName, address1, city, zip, email,
          });
          if (syncResult?.ok) {
            await env.DB.prepare(
              `UPDATE consent_status SET voter_id = COALESCE(voter_id, ?2), updated_at = datetime('now') WHERE phone_e164 = ?1`
            ).bind(phoneE164, syncResult.voterId).run();

            if (email) {
              const resolved = await resolveVoterDistrictAndPrecinct(env, syncResult.voterId);
              const recipient = {
                voter_id: syncResult.voterId,
                email_norm: email.toLowerCase(),
                house_district: resolved?.house_district || undefined,
                senate_district: resolved?.senate_district || undefined,
                political_party: resolved?.political_party || undefined,
                county: resolved?.county || undefined,
                city: resolved?.city || undefined,
                precinct_code: resolved?.precinct_code || undefined,
              };
              const { withLinks, mintFailures } = await mintPollInviteLinksForChunk(env, [recipient]);
              pollLink = withLinks?.[0]?.poll_link || null;
              if (pollLink) {
                [smsResult, emailResult] = await Promise.all([
                  sendPollLinkText(env, phoneE164, pollLink, {
                    auditDetails: { voterId: syncResult.voterId, matchedBy: "staff_call" },
                  }).catch((error) => ({ sent: false, reason: String(error?.message || error) })),
                  sendPollLinkEmail(env, { firstName, email, consentEmail: true, pollLink })
                    .catch((error) => ({ sent: false, reason: String(error?.message || error) })),
                ]);
                if (smsResult?.sent || emailResult?.sent) {
                  await env.DB.prepare(
                    `UPDATE consent_status SET poll_link_sent_at = datetime('now') WHERE phone_e164 = ?1`
                  ).bind(phoneE164).run();
                }
              } else if (mintFailures?.length) {
                console.log("[pulse-abandoned-signups/complete-optin] poll link mint skipped", { reason: mintFailures[0]?.error });
              }
            }
            matchResult = { attempted: true, matched: true, voterId: syncResult.voterId, matchedBy: syncResult.matchedBy };
          } else {
            const mode = syncResult?.skipped;
            const infraSkip = mode === "missing_wy_tables" || mode === "invalid_phone" || mode === "missing_binding";
            if (!infraSkip) {
              const candidateVoterIds = summarizeMatchCandidates(syncResult.candidates);
              await env.DB.prepare(
                `INSERT INTO pulse_voter_match_review
                   (phone_e164, submitted_first_name, submitted_last_name, submitted_address1, submitted_city, submitted_zip, match_mode, candidate_voter_ids)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
              ).bind(
                phoneE164, firstName, lastName, address1, city, zip, mode,
                candidateVoterIds.length ? JSON.stringify(candidateVoterIds) : null
              ).run();

              await sendPulseReviewNeededEmail(env, {
                phoneE164, firstName, lastName, address1, city, zip, matchMode: mode,
              }).catch((error) => {
                console.error("[pulse-abandoned-signups/complete-optin] review-needed email failed", String(error?.message || error));
              });
            }
            matchResult = { attempted: true, matched: false, mode };
          }
        }

        await env.DB.prepare(
          `UPDATE pulse_abandoned_signups
              SET completed_phone_e164 = ?1, call_status = 'reached_confirmed',
                  call_attempts = call_attempts + 1, called_at = datetime('now'),
                  called_by = ?2, updated_at = datetime('now')
            WHERE id = ?3`
        ).bind(phoneE164, actor.actorEmail || null, id).run();

        return json(req, env, { ok: true, id, phoneE164, matchResult, pollLink, sms: smsResult, email: emailResult });
      }

      if (req.method === "POST" && path === "/api/admin/texting/contacts/delete") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const phoneE164 = normalizePhoneNumber(body?.phone || "");

        if (!phoneE164) {
          return json(req, env, { error: "Valid phone required." }, 400);
        }

        const seed = await loadContactVolunteerSeed(env.DB, phoneE164);
        if (!seed?.phone_e164) {
          return json(req, env, { error: "Contact not found." }, 404);
        }

        const deleted = await deleteTextingContactRecord(env.DB, phoneE164);

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_delete_contact_record",
          targetPhone: phoneE164,
          detailsJson: JSON.stringify({
            firstName: seed.first_name || null,
            lastName: seed.last_name || null,
            contactsDeleted: deleted.contactsDeleted,
            consentStatusDeleted: deleted.consentStatusDeleted,
            smsOptinsDeleted: deleted.smsOptinsDeleted,
            deletedCount: deleted.deletedCount,
            messageHistoryDeleted: false,
            newsletterDeleted: false,
            volunteersDeleted: false,
          }),
        });

        return json(req, env, {
          ok: true,
          phoneE164,
          contactsDeleted: deleted.contactsDeleted,
          consentStatusDeleted: deleted.consentStatusDeleted,
          smsOptinsDeleted: deleted.smsOptinsDeleted,
          deletedCount: deleted.deletedCount,
          messageHistoryDeleted: false,
          newsletterDeleted: false,
          volunteersDeleted: false,
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/suppression") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = positiveInt(url.searchParams.get("limit"), 100, 500);
        const results = await queryAudienceContacts(env.DB, {
          filter: "opted_out",
          q: String(url.searchParams.get("q") || "").trim(),
          limit,
        });

        return json(req, env, { ok: true, items: results });
      }

      if (req.method === "GET" && path === "/api/admin/texting/conversations") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const phone = normalizePhoneNumber(url.searchParams.get("phone") || "");
        if (!phone) {
          return json(req, env, { error: "Valid phone query parameter required" }, 400);
        }

        const inbound = ((await env.DB.prepare(
          `SELECT id AS row_id, 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                  received_at AS at, raw_json, direction AS status
             FROM inbound_messages
            WHERE phone_from = ?1 OR phone_to = ?1`
        ).bind(phone).all())?.results || []);
        const outbound = ((await env.DB.prepare(
          `SELECT id AS row_id, 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                  updated_at AS at, raw_json, status
             FROM outbound_messages
            WHERE phone_from = ?1 OR phone_to = ?1`
        ).bind(phone).all())?.results || []);
        const consent = await env.DB.prepare(
          `SELECT * FROM consent_status WHERE phone_e164 = ?1`
        ).bind(phone).first();

        const items = [...inbound, ...outbound]
          .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));

        return json(req, env, { ok: true, phone, consent, items });
      }

      if (req.method === "POST" && path === "/api/admin/texting/conversations/clear") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const phone = normalizePhoneNumber(body?.phone || "");
        if (!phone) {
          return json(req, env, { error: "Valid phone required" }, 400);
        }

        const { inboundDeleted, outboundDeleted } = await clearConversationMessagesByPhone(env.DB, phone);
        const deletedCount = inboundDeleted + outboundDeleted;

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail,
          actorUserId: actor.actorUserId,
          action: "admin_clear_conversation_messages",
          targetPhone: phone,
          detailsJson: JSON.stringify({
            deletedCount,
            inboundDeleted,
            outboundDeleted,
          }),
        });

        return json(req, env, {
          ok: true,
          phone,
          deletedCount,
          inboundDeleted,
          outboundDeleted,
        });
      }

      if (req.method === "POST" && path === "/api/admin/texting/send") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        if (!String(env.TELNYX_API_KEY || "").trim()) {
          return json(req, env, { error: "TELNYX_API_KEY not configured" }, 503);
        }
        if (!String(env.TELNYX_FROM_NUMBER || "").trim()) {
          return json(req, env, { error: "TELNYX_FROM_NUMBER not configured" }, 503);
        }

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const to = normalizePhoneNumber(body.to || "");
        const messageTemplate = normalizeMessageText(body.text);
        const dryRun = body.dry_run === true || body.preview === true;
        const previewToken = String(body.preview_token || "").trim();
        const previewIssuedAt = normalizePreviewIssuedAt(body.preview_issued_at);

        if (!to) return json(req, env, { error: "Valid E.164 destination required" }, 400);
        if (!messageTemplate) return json(req, env, { error: "Message text is required" }, 400);
        const recipient = (await queryContactsByPhones(env.DB, [to]))[0];
        const text = personalizeSmsFirstName(messageTemplate, recipient?.first_name);
        if (text.length > 1200) return json(req, env, { error: "Message text too long" }, 400);

        const blocked = await isOutboundSendBlocked(env.DB, to);
        if (blocked) {
          await insertTextingAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "send_blocked_opted_out",
            targetPhone: to,
            detailsJson: JSON.stringify({ to, text }),
          });
          return json(req, env, { error: "Cannot send to an opted-out number", blocked: true }, 409);
        }

        if (dryRun) {
          const issuedAt = new Date().toISOString();
          const approvalToken = await createPreviewApprovalToken(
            env,
            buildSingleSendPreviewSeed({ to, text }),
            issuedAt
          );
          await insertTextingAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "send_preview",
            targetPhone: to,
            detailsJson: JSON.stringify({ to, text }),
          });
          return json(req, env, {
            ok: true,
            dryRun: true,
            preview: {
              to,
              from: String(env.TELNYX_FROM_NUMBER || "").trim(),
              text,
            },
            cost: estimateSmsCost(text, 1, DEFAULT_SMS_RATES),
            approval: {
              issuedAt,
              token: approvalToken,
              expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
            },
          });
        }

        if (!previewToken || !previewIssuedAt) {
          return json(req, env, { error: "Run Preview again before sending." }, 400);
        }
        if (isPreviewExpired(previewIssuedAt)) {
          return json(req, env, { error: "Preview expired. Run Preview again." }, 409);
        }

        const expectedPreviewToken = await createPreviewApprovalToken(
          env,
          buildSingleSendPreviewSeed({ to, text }),
          previewIssuedAt
        );
        if (!timingSafeEqual(previewToken, expectedPreviewToken)) {
          return json(req, env, { error: "Preview no longer matches this message. Run Preview again." }, 409);
        }

        try {
          const telnyx = await sendSmsWithTelnyx({
            apiKey: env.TELNYX_API_KEY,
            fromNumber: String(env.TELNYX_FROM_NUMBER || "").trim(),
            to,
            text,
            db: env.DB,
          });

          await env.DB.prepare(
            `INSERT INTO outbound_messages
               (telnyx_message_id, phone_from, phone_to, text, status, created_at, updated_at, raw_json)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), ?6)
             ON CONFLICT(telnyx_message_id) DO UPDATE SET
               phone_from=excluded.phone_from,
               phone_to=excluded.phone_to,
               text=excluded.text,
               status=excluded.status,
               updated_at=datetime('now'),
               raw_json=excluded.raw_json`
          )
            .bind(
              telnyx.providerId,
              String(env.TELNYX_FROM_NUMBER || "").trim(),
              to,
              text,
              telnyx.status,
              JSON.stringify(telnyx.body || null)
            )
            .run();

          await env.DB.prepare(
            `INSERT INTO contacts (phone_e164, created_at, updated_at)
             VALUES (?1, datetime('now'), datetime('now'))
             ON CONFLICT(phone_e164) DO UPDATE SET
               updated_at=datetime('now')`
          ).bind(to).run();

          await insertTextingAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "send_message",
            targetPhone: to,
            messageId: telnyx.providerId,
            detailsJson: JSON.stringify({
              to,
              from: String(env.TELNYX_FROM_NUMBER || "").trim(),
              status: telnyx.status,
            }),
          });

          return json(req, env, {
            ok: true,
            providerId: telnyx.providerId,
            status: telnyx.status,
          });
        } catch (error) {
          await insertTextingAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "send_failed",
            targetPhone: to,
            detailsJson: JSON.stringify({
              to,
              error: error.message,
              body: error.body || null,
            }),
          });
          return json(req, env, { error: error.message, details: error.body || null }, error.status || 502);
        }
      }

      if (req.method === "GET" && path === "/api/admin/texting/failed-recipients") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const since = String(url.searchParams.get("since") || "").trim();
        const until = String(url.searchParams.get("until") || "").trim();
        if (!since) return json(req, env, { error: "since parameter required (ISO date)" }, 400);

        const rows = await env.DB.prepare(
          `SELECT DISTINCT om.phone_to, cs.first_name
             FROM outbound_messages om
             LEFT JOIN consent_status cs ON cs.phone_e164 = om.phone_to
            WHERE om.status = 'delivery_failed'
              AND om.created_at >= ?1
              AND (?2 = '' OR om.created_at <= ?2)
              AND om.phone_to IS NOT NULL
              AND om.phone_to != ''
            ORDER BY om.created_at DESC`
        ).bind(since, until).all();

        return json(req, env, {
          recipients: (rows.results || []).map(r => ({
            phone_e164: r.phone_to,
            first_name: r.first_name || null,
          })),
          count: (rows.results || []).length,
        });
      }

      if (req.method === "POST" && path === "/api/admin/texting/send-batch") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        if (!String(env.TELNYX_API_KEY || "").trim()) {
          return json(req, env, { error: "TELNYX_API_KEY not configured" }, 503);
        }
        if (!String(env.TELNYX_FROM_NUMBER || "").trim()) {
          return json(req, env, { error: "TELNYX_FROM_NUMBER not configured" }, 503);
        }

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const filter = String(body.filter || "opted_in").trim();
        const city = normalizeContactFilterValue(body.city || "");
        const hd = normalizeContactFilterValue(body.hd || "");
        const sd = normalizeContactFilterValue(body.sd || "");
        const text = normalizeMessageText(body.text);
        const dryRun = body.dry_run !== false;
        const confirmed = body.confirmed === true;
        const limit = positiveInt(body.limit, 250, 250);
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const batchId = crypto.randomUUID();
        const previewToken = String(body.preview_token || "").trim();
        const previewIssuedAt = normalizePreviewIssuedAt(body.preview_issued_at);
        const requestedRecipients = normalizeRecipientPhones(body.recipients, 251);
        const hasExplicitRecipientInput = Array.isArray(body.recipients) && body.recipients.length > 0;
        const useExplicitRecipients = requestedRecipients.length > 0;
        const mode = useExplicitRecipients ? "explicit" : "filter";

        if (!text) return json(req, env, { error: "Message text is required" }, 400);
        if (requestedRecipients.length > 250) {
          return json(req, env, { error: "Recipient tray is limited to 250 contacts per batch." }, 400);
        }
        if (hasExplicitRecipientInput && !useExplicitRecipients) {
          return json(req, env, { error: "Recipient tray did not include any valid phone numbers." }, 400);
        }

        const audience = useExplicitRecipients
          ? await queryContactsByPhones(env.DB, requestedRecipients)
          : await queryAudienceContacts(env.DB, {
              filter,
              q: "",
              city,
              hd,
              sd,
              limit,
              sinceHours,
            });
        const recipients = audience.filter((item) => String(item.status || "").trim() === "opted_in");
        const audienceSeedPhones = useExplicitRecipients
          ? requestedRecipients
          : audience.map((item) => item.phone_e164);
        const audienceCount = audienceSeedPhones.length;
        const audienceHash = await sha256Hex(audienceSeedPhones.join(","));
        const recipientHash = await sha256Hex(recipients.map((item) => item.phone_e164).join(","));
        const previewRecipients = buildBatchPreviewRecipients(recipients);
        const personalizedMessages = recipients.map((item) => ({
          phone_e164: item.phone_e164,
          first_name: item.first_name || "",
          text: personalizeSmsFirstName(text, item.first_name),
        }));
        const personalizationHash = await sha256Hex(
          personalizedMessages.map((item) => `${item.phone_e164}:${item.text}`).join("|")
        );
        const skippedCount = Math.max(0, audienceCount - recipients.length);
        const batchOffset = Math.max(0, Math.trunc(Number(body.batch_offset) || 0));

        if (personalizedMessages.some((item) => item.text.length > 1200)) {
          return json(req, env, { error: "Personalized message text is too long" }, 400);
        }

        if (dryRun) {
          const issuedAt = new Date().toISOString();
          const approvalToken = await createPreviewApprovalToken(
            env,
            buildBatchSendPreviewSeed({
              mode,
              filter,
              city,
              hd,
              sd,
              text,
              limit,
              sinceHours,
              audienceCount,
              audienceHash,
              recipientCount: recipients.length,
              recipientHash,
              personalizationHash,
            }),
            issuedAt
          );
          await insertTextingAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "broadcast_preview",
            detailsJson: JSON.stringify({
              batchId,
              mode,
              filter,
              city,
              hd,
              sd,
              audienceCount,
              count: recipients.length,
              skippedCount,
              limit,
            }),
          });
          return json(req, env, {
            ok: true,
            dryRun: true,
            batchId,
            mode,
            audienceCount,
            count: recipients.length,
            skippedCount,
            previewRecipients,
            previewMessages: personalizedMessages.slice(0, 8),
            cost: estimatePersonalizedSmsCost(
              personalizedMessages.map((item) => item.text),
              DEFAULT_SMS_RATES
            ),
            approval: {
              issuedAt,
              token: approvalToken,
              expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
            },
          });
        }

        if (!confirmed) {
          return json(req, env, { error: "Broadcast execution requires confirmed=true" }, 400);
        }
        if (!previewToken || !previewIssuedAt) {
          return json(req, env, { error: "Run broadcast preview again before sending." }, 400);
        }
        if (isPreviewExpired(previewIssuedAt)) {
          return json(req, env, { error: "Broadcast preview expired. Run Preview again." }, 409);
        }

        const expectedPreviewToken = await createPreviewApprovalToken(
          env,
          buildBatchSendPreviewSeed({
            mode,
            filter,
            city,
            hd,
            sd,
            text,
            limit,
            sinceHours,
            audienceCount,
            audienceHash,
            recipientCount: recipients.length,
            recipientHash,
            personalizationHash,
          }),
          previewIssuedAt
        );
        if (!timingSafeEqual(previewToken, expectedPreviewToken)) {
          return json(req, env, { error: "Broadcast preview no longer matches this audience or message. Run Preview again." }, 409);
        }

        const chunkRecipients = recipients.slice(
          batchOffset,
          batchOffset + ADMIN_TEXTING_BROADCAST_SEND_CHUNK_SIZE
        );
        const sent = [];
        const failed = [];
        for (let smsIdx = 0; smsIdx < chunkRecipients.length; smsIdx++) {
          const recipient = chunkRecipients[smsIdx];
          try {
            const telnyx = await sendSmsWithTelnyx({
              apiKey: env.TELNYX_API_KEY,
              fromNumber: String(env.TELNYX_FROM_NUMBER || "").trim(),
              to: recipient.phone_e164,
              text: personalizeSmsFirstName(text, recipient.first_name),
              db: env.DB,
            });

            await env.DB.prepare(
              `INSERT INTO outbound_messages
                 (telnyx_message_id, phone_from, phone_to, text, status, created_at, updated_at, raw_json)
               VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), ?6)
               ON CONFLICT(telnyx_message_id) DO UPDATE SET
                 phone_from=excluded.phone_from,
                 phone_to=excluded.phone_to,
                 text=excluded.text,
                 status=excluded.status,
                 updated_at=datetime('now'),
                 raw_json=excluded.raw_json`
            )
              .bind(
                telnyx.providerId,
                String(env.TELNYX_FROM_NUMBER || "").trim(),
                recipient.phone_e164,
                personalizeSmsFirstName(text, recipient.first_name),
                telnyx.status,
                JSON.stringify(telnyx.body || null)
              )
              .run();

            sent.push({
              phone: recipient.phone_e164,
              providerId: telnyx.providerId,
              status: telnyx.status,
            });
          } catch (error) {
            failed.push({
              phone: recipient.phone_e164,
              error: error.message,
            });
          }
          // 340 ms between each individual send — keeps messages separate at the
          // carrier level so no recipient sees another's number in a group thread.
          if (smsIdx < chunkRecipients.length - 1) {
            await sleep(340);
          }
        }

        const nextOffset = batchOffset + chunkRecipients.length;
        const complete = nextOffset >= recipients.length;

        await insertTextingAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "broadcast_execute",
          detailsJson: JSON.stringify({
            batchId,
            mode,
            filter,
            city,
            hd,
            sd,
            audienceCount,
            skippedCount,
            batchOffset,
            chunkSize: chunkRecipients.length,
            nextOffset,
            complete,
            sent,
            failed,
          }),
        });

        return json(req, env, {
          ok: true,
          batchId,
          mode,
          audienceCount,
          totalRecipients: recipients.length,
          sentCount: sent.length,
          skippedCount,
          failedCount: failed.length,
          batchOffset,
          nextOffset,
          complete,
          sent,
          failed,
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/contacts.csv") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const results = await queryAudienceContacts(env.DB, {
          filter: "all",
          q: String(url.searchParams.get("q") || "").trim(),
          limit: 10000,
        });
        const columns = [
          "phone_e164",
          "first_name",
          "last_name",
          "status",
          "source",
          "source_detail",
          "consented_at",
          "revoked_at",
          "last_inbound_keyword",
          "tags",
          "welcome_sent_at",
        ];
        const date = new Date().toISOString().slice(0, 10);
        return csvResponse(req, env, `texting-contacts-${date}.csv`, rowsToCsv(columns, results));
      }

      if (req.method === "GET" && path === "/api/admin/texting/suppressed.csv") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const results = await queryAudienceContacts(env.DB, {
          filter: "opted_out",
          q: String(url.searchParams.get("q") || "").trim(),
          limit: 10000,
        });
        const columns = [
          "phone_e164",
          "first_name",
          "last_name",
          "status",
          "source",
          "revoked_at",
          "last_inbound_keyword",
        ];
        const date = new Date().toISOString().slice(0, 10);
        return csvResponse(req, env, `texting-suppressed-${date}.csv`, rowsToCsv(columns, results));
      }

      // ── Voter Blast ────────────────────────────────────────────────────────────
      // Queries WY_DB for voter phone numbers by county/city/party/district.
      // Bypasses SMS opt-in; honors opted_out from ballot_sources consent_status.
      // Rate: 1 msg/sec (10DLC single-number limit). Chunked 20 at a time.

      if (req.method === "GET" && path === "/api/admin/voter-blast/cities") {
        if (!env.WY_DB) return json(req, env, { error: "WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const county = normalizeText(url.searchParams.get("county") || "").toUpperCase() || null;

        const rows = county
          ? await env.WY_DB.prepare(
              `SELECT city, county FROM wy_city_county WHERE UPPER(TRIM(county)) = ?1 ORDER BY city ASC`
            ).bind(county).all()
          : await env.WY_DB.prepare(
              `SELECT city, county FROM wy_city_county ORDER BY city ASC`
            ).all();

        const cities = (rows.results || []).map((r) => ({
          city:   titleCase(r.city),
          county: titleCase(r.county),
        }));
        return json(req, env, { ok: true, county, cities });
      }

      if (req.method === "GET" && path === "/api/admin/voter-blast/preview") {
        if (!env.DB || !env.WY_DB) return json(req, env, { error: "DB or WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const county       = normalizeText(url.searchParams.get("county")        || "").toUpperCase() || null;
        const city         = normalizeText(url.searchParams.get("city")           || "").toUpperCase() || null;
        const party        = normalizeText(url.searchParams.get("party")          || "") || null;
        const districtType = normalizeText(url.searchParams.get("district_type")  || "") || null;
        const district     = normalizeText(url.searchParams.get("district")       || "") || null;
        const text         = normalizeText(url.searchParams.get("text")           || "");

        if (!text) return json(req, env, { error: "message text required" }, 400);

        const job = { county, city, party, district_type: districtType, district };
        const { where, bindings } = buildVoterBlastWhere(job);

        const countSql = `SELECT COUNT(*) AS cnt FROM voters v JOIN v_best_phone vbp ON vbp.voter_id=v.voter_id JOIN voters_addr_norm van ON van.voter_id=v.voter_id ${where}`;
        const sampleSql = `SELECT v.voter_id, van.fn, van.ln, van.city, v.political_party, vbp.phone_e164 FROM voters v JOIN v_best_phone vbp ON vbp.voter_id=v.voter_id JOIN voters_addr_norm van ON van.voter_id=v.voter_id ${where} LIMIT 8`;

        const [countRow, sampleRows] = await Promise.all([
          env.WY_DB.prepare(countSql).bind(...bindings).first(),
          env.WY_DB.prepare(sampleSql).bind(...bindings).all(),
        ]);

        const total = Number(countRow?.cnt || 0);
        const samples = (sampleRows.results || []).map((r) => ({
          name: `${titleCase(r.fn)} ${titleCase(r.ln)}`,
          city: titleCase(r.city || ""),
          party: r.political_party || "",
          phoneMasked: String(r.phone_e164 || "").slice(0, 6) + "***" + String(r.phone_e164 || "").slice(-2),
        }));

        const issuedAt = new Date().toISOString();
        const seed     = buildVoterBlastPreviewSeed({ county, city, party, districtType, district, text });
        const token    = await hmacSha256Hex(String(env.ADMIN_EXPORT_KEY || ""), `${seed}|${issuedAt}`);

        const cost = calcBlastCost(text, total);

        return json(req, env, {
          ok: true, total, samples,
          estimatedMinutes: Math.ceil(total / 60),
          cost,
          preview: { issuedAt, token, expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString() },
        });
      }

      if (req.method === "POST" && path === "/api/admin/voter-blast/job") {
        if (!env.DB || !env.WY_DB) return json(req, env, { error: "DB or WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const actor        = getAdminActor(req);
        const body         = await req.json().catch(() => ({}));
        const county       = normalizeText(body.county        || "").toUpperCase() || null;
        const city         = normalizeText(body.city          || "").toUpperCase() || null;
        const party        = normalizeText(body.party         || "") || null;
        const districtType = normalizeText(body.district_type || "") || null;
        const district     = normalizeText(body.district      || "") || null;
        const text         = normalizeText(body.text          || "");
        const previewToken = normalizeText(body.preview_token || "");
        const previewIssuedAt = normalizeText(body.preview_issued_at || "");

        if (!text) return json(req, env, { error: "message text required" }, 400);
        if (!previewToken || !previewIssuedAt) return json(req, env, { error: "Run preview first" }, 400);
        if (isPreviewExpired(previewIssuedAt)) return json(req, env, { error: "Preview expired — run it again" }, 409);

        const seed          = buildVoterBlastPreviewSeed({ county, city, party, districtType, district, text });
        const expectedToken = await hmacSha256Hex(String(env.ADMIN_EXPORT_KEY || ""), `${seed}|${previewIssuedAt}`);
        if (!timingSafeEqual(previewToken, expectedToken)) {
          return json(req, env, { error: "Preview token mismatch — run preview again" }, 409);
        }

        const job = { county, city, party, district_type: districtType, district };
        const { where, bindings } = buildVoterBlastWhere(job);
        const countRow = await env.WY_DB.prepare(
          `SELECT COUNT(*) AS cnt FROM voters v JOIN v_best_phone vbp ON vbp.voter_id=v.voter_id JOIN voters_addr_norm van ON van.voter_id=v.voter_id ${where}`
        ).bind(...bindings).first();
        const totalAudience = Number(countRow?.cnt || 0);

        const blastId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO voter_blast_jobs
             (blast_id, county, city, party, district_type, district, message_text,
              total_audience, status, actor_email, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'created',?9,datetime('now'),datetime('now'))`
        ).bind(blastId, county, city, party, districtType, district, text, totalAudience, actor.actorEmail).run();

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail, actorUserId: actor.actorUserId,
          action: "voter_blast_created",
          detailsJson: JSON.stringify({ blastId, county, city, party, districtType, district, totalAudience }),
        });

        return json(req, env, { ok: true, blast_id: blastId, total_audience: totalAudience });
      }

      if (req.method === "POST" && path === "/api/admin/voter-blast/send-chunk") {
        if (!env.DB || !env.WY_DB) return json(req, env, { error: "DB or WY_DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const actor   = getAdminActor(req);
        const body    = await req.json().catch(() => ({}));
        const dryRun  = body.dry_run === true;
        const blastId = normalizeText(body.blast_id || "");

        if (!dryRun) {
          if (!String(env.TELNYX_API_KEY    || "").trim()) return json(req, env, { error: "TELNYX_API_KEY not configured"    }, 503);
          if (!String(env.TELNYX_FROM_NUMBER|| "").trim()) return json(req, env, { error: "TELNYX_FROM_NUMBER not configured" }, 503);
        }
        if (!blastId) return json(req, env, { error: "blast_id required" }, 400);

        const job = await env.DB.prepare(
          `SELECT * FROM voter_blast_jobs WHERE blast_id=?1`
        ).bind(blastId).first();
        if (!job) return json(req, env, { error: "Blast job not found" }, 404);
        if (job.status === "complete")  {
          const dfRow = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM voter_blast_log vbl
             JOIN outbound_messages om ON om.telnyx_message_id = vbl.telnyx_message_id
             WHERE vbl.blast_id = ?1 AND om.status IN ('failed','delivery_failed')`
          ).bind(blastId).first();
          return json(req, env, { ok: true, done: true, sent: 0, failed: 0, skipped: 0,
            total_sent: Number(job.sent_count), total_failed: Number(job.failed_count) + Number(dfRow?.n || 0),
            total_skipped: Number(job.skipped_count), total_audience: Number(job.total_audience) });
        }
        if (job.status === "cancelled") return json(req, env, { error: "Blast was cancelled" }, 409);

        // Fetch next 20 voters from WY_DB
        const offset = Number(job.current_offset || 0);
        const { where, bindings } = buildVoterBlastWhere(job);
        const chunkRows = await env.WY_DB.prepare(
          `SELECT v.voter_id, van.fn, vbp.phone_e164
           FROM voters v
           JOIN v_best_phone vbp ON vbp.voter_id=v.voter_id
           JOIN voters_addr_norm van ON van.voter_id=v.voter_id
           ${where}
           ORDER BY v.voter_id
           LIMIT 20 OFFSET ${offset}`
        ).bind(...bindings).all();

        const chunk = chunkRows.results || [];

        if (chunk.length === 0) {
          await env.DB.prepare(
            `UPDATE voter_blast_jobs SET status='complete', updated_at=datetime('now') WHERE blast_id=?1`
          ).bind(blastId).run();
          return json(req, env, { ok: true, done: true, sent: 0, failed: 0, skipped: 0, total_sent: Number(job.sent_count), total_audience: Number(job.total_audience) });
        }

        // Cross-check opted-out numbers from ballot_sources
        const phones = chunk.map((r) => r.phone_e164).filter(Boolean);
        const suppressedResult = phones.length
          ? await env.DB.prepare(
              `SELECT phone_e164 FROM consent_status WHERE phone_e164 IN (${phones.map((_,i)=>`?${i+1}`).join(",")}) AND status='opted_out'`
            ).bind(...phones).all()
          : { results: [] };
        const suppressed = new Set((suppressedResult.results || []).map((r) => r.phone_e164));

        const apiKey     = String(env.TELNYX_API_KEY     || "").trim();
        const fromNumber = String(env.TELNYX_FROM_NUMBER || "").trim();
        const stopFooter = "\n\nReply STOP to opt out.";

        let chunkSent = 0, chunkFailed = 0, chunkSkipped = 0;

        for (let i = 0; i < chunk.length; i++) {
          const voter = chunk[i];
          if (!voter.phone_e164 || suppressed.has(voter.phone_e164)) {
            await env.DB.prepare(
              `INSERT INTO voter_blast_log (blast_id, voter_id, phone_e164, status) VALUES (?1,?2,?3,'skipped_suppressed')`
            ).bind(blastId, voter.voter_id, voter.phone_e164 || "").run();
            chunkSkipped++;
            continue;
          }

          const firstName = titleCase(voter.fn || "there");
          const msgText   = job.message_text.replace(/\{first_name\}/gi, firstName) + stopFooter;

          if (dryRun) {
            await env.DB.prepare(
              `INSERT INTO voter_blast_log (blast_id, voter_id, phone_e164, status, error_message) VALUES (?1,?2,?3,'dry_run','dry run — no message sent')`
            ).bind(blastId, voter.voter_id, voter.phone_e164).run();
            chunkSent++;
          } else {
            try {
              const telnyx = await sendSmsWithTelnyx({ apiKey, fromNumber, to: voter.phone_e164, text: msgText, db: env.DB });
              await env.DB.prepare(
                `INSERT INTO voter_blast_log (blast_id, voter_id, phone_e164, status, telnyx_message_id) VALUES (?1,?2,?3,'sent',?4)`
              ).bind(blastId, voter.voter_id, voter.phone_e164, telnyx.providerId).run();
              chunkSent++;
            } catch (err) {
              await env.DB.prepare(
                `INSERT INTO voter_blast_log (blast_id, voter_id, phone_e164, status, error_message) VALUES (?1,?2,?3,'failed',?4)`
              ).bind(blastId, voter.voter_id, voter.phone_e164, err.message).run();
              chunkFailed++;
            }

            if (i < chunk.length - 1) await sleep(1000); // 1 MPS — 10DLC carrier limit
          }
        }

        const newOffset = offset + chunk.length;
        const done      = chunk.length < 20;
        const newStatus = done ? "complete" : "running";

        await env.DB.prepare(
          `UPDATE voter_blast_jobs
           SET current_offset=?2, sent_count=sent_count+?3, failed_count=failed_count+?4,
               skipped_count=skipped_count+?5, status=?6, updated_at=datetime('now')
           WHERE blast_id=?1`
        ).bind(blastId, newOffset, chunkSent, chunkFailed, chunkSkipped, newStatus).run();

        await insertTextingAuditLog(env.DB, {
          actorEmail: actor.actorEmail, actorUserId: actor.actorUserId,
          action: "voter_blast_chunk",
          detailsJson: JSON.stringify({ blastId, offset, chunkSent, chunkFailed, chunkSkipped, done }),
        });

        const dfRow = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM voter_blast_log vbl
           JOIN outbound_messages om ON om.telnyx_message_id = vbl.telnyx_message_id
           WHERE vbl.blast_id = ?1 AND om.status IN ('failed','delivery_failed')`
        ).bind(blastId).first();

        const totalFailed   = Number(job.failed_count) + chunkFailed + Number(dfRow?.n || 0);
        const totalSkipped  = Number(job.skipped_count) + chunkSkipped;

        return json(req, env, {
          ok: true, done,
          sent: chunkSent, failed: chunkFailed, skipped: chunkSkipped,
          total_sent: Number(job.sent_count) + chunkSent,
          total_failed: totalFailed,
          total_skipped: totalSkipped,
          total_audience: Number(job.total_audience),
          current_offset: newOffset,
        });
      }

      if (req.method === "GET" && path === "/api/admin/voter-blast/jobs") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const rows = await env.DB.prepare(
          `SELECT blast_id, county, city, party, district_type, district,
                  total_audience, current_offset, sent_count, failed_count, skipped_count,
                  status, actor_email, created_at, updated_at
           FROM voter_blast_jobs
           ORDER BY datetime(created_at) DESC
           LIMIT 20`
        ).all();
        const jobs = rows.results || [];

        if (jobs.length > 0) {
          const ids = jobs.map(j => j.blast_id);
          const ph  = ids.map((_, i) => `?${i + 1}`).join(',');
          const dfRows = await env.DB.prepare(
            `SELECT vbl.blast_id, COUNT(*) AS n
             FROM voter_blast_log vbl
             JOIN outbound_messages om ON om.telnyx_message_id = vbl.telnyx_message_id
             WHERE vbl.blast_id IN (${ph})
               AND om.status IN ('failed','delivery_failed')
             GROUP BY vbl.blast_id`
          ).bind(...ids).all();
          const dfMap = Object.fromEntries((dfRows.results || []).map(r => [r.blast_id, Number(r.n)]));
          jobs.forEach(j => { j.delivery_failed_count = dfMap[j.blast_id] || 0; });
        }

        return json(req, env, { ok: true, jobs });
      }

      if (req.method === "PATCH" && path === "/api/admin/voter-blast/pause") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const body    = await req.json().catch(() => ({}));
        const blastId = normalizeText(body.blast_id || "");
        if (!blastId) return json(req, env, { error: "blast_id required" }, 400);

        await env.DB.prepare(
          `UPDATE voter_blast_jobs SET status='paused', updated_at=datetime('now') WHERE blast_id=?1 AND status='running'`
        ).bind(blastId).run();
        return json(req, env, { ok: true });
      }

      // ── End Voter Blast ────────────────────────────────────────────────────────

      if (req.method === "GET" && path === "/api/admin/emails/status") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const [counts, latestSubscriberRow] = await Promise.all([
          queryAdminEmailContactCounts(env.DB),
          env.DB.prepare(
            `SELECT email, source, created_at, updated_at
               FROM newsletter_subscribers
              ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, id DESC
              LIMIT 1`
          ).first().catch(() => null),
        ]);

        const envPresent = {
          adminExportKey: Boolean(String(env.ADMIN_EXPORT_KEY || "").trim()),
          resendApiKey: Boolean(String(env.RESEND_API_KEY || "").trim()),
          resendWebhookSecret: Boolean(String(env.RESEND_WEBHOOK_SECRET || "").trim()),
          adminEmailFrom: Boolean(String(env.ADMIN_EMAIL_FROM || "").trim()),
          adminEmailEnabled: String(env.ADMIN_EMAIL_ENABLED || "0") === "1",
          d1: Boolean(env.DB),
        };
        const tables = {
          newsletter_subscribers: await tableExists(env.DB, "newsletter_subscribers"),
          consent_status: await tableExists(env.DB, "consent_status"),
          admin_email_audit_log: await tableExists(env.DB, "admin_email_audit_log"),
          resend_webhook_events: await tableExists(env.DB, "resend_webhook_events"),
          email_suppressions: await tableExists(env.DB, "email_suppressions"),
        };

        const previewPathIssues = [];
        if (!envPresent.adminExportKey) previewPathIssues.push("Admin key missing");
        if (!envPresent.d1) previewPathIssues.push("Database not configured");
        if (tables.newsletter_subscribers === false) previewPathIssues.push("Newsletter subscribers table missing");
        if (tables.consent_status === false) previewPathIssues.push("Consent status table missing");

        const sendPathIssues = [];
        if (!envPresent.resendApiKey) sendPathIssues.push("Resend API key missing");
        if (!envPresent.adminEmailFrom) sendPathIssues.push("Admin email sender missing");
        if (!envPresent.adminEmailEnabled) sendPathIssues.push("Admin email sending disabled");
        if (tables.admin_email_audit_log === false) sendPathIssues.push("Admin email audit log table missing");
        if (tables.email_suppressions === false) sendPathIssues.push("Email suppressions table missing");

        return json(req, env, {
          ok: true,
          previewPathReady: previewPathIssues.length === 0,
          previewPathIssues,
          sendPathReady: sendPathIssues.length === 0,
          sendPathIssues,
          totalCount: Number(counts?.total_count || 0),
          emailableCount: Number(counts?.emailable_count || 0),
          inactiveCount: Number(counts?.inactive_count || 0),
          noConsentCount: Number(counts?.no_consent_count || 0),
          suppressedCount: Number(counts?.suppressed_count || 0),
          newOptIns24h: Number(counts?.new_opt_ins_24h || 0),
          lastAudienceUpdateAt: counts?.last_updated_at || null,
          latestSubscriber: latestSubscriberRow
            ? {
                email: latestSubscriberRow.email || null,
                source: latestSubscriberRow.source || "",
                createdAt: latestSubscriberRow.created_at || null,
                updatedAt: latestSubscriberRow.updated_at || null,
              }
            : null,
          sender: String(env.ADMIN_EMAIL_FROM || "").trim() || null,
          envPresent,
          tables,
        });
      }

      if (req.method === "GET" && path === "/api/admin/emails/contacts") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 5000);
        const q = String(url.searchParams.get("q") || "").trim();
        const filter = String(url.searchParams.get("filter") || "emailable").trim();
        const city = normalizeContactFilterValue(url.searchParams.get("city") || "");
        const hd = normalizeContactFilterValue(url.searchParams.get("hd") || "");
        const sd = normalizeContactFilterValue(url.searchParams.get("sd") || "");
        const sinceHours = positiveInt(url.searchParams.get("since_hours"), 24, 24 * 30);
        const results = await queryAdminEmailContactsRouted(env.DB, { filter, q, city, hd, sd, limit, sinceHours });

        return json(req, env, { ok: true, items: results });
      }

      // Sends to any address, bypassing the consent-database lookup entirely --
      // for previewing rendering/deliverability before running a real audience
      // send. Not logged as audience activity; tagged kind=admin_test in Resend.
      if (req.method === "POST" && path === "/api/admin/emails/send-test") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const emailConfig = getAdminEmailConfig(env);
        if (!emailConfig.apiKey) return json(req, env, { error: "RESEND_API_KEY not configured" }, 503);
        if (!emailConfig.from) return json(req, env, { error: "ADMIN_EMAIL_FROM not configured" }, 503);
        if (!emailConfig.enabled) return json(req, env, { error: "ADMIN_EMAIL_ENABLED is not enabled" }, 503);

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const to = normalizeText(body.to || "").toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
          return json(req, env, { error: "A valid test recipient address is required." }, 400);
        }

        const subject = normalizeAdminEmailSubject(body.subject);
        const messageBody = normalizeAdminEmailBody(body.body);
        const emailMode = ["share", "share_with_intro"].includes(String(body.email_mode || ""))
          ? String(body.email_mode)
          : "custom";
        const shareSlug = normalizeText(body.share_slug || "");
        const shareIntroText = normalizeAdminEmailBody(body.share_intro_text || "");

        if (!subject) return json(req, env, { error: "Email subject is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (emailMode === "custom") {
          if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
          if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
        } else {
          if (!shareSlug || !SHARE_MESSAGES[shareSlug]) {
            return json(req, env, { error: "Invalid or missing share message slug." }, 400);
          }
          if (shareIntroText.length > 5000) return json(req, env, { error: "Custom intro text too long" }, 400);
        }

        const testPersonalizationSource = emailMode === "custom"
          ? `${subject}\n${messageBody}`
          : `${subject}\n${shareIntroText}\n${SHARE_MESSAGES[shareSlug]?.body_html || ""}`;
        const testFirstName = FIRST_NAME_PLACEHOLDER_RE.test(testPersonalizationSource)
          ? await lookupAdminEmailFirstName(env.DB, to)
          : "";

        // Test sends carry the same List-Unsubscribe headers as a real blast so
        // this endpoint doubles as a safe way to verify the header actually
        // appears (most mail clients expose it via "Show original"/"View
        // headers") before trusting it on a real audience.
        const testOptinToken = await createEmailOptinToken(env.DB, {
          email: to,
          emailNorm: to,
          messageSlug: emailMode !== "custom" ? shareSlug : "admin_email_test",
          batchId: "test",
        });
        const testListUnsubscribeHeaders = {
          "List-Unsubscribe": `<${testOptinToken.noUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        };
        const personalizeTest = (text) => substitutePersonalization(text, {
          firstName: testFirstName,
          optinYesUrl: testOptinToken.yesUrl,
          optinNoUrl: testOptinToken.noUrl,
        });
        const testSubject = `[TEST] ${personalizeTest(subject)}`;

        try {
          let result;
          if (emailMode !== "custom") {
            const shareMsg = SHARE_MESSAGES[shareSlug];
            const introHtml = shareIntroText
              ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">${escHtml(shareIntroText).replace(/\n/g, "<br>")}</p>\n              <hr style="margin:0 0 22px;border:0;border-top:1px solid #e5e7eb;">\n              `
              : "";
            let htmlBody = buildShareEmailHtml({
              sender_name: "Skovgard for Wyoming",
              sender_intro: shareMsg.intro(),
              body_html: introHtml + shareMsg.body_html,
              preview_text: shareMsg.preview_text,
              title: shareMsg.title,
            });
            let textBody = buildShareEmailText({
              sender_name: "Skovgard for Wyoming",
              sender_intro: shareMsg.intro(),
              slug: shareSlug,
            });
            htmlBody = personalizeTest(htmlBody);
            textBody = personalizeTest(textBody);
            const personalizedShareIntroText = personalizeTest(shareIntroText);
            const resendResult = await sendResendEmail(emailConfig.apiKey, {
              from: emailConfig.from,
              to: [to],
              reply_to: emailConfig.from,
              subject: testSubject,
              text: personalizedShareIntroText ? `${personalizedShareIntroText}\n\n${textBody}` : textBody,
              html: htmlBody,
              headers: testListUnsubscribeHeaders,
              tags: [{ name: "source", value: "admin_emails" }, { name: "kind", value: "admin_test" }],
            });
            result = { id: resendResult?.id || null };
          } else {
            result = await sendAdminOutreachEmail(
              env,
              { email: to, email_norm: to, first_name: testFirstName },
              testSubject,
              personalizeTest(messageBody),
              { batchId: "test", replyTo: emailConfig.from, headers: testListUnsubscribeHeaders }
            );
          }

          await insertAdminEmailAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "send_test_email",
            targetEmail: to,
            subject: testSubject,
            messageId: result?.id || null,
            detailsJson: JSON.stringify({ emailMode, shareSlug: shareSlug || null }),
          });

          return json(req, env, { ok: true, to, messageId: result?.id || null });
        } catch (error) {
          return json(req, env, { error: String(error?.message || error || "Test send failed") }, 500);
        }
      }

      if (req.method === "POST" && path === "/api/admin/emails/preview") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const actor = getAdminActor(req);

        const body = await req.json().catch(() => ({}));
        const filter = String(body.filter || "emailable").trim();
        const city = normalizeContactFilterValue(body.city || "");
        const hd = normalizeContactFilterValue(body.hd || "");
        const sd = normalizeContactFilterValue(body.sd || "");
        const subject = normalizeAdminEmailSubject(body.subject);
        const messageBody = normalizeAdminEmailBody(body.body);
        const emailMode = ["share", "share_with_intro"].includes(String(body.email_mode || ""))
          ? String(body.email_mode)
          : "custom";
        const shareSlug = normalizeText(body.share_slug || "");
        const shareIntroText = normalizeAdminEmailBody(body.share_intro_text || "");
        const limit = positiveInt(body.limit, 250, 250);
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const requestedRecipients = normalizeRecipientEmails(body.recipients, 251);
        const hasExplicitRecipientInput = Array.isArray(body.recipients) && body.recipients.length > 0;
        const useExplicitRecipients = requestedRecipients.length > 0;
        const mode = useExplicitRecipients ? "explicit" : "filter";

        if (!subject) return json(req, env, { error: "Email subject is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (emailMode === "custom") {
          if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
          if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
        } else {
          if (!shareSlug || !SHARE_MESSAGES[shareSlug]) {
            return json(req, env, { error: "Invalid or missing share message slug." }, 400);
          }
          if (shareIntroText.length > 5000) return json(req, env, { error: "Custom intro text too long" }, 400);
        }
        if (requestedRecipients.length > 250) {
          return json(req, env, { error: "Recipient tray is limited to 250 contacts per preview." }, 400);
        }
        if (hasExplicitRecipientInput && !useExplicitRecipients) {
          return json(req, env, { error: "Recipient tray did not include any valid email addresses." }, 400);
        }

        const audience = useExplicitRecipients
          ? await queryAdminEmailContactsByAddress(env, requestedRecipients)
          : await queryAdminEmailContactsRouted(env.DB, { filter, city, hd, sd, limit, sinceHours });
        const recipients = audience.filter((item) => String(item.email_status || "").trim() === "emailable");
        const audienceSeedEmails = useExplicitRecipients
          ? requestedRecipients
          : audience.map((item) => item.email_norm);
        const audienceCount = audienceSeedEmails.length;
        const audienceHash = await sha256Hex(audienceSeedEmails.join(","));
        const recipientHash = await sha256Hex(recipients.map((item) => item.email_norm).join(","));
        const previewRecipients = buildAdminEmailPreviewRecipients(recipients);
        const skippedCount = Math.max(0, audienceCount - recipients.length);
        const issuedAt = new Date().toISOString();
        const shareBodySeed = emailMode !== "custom"
          ? `${shareSlug}|${shareIntroText}`
          : messageBody;
        const approvalToken = await createPreviewApprovalToken(
          env,
          buildAdminEmailPreviewSeed({
            mode,
            filter,
            city,
            hd,
            sd,
            subject,
            body: `${emailMode}|${shareBodySeed}`,
            limit,
            sinceHours,
            audienceCount,
            audienceHash,
            recipientCount: recipients.length,
            recipientHash,
          }),
          issuedAt
        );

        const auditTableReady = await tableExists(env.DB, "admin_email_audit_log");
        if (auditTableReady !== false) {
          await insertAdminEmailAuditLog(env.DB, {
            actorUserId: actor.actorUserId,
            actorEmail: actor.actorEmail,
            action: "preview_audience",
            subject,
            detailsJson: JSON.stringify({
              mode,
              emailMode,
              shareSlug: shareSlug || null,
              filter,
              city,
              hd,
              sd,
              limit,
              sinceHours,
              audienceCount,
              recipientCount: recipients.length,
              skippedCount,
            }),
          }).catch(() => {});
        }

        const previewBodySummary = emailMode === "custom"
          ? messageBody
          : `[Share: ${SHARE_MESSAGES[shareSlug].title}]${shareIntroText ? `\n\nCustom intro:\n${shareIntroText}` : ""}`;

        return json(req, env, {
          ok: true,
          dryRun: true,
          mode,
          audienceCount,
          count: recipients.length,
          skippedCount,
          previewRecipients,
          preview: {
            from: String(env.ADMIN_EMAIL_FROM || "").trim() || null,
            subject,
            body: previewBodySummary,
          },
          approval: {
            issuedAt,
            token: approvalToken,
            expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
          },
        });
      }

      if (req.method === "POST" && path === "/api/admin/emails/send") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const auditTableReady = await tableExists(env.DB, "admin_email_audit_log");
        const emailConfig = getAdminEmailConfig(env);
        if (!emailConfig.apiKey) {
          return json(req, env, { error: "RESEND_API_KEY not configured" }, 503);
        }
        if (!emailConfig.from) {
          return json(req, env, { error: "ADMIN_EMAIL_FROM not configured" }, 503);
        }
        if (!emailConfig.enabled) {
          return json(req, env, { error: "ADMIN_EMAIL_ENABLED is not enabled" }, 503);
        }
        if (auditTableReady === false) {
          return json(req, env, { error: "admin_email_audit_log table missing" }, 503);
        }

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const filter = String(body.filter || "emailable").trim();
        const city = normalizeContactFilterValue(body.city || "");
        const hd = normalizeContactFilterValue(body.hd || "");
        const sd = normalizeContactFilterValue(body.sd || "");
        const subject = normalizeAdminEmailSubject(body.subject);
        const messageBody = normalizeAdminEmailBody(body.body);
        const emailMode = ["share", "share_with_intro"].includes(String(body.email_mode || ""))
          ? String(body.email_mode)
          : "custom";
        const shareSlug = normalizeText(body.share_slug || "");
        const shareIntroText = normalizeAdminEmailBody(body.share_intro_text || "");
        const limit = positiveInt(body.limit, 250, 250);
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const requestedRecipients = normalizeRecipientEmails(body.recipients, 251);
        const hasExplicitRecipientInput = Array.isArray(body.recipients) && body.recipients.length > 0;
        const useExplicitRecipients = requestedRecipients.length > 0;
        const mode = useExplicitRecipients ? "explicit" : "filter";
        const confirmed = body.confirmed === true;
        const previewToken = String(body.preview_token || "").trim();
        const previewIssuedAt = normalizePreviewIssuedAt(body.preview_issued_at);

        if (!subject) return json(req, env, { error: "Email subject is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (emailMode === "custom") {
          if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
          if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
        } else {
          if (!shareSlug || !SHARE_MESSAGES[shareSlug]) {
            return json(req, env, { error: "Invalid or missing share message slug." }, 400);
          }
          if (shareIntroText.length > 5000) return json(req, env, { error: "Custom intro text too long" }, 400);
        }
        if (requestedRecipients.length > 250) {
          return json(req, env, { error: "Recipient tray is limited to 250 contacts per send." }, 400);
        }
        if (hasExplicitRecipientInput && !useExplicitRecipients) {
          return json(req, env, { error: "Recipient tray did not include any valid email addresses." }, 400);
        }
        if (!confirmed) {
          return json(req, env, { error: "Email send requires confirmed=true" }, 400);
        }
        if (!previewToken || !previewIssuedAt) {
          return json(req, env, { error: "Run Preview again before sending." }, 400);
        }
        if (isPreviewExpired(previewIssuedAt)) {
          return json(req, env, { error: "Preview expired. Run Preview again." }, 409);
        }

        const audience = useExplicitRecipients
          ? await queryAdminEmailContactsByAddress(env, requestedRecipients)
          : await queryAdminEmailContactsRouted(env.DB, { filter, city, hd, sd, limit, sinceHours });
        const recipients = audience.filter((item) => String(item.email_status || "").trim() === "emailable");
        const audienceSeedEmails = useExplicitRecipients
          ? requestedRecipients
          : audience.map((item) => item.email_norm);
        const audienceCount = audienceSeedEmails.length;
        const audienceHash = await sha256Hex(audienceSeedEmails.join(","));
        const recipientHash = await sha256Hex(recipients.map((item) => item.email_norm).join(","));
        const skippedCount = Math.max(0, audienceCount - recipients.length);

        const sendShareBodySeed = emailMode !== "custom"
          ? `${shareSlug}|${shareIntroText}`
          : messageBody;
        const expectedPreviewToken = await createPreviewApprovalToken(
          env,
          buildAdminEmailPreviewSeed({
            mode,
            filter,
            city,
            hd,
            sd,
            subject,
            body: `${emailMode}|${sendShareBodySeed}`,
            limit,
            sinceHours,
            audienceCount,
            audienceHash,
            recipientCount: recipients.length,
            recipientHash,
          }),
          previewIssuedAt
        );
        if (!timingSafeEqual(previewToken, expectedPreviewToken)) {
          return json(req, env, { error: "Preview no longer matches this audience or email. Run Preview again." }, 409);
        }
        if (!recipients.length) {
          return json(req, env, { error: "Preview produced no sendable recipients." }, 409);
        }

        const batchId = crypto.randomUUID();
        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "send_batch_start",
          subject,
          detailsJson: JSON.stringify({
            batchId,
            mode,
            filter,
            city,
            hd,
            sd,
            audienceCount,
            recipientCount: recipients.length,
            skippedCount,
            limit,
            sinceHours,
          }),
        });

        const settled = await mapInBatches(
          recipients,
          ADMIN_EMAIL_SEND_BATCH_SIZE,
          ADMIN_EMAIL_SEND_BATCH_DELAY_MS,
          (recipient) => sendOneAdminEmail(env, {
            actor,
            batchId,
            idempotencySeed: previewToken,
            recipient,
            subject,
            emailMode,
            shareSlug,
            shareIntroText,
            messageBody,
            emailConfig,
          })
        );

        const sent = settled.filter((item) => item?.ok);
        const failed = settled.filter((item) => item && item.ok === false);

        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "send_batch_complete",
          subject,
          detailsJson: JSON.stringify({
            batchId,
            mode,
            audienceCount,
            recipientCount: recipients.length,
            sentCount: sent.length,
            failedCount: failed.length,
            skippedCount,
            deliveryMode: "staged",
            batchSize: ADMIN_EMAIL_SEND_BATCH_SIZE,
            batchDelayMs: ADMIN_EMAIL_SEND_BATCH_DELAY_MS,
          }),
        });

        return json(req, env, {
          ok: true,
          batchId,
          partial: failed.length > 0,
          audienceCount,
          attemptedCount: recipients.length,
          sentCount: sent.length,
          failedCount: failed.length,
          skippedCount,
          deliveryMode: "staged",
          batchSize: ADMIN_EMAIL_SEND_BATCH_SIZE,
          batchDelayMs: ADMIN_EMAIL_SEND_BATCH_DELAY_MS,
          sent,
          failed,
        });
      }

      // ── Email Blast (paginated, for filter audiences beyond the 250/call send cap) ──

      const EMAIL_BLAST_DEFAULT_CHUNK_SIZE = MAX_SEND_CHUNK_SIZE;

      if (req.method === "GET" && path === "/api/admin/emails/blast/audience-count") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const filter = String(url.searchParams.get("filter") || "emailable").trim();
        const city = normalizeContactFilterValue(url.searchParams.get("city") || "");
        const hd = normalizeContactFilterValue(url.searchParams.get("hd") || "");
        const sd = normalizeContactFilterValue(url.searchParams.get("sd") || "");
        const sinceHours = positiveInt(url.searchParams.get("since_hours"), 24, 24 * 30);

        const total = await countBlastAudienceTotal(env, { filter, city, hd, sd, sinceHours });
        return json(req, env, { ok: true, filter, city, hd, sd, sinceHours, total });
      }

      if (req.method === "POST" && path === "/api/admin/emails/blast/job") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const emailConfig = getAdminEmailConfig(env);
        if (!emailConfig.apiKey) return json(req, env, { error: "RESEND_API_KEY not configured" }, 503);
        if (!emailConfig.from) return json(req, env, { error: "ADMIN_EMAIL_FROM not configured" }, 503);
        if (!emailConfig.enabled) return json(req, env, { error: "ADMIN_EMAIL_ENABLED is not enabled" }, 503);
        if ((await tableExists(env.DB, "email_blast_jobs")) === false) {
          return json(req, env, { error: "email_blast_jobs table missing -- apply migrations/025_email_blast_jobs.sql first" }, 503);
        }

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const filter = String(body.filter || "emailable").trim();
        const city = normalizeContactFilterValue(body.city || "");
        const hd = normalizeContactFilterValue(body.hd || "");
        const sd = normalizeContactFilterValue(body.sd || "");
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const subject = normalizeAdminEmailSubject(body.subject);
        const messageBody = normalizeAdminEmailBody(body.body);
        const emailMode = ["share", "share_with_intro"].includes(String(body.email_mode || ""))
          ? String(body.email_mode)
          : "custom";
        const shareSlug = normalizeText(body.share_slug || "");
        const shareIntroText = normalizeAdminEmailBody(body.share_intro_text || "");
        const chunkSize = positiveInt(body.chunk_size, EMAIL_BLAST_DEFAULT_CHUNK_SIZE, MAX_SEND_CHUNK_SIZE);
        const confirmed = body.confirmed === true;

        if (!subject) return json(req, env, { error: "Email subject is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (emailMode === "custom") {
          if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
          if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
        } else {
          if (!shareSlug || !SHARE_MESSAGES[shareSlug]) {
            return json(req, env, { error: "Invalid or missing share message slug." }, 400);
          }
          if (shareIntroText.length > 5000) return json(req, env, { error: "Custom intro text too long" }, 400);
        }
        if (!confirmed) {
          return json(req, env, { error: "Blast creation requires confirmed=true -- check the audience count first." }, 400);
        }

        const jobNoGeo = !city && !hd && !sd;
        if (filter === "voter_file" && !jobNoGeo && !env.WY_DB) {
          return json(req, env, { error: "WY_DB not configured" }, 500);
        }
        const totalAudience = await countBlastAudienceTotal(env, { filter, city, hd, sd, sinceHours });
        if (totalAudience === 0) {
          return json(req, env, { error: "No recipients match this filter." }, 409);
        }

        const blastId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO email_blast_jobs
             (blast_id, filter, city, hd, sd, since_hours, subject, email_mode, share_slug,
              share_intro_text, message_body, chunk_size, total_audience, status, actor_email,
              created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'created',?14,datetime('now'),datetime('now'))`
        ).bind(
          blastId, filter, city || null, hd || null, sd || null, sinceHours, subject, emailMode,
          shareSlug || null, shareIntroText || null, messageBody || null, chunkSize, totalAudience,
          actor.actorEmail
        ).run();

        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "email_blast_created",
          subject,
          detailsJson: JSON.stringify({ blastId, filter, city, hd, sd, sinceHours, emailMode, chunkSize, totalAudience }),
        });

        return json(req, env, { ok: true, blast_id: blastId, total_audience: totalAudience, chunk_size: chunkSize });
      }

      if (req.method === "POST" && path === "/api/admin/emails/blast/send-chunk") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const emailConfig = getAdminEmailConfig(env);
        if (!emailConfig.apiKey) return json(req, env, { error: "RESEND_API_KEY not configured" }, 503);
        if (!emailConfig.from) return json(req, env, { error: "ADMIN_EMAIL_FROM not configured" }, 503);
        if (!emailConfig.enabled) return json(req, env, { error: "ADMIN_EMAIL_ENABLED is not enabled" }, 503);

        const actor = getAdminActor(req);
        const body = await req.json().catch(() => ({}));
        const blastId = normalizeText(body.blast_id || "");
        if (!blastId) return json(req, env, { error: "blast_id required" }, 400);

        const job = await env.DB.prepare(`SELECT * FROM email_blast_jobs WHERE blast_id=?1`).bind(blastId).first();
        if (!job) return json(req, env, { error: "Blast job not found" }, 404);
        if (job.status === "complete" || job.status === "cancelled") {
          return json(req, env, {
            ok: true, done: true, sent: 0, failed: 0, skipped: 0,
            total_sent: Number(job.sent_count), total_failed: Number(job.failed_count),
            total_skipped: Number(job.skipped_count), total_audience: Number(job.total_audience),
            status: job.status,
          });
        }

        const offset = Number(job.current_offset || 0);
        const chunkSize = Math.min(Number(job.chunk_size || EMAIL_BLAST_DEFAULT_CHUNK_SIZE), MAX_SEND_CHUNK_SIZE);
        const chunkNoGeo = !job.city && !job.hd && !job.sd;
        if (job.filter === "voter_file" && !chunkNoGeo && !env.WY_DB) {
          return json(req, env, { error: "WY_DB not configured" }, 500);
        }
        const chunk = await queryBlastAudienceChunk(env, {
          filter: job.filter,
          city: job.city || "",
          hd: job.hd || "",
          sd: job.sd || "",
          sinceHours: Number(job.since_hours || 24),
          limit: chunkSize,
          offset,
          blastId: job.blast_id,
        });

        if (chunk.length === 0) {
          await env.DB.prepare(
            `UPDATE email_blast_jobs SET status='complete', updated_at=datetime('now') WHERE blast_id=?1`
          ).bind(blastId).run();
          return json(req, env, {
            ok: true, done: true, sent: 0, failed: 0, skipped: 0,
            total_sent: Number(job.sent_count), total_audience: Number(job.total_audience), status: "complete",
          });
        }

        let chunkSent = 0, chunkFailed = 0, chunkSkipped = 0;
        let toSend = [];
        for (const recipient of chunk) {
          if (String(recipient.email_status || "").trim() !== "emailable") {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status) VALUES (?1,?2,?3,'skipped_suppressed')`
            ).bind(blastId, recipient.email || recipient.email_norm, recipient.email_norm).run();
            chunkSkipped++;
            continue;
          }
          const domain = String(recipient.email_norm || "").split("@")[1] || "";
          if (BLAST_CONTENT_FILTER_SKIP_DOMAINS.has(domain)) {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status) VALUES (?1,?2,?3,'skipped_content_filter')`
            ).bind(blastId, recipient.email || recipient.email_norm, recipient.email_norm).run();
            chunkSkipped++;
            continue;
          }
          if (BLAST_UNVERIFIED_SKIP_DOMAINS.has(domain)) {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status) VALUES (?1,?2,?3,'skipped_unverified')`
            ).bind(blastId, recipient.email || recipient.email_norm, recipient.email_norm).run();
            chunkSkipped++;
            continue;
          }
          toSend.push(recipient);
        }

        if (job.filter === "poll_invite_2026" && toSend.length) {
          const { withLinks, mintFailures } = await mintPollInviteLinksForChunk(env, toSend);
          for (const { recipient, error } of mintFailures) {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status, error_message) VALUES (?1,?2,?3,'failed',?4)`
            ).bind(blastId, recipient.email || recipient.email_norm, recipient.email_norm, `poll_invite_mint_failed: ${error}`).run();
            chunkFailed++;
          }
          toSend = withLinks;
        }

        const emailNormByEmail = new Map(toSend.map((r) => [r.email, r.email_norm]));

        const settled = await mapInBatches(
          toSend,
          ADMIN_EMAIL_SEND_BATCH_SIZE,
          ADMIN_EMAIL_SEND_BATCH_DELAY_MS,
          (recipient) => sendOneAdminEmail(env, {
            actor,
            batchId: blastId,
            idempotencySeed: blastId,
            recipient,
            subject: job.subject,
            emailMode: job.email_mode,
            shareSlug: job.share_slug || "",
            shareIntroText: job.share_intro_text || "",
            messageBody: job.message_body || "",
            emailConfig,
          })
        );

        for (const result of settled) {
          const emailNorm = emailNormByEmail.get(result?.email) || "";
          if (result?.ok) {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status, resend_message_id) VALUES (?1,?2,?3,'sent',?4)`
            ).bind(blastId, result.email, emailNorm, result.messageId || null).run();
            chunkSent++;
          } else if (result?.likelyAlreadySent) {
            // See sendOneAdminEmail's likelyAlreadySent comment -- Resend's
            // idempotency check rejected this as a duplicate of an already-
            // successful send. Log distinctly (not plain 'sent', so this
            // stays visible for audit) but count toward sent, not failed --
            // it is not a delivery failure.
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status, error_message) VALUES (?1,?2,?3,'sent_idempotent_conflict',?4)`
            ).bind(blastId, result?.email || "", emailNorm, result?.error || "Unknown error").run();
            chunkSent++;
          } else {
            await env.DB.prepare(
              `INSERT INTO email_blast_log (blast_id, email, email_norm, status, error_message) VALUES (?1,?2,?3,'failed',?4)`
            ).bind(blastId, result?.email || "", emailNorm, result?.error || "Unknown error").run();
            chunkFailed++;
          }
        }

        const newOffset = offset + chunk.length;
        const chunkComplete = chunk.length < chunkSize;
        const totalSentSoFar = Number(job.sent_count) + chunkSent;

        // Circuit breaker: only worth checking a job that would otherwise
        // keep running, and only once enough sends exist that a rate is
        // meaningful (a bounce in the first handful of sends is noise, not
        // signal). Rates lag real-time by however long Resend's webhook
        // delivery takes -- this chunk's own bounces/complaints usually
        // haven't arrived yet -- so this catches a job that's been
        // accumulating bad signal over several chunks, not necessarily this
        // exact one. That's an inherent property of a webhook-fed guard, not
        // a bug: the alternative is no guard at all.
        let circuitBreaker = null;
        // Complaint threshold is never overridable (see BLAST_OVERRIDE_BOUNCE_PAUSE_RATE);
        // bounce threshold uses this job's override if one was explicitly
        // set via PATCH /api/admin/emails/blast/override, else the normal default.
        const bouncePauseRate = job.bounce_pause_rate_override != null
          ? Number(job.bounce_pause_rate_override)
          : DELIVERABILITY_BOUNCE_PAUSE_RATE;
        if (!chunkComplete && totalSentSoFar >= DELIVERABILITY_MIN_SAMPLE) {
          const rates = await computeBlastJobDeliverabilityRates(env.DB, blastId, totalSentSoFar);
          if (rates.complaintRate >= DELIVERABILITY_COMPLAINT_PAUSE_RATE) {
            circuitBreaker = { tripped: true, reason: "complaint_rate", ...rates };
          } else if (rates.bounceRate >= bouncePauseRate) {
            circuitBreaker = { tripped: true, reason: "bounce_rate", pauseRateUsed: bouncePauseRate, ...rates };
          } else if (
            rates.complaintRate >= DELIVERABILITY_COMPLAINT_WARN_RATE
            || rates.bounceRate >= DELIVERABILITY_BOUNCE_WARN_RATE
          ) {
            circuitBreaker = { tripped: false, warning: true, ...rates };
          }
        }

        const autoPaused = Boolean(circuitBreaker?.tripped);
        const done = chunkComplete || autoPaused;
        const newStatus = chunkComplete ? "complete" : (autoPaused ? "paused" : "running");

        await env.DB.prepare(
          `UPDATE email_blast_jobs
           SET current_offset=?2, sent_count=sent_count+?3, failed_count=failed_count+?4,
               skipped_count=skipped_count+?5, status=?6, updated_at=datetime('now')
           WHERE blast_id=?1`
        ).bind(blastId, newOffset, chunkSent, chunkFailed, chunkSkipped, newStatus).run();

        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: autoPaused ? "email_blast_auto_paused" : "email_blast_chunk",
          subject: job.subject,
          detailsJson: JSON.stringify({ blastId, offset, chunkSent, chunkFailed, chunkSkipped, done, circuitBreaker }),
        });

        return json(req, env, {
          ok: true, done, autoPaused,
          sent: chunkSent, failed: chunkFailed, skipped: chunkSkipped,
          total_sent: totalSentSoFar,
          total_failed: Number(job.failed_count) + chunkFailed,
          total_skipped: Number(job.skipped_count) + chunkSkipped,
          total_audience: Number(job.total_audience),
          current_offset: newOffset,
          status: newStatus,
          ...(circuitBreaker ? { circuitBreaker } : {}),
        });
      }

      if (req.method === "GET" && path === "/api/admin/emails/blast/jobs") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const rows = await env.DB.prepare(
          `SELECT blast_id, filter, city, hd, sd, subject, email_mode,
                  share_slug, share_intro_text, message_body, chunk_size,
                  total_audience, current_offset, sent_count, failed_count, skipped_count,
                  status, actor_email, created_at, updated_at
             FROM email_blast_jobs
            ORDER BY datetime(created_at) DESC
            LIMIT 20`
        ).all();
        return json(req, env, { ok: true, jobs: rows.results || [] });
      }

      if (req.method === "PATCH" && path === "/api/admin/emails/blast/pause") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const body = await req.json().catch(() => ({}));
        const blastId = normalizeText(body.blast_id || "");
        if (!blastId) return json(req, env, { error: "blast_id required" }, 400);

        await env.DB.prepare(
          `UPDATE email_blast_jobs SET status='paused', updated_at=datetime('now') WHERE blast_id=?1 AND status='running'`
        ).bind(blastId).run();
        return json(req, env, { ok: true });
      }

      // PATCH /api/admin/emails/blast/override — deliberate, audited,
      // per-job opt-in to a raised bounce-rate ceiling (see
      // BLAST_OVERRIDE_BOUNCE_PAUSE_RATE above). Only touches this one job's
      // row; the global DELIVERABILITY_BOUNCE_PAUSE_RATE default, and every
      // other job's own breaker, are unaffected. Complaint-rate threshold is
      // never overridden by this endpoint.
      if (req.method === "PATCH" && path === "/api/admin/emails/blast/override") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const actor = getAdminActor(req);

        const body = await req.json().catch(() => ({}));
        const blastId = normalizeText(body.blast_id || "");
        if (!blastId) return json(req, env, { error: "blast_id required" }, 400);

        const job = await env.DB.prepare(`SELECT * FROM email_blast_jobs WHERE blast_id=?1`).bind(blastId).first();
        if (!job) return json(req, env, { error: "Blast job not found" }, 404);

        const ratesBefore = await computeBlastJobDeliverabilityRates(env.DB, blastId, Number(job.sent_count || 0));

        await env.DB.prepare(
          `UPDATE email_blast_jobs SET bounce_pause_rate_override=?2, updated_at=datetime('now') WHERE blast_id=?1`
        ).bind(blastId, BLAST_OVERRIDE_BOUNCE_PAUSE_RATE).run();

        await insertAdminEmailAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "email_blast_bounce_override",
          subject: job.subject,
          detailsJson: JSON.stringify({
            blastId,
            previousThreshold: DELIVERABILITY_BOUNCE_PAUSE_RATE,
            newThreshold: BLAST_OVERRIDE_BOUNCE_PAUSE_RATE,
            rateAtOverride: ratesBefore,
          }),
        });

        return json(req, env, {
          ok: true,
          bouncePauseRateOverride: BLAST_OVERRIDE_BOUNCE_PAUSE_RATE,
          rateAtOverride: ratesBefore,
        });
      }

      // GET /api/admin/emails/deliverability — account-wide bounce/complaint
      // rates over rolling windows, plus a per-job breakdown for the most
      // recent blasts. Reads resend_webhook_events, which every send path
      // populates via the webhook regardless of how the email was sent, so
      // this reflects real Resend-side outcomes, not just our own send logs.
      if (req.method === "GET" && path === "/api/admin/emails/deliverability") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const [window24h, window7d, window30d, recentJobs] = await Promise.all([
          computeAccountDeliverabilityRates(env.DB, 24),
          computeAccountDeliverabilityRates(env.DB, 24 * 7),
          computeAccountDeliverabilityRates(env.DB, 24 * 30),
          env.DB.prepare(
            `SELECT blast_id, filter, subject, sent_count, status, created_at
               FROM email_blast_jobs
              ORDER BY datetime(created_at) DESC
              LIMIT 10`
          ).all(),
        ]);

        const jobs = await Promise.all(
          (recentJobs.results || []).map(async (job) => {
            const rates = await computeBlastJobDeliverabilityRates(env.DB, job.blast_id, job.sent_count);
            return {
              blastId: job.blast_id,
              filter: job.filter,
              subject: job.subject,
              status: job.status,
              createdAt: job.created_at,
              sent: rates.sent,
              bounced: rates.bounced,
              complained: rates.complained,
              bounceRate: rates.bounceRate,
              complaintRate: rates.complaintRate,
              belowMinSample: rates.sent < DELIVERABILITY_MIN_SAMPLE,
            };
          })
        );

        return json(req, env, {
          ok: true,
          thresholds: {
            minSample: DELIVERABILITY_MIN_SAMPLE,
            bounceWarn: DELIVERABILITY_BOUNCE_WARN_RATE,
            bouncePause: DELIVERABILITY_BOUNCE_PAUSE_RATE,
            complaintWarn: DELIVERABILITY_COMPLAINT_WARN_RATE,
            complaintPause: DELIVERABILITY_COMPLAINT_PAUSE_RATE,
          },
          account: { window24h, window7d, window30d },
          jobs,
        });
      }

      // POST /api/admin/emails/verification/run-batch — manually triggers one
      // batch of the scheduled email-verification queue (same function the
      // Cron Trigger calls). Exists for testing a batch on demand without
      // waiting for the cron, and as a manual-recovery lever if the schedule
      // ever needs a nudge -- not part of the normal unattended flow.
      if (req.method === "POST" && path === "/api/admin/emails/verification/run-batch") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const result = await runEmailVerificationBatch(env);
        return json(req, env, result);
      }

      // GET /api/admin/emails/verification/status — queue progress + verdict
      // breakdown for the scheduled email-verification job.
      if (req.method === "GET" && path === "/api/admin/emails/verification/status") {
        if (!env.DB) return json(req, env, { error: "DB not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const row = await env.DB.prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN checked_at IS NULL THEN 1 ELSE 0 END) AS remaining,
             SUM(CASE WHEN verdict = 'good' THEN 1 ELSE 0 END) AS good,
             SUM(CASE WHEN verdict = 'risky' THEN 1 ELSE 0 END) AS risky,
             SUM(CASE WHEN verdict = 'bad' THEN 1 ELSE 0 END) AS bad,
             SUM(CASE WHEN status = 'verify_timeout' THEN 1 ELSE 0 END) AS gaveUp
           FROM email_verification_queue`
        ).first();
        return json(req, env, {
          ok: true,
          total: Number(row?.total || 0),
          remaining: Number(row?.remaining || 0),
          checked: Number(row?.total || 0) - Number(row?.remaining || 0),
          good: Number(row?.good || 0),
          risky: Number(row?.risky || 0),
          bad: Number(row?.bad || 0),
          gaveUp: Number(row?.gaveUp || 0),
        });
      }

      // ── End Email Blast ──────────────────────────────────────────────────────────

      // ------------- NEWSLETTER EMAIL SIGNUP -------------
      if (req.method === "POST" && path === "/api/newsletter/subscribe") {
        if (!env.DB) {
          return json(req, env, { error: "Database not configured" }, 500);
        }

        const b = await req.json().catch(() => ({}));

        const { raw: emailRaw, normalized: email } = normalizeEmailForStorage(b.email);
        const consentEmail = b.consent_email === true || b.consent_email === 1;
        const consentVer = String(b.consent_version || "email-v1-2026-02-19");

        // Token: prefer header (official), fallback to body for older clients
        const tsToken = (
          req.headers.get("cf-turnstile-response") ||
          String(b.turnstile_token || "")
        ).trim();

        // Server-side time trap
        const now = Date.now();
        const elapsed = getElapsedMsFromBody(b, now);
        const MIN_WAIT = 1200;
        if (elapsed > 0 && elapsed < MIN_WAIT) {
          return json(
            req,
            env,
            { error: "Please wait a moment and try again." },
            400
          );
        }

        if (!email || !/.+@.+\..+/.test(email)) {
          return json(req, env, { error: "Valid email is required" }, 400);
        }
        if (!consentEmail) {
          return json(req, env, { error: "Email consent required" }, 400);
        }

        // Bot protections
        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);

        const origin = req.headers.get("origin") || "";
        const hostHdr = req.headers.get("host") || "";
        const isLocalHost =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          hostHdr.startsWith("localhost") ||
          hostHdr.startsWith("127.0.0.1");

        const sv = isLocalHost
          ? { success: true, hostname: "localhost", action: "newsletter" }
          : await verifyTurnstile(env.TURNSTILE_SECRET, tsToken, ip);

        if (!isLocalHost && sv.hostname && !tsHostAllowed(env, sv.hostname)) {
          return json(req, env, { error: "Invalid origin" }, 400);
        }
        if (!isLocalHost && sv.action && sv.action !== "newsletter") {
          return json(req, env, { error: "Verification mismatch" }, 400);
        }
        if (!sv.success) {
          const code = String((sv["error-codes"] || [])[0] || "");
          const msg = code.includes("timeout-or-duplicate")
            ? "Verification timed out. Please try again."
            : code.includes("invalid-input-response")
            ? "Verification failed. Please refresh and try again."
            : "Verification failed";
          return json(req, env, { error: msg }, 400);
        }

        const okRl = await rateLimitOk(env, ipHash, 15, 5);
        if (!okRl) {
          return json(
            req,
            env,
            { error: "Too many requests, please try later" },
            429
          );
        }

        const ua = req.headers.get("user-agent") || "";
        await upsertNewsletterSubscriber(env.DB, {
          email: emailRaw,
          consentEmail,
          consentVersion: consentVer,
          source: "skovgard2026:updates",
          userAgent: ua,
          ipHash,
        });

        return json(req, env, { ok: true });
      }

      // ------------- ADMIN CSV EXPORTS -------------
      if (req.method === "GET" && path === "/api/admin/exports/newsletter.csv") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        if (!String(env.ADMIN_EXPORT_KEY || "").trim()) {
          return json(req, env, { error: "Admin export key not configured" }, 503);
        }
        if (!(await isAdminAuthorized(req, env, url))) {
          return json(req, env, { error: "Unauthorized" }, 401);
        }

        const columns = [
          "id",
          "email",
          "email_norm",
          "consent_email",
          "consent_version",
          "source",
          "active",
          "confirmed_at",
          "created_at",
          "updated_at",
        ];

        const { results = [] } =
          (await env.DB.prepare(
            `SELECT id, email, email_norm, consent_email, consent_version,
                    source, active, confirmed_at, created_at, updated_at
               FROM newsletter_subscribers
               ORDER BY created_at DESC`
          ).all()) || {};

        const date = new Date().toISOString().slice(0, 10);
        const csv = rowsToCsv(columns, results);
        return csvResponse(req, env, `newsletter-subscribers-${date}.csv`, csv);
      }

      if (req.method === "GET" && path === "/api/admin/exports/pulse.csv") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        if (!String(env.ADMIN_EXPORT_KEY || "").trim()) {
          return json(req, env, { error: "Admin export key not configured" }, 503);
        }
        if (!(await isAdminAuthorized(req, env, url))) {
          return json(req, env, { error: "Unauthorized" }, 401);
        }

        const columns = [
          "id",
          "first_name",
          "last_name",
          "name",
          "phone",
          "email",
          "consent",
          "consent_email",
          "wy_voter",
          "county",
          "zip",
          "consent_version",
          "source",
          "created_at",
          "address1",
          "address2",
          "city",
          "state",
          "country",
          "state_house_district",
          "state_senate_district",
        ];

        const { results = [] } =
          (await env.DB.prepare(
            `SELECT id, phone_e164, status, source, source_detail, consented_at, revoked_at,
                    first_name, last_name, email, consent_email, wy_voter, county, zip,
                    address1, address2, city, state, country,
                    state_house_district, state_senate_district,
                    consent_version, created_at
               FROM consent_status
              WHERE consent_version IS NOT NULL
               ORDER BY datetime(COALESCE(consented_at, created_at)) DESC, id DESC`
          ).all()) || {};

        const date = new Date().toISOString().slice(0, 10);
        const csv = rowsToCsv(columns, mapPulseExportRows(results));
        return csvResponse(req, env, `pulse-optins-${date}.csv`, csv);
      }

      if (
        req.method === "GET" &&
        (path === "/api/admin/exports/donations.csv" || path === "/api/admin/donations.csv")
      ) {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = await mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const columns = [
          "contribution_id",
          "contribution_created_at",
          "contribution_updated_at",
          "status",
          "election_period",
          "amount",
          "amount_cents",
          "currency",
          "payment_intent_id",
          "donor_id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "address1",
          "address2",
          "city",
          "state",
          "zip",
          "country",
          "employer",
          "occupation",
          "donor_created_at",
          "us_citizen",
          "personal_funds",
          "age_18",
          "not_federal_contractor",
          "personal_card",
          "attestation_created_at",
          "ip",
          "user_agent",
        ];

        const { results = [] } =
          (await env.DB.prepare(
            `SELECT
                c.id AS contribution_id,
                c.created_at AS contribution_created_at,
                c.updated_at AS contribution_updated_at,
                c.status,
                c.election_period,
                printf('%.2f', c.amount_cents / 100.0) AS amount,
                c.amount_cents,
                c.currency,
                c.payment_intent_id,
                d.id AS donor_id,
                d.first_name,
                d.last_name,
                d.email,
                d.phone,
                d.address1,
                d.address2,
                d.city,
                d.state,
                d.zip,
                d.country,
                d.employer,
                d.occupation,
                d.created_at AS donor_created_at,
                COALESCE(a.us_citizen, '') AS us_citizen,
                COALESCE(a.personal_funds, '') AS personal_funds,
                COALESCE(a.age_18, '') AS age_18,
                COALESCE(a.not_federal_contractor, '') AS not_federal_contractor,
                COALESCE(a.personal_card, '') AS personal_card,
                COALESCE(a.created_at, '') AS attestation_created_at,
                COALESCE(a.ip, '') AS ip,
                COALESCE(a.user_agent, '') AS user_agent
             FROM contributions c
             JOIN donors d ON d.id = c.donor_id
             LEFT JOIN contribution_attestations a ON a.contribution_id = c.id
             ORDER BY datetime(c.created_at) DESC, c.id DESC`
          ).all()) || {};

        const date = new Date().toISOString().slice(0, 10);
        return csvResponse(req, env, `stripe-donations-${date}.csv`, rowsToCsv(columns, results));
      }

      // Fallback (ensure CORS on 404)
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders(env, req),
      });
    } catch (err) {
      console.error("Worker error:", err);
      const errorMessage = String(err?.message || "");
      const isLocalDevRequest = (() => {
        try {
          const requestUrl = new URL(req.url);
          return requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
        } catch {
          return false;
        }
      })();
      if (
        isLocalDevRequest &&
        /(has no column named|no such column|no such table)/i.test(errorMessage)
      ) {
        return json(
          req,
          env,
          {
            error:
              "Local D1 schema is out of date. Run `npx wrangler d1 migrations apply ballot_sources --local` in /worker and restart Wrangler dev.",
          },
          500
        );
      }
      return json(req, env, { error: "Server error" }, 500);
    }
  },

  // Cloudflare Cron Trigger (see wrangler.toml [env.production.triggers]
  // crons). runEmailVerificationBatch's "*/2 * * * *" trigger is PAUSED as
  // of 2026-07-19 (EmailListVerify account out of credits, not being
  // topped up right now -- docs/who_needs_to_know.md §5) -- the function
  // itself is untouched so it's a one-line wrangler.toml change to resume
  // it later, it's just not wired to any cron pattern below at the moment.
  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 14 * * *") {
      ctx.waitUntil(
        runPulseFollowUpDigest(env).catch((e) => {
          console.error("scheduled pulse follow-up digest failed:", e);
        })
      );
      ctx.waitUntil(
        runEmailConsentReconciliation(env).catch((e) => {
          console.error("scheduled email consent reconciliation failed:", e);
        })
      );
      return;
    }
    if (controller.cron === "17 * * * *") {
      ctx.waitUntil(
        reconcilePendingDonations(env).catch((e) => {
          console.error("scheduled donation reconciliation failed:", e);
        })
      );
      return;
    }
    // Unrecognized cron pattern (e.g. the paused email-verification one, if
    // it's ever re-added without updating this branch) -- log, don't crash.
    console.error("scheduled(): no handler for cron pattern", controller.cron);
  },
};
