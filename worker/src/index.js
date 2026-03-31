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
  if (row?.county || row?.zip || Number(row?.wy_voter || 0) === 1) return "skovgard2026:pulse";
  if (consentVersion.startsWith("donate-")) return "skovgard2026:donate";
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
    default:
      return { clause: "1=1", bind: [] };
  }
}

async function queryAudienceContacts(db, { filter = "opted_in", q = "", limit = 250, sinceHours = 24 } = {}) {
  const normalizedFilter = String(filter || "opted_in").trim();
  const statusFilter = contactStatusWhereClause(normalizedFilter, sinceHours);
  const search = String(q || "").trim();
  const binds = [];
  let where = statusFilter.clause;

  for (const value of statusFilter.bind) binds.push(value);

  if (search) {
    binds.push(`%${search}%`);
    const idx = binds.length;
    where += ` AND (c.phone_e164 LIKE ?${idx} OR c.first_name LIKE ?${idx} OR c.last_name LIKE ?${idx})`;
  }

  binds.push(limit);
  const limitIdx = binds.length;

  const sql = `SELECT c.phone_e164, c.first_name, c.last_name, c.tags, c.welcome_sent_at,
                      cs.status, cs.source, cs.source_detail, cs.consented_at, cs.revoked_at, cs.last_inbound_keyword
                 FROM contacts c
                 LEFT JOIN consent_status cs ON cs.phone_e164 = c.phone_e164
                WHERE ${where}
                ORDER BY datetime(COALESCE(cs.updated_at, c.updated_at)) DESC
                LIMIT ?${limitIdx}`;
  return ((await db.prepare(sql).bind(...binds).all())?.results || []);
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
  filter,
  text,
  limit,
  sinceHours,
  recipientCount,
  recipientHash,
}) {
  return [
    "batch_send",
    filter,
    String(limit),
    String(sinceHours),
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
      const isLocalDev = url.hostname === "localhost" || url.hostname === "127.0.0.1";

      if (isLocalDev && !env.STRIPE_SECRET_KEY) {
        throw new Error("Missing STRIPE_SECRET_KEY for local development. Add it to worker/.dev.vars.");
      }

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
          const donorInsert = await env.DB.prepare(
            `INSERT INTO donors (first_name, last_name, email, phone, address1, address2, city, state, zip, country, employer, occupation)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
          ).bind(
            donor.first_name,
            donor.last_name,
            donor.email,
            donor.phone,
            donor.address1,
            donor.address2,
            donor.city,
            donor.state,
            donor.zip,
            donor.country,
            donor.employer,
            donor.occupation
          ).run();

          const donorId = donorInsert.meta.last_row_id;

          const contributionInsert = await env.DB.prepare(
            `INSERT INTO contributions (donor_id, amount_cents, currency, payment_intent_id, status, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)`
          ).bind(
            donorId,
            cents,
            "usd",
            stripeResult.id,
            "pending"
          ).run();

          const contributionId = contributionInsert.meta.last_row_id;

          await env.DB.prepare(
            `INSERT INTO contribution_attestations
              (contribution_id, us_citizen, personal_funds, age_18, not_federal_contractor, personal_card, ip, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
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

      // ---------------- SMS OPT-IN ----------------
      if (req.method === "POST" && path === "/api/optin") {
        const b = await req.json().catch(() => ({}));

        const firstName = String(b.first_name || "").trim();
        const lastName = String(b.last_name || "").trim();
        const zip = String(b.zip || "").replace(/\D/g, "");
        const county = String(b.county || "").trim();
        const wyVoter = b.wy_voter === true || b.wy_voter === 1;

        const phone = String(b.phone || "").replace(/[^\d]/g, "");
        const email = String(b.email || "").trim();

        const consentSMS = b.consent_sms === true || b.consent === 1;
        const consentEmail = b.consent_email === true;
        const consentVer = String(b.consent_version || "v2-2026-03-24");

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
        if (!/^\d{5}$/.test(zip))
          return json(req, env, { error: "5-digit ZIP required" }, 400);
        if (!wyVoter)
          return json(
            req,
            env,
            { error: "This SMS list is for registered Wyoming voters only." },
            400
          );
        if (!phone || phone.length < 10)
          return json(
            req,
            env,
            { error: "Valid 10-digit mobile required" },
            400
          );
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
          status: consentSMS ? "opted_in" : null,
          source: "web_form",
          sourceDetail: "pulse",
          consentedAt: consentSMS ? new Date().toISOString() : null,
          firstName,
          lastName,
          email: email || null,
          consentEmail: consentEmail ? 1 : 0,
          wyVoter: wyVoter ? 1 : 0,
          county: county || null,
          zip,
          consentVersion: consentVer,
          userAgent: ua,
          ipHash,
          overwriteProfile: true,
        });

        if (consentSMS) await maybeSendWelcomeText(env.DB, env, phone);

        return json(req, env, { ok: true });
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
          ? `SELECT 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    status, created_at AS at, updated_at, raw_json
               FROM outbound_messages
              WHERE phone_to LIKE ?1 OR phone_from LIKE ?1 OR text LIKE ?1`
          : `SELECT 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    status, created_at AS at, updated_at, raw_json
               FROM outbound_messages`;

        const inboundSql = q
          ? `SELECT 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                    direction AS status, received_at AS at, received_at AS updated_at, raw_json
               FROM inbound_messages
              WHERE phone_from LIKE ?1 OR phone_to LIKE ?1 OR text LIKE ?1`
          : `SELECT 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
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

      if (req.method === "GET" && path === "/api/admin/texting/contacts") {
        if (!env.DB) return json(req, env, { error: "Database not configured" }, 500);
        const auth = mustBeAdmin(req, env, url);
        if (!auth.ok) return auth.response;

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
        const q = String(url.searchParams.get("q") || "").trim();
        const filter = String(url.searchParams.get("filter") || "all").trim();
        const sinceHours = positiveInt(url.searchParams.get("since_hours"), 24, 24 * 30);
        const results = await queryAudienceContacts(env.DB, {
          filter,
          q,
          limit,
          sinceHours,
        });

        return json(req, env, { ok: true, items: results });
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
          `SELECT 'inbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
                  received_at AS at, raw_json, direction AS status
             FROM inbound_messages
            WHERE phone_from = ?1 OR phone_to = ?1`
        ).bind(phone).all())?.results || []);
        const outbound = ((await env.DB.prepare(
          `SELECT 'outbound' AS direction, telnyx_message_id AS message_id, phone_from, phone_to, text,
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
        const text = normalizeMessageText(body.text);
        const dryRun = body.dry_run !== false;
        const confirmed = body.confirmed === true;
        const limit = positiveInt(body.limit, 250, 250);
        const sinceHours = positiveInt(body.since_hours, 24, 24 * 30);
        const batchId = crypto.randomUUID();
        const previewToken = String(body.preview_token || "").trim();
        const previewIssuedAt = normalizePreviewIssuedAt(body.preview_issued_at);

        if (!text) return json(req, env, { error: "Message text is required" }, 400);

        const audience = await queryAudienceContacts(env.DB, {
          filter,
          q: "",
          limit,
          sinceHours,
        });
        const recipients = audience.filter((item) => String(item.status || "").trim() === "opted_in");
        const recipientHash = await sha256Hex(recipients.map((item) => item.phone_e164).join(","));
        const previewRecipients = recipients.slice(0, 10).map((item) => ({
          phone_e164: item.phone_e164,
          first_name: item.first_name,
          last_name: item.last_name,
        }));

        if (dryRun) {
          const issuedAt = new Date().toISOString();
          const approvalToken = await createPreviewApprovalToken(
            env,
            buildBatchSendPreviewSeed({
              filter,
              text,
              limit,
              sinceHours,
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
              filter,
              count: recipients.length,
              limit,
            }),
          });
          return json(req, env, {
            ok: true,
            dryRun: true,
            batchId,
            count: recipients.length,
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
            filter,
            text,
            limit,
            sinceHours,
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
        for (const recipient of recipients) {
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
        }

        await insertTextingAuditLog(env.DB, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          action: "broadcast_execute",
          detailsJson: JSON.stringify({
            batchId,
            filter,
            sent,
            failed,
          }),
        });

        return json(req, env, {
          ok: true,
          batchId,
          sentCount: sent.length,
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

      // ------------- NEWSLETTER EMAIL SIGNUP -------------
      if (req.method === "POST" && path === "/api/newsletter/subscribe") {
        if (!env.DB) {
          return json(req, env, { error: "Database not configured" }, 500);
        }

        const b = await req.json().catch(() => ({}));

        const emailRaw = String(b.email || "").trim();
        const email = emailRaw.toLowerCase();
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
        await env.DB.prepare(
          `INSERT INTO newsletter_subscribers
             (email, email_norm, consent_email, consent_version, source, active, user_agent, ip_hash, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'skovgard2026:updates', 1, ?5, ?6, datetime('now'))
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
          .bind(emailRaw, email, consentEmail ? 1 : 0, consentVer, ua, ipHash)
          .run();

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
        ];

        const { results = [] } =
          (await env.DB.prepare(
            `SELECT id, phone_e164, status, source, source_detail, consented_at, revoked_at,
                    first_name, last_name, email, consent_email, wy_voter, county, zip,
                    consent_version, created_at
               FROM consent_status
              WHERE consent_version IS NOT NULL
               ORDER BY datetime(COALESCE(consented_at, created_at)) DESC, id DESC`
          ).all()) || {};

        const date = new Date().toISOString().slice(0, 10);
        const csv = rowsToCsv(columns, mapPulseExportRows(results));
        return csvResponse(req, env, `pulse-optins-${date}.csv`, csv);
      }

      // Fallback (ensure CORS on 404)
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders(env, req),
      });
    } catch (err) {
      console.error("Worker error:", err);
      return json(req, env, { error: "Server error" }, 500);
    }
  },
};
