import { sendResendEmail } from "./resend.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPlainTextHtml(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function getAdminEmailConfig(env) {
  return {
    enabled: String(env.ADMIN_EMAIL_ENABLED || "0") === "1",
    apiKey: normalizeText(env.RESEND_API_KEY),
    from: normalizeText(env.ADMIN_EMAIL_FROM),
  };
}

export function buildAdminOutreachEmail(config, recipient, subject, body, options = {}) {
  const to = normalizeText(recipient?.email || recipient);
  const normalizedSubject = normalizeText(subject);
  const normalizedBody = String(body ?? "").replace(/\r\n/g, "\n").trim();
  const batchId = normalizeText(options.batchId);
  const replyTo = normalizeText(options.replyTo || config.from);

  return {
    from: config.from,
    to: [to],
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: normalizedSubject,
    text: normalizedBody,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; color: #0f172a; line-height: 1.6;">
        ${renderPlainTextHtml(normalizedBody)}
      </div>
    `,
    ...(options.headers && Object.keys(options.headers).length ? { headers: options.headers } : {}),
    tags: [
      { name: "source", value: "admin_emails" },
      { name: "kind", value: "outreach" },
      ...(batchId ? [{ name: "batch_id", value: batchId.slice(0, 200) }] : []),
    ],
  };
}

export async function sendAdminOutreachEmail(env, recipient, subject, body, options = {}) {
  const config = getAdminEmailConfig(env);
  if (!config.enabled || !config.apiKey || !config.from) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }

  const message = buildAdminOutreachEmail(config, recipient, subject, body, options);
  const result = await sendResendEmail(config.apiKey, message, options.idempotencyKey || null);
  return {
    sent: true,
    id: result?.id || null,
    to: normalizeText(recipient?.email || recipient),
  };
}

export async function insertAdminEmailAuditLog(db, input) {
  const action = normalizeText(input?.action);
  if (!action) return;

  await db.prepare(
    `INSERT INTO admin_email_audit_log
       (actor_user_id, actor_email, action, target_email, subject, message_id, details_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))`
  )
    .bind(
      input?.actorUserId ?? null,
      input?.actorEmail ?? null,
      action,
      normalizeText(input?.targetEmail) || null,
      normalizeText(input?.subject) || null,
      input?.messageId ?? null,
      input?.detailsJson ?? null
    )
    .run();
}
