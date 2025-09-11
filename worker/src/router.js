import { json, ok, sha256Hex, phoneDigits } from "./util.js";

/** Mini router */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return json({}, 200);
    }

    if (req.method === "POST" && url.pathname === "/api/optin") {
      try {
        const body = await req.json().catch(() => ({}));
        const name   = (body.name || "").trim();
        const phone  = phoneDigits(body.phone);
        const consent = body.consent === true || body.consent === 1 ? 1 : 0;
        const consentVersion = (body.consent_version || "v1-2025-09-08").trim();
        const source = "pulse";

        if (!phone || phone.length < 10) return json({ error: "Invalid phone" }, 400);
        if (!consent) return json({ error: "Consent required" }, 400);

        const ua = req.headers.get("user-agent") || "";
        const ip = req.headers.get("cf-connecting-ip") || "";
        const ipHash = await sha256Hex(ip);

        await env.DB.prepare(
          `INSERT INTO sms_optins (name, phone, consent, consent_version, source, user_agent, ip_hash)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(phone) DO UPDATE SET
             name=excluded.name,
             consent=excluded.consent,
             consent_version=excluded.consent_version,
             source=excluded.source,
             user_agent=excluded.user_agent,
             ip_hash=excluded.ip_hash`
        ).bind(name, phone, consent, consentVersion, source, ua, ipHash).run();

        return ok();
      } catch (e) {
        return json({ error: "Server error" }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  }
}
