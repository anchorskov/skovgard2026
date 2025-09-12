// --- CORS helpers ------------------------------------------------------------
function allowOrigin(env, req) {
  const origin = req.headers.get("origin") || "";
  const allow = (env.CORS_ORIGINS
      || "http://localhost:1313,https://skovgard2026.org,https://www.skovgard2026.org,https://skovgard2026.pages.dev")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return allow.includes(origin) ? origin : "";
}

function corsHeaders(env, req) {
  const originHeader = allowOrigin(env, req);
  const base = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, cf-turnstile-response",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
  return originHeader ? { "access-control-allow-origin": originHeader, ...base } : base;
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
async function sha256Hex(s) {
  const bytes = new TextEncoder().encode(s || "");
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Cloudflare Turnstile: server-side validation (returns full response)
async function verifyTurnstile(secret, token, ip) {
  if (!secret || !token) return { success: false, "error-codes": ["missing-secret-or-token"] };
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || "" }),
    }).then(r => r.json());
    // r: { success, challenge_ts, hostname, action?, "error-codes"? }
    return r;
  } catch {
    return { success: false, "error-codes": ["fetch-error"] };
  }
}

// Validate Turnstile-reported hostname against allow-list
// Normalize the Turnstile-reported hostname and allow a simple list.
// (strip any :port, compare against env list)
function tsHostAllowed(env, h) {
  const base = String(h || "").trim().split(":")[0];  // <-- normalize
  if (!base) return true; // if Turnstile didn't return a host, don't fail hard
  const list = String(env.TS_ALLOWED_HOSTNAMES || "skovgard2026.org,www.skovgard2026.org,localhost,127.0.0.1,skovgard2026.pages.dev")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list.includes(base);
}

// Simple IP-based rate limiting; soft-fails open if table missing
async function rateLimitOk(env, ipHash, windowMin = 15, maxReq = 3) {
  try {
    // table created by migration 004_rate_limit.sql
    await env.DB.prepare("INSERT INTO rl_submissions (ip_hash) VALUES (?1)").bind(ipHash).run();
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rl_submissions WHERE ip_hash=?1 AND created_at >= datetime('now', ?2)"
    ).bind(ipHash, `-${windowMin} minutes`).first();
    return (row?.n || 0) <= maxReq;
  } catch {
    return true;
  }
}

// --- Worker ------------------------------------------------------------------
export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, ""); // strip trailing slash

      // CORS preflight
      if (req.method === "OPTIONS" && path.startsWith("/api")) {
        return new Response(null, { status: 204, headers: corsHeaders(env, req) });
      }

      // Health check
      if (req.method === "GET" && path === "/api/health") {
        return json(req, env, { ok: true, d1Bound: Boolean(env.DB) });
      }

      // ---------------- SMS OPT-IN ----------------
      if (req.method === "POST" && path === "/api/optin") {
        const b = await req.json().catch(() => ({}));

        const firstName = String(b.first_name || "").trim();
        const lastName  = String(b.last_name  || "").trim();
        const zip       = String(b.zip || "").replace(/\D/g, "");
        const county    = String(b.county || "").trim();
        const wyVoter   = b.wy_voter === true || b.wy_voter === 1;

        const phone     = String(b.phone || "").replace(/[^\d]/g, "");
        const email     = String(b.email || "").trim();

        const consentSMS   = b.consent_sms === true || b.consent === 1;
        const consentEmail = b.consent_email === true;
        const consentVer   = String(b.consent_version || "v1-2025-09-08");

        const tsToken  = String(b.turnstile_token || "");

        // Robust parse for ts_client:
        // - number (epoch ms)
        // - 13-digit numeric string (epoch ms)
        // - 10-digit numeric string (epoch s) -> convert to ms
        // - ISO date string

      function parseClientEpochMs(raw, now = Date.now()) {
        // Accept: number (ms), "###########" ms, "##########" s, ISO-like
        let ms = 0;

        if (typeof raw === 'number' && Number.isFinite(raw)) {
          ms = Math.trunc(raw);
        } else if (typeof raw === 'string') {
          if (/^\d{13}$/.test(raw))        ms = parseInt(raw, 10);
          else if (/^\d{10}$/.test(raw))   ms = parseInt(raw, 10) * 1000;
          else {
            const d = Date.parse(raw);
            if (Number.isFinite(d)) ms = d;
          }
        }

        // Clamp to a sane window to avoid bogus values
        // Reject if more than 5 minutes in the future or older than 7 days
        const FIVE_MIN = 5 * 60 * 1000;
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        if (!ms) return 0;
        if (ms > now + FIVE_MIN) return 0;
        if (now - ms > SEVEN_DAYS) return 0;

        return ms;
      }

      function getElapsedMsFromBody(b, now = Date.now()) {
        const startMs   = Number(b.ts_start_ms) || 0;
        const elapsedMs = Number(b.ts_elapsed_ms) || 0;

        // Preferred: explicit elapsed from client
        if (elapsedMs > 0) return elapsedMs;

        // Fallback: compute from client start timestamp
        if (startMs > 0) {
          const diff = now - startMs;
          return diff > 0 ? diff : 0;
        }

        // Legacy fallback: ts_client. Use only if older clients sent a true page-start.
        const tsClient = parseClientEpochMs(b.ts_client, now);
        return tsClient > 0 ? (now - tsClient) : 0;
      }

        /// … inside your /api/optin handler:
        const now = Date.now();
        const elapsed = getElapsedMsFromBody(b, now); // <-- use b

        // Enforce server-side minimum wait only if we have a credible elapsed
        const MIN_WAIT = 1200; // must match browser check
        if (elapsed > 0 && elapsed < MIN_WAIT) {
          return json(req, env, { error: "Please wait a moment and try again." }, 400); // <-- use json helper
        }

        // Required fields
        if (!firstName) return json(req, env, { error: "First name is required" }, 400);
        if (!lastName)  return json(req, env, { error: "Last name is required" }, 400);
        if (!/^\d{5}$/.test(zip)) return json(req, env, { error: "5-digit ZIP required" }, 400);
        if (!wyVoter)   return json(req, env, { error: "This SMS list is for registered Wyoming voters only." }, 400);
        if (!phone || phone.length < 10) return json(req, env, { error: "Valid 10-digit mobile required" }, 400);
        if (!consentSMS) return json(req, env, { error: "SMS consent required" }, 400);

        // Bot protections
        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);

        // 1) server time trap (shorter in local/dev)
        // Optional: enforce allowed hostnames from TS_ALLOWED_HOSTNAMES
        // but don't block local dev (localhost/127.x).
        const origin  = req.headers.get("origin") || "";
        const hostHdr = req.headers.get("host") || "";
        const isLocalHost =
          origin.includes("localhost") || origin.includes("127.0.0.1") ||
          hostHdr.startsWith("localhost") || hostHdr.startsWith("127.0.0.1");

        // 2) Turnstile check (+ optional assertions)
        const sv = await verifyTurnstile(env.TURNSTILE_SECRET, tsToken, ip);

        // Temporary logging while stabilizing; remove later
        console.log("turnstile", {
          success: sv.success,
          hostname: sv.hostname,
          action: sv.action,
          ts: sv.challenge_ts,
          errors: sv["error-codes"],
        });

        // Optional: enforce allowed hostnames from TS_ALLOWED_HOSTNAMES
        if (!isLocalHost && sv.hostname && !tsHostAllowed(env, sv.hostname)) {
          console.log("Turnstile hostname rejected:", sv.hostname);
          return json(req, env, { error: "Invalid origin" }, 400);
        }

        if (!sv.success) {
          const code = String((sv["error-codes"] || [])[0] || "");
          const msg =
            code.includes("timeout-or-duplicate")   ? "Verification timed out. Please try again." :
            code.includes("invalid-input-response") ? "Verification failed. Please refresh and try again." :
            "Verification failed";
          return json(req, env, { error: msg }, 400);
        }

        // If you set data-action="optin" on the widget, assert it here
        if (sv.action && sv.action !== "optin") {
          return json(req, env, { error: "Verification mismatch" }, 400);
        }

        // 3) IP rate limiting
        const okRl = await rateLimitOk(env, ipHash, 15, 3);
        if (!okRl) return json(req, env, { error: "Too many requests, please try later" }, 429);

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
        ).bind(
          firstName, lastName,
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
        ).run();

        return json(req, env, { ok: true });
      }

      // Fallback (ensure CORS on 404)
      return new Response("Not found", { status: 404, headers: corsHeaders(env, req) });
    } catch (err) {
      console.error("Worker error:", err);
      return json(req, env, { error: "Server error" }, 500);
    }
  },
};