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

function checkAuth(request) {
  const key = request.headers.get('x-admin-key') ?? '';
  return timingSafeEqual(key, env.CANDIDATES_ADMIN_KEY_GUIDE ?? '');
}

// GET /api/admin/reference-evidence?candidate_id=X
// Returns all guide_rubric_evidence_links rows for the candidate,
// with legislation item details for rows where reference_kind='legislation'.
export async function GET(context) {
  if (!checkAuth(context.request)) return json({ error: 'Unauthorized' }, 401);

  const candidateId = new URL(context.request.url).searchParams.get('candidate_id');
  if (!candidateId) return json({ error: 'candidate_id required' }, 400);

  const db = env.WY_DB;
  if (!db) return json({ error: 'WY_DB binding not found' }, 503);

  try {
    const { results } = await db.prepare(`
      SELECT
        rel.id,
        rel.candidate_id,
        rel.category_key,
        rel.reference_kind,
        rel.reference_key,
        rel.claim_summary,
        rel.evidence_weight,
        rel.ballot_visible,
        rel.display_publicly,
        rel.verification_status,
        rel.notes,
        rel.updated_at,
        c.full_name     AS candidate_name,
        li.topic_display,
        li.source_framing,
        li.official_url
      FROM guide_rubric_evidence_links rel
      JOIN candidates c ON c.id = rel.candidate_id
      LEFT JOIN guide_legislation_items li
        ON li.ref_id = rel.reference_key AND rel.reference_kind = 'legislation'
      WHERE rel.candidate_id = ?
      ORDER BY rel.category_key, rel.reference_key
    `).bind(candidateId).all();

    return json({ evidence: results });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// POST /api/admin/reference-evidence
// Body: { id, ballot_visible, verification_status, notes }
// WORM: only updates the three editorial fields + updated_at. Never deletes rows.
export async function POST(context) {
  if (!checkAuth(context.request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { id, ballot_visible, verification_status, notes } = body;

  if (id == null) return json({ error: 'id required' }, 400);

  const VALID_STATUSES = ['draft', 'needs_official_verification', 'verified', 'do_not_publish'];
  if (verification_status != null && !VALID_STATUSES.includes(verification_status)) {
    return json({ error: `Invalid verification_status: ${verification_status}` }, 400);
  }
  if (ballot_visible != null && ballot_visible !== 0 && ballot_visible !== 1) {
    return json({ error: 'ballot_visible must be 0 or 1' }, 400);
  }

  const db = env.WY_DB;
  if (!db) return json({ error: 'WY_DB binding not found' }, 503);

  try {
    const result = await db.prepare(`
      UPDATE guide_rubric_evidence_links
      SET
        ballot_visible      = CASE WHEN ?1 IS NOT NULL THEN ?1 ELSE ballot_visible END,
        verification_status = CASE WHEN ?2 IS NOT NULL THEN ?2 ELSE verification_status END,
        notes               = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE notes END,
        updated_at          = datetime('now')
      WHERE id = ?4
    `).bind(
      ballot_visible ?? null,
      verification_status ?? null,
      notes !== undefined ? (notes || null) : null,
      id,
    ).run();

    if (result.meta.changes === 0) {
      return json({ error: `No row found with id=${id}` }, 404);
    }

    return json({ ok: true, changes: result.meta.changes });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
