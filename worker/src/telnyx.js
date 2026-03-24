// worker/src/telnyx.js
const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "UNSTOP"]);
const HELP_KEYWORDS = new Set(["HELP"]);

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function base64ToBytes(value) {
  const text = String(value || "").trim();
  if (!text) return new Uint8Array();
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesFromPem(value) {
  const text = String(value || "").trim();
  if (!text.includes("BEGIN PUBLIC KEY")) return null;
  const body = text
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

function hexToBytes(value) {
  const text = String(value || "").trim();
  if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) return null;
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < text.length; i += 2) {
    out[i / 2] = parseInt(text.slice(i, i + 2), 16);
  }
  return out;
}

async function importEd25519PublicKey(publicKey) {
  const raw = String(publicKey || "").trim();
  if (!raw) throw new Error("Missing Telnyx public key");

  const candidates = [];
  const pemBytes = bytesFromPem(raw);
  if (pemBytes) candidates.push({ format: "spki", bytes: pemBytes });

  const hexBytes = hexToBytes(raw);
  if (hexBytes) {
    candidates.push({ format: "raw", bytes: hexBytes });
    candidates.push({ format: "spki", bytes: hexBytes });
  }

  try {
    const base64Bytes = base64ToBytes(raw);
    if (base64Bytes.length > 0) {
      candidates.push({ format: "raw", bytes: base64Bytes });
      candidates.push({ format: "spki", bytes: base64Bytes });
    }
  } catch {}

  for (const candidate of candidates) {
    try {
      return await crypto.subtle.importKey(
        candidate.format,
        candidate.bytes,
        { name: "Ed25519" },
        false,
        ["verify"]
      );
    } catch {}
  }

  throw new Error("Unsupported Telnyx public key format");
}

export function normalizePhoneNumber(raw) {
  const input = normalizeWhitespace(raw);
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function phoneDigitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function parseInboundKeyword(text) {
  const cleaned = normalizeWhitespace(text).toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  if (!cleaned) return "";
  const first = cleaned.split(" ")[0];
  if (STOP_KEYWORDS.has(first)) return first;
  if (START_KEYWORDS.has(first)) return first;
  if (HELP_KEYWORDS.has(first)) return first;
  return "";
}

export async function verifyTelnyxSignature(rawBody, headers, publicKey, options = {}) {
  const timestamp = String(headers.get("telnyx-timestamp") || "").trim();
  const signature = String(headers.get("telnyx-signature-ed25519") || "").trim();
  const toleranceSeconds = Number(options.toleranceSeconds || 300);

  if (!timestamp || !signature || !publicKey) return false;

  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > toleranceSeconds) return false;

  const publicCryptoKey = await importEd25519PublicKey(publicKey);
  const signedPayload = `${timestamp}|${rawBody}`;
  const data = new TextEncoder().encode(signedPayload);
  const sigBytes = base64ToBytes(signature);
  return crypto.subtle.verify({ name: "Ed25519" }, publicCryptoKey, sigBytes, data);
}

export async function logTelnyxEvent(db, event) {
  const {
    eventId = null,
    eventType = "unknown",
    telnyxMessageId = null,
    occurredAt = null,
    signatureValid = false,
    rawJson = "{}",
  } = event || {};

  await db.prepare(
    `INSERT INTO telnyx_events
       (event_id, event_type, telnyx_message_id, occurred_at, processed_at, signature_valid, raw_json)
     VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5, ?6)
     ON CONFLICT(event_id) DO NOTHING`
  )
    .bind(
      eventId,
      eventType,
      telnyxMessageId,
      occurredAt,
      signatureValid ? 1 : 0,
      rawJson
    )
    .run();
}

export async function upsertConsentStatus(db, input) {
  const phoneE164 = normalizePhoneNumber(input?.phoneE164 || input?.phone || "");
  if (!phoneE164) return;

  const status = String(input?.status || "unknown").trim() || "unknown";
  const source = String(input?.source || "inbound_sms").trim() || "inbound_sms";
  const sourceDetail = input?.sourceDetail ?? null;
  const consentedAt = input?.consentedAt ?? null;
  const revokedAt = input?.revokedAt ?? null;
  const lastInboundKeyword = input?.lastInboundKeyword ?? null;
  const phoneDigits = phoneDigitsOnly(phoneE164);

  await db.prepare(
    `INSERT INTO contacts (phone_e164, created_at, updated_at)
     VALUES (?1, datetime('now'), datetime('now'))
     ON CONFLICT(phone_e164) DO UPDATE SET
       updated_at=datetime('now')`
  )
    .bind(phoneE164)
    .run();

  await db.prepare(
    `INSERT INTO consent_status
       (phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
     ON CONFLICT(phone_e164) DO UPDATE SET
       status=excluded.status,
       source=excluded.source,
       source_detail=excluded.source_detail,
       consented_at=COALESCE(excluded.consented_at, consent_status.consented_at),
       revoked_at=COALESCE(excluded.revoked_at, consent_status.revoked_at),
       last_inbound_keyword=excluded.last_inbound_keyword,
       updated_at=datetime('now')`
  )
    .bind(phoneE164, status, source, sourceDetail, consentedAt, revokedAt, lastInboundKeyword)
    .run();

  if (status === "opted_in" || status === "opted_out") {
    await db.prepare(
      `UPDATE sms_optins
         SET consent = ?2
       WHERE phone = ?1`
    )
      .bind(phoneDigits, status === "opted_out" ? 0 : 1)
      .run();
  }
}

export async function updateMessageDeliveryStatus(db, input) {
  const payload = input?.payload || {};
  const toPhone = normalizePhoneNumber(payload?.to?.[0]?.phone_number || payload?.to?.phone_number || "");
  const fromPhone = normalizePhoneNumber(payload?.from?.phone_number || payload?.from || "");
  const telnyxMessageId = String(payload?.id || input?.telnyxMessageId || "").trim();
  if (!telnyxMessageId) return;

  const status =
    String(
      input?.status
      || payload?.to?.[0]?.status
      || payload?.delivery_status
      || payload?.status
      || input?.eventType
      || "unknown"
    ).trim() || "unknown";

  const costValue =
    payload?.cost?.amount
    ?? payload?.cost?.currency
    ?? payload?.cost
    ?? null;

  await db.prepare(
    `INSERT INTO outbound_messages
       (telnyx_message_id, phone_from, phone_to, text, status, cost_nullable, created_at, updated_at, raw_json)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'), ?7)
     ON CONFLICT(telnyx_message_id) DO UPDATE SET
       phone_from=excluded.phone_from,
       phone_to=excluded.phone_to,
       text=COALESCE(excluded.text, outbound_messages.text),
       status=excluded.status,
       cost_nullable=COALESCE(excluded.cost_nullable, outbound_messages.cost_nullable),
       updated_at=datetime('now'),
       raw_json=COALESCE(excluded.raw_json, outbound_messages.raw_json)`
  )
    .bind(
      telnyxMessageId,
      fromPhone || "",
      toPhone || "",
      payload?.text ?? null,
      status,
      costValue === null ? null : String(costValue),
      input?.rawJson ?? null
    )
    .run();
}

export async function isOutboundSendBlocked(db, phone) {
  const phoneE164 = normalizePhoneNumber(phone);
  if (!phoneE164) return false;

  const row = await db.prepare(
    `SELECT status
       FROM consent_status
      WHERE phone_e164 = ?1`
  )
    .bind(phoneE164)
    .first();

  return String(row?.status || "").trim() === "opted_out";
}

export async function processTelnyxWebhookEvent(db, rawBody, event, env) {
  const data = event?.data || {};
  const payload = data?.payload || {};
  const eventType = String(data?.event_type || "unknown").trim() || "unknown";
  const eventId = String(data?.id || "").trim() || null;
  const occurredAt = data?.occurred_at || null;
  const telnyxMessageId = String(payload?.id || "").trim() || null;

  await logTelnyxEvent(db, {
    eventId,
    eventType,
    telnyxMessageId,
    occurredAt,
    signatureValid: true,
    rawJson: rawBody,
  });

  if (eventType === "message.received") {
    const phoneFrom = normalizePhoneNumber(payload?.from?.phone_number || "");
    const phoneTo = normalizePhoneNumber(payload?.to?.[0]?.phone_number || "");
    const text = payload?.text ?? null;
    const receivedAt = payload?.received_at || occurredAt || null;

    await db.prepare(
      `INSERT INTO inbound_messages
         (telnyx_message_id, phone_from, phone_to, text, direction, received_at, raw_json)
       VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6, datetime('now')), ?7)
       ON CONFLICT(telnyx_message_id) DO UPDATE SET
         text=excluded.text,
         raw_json=excluded.raw_json`
    )
      .bind(
        telnyxMessageId,
        phoneFrom || "",
        phoneTo || "",
        text,
        String(payload?.direction || "inbound"),
        receivedAt,
        rawBody
      )
      .run();

    const keyword = parseInboundKeyword(text);
    if (STOP_KEYWORDS.has(keyword)) {
      await upsertConsentStatus(db, {
        phoneE164: phoneFrom,
        status: "opted_out",
        source: "inbound_sms",
        sourceDetail: eventType,
        revokedAt: occurredAt || new Date().toISOString(),
        lastInboundKeyword: keyword,
      });
    } else if (START_KEYWORDS.has(keyword) && String(env.TELNYX_ALLOW_REACTIVATION || "0") === "1") {
      await upsertConsentStatus(db, {
        phoneE164: phoneFrom,
        status: "opted_in",
        source: "inbound_sms",
        sourceDetail: eventType,
        consentedAt: occurredAt || new Date().toISOString(),
        lastInboundKeyword: keyword,
      });
    } else if (HELP_KEYWORDS.has(keyword)) {
      await upsertConsentStatus(db, {
        phoneE164: phoneFrom,
        status: "unknown",
        source: "inbound_sms",
        sourceDetail: eventType,
        lastInboundKeyword: keyword,
      });
      // TODO(worker/src/telnyx.js): add policy-approved HELP auto-reply logic.
    }
    return;
  }

  if (
    eventType === "message.sent"
    || eventType === "message.delivered"
    || eventType === "message.finalized"
    || eventType === "message.delivery_failed"
  ) {
    await updateMessageDeliveryStatus(db, {
      eventType,
      payload,
      rawJson: rawBody,
    });
    return;
  }

  // TODO(worker/src/telnyx.js): surface unknown webhook types in an admin review UI.
}
