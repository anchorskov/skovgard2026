// Candidates/src/pages/api/questionnaire/submit.js
import { env } from 'cloudflare:workers';
import { QUESTIONNAIRE_KEYS, QUESTIONNAIRE_LABELS, MAX_ANSWER_LENGTH } from '../../../lib/questionnaire';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function POST({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: 'Could not read submission.' }, 400);
  }

  const token = String(payload?.token ?? '').trim();
  const responses = payload?.responses;
  if (!token || !responses || typeof responses !== 'object') {
    return json({ success: false, message: 'Missing token or responses.' }, 400);
  }

  if (payload?.consentAuthorized !== true || payload?.consentPublish !== true) {
    return json({ success: false, message: 'Please confirm both consent checkboxes before submitting.' }, 400);
  }

  const db = env.WY_DB;
  const tokenRow = await db.prepare(`
    SELECT id AS token_id, candidate_id, expires_at
    FROM guide_questionnaire_tokens
    WHERE token = ?1
  `).bind(token).first();

  if (!tokenRow) {
    return json({ success: false, message: 'This questionnaire link is not valid. Contact jimmy@grassrootsmvt.org for a new one.' }, 404);
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return json({ success: false, message: 'This questionnaire link has expired. Contact jimmy@grassrootsmvt.org for a new one.' }, 410);
  }

  const tooLong = [];
  const toWrite = [];
  for (const key of QUESTIONNAIRE_KEYS) {
    const raw = responses[key];
    if (typeof raw !== 'string') continue;
    if (raw.length > MAX_ANSWER_LENGTH) {
      tooLong.push(QUESTIONNAIRE_LABELS[key]?.split('\n')[0] ?? key);
      continue;
    }
    const text = raw.trim();
    if (!text) continue; // skip blanks so an empty field never wipes a prior answer
    toWrite.push({ key, text });
  }

  if (tooLong.length) {
    return json({
      success: false,
      message: `These answers exceed ${MAX_ANSWER_LENGTH.toLocaleString('en-US')} characters: ${tooLong.join('; ')}`,
    }, 400);
  }

  if (!toWrite.length) {
    return json({ success: false, message: 'No answers were submitted.' }, 400);
  }

  const statements = toWrite.map(({ key, text }) =>
    db.prepare(`
      INSERT INTO guide_questionnaire_responses (token_id, candidate_id, question_key, response_text, submitted_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
      ON CONFLICT(candidate_id, question_key) DO UPDATE SET
        response_text = excluded.response_text,
        updated_at = datetime('now')
    `).bind(tokenRow.token_id, tokenRow.candidate_id, key, text)
  );

  statements.push(
    db.prepare(`
      UPDATE guide_questionnaire_tokens
      SET consent_authorized_at = datetime('now'), consent_publish_at = datetime('now')
      WHERE id = ?1
    `).bind(tokenRow.token_id)
  );

  statements.push(
    db.prepare(`
      INSERT INTO guide_endorsements (candidate_id, status, candidate_response_status, candidate_responded_at)
      VALUES (?1, 'research', 'responded', datetime('now'))
      ON CONFLICT(candidate_id) DO UPDATE SET
        candidate_response_status = 'responded',
        candidate_responded_at = datetime('now'),
        updated_at = datetime('now')
    `).bind(tokenRow.candidate_id)
  );

  await db.batch(statements);

  return json({ success: true, message: 'Thanks — your answers have been saved and will appear on your profile.' });
}
