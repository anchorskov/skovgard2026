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

// GET /api/admin/rubric?candidate_id=X — load existing scores + sources
export async function GET(context) {
  if (!checkAuth(context.request)) return json({ error: 'Unauthorized' }, 401);

  const candidateId = new URL(context.request.url).searchParams.get('candidate_id');
  if (!candidateId) return json({ error: 'candidate_id required' }, 400);

  const db = env.WY_DB;
  try {
    const [{ results: scores }, { results: sources }, endorsement] = await Promise.all([
      db.prepare('SELECT * FROM guide_rubric_scores WHERE candidate_id = ? ORDER BY id').bind(candidateId).all(),
      db.prepare('SELECT * FROM guide_sources WHERE candidate_id = ? ORDER BY source_number').bind(candidateId).all(),
      db.prepare('SELECT * FROM guide_endorsements WHERE candidate_id = ?').bind(candidateId).first(),
    ]);
    return json({ scores, sources, endorsement: endorsement ?? null });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// POST /api/admin/rubric — save / update scores for a candidate
export async function POST(context) {
  if (!checkAuth(context.request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { candidate_id, categories = [], sources = [], overall_confidence = 'Low' } = body;
  if (!candidate_id) return json({ error: 'candidate_id required' }, 400);

  const db = env.WY_DB;

  const categoryStmts = categories.map(cat =>
    db.prepare(`
      INSERT INTO guide_rubric_scores
        (candidate_id, category_key, category_label, weight,
         score_original, evidence_notes, follow_up_question, evidence_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(candidate_id, category_key) DO UPDATE SET
        score_original      = excluded.score_original,
        evidence_notes      = excluded.evidence_notes,
        follow_up_question  = excluded.follow_up_question,
        evidence_confidence = excluded.evidence_confidence,
        updated_at          = datetime('now')
    `).bind(
      candidate_id,
      cat.key,
      cat.label,
      cat.weight,
      cat.score ?? null,
      cat.evidence_notes || null,
      cat.follow_up_question || null,
      cat.confidence || 'Low',
    )
  );

  const deleteSources = db.prepare('DELETE FROM guide_sources WHERE candidate_id = ?').bind(candidate_id);

  const sourceStmts = sources
    .filter(s => s.name?.trim())
    .map((src, i) =>
      db.prepare(`
        INSERT INTO guide_sources
          (candidate_id, source_number, source_name, source_url, source_date, evidence_weight, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        candidate_id, i + 1,
        src.name.trim(),
        src.url?.trim() || null,
        src.date || null,
        src.weight ?? 3,
        src.notes?.trim() || null,
      )
    );

  const scored = categories.filter(c => c.score !== null && c.score !== undefined);
  const finalScore = scored.reduce((sum, c) => sum + (Number(c.score) * c.weight), 0);
  const maxPossible = scored.reduce((sum, c) => sum + (5 * c.weight), 0);

  const endorsementStmt = db.prepare(`
    INSERT INTO guide_endorsements (candidate_id, status, evidence_confidence, final_score, max_possible)
    VALUES (?, 'research', ?, ?, ?)
    ON CONFLICT(candidate_id) DO UPDATE SET
      evidence_confidence = excluded.evidence_confidence,
      final_score         = excluded.final_score,
      max_possible        = excluded.max_possible,
      updated_at          = datetime('now')
  `).bind(candidate_id, overall_confidence, finalScore || null, maxPossible || null);

  try {
    await db.batch([deleteSources, ...categoryStmts, ...sourceStmts, endorsementStmt]);
    return json({ success: true, final_score: finalScore, max_possible: maxPossible });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
