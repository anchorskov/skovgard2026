export const prerender = false;

import { env } from 'cloudflare:workers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function GET(context) {
  try {
    const key = context.request.headers.get('x-admin-key') ?? '';
    if (!timingSafeEqual(key, env.CANDIDATES_ADMIN_KEY_GUIDE ?? '')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (!env.WY_DB) return json({ error: 'WY_DB binding not found' }, 503);

    const { results } = await env.WY_DB.prepare(`
      SELECT
        c.id,
        c.full_name AS name,
        c.party,
        o.title      AS office,
        o.district,
        o.county,
        o.level,
        o.scope_kind,
        ge.status    AS guide_status,
        ge.final_score,
        ge.evidence_confidence AS guide_confidence
      FROM candidates c
      JOIN offices o ON c.office_id = o.id
      LEFT JOIN guide_endorsements ge ON ge.candidate_id = c.id
      WHERE c.full_name IS NOT NULL AND c.full_name != ''
      ORDER BY
        CASE o.level
          WHEN 'federal'       THEN 1
          WHEN 'statewide'     THEN 2
          WHEN 'state_senate'  THEN 3
          WHEN 'state_house'   THEN 4
          WHEN 'county'        THEN 5
          ELSE 6
        END,
        o.title,
        c.full_name
    `).all();

    return json(results);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
