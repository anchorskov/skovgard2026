function allowOrigin(env, req) {
  const origin = req.headers.get("origin") || "";
  const allow = (env.CORS_ORIGINS || "http://localhost:1313,https://skovgard2026.org")
    .split(",").map(s => s.trim());
  return allow.includes(origin) ? origin : "*"; // keep permissive fallback for now
}

function json(req, env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": allowOrigin(env, req),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      ...extra
    }
  });
}

async function sha256Hex(s) {
  const bytes = new TextEncoder().encode(s || "");
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(secret, token, ip) {
  if (!secret || !token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || "" })
    }).then(r => r.json());
    return !!r.success;
  } catch {
    return false;
  }
}

async function rateLimitOk(env, ipHash, windowMin = 15, maxReq = 3) {
  try {
    // table created by migration 004_rate_limit.sql
    await env.DB.prepare("INSERT INTO rl_submissions (ip_hash) VALUES (?1)").bind(ipHash).run();
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rl_submissions WHERE ip_hash=?1 AND created_at >= datetime('now', ?2)"
    ).bind(ipHash, `-${windowMin} minutes`).first();
    return (row?.n || 0) <= maxReq;
  } catch {
    // if table missing, do not block; just allow
    return true;
  }
}

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, ""); // strip trailing slash

      // CORS preflight
      if (req.method === "OPTIONS" && path.startsWith("/api")) {
        return json(req, env, {});
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
        const tsClient = Date.parse(String(b.ts_client || "")) || 0;

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

        // 1) server time trap (~1.5s since page load)
        if (!tsClient || (Date.now() - tsClient) < 1500) {
          return json(req, env, { error: "Please wait a moment and try again." }, 400);
        }

        // 2) Turnstile check
        const okTs = await verifyTurnstile(env.TURNSTILE_SECRET, tsToken, ip);
        if (!okTs) return json(req, env, { error: "Verification failed" }, 400);

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

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("Worker error:", err);
      return json(req, env, { error: "Server error" }, 500);
    }
  }
};
