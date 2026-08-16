// Candidates/src/pages/api/ballot-recovery/request.js
// Public endpoint: a voter emails themselves a link that restores their
// saved ballot list (races + candidate picks, both from localStorage) on
// another device. Unlike questionnaire/request.js, the send target here is
// an arbitrary voter-supplied address, not one matched against a filing
// record — so this endpoint needs its own rate limiting, and can give
// honest, specific error messages rather than a generic message hiding a
// match/no-match branch.
//
// Also upserts ballot_saves — a durable, email-keyed copy of the same
// payload. That's what makes this a save/update action rather than a
// one-shot relay: submitting this form again later (with a changed list)
// just overwrites the prior row for that email. It's also what the cold
// recover.js endpoint reads from when the voter has no link in hand. See
// docs/ballot_recovery.md.
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../../../lib/turnstile';
import { sendBallotRecoveryEmail } from '../../../lib/ballot-recovery-email';

const MAX_PAYLOAD_BYTES = 20_000;
const COOLDOWN_SECONDS = 60;
const IP_HOURLY_CAP = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isPlainArray(value) {
  return Array.isArray(value);
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

  const availableRaces = isPlainArray(payload?.availableRaces) ? payload.availableRaces : null;
  const choices = isPlainArray(payload?.choices) ? payload.choices : null;
  if (!availableRaces || !choices || (availableRaces.length === 0 && choices.length === 0)) {
    return json({ success: false, message: 'No saved ballot list to send yet.' }, 400);
  }

  const payloadJson = JSON.stringify({ availableRaces, choices });
  if (payloadJson.length > MAX_PAYLOAD_BYTES) {
    return json({ success: false, message: 'Saved list is too large to send.' }, 400);
  }

  const db = env.WY_DB;
  const ip = request.headers.get('cf-connecting-ip') || null;

  // Save/update the durable record unconditionally — this reflects the
  // current state of the device's list and isn't itself an outbound email,
  // so it isn't subject to the cooldown/IP-cap checks below. A voter who's
  // hit the email rate limit should still be able to save a changed
  // selection; they just won't get another link emailed immediately.
  await db.prepare(`
    INSERT INTO ballot_saves (email_norm, payload_json, updated_at)
    VALUES (?1, ?2, datetime('now'))
    ON CONFLICT(email_norm) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(email, payloadJson).run();

  // Opportunistic cleanup of the ephemeral link table — ballot_saves itself
  // is purged on a fixed election-cycle deadline by the separate
  // skovgard-candidates-cron Worker, not here (see docs/ballot_recovery.md).
  await db.prepare(`DELETE FROM ballot_recovery_tokens WHERE expires_at < datetime('now')`).run();

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

  const token = randomToken();
  await db.prepare(`
    INSERT INTO ballot_recovery_tokens (token, payload_json, email_norm, ip, sent_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now', '+24 hours'))
  `).bind(token, payloadJson, email, ip).run();

  const link = `${new URL(request.url).origin}/ballot-recovery/${token}`;
  const result = await sendBallotRecoveryEmail(env, { to: email, link });

  if (!result.sent) {
    return json({
      success: false,
      message: result.reason === 'missing_api_key'
        ? 'Email delivery is not configured yet. Please try again later.'
        : 'Could not send the recovery email. Please try again.',
    }, 502);
  }

  return json({ success: true, message: 'Recovery link sent — check your email.' });
}

export function ALL() {
  return json({ success: false, message: 'Use POST for ballot recovery requests.' }, 405);
}
