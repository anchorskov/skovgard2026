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

  if (SUPPRESSION_EVENTS.has(summary.type) && summary.recipientEmailNorm) {
    const data = event?.data || {};
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
        })
      )
      .run();
  }

  return {
    ok: true,
    accepted: true,
    eventType: summary.type,
    suppressed: SUPPRESSION_EVENTS.has(summary.type) && Boolean(summary.recipientEmailNorm),
  };
}
