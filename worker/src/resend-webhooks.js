const RESEND_EMAIL_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.complained",
  "email.suppressed",
  "email.opened",
  "email.clicked",
]);

const SUPPRESSION_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);

// A bounced event only earns a permanent suppression when Resend classifies
// it "Permanent" (data.bounce.type, inherited from the underlying SES
// classification -- confirmed against a real Resend webhook payload).
// Anything else (Temporary/Transient/Undetermined, or missing entirely) is a
// soft signal -- mailbox full, greylisting on a first-contact send, etc. --
// that shouldn't permanently kill an address with no way back in. It's still
// recorded in resend_webhook_events either way, so repeat soft bounces or
// rate calculations can still see it; it just doesn't write to
// email_suppressions. complained/suppressed always suppress -- there's no
// "soft" version of a spam complaint or an explicit suppression.
export function shouldPermanentlySuppress(eventType, data) {
  if (eventType === "email.complained" || eventType === "email.suppressed") return true;
  if (eventType === "email.bounced") {
    return normalizeText(data?.bounce?.type).toLowerCase() === "permanent";
  }
  return false;
}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function svixSignatures(header) {
  return normalizeText(header)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(",");
      return idx >= 0 ? part.slice(idx + 1) : part;
    })
    .filter(Boolean);
}

export async function verifyResendWebhookSignature(rawBody, headers, secret, options = {}) {
  const svixId = normalizeText(headers.get("svix-id") || headers.get("webhook-id"));
  const svixTimestamp = normalizeText(headers.get("svix-timestamp") || headers.get("webhook-timestamp"));
  const svixSignature = normalizeText(headers.get("svix-signature") || headers.get("webhook-signature"));
  const webhookSecret = normalizeText(secret);
  const toleranceSeconds = Number(options.toleranceSeconds || DEFAULT_TOLERANCE_SECONDS);

  if (!svixId || !svixTimestamp || !svixSignature || !webhookSecret) return false;
  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  if (!webhookSecret.startsWith("whsec_")) return false;

  const secretBytes = base64ToBytes(webhookSecret.slice("whsec_".length));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = bytesToBase64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent))
  );

  return svixSignatures(svixSignature).some((signature) => timingSafeEqual(signature, expected));
}

function firstRecipient(data) {
  const to = data?.to;
  if (Array.isArray(to)) return normalizeText(to[0]);
  return normalizeText(to);
}

function eventTags(data) {
  const tags = data?.tags || {};
  if (Array.isArray(tags)) {
    return Object.fromEntries(
      tags
        .map((tag) => [normalizeText(tag?.name), normalizeText(tag?.value)])
        .filter(([name]) => name)
    );
  }
  if (tags && typeof tags === "object") return tags;
  return {};
}

export function summarizeResendWebhookEvent(event) {
  const type = normalizeText(event?.type);
  const data = event?.data || {};
  const tags = eventTags(data);
  const recipient = firstRecipient(data);
  return {
    type,
    createdAt: normalizeText(event?.created_at || data?.created_at) || null,
    emailId: normalizeText(data?.email_id || data?.id) || null,
    messageId: normalizeText(data?.message_id) || null,
    recipientEmail: recipient || null,
    recipientEmailNorm: normalizeEmail(recipient) || null,
    source: normalizeText(tags.source) || null,
    kind: normalizeText(tags.kind) || null,
    batchId: normalizeText(tags.batch_id) || null,
    bounceType: normalizeText(data?.bounce?.type) || null,
    bounceSubType: normalizeText(data?.bounce?.subType) || null,
  };
}

export async function processResendWebhookEvent(db, rawBody, event, headers) {
  const svixId = normalizeText(headers.get("svix-id") || headers.get("webhook-id"));
  if (!svixId) return { ok: false, error: "missing_event_id" };

  const summary = summarizeResendWebhookEvent(event);
  if (!RESEND_EMAIL_EVENTS.has(summary.type)) {
    return { ok: true, ignored: true, eventType: summary.type || "unknown" };
  }

  const insertResult = await db.prepare(
    `INSERT OR IGNORE INTO resend_webhook_events
       (svix_id, event_type, event_created_at, email_id, message_id,
        recipient_email, recipient_email_norm, source, kind, batch_id, raw_json)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  )
    .bind(
      svixId,
      summary.type,
      summary.createdAt,
      summary.emailId,
      summary.messageId,
      summary.recipientEmail,
      summary.recipientEmailNorm,
      summary.source,
      summary.kind,
      summary.batchId,
      rawBody
    )
    .run();

  if (Number(insertResult?.meta?.changes || 0) === 0) {
    return { ok: true, duplicate: true, eventType: summary.type };
  }

  const data = event?.data || {};
  const permanentlySuppress = SUPPRESSION_EVENTS.has(summary.type)
    && Boolean(summary.recipientEmailNorm)
    && shouldPermanentlySuppress(summary.type, data);

  if (permanentlySuppress) {
    const reason =
      normalizeText(data?.bounce?.message)
      || normalizeText(data?.complaint?.message)
      || normalizeText(data?.reason)
      || summary.type.replace(/^email\./, "");

    await db.prepare(
      `INSERT INTO email_suppressions
         (email_norm, email, reason, event_type, resend_event_id, resend_message_id, details_json, suppressed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
       ON CONFLICT(email_norm) DO UPDATE SET
         email = excluded.email,
         reason = excluded.reason,
         event_type = excluded.event_type,
         resend_event_id = excluded.resend_event_id,
         resend_message_id = excluded.resend_message_id,
         details_json = excluded.details_json,
         suppressed_at = excluded.suppressed_at`
    )
      .bind(
        summary.recipientEmailNorm,
        summary.recipientEmail || summary.recipientEmailNorm,
        reason,
        summary.type,
        svixId,
        summary.emailId || summary.messageId,
        JSON.stringify({
          emailId: summary.emailId,
          messageId: summary.messageId,
          source: summary.source,
          kind: summary.kind,
          batchId: summary.batchId,
          bounceType: summary.bounceType,
          bounceSubType: summary.bounceSubType,
        })
      )
      .run();
  }

  return {
    ok: true,
    accepted: true,
    eventType: summary.type,
    suppressed: permanentlySuppress,
  };
}

// ---------------------------------------------------------------------------
// Deliverability rate monitoring -- reads resend_webhook_events, which every
// send through Resend populates regardless of code path (Blast, test-send,
// /api/share), since it's driven by the webhook rather than our own send
// logs. That makes it the right source for an account-wide "are we healthy"
// view, and (via the batch_id tag every send path sets) for a per-blast-job
// view too.
// ---------------------------------------------------------------------------

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

// Account-wide rates over a rolling window (e.g. 24, 168, 720 hours). "sent"
// here is Resend's own email.sent event count, not our send logs -- it's the
// one denominator that's consistent no matter which code path did the
// sending.
export async function computeAccountDeliverabilityRates(db, windowHours) {
  const hours = Number(windowHours) || 24;
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'email.sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN event_type = 'email.bounced' THEN 1 ELSE 0 END) AS bounced,
         SUM(CASE WHEN event_type = 'email.complained' THEN 1 ELSE 0 END) AS complained,
         SUM(CASE WHEN event_type = 'email.suppressed' THEN 1 ELSE 0 END) AS suppressed
       FROM resend_webhook_events
      WHERE event_created_at IS NOT NULL
        AND datetime(event_created_at) >= datetime('now', ?1)`
    )
    .bind(`-${hours} hours`)
    .first();

  const sent = Number(row?.sent || 0);
  const bounced = Number(row?.bounced || 0);
  const complained = Number(row?.complained || 0);
  const suppressed = Number(row?.suppressed || 0);
  return {
    windowHours: hours,
    sent,
    bounced,
    complained,
    suppressed,
    bounceRate: safeRate(bounced, sent),
    complaintRate: safeRate(complained, sent),
  };
}

// Per-blast-job rates, keyed by the batch_id tag (== blast_id) every Blast
// send carries. sentSoFar is passed in rather than queried here -- callers
// (the send-chunk handler, the recent-jobs list) already have
// email_blast_jobs.sent_count in hand.
export async function computeBlastJobDeliverabilityRates(db, blastId, sentSoFar) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'email.bounced' THEN 1 ELSE 0 END) AS bounced,
         SUM(CASE WHEN event_type = 'email.complained' THEN 1 ELSE 0 END) AS complained
       FROM resend_webhook_events
      WHERE batch_id = ?1`
    )
    .bind(blastId)
    .first();

  const bounced = Number(row?.bounced || 0);
  const complained = Number(row?.complained || 0);
  const sent = Number(sentSoFar || 0);
  return {
    bounced,
    complained,
    sent,
    bounceRate: safeRate(bounced, sent),
    complaintRate: safeRate(complained, sent),
  };
}
