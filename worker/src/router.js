import { json, ok, sha256Hex, phoneDigits } from "./util.js";

const SUBSTACK_RSS = "https://jimskovgard.substack.com/feed";
const FEED_MAX_ITEMS = 20;

function getText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function parseRSS(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    const linkM = raw.match(/<link>([^<]+)<\/link>/i) || raw.match(/<guid[^>]*>([^<]+)<\/guid>/i);
    const encM = raw.match(/<enclosure[^>]+url="([^"]+)"/i);
    const durM = raw.match(/<itunes:duration>([^<]+)<\/itunes:duration>/i);
    const desc = stripHtml(getText(raw, "description"));
    items.push({
      title: stripHtml(getText(raw, "title")),
      link: linkM ? linkM[1].trim() : "",
      date: getText(raw, "pubDate"),
      description: desc.length > 220 ? desc.slice(0, 220) + "…" : desc,
      audio: encM ? encM[1] : null,
      duration: durM ? durM[1].trim() : null,
    });
  }
  return items.filter(i => i.title && i.link).slice(0, FEED_MAX_ITEMS);
}

/** Mini router */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return json({}, 200);
    }

    if (req.method === "GET" && url.pathname === "/api/podcast-feed") {
      try {
        const upstream = await fetch(SUBSTACK_RSS, {
          headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
          cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (!upstream.ok) return json({ error: "Feed unavailable" }, 502);
        const xml = await upstream.text();
        const episodes = parseRSS(xml);
        return new Response(JSON.stringify({ episodes }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
            "access-control-allow-origin": "*",
          },
        });
      } catch (e) {
        return json({ error: "Failed to fetch feed" }, 500);
      }
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
