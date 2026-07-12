// Candidates/src/pages/api/questionnaire/request.js
// Public endpoint: a candidate types the email address on file with their
// filing and we email THAT address (never an arbitrary attacker-supplied one)
// a link containing their private questionnaire token. Possession of the
// inbox on file is the verification — there is no separate confirm step.
import { env } from 'cloudflare:workers';
import { sendQuestionnaireInviteEmail } from '../../../lib/questionnaire-email';

const GENERIC_MESSAGE = 'If that email matches our filing records for this candidate, we\'ve sent a questionnaire link to it. Check spam if it doesn\'t arrive in a few minutes.';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function verifyTurnstile(token) {
  if (import.meta.env.DEV) return true;

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — skip in local dev

  if (!token) return false;

  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function POST({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: 'Could not read request.' }, 400);
  }

  const turnstileOk = await verifyTurnstile(payload?.cf_turnstile_response);
  if (!turnstileOk) {
    return json({ success: false, message: 'Verification failed. Please reload and try again.' }, 403);
  }

  const slug = String(payload?.slug ?? '').trim();
  const email = normalizeEmail(payload?.email);
  if (!slug || !email) {
    return json({ success: false, message: 'Email is required.' }, 400);
  }

  const db = env.WY_DB;
  const candRow = await db.prepare(`
    SELECT id, full_name, email, office_id
    FROM candidates
    WHERE slug = ?1 AND withdrawn_at IS NULL
    LIMIT 1
  `).bind(slug).first();

  const candidateEmailOnFile = normalizeEmail(candRow?.email);
  const matches = Boolean(candRow) && Boolean(candidateEmailOnFile) && candidateEmailOnFile === email;

  if (matches) {
    let tokenRow = await db.prepare(`
      SELECT token FROM guide_questionnaire_tokens WHERE candidate_id = ?1
    `).bind(candRow.id).first();

    if (!tokenRow) {
      const token = randomToken();
      await db.prepare(`
        INSERT INTO guide_questionnaire_tokens (candidate_id, token, sent_at)
        VALUES (?1, ?2, datetime('now'))
      `).bind(candRow.id, token).run();
      tokenRow = { token };
    } else {
      await db.prepare(`
        UPDATE guide_questionnaire_tokens SET sent_at = datetime('now') WHERE candidate_id = ?1
      `).bind(candRow.id).run();
    }

    const office = await db.prepare(`SELECT title FROM offices WHERE id = ?1`).bind(candRow.office_id).first();
    const link = `${new URL(request.url).origin}/questionnaire/${tokenRow.token}`;

    await sendQuestionnaireInviteEmail(env, {
      to: candRow.email,
      candidateName: candRow.full_name,
      officeTitle: office?.title || 'your race',
      link,
    });
  }

  // Same response whether or not it matched, so this endpoint can't be used
  // to probe which candidates have an email on file or guess a stored address.
  return json({ success: true, message: GENERIC_MESSAGE });
}
