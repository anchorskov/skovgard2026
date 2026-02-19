// worker/src/index.js
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
    "access-control-allow-headers": "content-type, cf-turnstile-response",
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
  async fetch(req, env) {
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

        await env.DB.prepare(
          `INSERT INTO sms_optins
             (first_name, last_name, name, phone, email, consent, consent_email,
              consent_version, source, user_agent, ip_hash)
           VALUES (?1, ?2, TRIM(?1||' '||?2), ?3, ?4, ?5, ?6,
                   ?7, 'skovgard2026:donate', ?8, ?9)
           ON CONFLICT(phone) DO UPDATE SET
             first_name=excluded.first_name,
             last_name =excluded.last_name,
             name      =excluded.name,
             email     =excluded.email,
             consent   =excluded.consent,
             consent_version=excluded.consent_version,
             source    =excluded.source,
             user_agent=excluded.user_agent,
             ip_hash   =excluded.ip_hash`
        )
          .bind(
            firstName,
            lastName,
            phone,
            email || null,
            consentSMS ? 1 : 0,
            0,
            consentVersion,
            ua,
            ipHash
          )
          .run();

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
        const consentVer = String(b.consent_version || "v1-2025-09-08");

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
        if (!consentSMS)
          return json(req, env, { error: "SMS consent required" }, 400);

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

        // Insert/update
        const ua = req.headers.get("user-agent") || "";
        await env.DB.prepare(
          `INSERT INTO sms_optins
             (first_name, last_name, name, phone, email, consent, consent_email,
              wy_voter, county, zip, consent_version, source, user_agent, ip_hash)
           VALUES (?1, ?2, TRIM(?1||' '||?2), ?3, ?4, ?5, ?6,
                   ?7, ?8, ?9, ?10, 'skovgard2026:pulse', ?11, ?12)
           ON CONFLICT(phone) DO UPDATE SET
             first_name=excluded.first_name,
             last_name =excluded.last_name,
             name      =excluded.name,
             email     =excluded.email,
             consent   =excluded.consent,
             consent_email=excluded.consent_email,
             wy_voter  =excluded.wy_voter,
             county    =excluded.county,
             zip       =excluded.zip,
             consent_version=excluded.consent_version,
             source    =excluded.source,
             user_agent=excluded.user_agent,
             ip_hash   =excluded.ip_hash`
        )
          .bind(
            firstName,
            lastName,
            phone,
            email || null,
            consentSMS ? 1 : 0,
            consentEmail ? 1 : 0,
            wyVoter ? 1 : 0,
            county || null,
            zip,
            consentVer,
            ua,
            ipHash
          )
          .run();

        return json(req, env, { ok: true });
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
