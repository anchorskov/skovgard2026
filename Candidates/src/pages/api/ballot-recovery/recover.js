// Candidates/src/pages/api/ballot-recovery/recover.js
// Cold-start counterpart to request.js: the voter has no local list on this
// device and no unexpired link in hand — they just remember an email address
// they saved under (via "Save my ballot" elsewhere) and want a fresh link.
//
// Unlike request.js — which can be honest about errors because the caller
// already holds their own current list, so there's no secret to protect —
// this endpoint answers "does this email have a saved ballot," which is
// exactly the kind of oracle questionnaire/request.js already guards against
// for candidate filing emails. Same fix here: always the same response
// regardless of match. See docs/ballot_recovery.md.
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../../../lib/turnstile';
import { sendBallotRecoveryEmail } from '../../../lib/ballot-recovery-email';

const COOLDOWN_SECONDS = 60;
const IP_HOURLY_CAP = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE = 'If we have a saved ballot for that address, check your email for a link.';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
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

  const turnstileOk = await verifyTurnstile(env, payload?.cf_turnstile_response);
  if (!turnstileOk) {
    return json({ success: false, message: 'Verification failed. Please reload and try again.' }, 403);
  }

  const email = normalizeEmail(payload?.email);
  if (!email || !EMAIL_RE.test(email)) {
    return json({ success: false, message: 'Enter a valid email address.' }, 400);
  }

  const db = env.WY_DB;
  const ip = request.headers.get('cf-connecting-ip') || null;

  await db.prepare(`DELETE FROM ballot_recovery_tokens WHERE expires_at < datetime('now')`).run();

  // Cooldown/IP-cap checks run before the ballot_saves lookup and use the
  // same table/columns request.js does, so their outcome never depends on
  // whether this email has a saved ballot — only on recent send history.
  const cooldownRow = await db.prepare(`
    SELECT 1 FROM ballot_recovery_tokens
    WHERE email_norm = ?1 AND sent_at > datetime('now', ?2)
    LIMIT 1
  `).bind(email, `-${COOLDOWN_SECONDS} seconds`).first();
  if (cooldownRow) {
    return json({ success: false, message: 'Please wait a minute before requesting another link for this address.' }, 429);
  }

  if (ip) {
    const ipCountRow = await db.prepare(`
      SELECT COUNT(*) AS n FROM ballot_recovery_tokens
      WHERE ip = ?1 AND sent_at > datetime('now', '-1 hour')
    `).bind(ip).first();
    if (Number(ipCountRow?.n || 0) >= IP_HOURLY_CAP) {
      return json({ success: false, message: 'Too many recovery links requested recently. Please try again later.' }, 429);
    }
  }

  const savedRow = await db.prepare(`
    SELECT payload_json FROM ballot_saves WHERE email_norm = ?1
  `).bind(email).first();

  // Same amount of externally-visible work either way — a token row is only
  // created and an email only sent when a save exists — but the response
  // below never varies, so this can't be used to probe which addresses have
  // a saved ballot. (Response latency does differ slightly on a match, since
  // sending the email is awaited; treated as an accepted low-severity
  // residual signal for this data, not a password-grade secret.)
  if (savedRow) {
    const token = randomToken();
    await db.prepare(`
      INSERT INTO ballot_recovery_tokens (token, payload_json, email_norm, ip, sent_at, expires_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now', '+24 hours'))
    `).bind(token, savedRow.payload_json, email, ip).run();

    const link = `${new URL(request.url).origin}/ballot-recovery/${token}`;
    await sendBallotRecoveryEmail(env, { to: email, link });
  }

  return json({ success: true, message: GENERIC_MESSAGE });
}

export function ALL() {
  return json({ success: false, message: 'Use POST for ballot recovery requests.' }, 405);
}
