// GET /api/admin/candidate-emails
// Returns all candidate email addresses for admin bulk-send use.
// Auth: CANDIDATES_ADMIN_KEY secret — passed as ?key= or Authorization: Bearer <key>
// CORS: allows skovgard2026.org so the share admin page can load this list directly.
import { env } from 'cloudflare:workers';

const CORS_ORIGIN = 'https://skovgard2026.org';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': CORS_ORIGIN,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      ...extraHeaders,
    },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function GET({ request }) {
  const url = new URL(request.url);
  const configuredKey = String(env.CANDIDATES_ADMIN_KEY || '').trim();

  if (!configuredKey) return json({ error: 'Admin key not configured on this Worker.' }, 503);

  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const queryKey = String(url.searchParams.get('key') || '').trim();
  if (!timingSafeEqual(bearer || queryKey, configuredKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = env.WY_DB;
  if (!db) return json({ error: 'Database not configured.' }, 503);

  try {
    const result = await db.prepare(
      `SELECT email, full_name
         FROM candidates
        WHERE email IS NOT NULL AND email != '' AND withdrawn_at IS NULL
        ORDER BY full_name`
    ).all();

    const rows = result?.results || [];
    const emails = rows.map(r => r.email);
    return json({ ok: true, emails, count: emails.length });
  } catch {
    return json({ error: 'Database query failed.' }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': CORS_ORIGIN,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
    },
  });
}

export function ALL() {
  return json({ error: 'Method not allowed.' }, 405);
}
