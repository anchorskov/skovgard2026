// worker/src/telnyx.js
const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "UNSTOP", "JOIN"]);
const HELP_KEYWORDS = new Set(["HELP"]);

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeOptionalText(value) {
  const text = normalizeWhitespace(value);
  return text ? text : null;
}

function normalizeOptionalFlag(value) {
  if (value === undefined || value === null || value === "") return null;
  return value === true || value === 1 || value === "1" ? 1 : 0;
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

export async function sendSmsWithTelnyx({ apiKey, fromNumber, to, text }) {
  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromNumber,
      to,
      text,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.errors?.[0]?.detail || `Telnyx request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return {
    providerId: body?.data?.id || null,
    status: body?.data?.status || "accepted",
    body,
  };
}

export async function maybeSendWelcomeText(db, env, phoneE164) {
  const enabled = String(env.TEXTING_WELCOME_ENABLED || "0") === "1";
  const welcomeText = String(env.TEXTING_WELCOME_TEXT || "").trim();
  const apiKey = String(env.TELNYX_API_KEY || "").trim();
  const fromNumber = String(env.TELNYX_FROM_NUMBER || "").trim();
  const to = normalizePhoneNumber(phoneE164);

  if (!enabled || !welcomeText || !apiKey || !fromNumber || !to) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }

  const row = await db.prepare(
    `SELECT c.phone_e164, c.welcome_sent_at, cs.status
       FROM contacts c
       LEFT JOIN consent_status cs ON cs.phone_e164 = c.phone_e164
      WHERE c.phone_e164 = ?1`
  )
    .bind(to)
    .first();

  if (!row) return { sent: false, reason: "contact_not_found" };
  if (String(row.status || "").trim() !== "opted_in") {
    return { sent: false, reason: "not_opted_in" };
  }
  if (row.welcome_sent_at) {
    return { sent: false, reason: "already_sent" };
  }

  const telnyx = await sendSmsWithTelnyx({
    apiKey,
    fromNumber,
    to,
    text: welcomeText,
  });

  await db.prepare(
    `UPDATE contacts
        SET welcome_sent_at = datetime('now'),
            updated_at = datetime('now')
      WHERE phone_e164 = ?1`
  )
    .bind(to)
    .run();

  await db.prepare(
    `INSERT INTO outbound_messages
       (telnyx_message_id, phone_from, phone_to, text, status, created_at, updated_at, raw_json)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), ?6)
     ON CONFLICT(telnyx_message_id) DO UPDATE SET
       phone_from=excluded.phone_from,
       phone_to=excluded.phone_to,
       text=excluded.text,
       status=excluded.status,
       updated_at=datetime('now'),
       raw_json=excluded.raw_json`
  )
    .bind(
      telnyx.providerId,
      fromNumber,
      to,
      welcomeText,
      telnyx.status,
      JSON.stringify(telnyx.body || null)
    )
    .run();

  await insertTextingAuditLog(db, {
    action: "welcome_send",
    targetPhone: to,
    messageId: telnyx.providerId,
    detailsJson: JSON.stringify({
      status: telnyx.status,
    }),
  });

  return { sent: true, providerId: telnyx.providerId, status: telnyx.status };
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

async function handleInboundOptInKeyword(db, env, { phoneE164, keyword, occurredAt, eventType }) {
  const phone = normalizePhoneNumber(phoneE164);
  if (!phone || !keyword) return { changed: false, reason: "missing_phone_or_keyword" };
  const consentDate = String(occurredAt || new Date().toISOString()).slice(0, 10);
  const consentVersion = `inbound-sms-${keyword.toLowerCase()}-${consentDate}`;

  const existing = await db.prepare(
    `SELECT status
       FROM consent_status
      WHERE phone_e164 = ?1`
  )
    .bind(phone)
    .first();

  const existingStatus = String(existing?.status || "").trim();
  const allowReactivation = String(env.TELNYX_ALLOW_REACTIVATION || "0") === "1";

  if (existingStatus === "opted_in") {
    await db.prepare(
      `UPDATE consent_status
          SET last_inbound_keyword = ?2,
              updated_at = datetime('now')
        WHERE phone_e164 = ?1`
    )
      .bind(phone, keyword)
      .run();

    await insertTextingAuditLog(db, {
      action: "inbound_opt_in_existing",
      targetPhone: phone,
      detailsJson: JSON.stringify({ keyword, eventType }),
    });
    return { changed: false, reason: "already_opted_in" };
  }

  if (existingStatus === "opted_out" && !allowReactivation) {
    await db.prepare(
      `UPDATE consent_status
          SET last_inbound_keyword = ?2,
              updated_at = datetime('now')
        WHERE phone_e164 = ?1`
    )
      .bind(phone, keyword)
      .run();

    await insertTextingAuditLog(db, {
      action: "inbound_opt_in_reactivation_blocked",
      targetPhone: phone,
      detailsJson: JSON.stringify({ keyword, eventType }),
    });
    return { changed: false, reason: "reactivation_disabled" };
  }

  await upsertConsentStatus(db, {
    phoneE164: phone,
    status: "opted_in",
    source: "inbound_sms",
    sourceDetail: `${eventType}:${keyword.toLowerCase()}`,
    consentedAt: occurredAt || new Date().toISOString(),
    consentVersion,
    lastInboundKeyword: keyword,
  });

  await insertTextingAuditLog(db, {
    action: existingStatus === "opted_out" ? "inbound_opt_in_reactivated" : "inbound_opt_in",
    targetPhone: phone,
    detailsJson: JSON.stringify({ keyword, eventType }),
  });

  await maybeSendWelcomeText(db, env, phone);
  return { changed: true, reason: existingStatus === "opted_out" ? "reactivated" : "opted_in" };
}

export async function upsertConsentStatus(db, input) {
  const phoneE164 = normalizePhoneNumber(input?.phoneE164 || input?.phone || "");
  if (!phoneE164) return;

  const rawStatus = input?.status;
  const status = rawStatus === undefined || rawStatus === null
    ? null
    : String(rawStatus).trim() || null;
  const rawSource = input?.source;
  const source = rawSource === undefined || rawSource === null
    ? "inbound_sms"
    : String(rawSource).trim() || "inbound_sms";
  const sourceDetail = input?.sourceDetail ?? null;
  const consentedAt = input?.consentedAt ?? null;
  const revokedAt = input?.revokedAt ?? null;
  const lastInboundKeyword = input?.lastInboundKeyword ?? null;
  const overwriteProfile = input?.overwriteProfile === true ? 1 : 0;
  const firstName = normalizeOptionalText(input?.firstName ?? input?.first_name);
  const lastName = normalizeOptionalText(input?.lastName ?? input?.last_name);
  const email = normalizeOptionalText(input?.email);
  const consentEmail = normalizeOptionalFlag(input?.consentEmail ?? input?.consent_email);
  const wyVoter = normalizeOptionalFlag(input?.wyVoter ?? input?.wy_voter);
  const county = normalizeOptionalText(input?.county);
  const zip = normalizeOptionalText(input?.zip);
  const consentVersion = normalizeOptionalText(input?.consentVersion ?? input?.consent_version);
  const userAgent = normalizeOptionalText(input?.userAgent ?? input?.user_agent);
  const ipHash = normalizeOptionalText(input?.ipHash ?? input?.ip_hash);

  await db.prepare(
    `INSERT INTO contacts (phone_e164, first_name, last_name, created_at, updated_at)
     VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
     ON CONFLICT(phone_e164) DO UPDATE SET
       first_name=COALESCE(?2, contacts.first_name),
       last_name=COALESCE(?3, contacts.last_name),
       updated_at=datetime('now')`
  )
    .bind(phoneE164, firstName, lastName)
    .run();

  await db.prepare(
    `INSERT INTO consent_status
       (phone_e164, status, source, source_detail, consented_at, revoked_at, last_inbound_keyword,
        first_name, last_name, email, consent_email, wy_voter, county, zip,
        consent_version, user_agent, ip_hash, created_at, updated_at)
     VALUES (?1, COALESCE(?2, 'unknown'), ?3, ?4, ?5, ?6, ?7,
             ?8, ?9, ?10, ?11, ?12, ?13, ?14,
             ?15, ?16, ?17, datetime('now'), datetime('now'))
     ON CONFLICT(phone_e164) DO UPDATE SET
       status=COALESCE(?2, consent_status.status),
       source=COALESCE(?3, consent_status.source),
       source_detail=COALESCE(?4, consent_status.source_detail),
       consented_at=COALESCE(excluded.consented_at, consent_status.consented_at),
       revoked_at=COALESCE(excluded.revoked_at, consent_status.revoked_at),
       last_inbound_keyword=COALESCE(?7, consent_status.last_inbound_keyword),
       first_name=CASE WHEN ?18 = 1 THEN ?8 ELSE COALESCE(?8, consent_status.first_name) END,
       last_name=CASE WHEN ?18 = 1 THEN ?9 ELSE COALESCE(?9, consent_status.last_name) END,
       email=CASE WHEN ?18 = 1 THEN ?10 ELSE COALESCE(?10, consent_status.email) END,
       consent_email=CASE WHEN ?18 = 1 THEN ?11 ELSE COALESCE(?11, consent_status.consent_email) END,
       wy_voter=CASE WHEN ?18 = 1 THEN ?12 ELSE COALESCE(?12, consent_status.wy_voter) END,
       county=CASE WHEN ?18 = 1 THEN ?13 ELSE COALESCE(?13, consent_status.county) END,
       zip=CASE WHEN ?18 = 1 THEN ?14 ELSE COALESCE(?14, consent_status.zip) END,
       consent_version=COALESCE(?15, consent_status.consent_version),
       user_agent=CASE WHEN ?18 = 1 THEN ?16 ELSE COALESCE(?16, consent_status.user_agent) END,
       ip_hash=CASE WHEN ?18 = 1 THEN ?17 ELSE COALESCE(?17, consent_status.ip_hash) END,
       updated_at=datetime('now')`
  )
    .bind(
      phoneE164,
      status,
      source,
      sourceDetail,
      consentedAt,
      revokedAt,
      lastInboundKeyword,
      firstName,
      lastName,
      email,
      consentEmail,
      wyVoter,
      county,
      zip,
      consentVersion,
      userAgent,
      ipHash,
      overwriteProfile
    )
    .run();
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

export async function insertTextingAuditLog(db, input) {
  const action = String(input?.action || "").trim();
  if (!action) return;

  await db.prepare(
    `INSERT INTO texting_audit_log
       (actor_user_id, actor_email, action, target_phone, message_id, details_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
  )
    .bind(
      input?.actorUserId ?? null,
      input?.actorEmail ?? null,
      action,
      input?.targetPhone ?? null,
      input?.messageId ?? null,
      input?.detailsJson ?? null
    )
    .run();
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
    } else if (START_KEYWORDS.has(keyword)) {
      await handleInboundOptInKeyword(db, env, {
        phoneE164: phoneFrom,
        keyword,
        occurredAt,
        eventType,
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
