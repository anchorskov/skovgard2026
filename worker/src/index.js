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
  upsertConsentStatus,
  verifyTelnyxSignature,
} from "./telnyx.js";
import {
  getAdminEmailConfig,
  insertAdminEmailAuditLog,
  sendAdminOutreachEmail,
} from "./admin-email.js";
import { sendPulseOptInEmails } from "./pulse-email.js";
import { sendResendEmail } from "./resend.js";
import { buildShareEmailHtml, buildShareEmailText, SHARE_MESSAGES } from "./email-template.js";

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

async function findUniqueWyTargetMatch(wyDb, input) {
  const firstName = normalizeLookupText(input.firstName);
  const lastName = normalizeLookupText(input.lastName);
  const city = normalizeLookupText(input.city);
  const zip = normalizeZip5(input.zip);
  const address1 = normalizeLookupText(input.address1);

  if (!firstName || !lastName || !city || !zip) {
    return { match: null, mode: "missing_lookup_fields" };
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
      LIMIT 2`
    )
      .bind(firstName, lastName, city, zip, address1)
      .all()
      .then((result) => result?.results || [])
      .catch(() => []);

    if (addressRows.length === 1) {
      return { match: addressRows[0], mode: "name_city_zip_address" };
    }
    if (addressRows.length > 1) {
      return { match: null, mode: "ambiguous_address" };
    }
  }

  const rows = await wyDb.prepare(`${baseSql} LIMIT 2`)
    .bind(firstName, lastName, city, zip)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);

  if (rows.length === 1) {
    return { match: rows[0], mode: "name_city_zip" };
  }
  if (rows.length > 1) {
    return { match: null, mode: "ambiguous_name_city_zip" };
  }
  return { match: null, mode: "no_match" };
}

async function syncSubmittedPhoneToWyVoter(env, input) {
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

  const { match, mode } = await findUniqueWyTargetMatch(wyDb, input);
  if (!match?.voter_id) {
    return { ok: false, skipped: mode };
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
    return {
      ok: false,
      skipped: "phone_belongs_to_other_voter",
      voterId: match.voter_id,
    };
  }

  const isWyArea = phone10.startsWith("307") ? 1 : 0;
  const confidenceCode = 5;
  const source = "skovgard_optin";

  await wyDb.prepare(
    `INSERT INTO voter_phones
       (voter_id, phone10, phone_e164, confidence_code, is_wy_area, source, imported_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
     ON CONFLICT(voter_id, phone10) DO UPDATE SET
       phone_e164 = excluded.phone_e164,
       confidence_code = MAX(COALESCE(voter_phones.confidence_code, 0), excluded.confidence_code),
       is_wy_area = excluded.is_wy_area,
       source = excluded.source,
       imported_at = datetime('now')`
  )
    .bind(match.voter_id, phone10, phoneE164, confidenceCode, isWyArea, source)
    .run();

  await wyDb.prepare(
    `INSERT INTO v_best_phone
       (voter_id, phone_e164, confidence_code, is_wy_area, imported_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT(voter_id) DO UPDATE SET
       phone_e164 = excluded.phone_e164,
       confidence_code = excluded.confidence_code,
       is_wy_area = excluded.is_wy_area,
       imported_at = datetime('now')`
  )
    .bind(match.voter_id, phoneE164, confidenceCode, isWyArea)
    .run();

  return {
    ok: true,
    voterId: match.voter_id,
    matchedBy: mode,
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

function isAdminAuthorized(req, env, url) {
  const configured = String(env.ADMIN_EXPORT_KEY || "").trim();
  if (!configured) return false;
  const bearer = getAdminBearerToken(req);
  const query = String(url.searchParams.get("key") || "").trim();
  const provided = bearer || query;
  return timingSafeEqual(provided, configured);
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
                                           0 AS is_volunteer,
                                           0 AS has_profile
                                      FROM newsletter_subscribers ns
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

async function queryAdminEmailContacts(
  db,
  {
    filter = "emailable",
    q = "",
    city = "",
    hd = "",
    sd = "",
    limit = 250,
    sinceHours = 24,
  } = {}
) {
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
    where += ` AND LOWER(TRIM(COALESCE(state_house_district, ''))) = LOWER(TRIM(?${idx}))`;
  }

  if (sdFilter) {
    binds.push(sdFilter);
    const idx = binds.length;
    where += ` AND LOWER(TRIM(COALESCE(state_senate_district, ''))) = LOWER(TRIM(?${idx}))`;
  }

  binds.push(limit);
  const limitIdx = binds.length;

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
                 ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, email_norm ASC
                 LIMIT ?${limitIdx}`;
  return ((await db.prepare(sql).bind(...binds).all())?.results || []);
}

async function queryAdminEmailContactsByAddress(db, emailList = []) {
  const emails = normalizeRecipientEmails(emailList);
  if (!emails.length) return [];

  const placeholders = emails.map((_value, index) => `?${index + 1}`).join(", ");
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
  const results = ((await db.prepare(sql).bind(...emails).all())?.results || []);
  const byEmail = new Map(results.map((item) => [item.email_norm, item]));
  return emails.map((email) => byEmail.get(email)).filter(Boolean);
}

async function queryAdminEmailContactCounts(db) {
  const row = await db.prepare(
    `${ADMIN_EMAIL_CONTACTS_CTE}
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN email_status = 'emailable' THEN 1 ELSE 0 END) AS emailable_count,
             SUM(CASE WHEN email_status = 'inactive' THEN 1 ELSE 0 END) AS inactive_count,
             SUM(CASE WHEN email_status = 'no_consent' THEN 1 ELSE 0 END) AS no_consent_count,
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

function mustBeAdmin(req, env, url) {
  if (!String(env.ADMIN_EXPORT_KEY || "").trim()) {
    return { ok: false, response: json(req, env, { error: "Admin export key not configured" }, 503) };
  }
  if (!isAdminAuthorized(req, env, url)) {
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
const ADMIN_EMAIL_SEND_BATCH_SIZE = 1;
const ADMIN_EMAIL_SEND_BATCH_DELAY_MS = 340;
const ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT = 2;
const ADMIN_EMAIL_RATE_LIMIT_FALLBACK_MS = 1500;

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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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

              await sendResendEmail(env.RESEND_API_KEY, {
                from: "Skovgard 2026 <" + fromAddr + ">",
                to: ["donate@grassrootsmvt.org"],
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
        if (!isNonEmpty(address1))
          return json(req, env, { error: "Street address is required" }, 400);
        if (!isNonEmpty(city))
          return json(req, env, { error: "City is required" }, 400);
        if (state !== "WY")
          return json(
            req,
            env,
            { error: "This SMS list is for Wyoming addresses only." },
            400
          );
        if (!/^\d{5}$/.test(zip))
          return json(req, env, { error: "5-digit ZIP required" }, 400);
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
          `SELECT status, consent_email, wy_voter
             FROM consent_status
            WHERE phone_e164 = ?1`
        )
          .bind(phoneE164)
          .first()
          .catch(() => null);

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
          return json(req, env, { error: "Invalid origin" }, 400);
        }
        if (!isLocalHost && sv.action && sv.action !== "optin") {
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

        // Rate limiting
        const okRl = await rateLimitOk(env, ipHash, 15, 3);
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

        if (ctx?.waitUntil) {
          ctx.waitUntil(
            syncSubmittedPhoneToWyVoter(env, {
              phone,
              firstName,
              lastName,
              address1,
              city,
              zip,
            }).then((result) => {
              if (result?.ok) {
                console.log("[/api/optin] mirrored phone to WY voter", {
                  voterId: result.voterId,
                  matchedBy: result.matchedBy,
                });
                return;
              }
              if (result?.skipped && result.skipped !== "missing_binding" && result.skipped !== "missing_wy_tables") {
                console.log("[/api/optin] skipped WY phone mirror", {
                  reason: result.skipped,
                });
              }
            }).catch((error) => {
              console.error("[/api/optin] WY phone mirror failed", String(error?.message || error));
            })
          );
        }

        const pulseWelcomeWork = maybeSendWelcomeText(
          env.DB,
          env,
          phone,
          pulseWelcomeConfig(env)
        ).catch((error) => {
          console.error("[/api/optin] pulse welcome text failed", String(error?.message || error));
          return null;
        });
        if (ctx?.waitUntil) {
          ctx.waitUntil(pulseWelcomeWork);
        } else {
          await pulseWelcomeWork;
        }

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

        return json(req, env, { ok: true });
      }

      // POST /api/share — visitor-initiated "share with a friend" sends
      if (req.method === "POST" && path === "/api/share") {
        const shareEnabled = String(env.SHARE_ENABLED || "0") === "1";
        const apiKey = String(env.RESEND_API_KEY || "").trim();
        const fromAddr = String(env.ADMIN_EMAIL_FROM || "").trim();

        if (!shareEnabled || !apiKey || !fromAddr) {
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
        const isAdminSend = adminKey && String(b.admin_key || "").trim() === adminKey;

        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);
        if (!isAdminSend && env.DB) {
          try {
            const rlRow = await env.DB.prepare(
              "SELECT COUNT(*) AS n FROM share_sends WHERE sender_ip_hash = ?1 AND created_at >= datetime('now', '-60 minutes')"
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

        const messageSlug = String(b.message_slug || "jimmys-story").trim();
        const msg = SHARE_MESSAGES[messageSlug];
        if (!msg) {
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

        const senderIntro = msg.intro(senderName);
        const subject     = msg.subject(senderName);

        const htmlBody = buildShareEmailHtml({
          sender_name:  senderName,
          sender_intro: senderIntro,
          body_html:    msg.body_html,
          preview_text: msg.preview_text,
          title:        msg.title,
        });
        const textBody = buildShareEmailText({
          sender_name:  senderName,
          sender_intro: senderIntro,
          slug:         messageSlug,
        });

        const sends = recipients.map((to) =>
          sendResendEmail(apiKey, {
            from: fromAddr,
            to: [to],
            subject,
            text: textBody,
            html: htmlBody,
            reply_to: fromAddr,
            tags: [
              { name: "source", value: "share" },
              { name: "kind", value: "friend_share" },
            ],
          })
            .then((res) => ({ ok: true,  email: to, resendId: res?.id || null }))
            .catch((err) => ({ ok: false, email: to, error: String(err?.message || err) }))
        );

        const results = await Promise.all(sends);
        const sent   = results.filter((r) => r.ok).length;
        const failed = results.length - sent;

        // Persist every send attempt — audit log + rate-limit source
        if (env.DB) {
          const logWork = Promise.all(
            results.map((r) =>
              env.DB.prepare(
                `INSERT INTO share_sends
                   (message_slug, recipient_email, sender_name, sender_ip_hash,
                    resend_message_id, status, error_message)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
              )
                .bind(
                  messageSlug,
                  r.email,
                  senderName || null,
                  ipHash,
                  r.resendId || null,
                  r.ok ? "sent" : "failed",
                  r.ok ? null : (r.error || null)
                )
                .run()
                .catch(() => {})
            )
          );
          if (ctx?.waitUntil) ctx.waitUntil(logWork);
          else await logWork;
        }

        if (sent === 0) {
          return json(req, env, { error: "Failed to send. Please try again shortly." }, 500);
        }

        const failedEmails = results.filter(r => !r.ok).map(r => r.email);
        return json(req, env, { ok: true, sent, failed, failed_emails: failedEmails });
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

      // GET /api/admin/share/audit — share send log with optional filters
      if (req.method === "GET" && path === "/api/admin/share/audit") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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

      if (req.method === "POST" && path === "/api/admin/texting/contacts/delete") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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
        const text = normalizeMessageText(body.text);
        const dryRun = body.dry_run === true || body.preview === true;
        const previewToken = String(body.preview_token || "").trim();
        const previewIssuedAt = normalizePreviewIssuedAt(body.preview_issued_at);

        if (!to) return json(req, env, { error: "Valid E.164 destination required" }, 400);
        if (!text) return json(req, env, { error: "Message text is required" }, 400);
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

      if (req.method === "POST" && path === "/api/admin/texting/send-batch") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
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
        const skippedCount = Math.max(0, audienceCount - recipients.length);

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
          }),
          previewIssuedAt
        );
        if (!timingSafeEqual(previewToken, expectedPreviewToken)) {
          return json(req, env, { error: "Broadcast preview no longer matches this audience or message. Run Preview again." }, 409);
        }

        const sent = [];
        const failed = [];
        for (let smsIdx = 0; smsIdx < recipients.length; smsIdx++) {
          const recipient = recipients[smsIdx];
          try {
            const telnyx = await sendSmsWithTelnyx({
              apiKey: env.TELNYX_API_KEY,
              fromNumber: String(env.TELNYX_FROM_NUMBER || "").trim(),
              to: recipient.phone_e164,
              text,
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
                text,
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
          if (smsIdx < recipients.length - 1) {
            await sleep(340);
          }
        }

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
            sent,
            failed,
          }),
        });

        return json(req, env, {
          ok: true,
          batchId,
          mode,
          audienceCount,
          sentCount: sent.length,
          skippedCount,
          failedCount: failed.length,
          sent,
          failed,
        });
      }

      if (req.method === "GET" && path === "/api/admin/texting/contacts.csv") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
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
        const auth = mustBeAdmin(req, env, url);
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

      if (req.method === "GET" && path === "/api/admin/emails/status") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
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
          adminEmailFrom: Boolean(String(env.ADMIN_EMAIL_FROM || "").trim()),
          adminEmailEnabled: String(env.ADMIN_EMAIL_ENABLED || "0") === "1",
          d1: Boolean(env.DB),
        };
        const tables = {
          newsletter_subscribers: await tableExists(env.DB, "newsletter_subscribers"),
          consent_status: await tableExists(env.DB, "consent_status"),
          admin_email_audit_log: await tableExists(env.DB, "admin_email_audit_log"),
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
        const auth = mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 5000);
        const q = String(url.searchParams.get("q") || "").trim();
        const filter = String(url.searchParams.get("filter") || "emailable").trim();
        const city = normalizeContactFilterValue(url.searchParams.get("city") || "");
        const hd = normalizeContactFilterValue(url.searchParams.get("hd") || "");
        const sd = normalizeContactFilterValue(url.searchParams.get("sd") || "");
        const sinceHours = positiveInt(url.searchParams.get("since_hours"), 24, 24 * 30);
        const results = await queryAdminEmailContacts(env.DB, {
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

      if (req.method === "POST" && path === "/api/admin/emails/preview") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;
        const actor = getAdminActor(req);

        const body = await req.json().catch(() => ({}));
        const filter = String(body.filter || "emailable").trim();
        const city = normalizeContactFilterValue(body.city || "");
        const hd = normalizeContactFilterValue(body.hd || "");
        const sd = normalizeContactFilterValue(body.sd || "");
        const subject = normalizeAdminEmailSubject(body.subject);
        const messageBody = normalizeAdminEmailBody(body.body);
        const limit = positiveInt(body.limit, 250, 250);
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const requestedRecipients = normalizeRecipientEmails(body.recipients, 251);
        const hasExplicitRecipientInput = Array.isArray(body.recipients) && body.recipients.length > 0;
        const useExplicitRecipients = requestedRecipients.length > 0;
        const mode = useExplicitRecipients ? "explicit" : "filter";

        if (!subject) return json(req, env, { error: "Email subject is required" }, 400);
        if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
        if (requestedRecipients.length > 250) {
          return json(req, env, { error: "Recipient tray is limited to 250 contacts per preview." }, 400);
        }
        if (hasExplicitRecipientInput && !useExplicitRecipients) {
          return json(req, env, { error: "Recipient tray did not include any valid email addresses." }, 400);
        }

        const audience = useExplicitRecipients
          ? await queryAdminEmailContactsByAddress(env.DB, requestedRecipients)
          : await queryAdminEmailContacts(env.DB, {
              filter,
              q: "",
              city,
              hd,
              sd,
              limit,
              sinceHours,
            });
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
        const approvalToken = await createPreviewApprovalToken(
          env,
          buildAdminEmailPreviewSeed({
            mode,
            filter,
            city,
            hd,
            sd,
            subject,
            body: messageBody,
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
            body: messageBody,
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
        const auth = mustBeAdmin(req, env, url);
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
        if (!messageBody) return json(req, env, { error: "Email body is required" }, 400);
        if (subject.length > 180) return json(req, env, { error: "Email subject too long" }, 400);
        if (messageBody.length > 20000) return json(req, env, { error: "Email body too long" }, 400);
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
          ? await queryAdminEmailContactsByAddress(env.DB, requestedRecipients)
          : await queryAdminEmailContacts(env.DB, {
              filter,
              q: "",
              city,
              hd,
              sd,
              limit,
              sinceHours,
            });
        const recipients = audience.filter((item) => String(item.email_status || "").trim() === "emailable");
        const audienceSeedEmails = useExplicitRecipients
          ? requestedRecipients
          : audience.map((item) => item.email_norm);
        const audienceCount = audienceSeedEmails.length;
        const audienceHash = await sha256Hex(audienceSeedEmails.join(","));
        const recipientHash = await sha256Hex(recipients.map((item) => item.email_norm).join(","));
        const skippedCount = Math.max(0, audienceCount - recipients.length);

        const expectedPreviewToken = await createPreviewApprovalToken(
          env,
          buildAdminEmailPreviewSeed({
            mode,
            filter,
            city,
            hd,
            sd,
            subject,
            body: messageBody,
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
          async (recipient) => {
            const idempotencyKey = await sha256Hex([
              "admin_email_send",
              previewToken,
              recipient.email_norm,
            ].join("|"));

            let attempt = 0;
            while (attempt <= ADMIN_EMAIL_RATE_LIMIT_RETRY_LIMIT) {
              attempt += 1;
              try {
                const result = await sendAdminOutreachEmail(
                  env,
                  recipient,
                  subject,
                  messageBody,
                  {
                    batchId,
                    idempotencyKey,
                    replyTo: emailConfig.from,
                  }
                );
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
        if (!isAdminAuthorized(req, env, url)) {
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
        if (!isAdminAuthorized(req, env, url)) {
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
        const auth = mustBeAdmin(req, env, url);
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
};
