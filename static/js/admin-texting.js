// static/js/admin-texting.js
import { API_URL } from "/js/env.js";

const authForm = document.getElementById("admin-texting-auth");
const shellEl = document.getElementById("admin-texting-shell");
const authStatusEl = document.getElementById("admin-texting-auth-status");
const keyInput = document.getElementById("admin_texting_key");
const actorEmailInput = document.getElementById("admin_actor_email");
const connectBtn = document.getElementById("admin-texting-connect");
const clearBtn = document.getElementById("admin-texting-clear");
const refreshBtn = document.getElementById("admin-texting-refresh");
const sendForm = document.getElementById("admin-texting-send");
const sendStatusEl = document.getElementById("admin-texting-send-status");
const previewBtn = document.getElementById("text-preview");
const previewBox = document.getElementById("text-preview-box");
const previewSummary = document.getElementById("text-preview-summary");
const statusEl = document.getElementById("admin-texting-status");
const messagesEl = document.getElementById("admin-texting-messages");
const contactsEl = document.getElementById("admin-texting-contacts");
const conversationEl = document.getElementById("admin-texting-conversation");
const messagesSearchInput = document.getElementById("messages_search");
const contactsSearchInput = document.getElementById("contacts_search");
const contactsFilterInput = document.getElementById("contacts_filter");
const suppressionEl = document.getElementById("admin-texting-suppression");
const downloadContactsBtn = document.getElementById("download-texting-contacts");
const downloadSuppressedBtn = document.getElementById("download-suppressed-contacts");
const broadcastForm = document.getElementById("admin-texting-broadcast");
const broadcastStatusEl = document.getElementById("broadcast-send-status");
const broadcastPreviewBtn = document.getElementById("broadcast-preview");
const broadcastPreviewBox = document.getElementById("broadcast-preview-box");
const broadcastPreviewSummary = document.getElementById("broadcast-preview-summary");
const broadcastPreviewList = document.getElementById("broadcast-preview-list");
const sendToInput = document.getElementById("send_to");
const sendTextInput = document.getElementById("send_text");
const broadcastFilterSelect = document.getElementById("broadcast_filter");
const broadcastLimitInput = document.getElementById("broadcast_limit");
const broadcastTextInput = document.getElementById("broadcast_text");

const STORAGE_KEY = "skovgard_admin_texting_key";
const STORAGE_EMAIL = "skovgard_admin_texting_email";

let selectedPhone = "";
let singlePreviewState = null;
let broadcastPreviewState = null;
let lastApiDiagnostic = {
  kind: "idle",
  status: null,
  message: "No API request yet.",
};

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function returnToAuth(message, { clearStoredKey = false } = {}) {
  shellEl.hidden = true;
  clearSinglePreview();
  clearBroadcastPreview();
  renderConversation({ phone: "", items: [] });
  if (clearStoredKey) {
    localStorage.removeItem(STORAGE_KEY);
    keyInput.value = "";
  }
  setStatus(authStatusEl, message, true);
  keyInput?.focus();
}

function getAdminKey() {
  return String(keyInput?.value || "").trim();
}

function getActorEmail() {
  return String(actorEmailInput?.value || "").trim();
}

function apiBaseForDisplay() {
  return API_URL ? String(API_URL).replace(/\/+$/, "") : window.location.origin;
}

function buildApiUrl(path) {
  const key = getAdminKey();
  const actorEmail = getActorEmail();
  const base = API_URL ? `${String(API_URL).replace(/\/+$/, "")}/` : window.location.origin;
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${base}`);
  if (key) url.searchParams.set("key", key);
  if (actorEmail) url.searchParams.set("actor_email", actorEmail);
  if (!API_URL && url.origin === window.location.origin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return url.toString();
}

function setApiDiagnostic(kind, message, status = null) {
  lastApiDiagnostic = { kind, message, status };
}

function isAccessLoginLocation(value) {
  const s = String(value || "");
  return s.includes("/cdn-cgi/access/login") || s.includes(".cloudflareaccess.com/");
}

function makeFriendlyApiError() {
  switch (lastApiDiagnostic.kind) {
    case "access_missing":
      return new Error("Your Access session for the texting API is not active. Re-authenticate to Cloudflare Access for this hostname and try again.");
    case "unauthorized":
      return new Error("The admin key was rejected.");
    case "network_error":
      return new Error("The texting API could not be reached. Check your network or Cloudflare Access session.");
    case "html":
      return new Error("The texting API returned HTML instead of JSON. Your Access session may not be active for the API route.");
    default:
      return new Error(lastApiDiagnostic.message || "Request failed.");
  }
}

function shouldReturnToAuth(error) {
  const message = String(error?.message || "");
  return lastApiDiagnostic.kind === "unauthorized" || /admin key/i.test(message);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTs(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function badge(status) {
  const s = String(status || "unknown").toLowerCase();
  return `<span class="status-badge status-${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseFilename(disposition, fallback) {
  const match = String(disposition || "").match(/filename="?([^"]+)"?/i);
  return match ? match[1] : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatFlag(value, whenTrue, whenFalse, fallback = "unknown") {
  if (value === true) return whenTrue;
  if (value === false) return whenFalse;
  return fallback;
}

function formatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "n/a";
}

function statusChip(label, tone = "unknown") {
  return `<span class="status-badge status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "unknown";
  return `***${digits.slice(-4)}`;
}

function truncatePreview(value, maxLength = 72) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function renderEmptyMessage(el, message) {
  if (!el) return;
  el.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
}

function renderStatusFallback(message) {
  if (!statusEl) return;
  statusEl.innerHTML = `
    <article class="status-item">
      <div class="row">
        <strong>Operational Status</strong>
        ${statusChip("API offline", "failed")}
      </div>
      <div class="meta">${escapeHtml(message || "Status data is unavailable right now.")}</div>
      <div class="meta">Refresh the portal after your admin key and Cloudflare Access session are active.</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Recent Activity</strong>
        ${statusChip("Unknown", "unknown")}
      </div>
      <div class="meta">Last response: ${escapeHtml(lastApiDiagnostic.kind)}</div>
      <div class="meta">Last status: ${escapeHtml(lastApiDiagnostic.status ?? "n/a")}</div>
      <div class="meta">${escapeHtml(lastApiDiagnostic.message)}</div>
    </article>
  `;
}

function clearSinglePreview() {
  singlePreviewState = null;
  previewBox.hidden = true;
  previewSummary.textContent = "";
}

function clearBroadcastPreview() {
  broadcastPreviewState = null;
  broadcastPreviewBox.hidden = true;
  broadcastPreviewSummary.textContent = "";
  broadcastPreviewList.innerHTML = "";
}

function currentSinglePayload() {
  return {
    to: sendToInput?.value.trim() || "",
    text: sendTextInput?.value.trim() || "",
  };
}

function currentBroadcastPayload() {
  return {
    filter: broadcastFilterSelect?.value || "opted_in",
    text: broadcastTextInput?.value.trim() || "",
    limit: Number(broadcastLimitInput?.value || 100),
  };
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      credentials: "same-origin",
      redirect: "manual",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (_error) {
    setApiDiagnostic("network_error", "Network request failed before the API responded.");
    throw makeFriendlyApiError();
  }

  const location = response.headers.get("location") || "";
  if (
    response.type === "opaqueredirect" ||
    ((response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) &&
      isAccessLoginLocation(location))
  ) {
    setApiDiagnostic("access_missing", "Cloudflare Access redirected the API request to login.", response.status || 302);
    throw makeFriendlyApiError();
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    setApiDiagnostic("html", "Received HTML from the API route instead of JSON.", response.status);
    throw makeFriendlyApiError();
  }

  const json = await response.json().catch(() => null);
  if (!json) {
    setApiDiagnostic("html", "API response could not be parsed as JSON.", response.status);
    throw makeFriendlyApiError();
  }

  if (!response.ok) {
    if (response.status === 401) {
      setApiDiagnostic("unauthorized", "Admin key rejected by API.", response.status);
    } else {
      setApiDiagnostic("error", json?.error || `Request failed (${response.status})`, response.status);
    }
    throw makeFriendlyApiError();
  }

  setApiDiagnostic("json", "JSON response received from API.", response.status);
  return json;
}

function renderStatus(data) {
  const model = isRecord(data) ? data : {};
  const telnyx = isRecord(model.telnyx) ? model.telnyx : {};
  const lastOutboundSummary = isRecord(model.lastOutboundSummary) ? model.lastOutboundSummary : null;
  const lastInboundSummary = isRecord(model.lastInboundSummary) ? model.lastInboundSummary : null;
  const sendPathIssues = Array.isArray(model.sendPathIssues)
    ? model.sendPathIssues.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const apiOnline = model.ok !== false;
  const sendPathReady = model.sendPathReady === true;
  const webhookRouteLive = model.webhookRouteLive === true || telnyx.webhookRouteLive === true;
  const lastWebhookAt = model.lastWebhookReceivedAt || telnyx.lastWebhookReceivedAt || null;
  const lastInvalidSignatureAt = model.lastInvalidSignatureAt || telnyx.lastInvalidSignatureAt || null;
  const healthTone = apiOnline && sendPathReady && webhookRouteLive && Number(model.failedDeliveries || 0) === 0
    ? "delivered"
    : "failed";
  const sendIssueText = sendPathReady
    ? "Outbound texting is configured and ready."
    : sendPathIssues.slice(0, 2).join("; ") || "Send path details are unavailable.";
  statusEl.innerHTML = `
    <article class="status-item">
      <div class="row">
        <strong>Operational Status</strong>
        ${statusChip(apiOnline ? "API online" : "API offline", apiOnline ? "delivered" : "failed")}
      </div>
      <div class="meta">Send path: ${sendPathReady ? "Ready" : "Needs attention"}</div>
      <div class="meta">Webhook route: ${webhookRouteLive ? "Live" : "Not live"}</div>
      <div class="meta">Last webhook: ${escapeHtml(formatTs(lastWebhookAt) || "No webhook received yet")}</div>
      <div class="meta">Last invalid signature: ${escapeHtml(formatTs(lastInvalidSignatureAt) || "None recorded")}</div>
      <div class="meta">${escapeHtml(sendIssueText)}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Recent Activity</strong>
        ${statusChip(healthTone === "delivered" ? "Healthy" : "Needs review", healthTone)}
      </div>
      <div class="meta">Last outbound: ${escapeHtml(formatTs(model.lastOutboundAt) || "none yet")}</div>
      <div class="meta">Last inbound: ${escapeHtml(formatTs(model.lastInboundAt) || "none yet")}</div>
      <div class="meta">Last delivery update: ${escapeHtml(formatTs(model.lastDeliveryUpdateAt) || "No delivery webhook yet")}</div>
      <div class="meta">Sent today: ${escapeHtml(formatCount(model.messagesSentToday))}</div>
      <div class="meta">Failed deliveries: ${escapeHtml(formatCount(model.failedDeliveries))}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Latest Outbound</strong>
        ${lastOutboundSummary ? badge(lastOutboundSummary.status || "unknown") : statusChip("No recent outbound", "unknown")}
      </div>
      <div class="meta">To: ${escapeHtml(lastOutboundSummary ? maskPhone(lastOutboundSummary.phone) : "No outbound text yet")}</div>
      <div class="meta">Sent: ${escapeHtml(lastOutboundSummary ? formatTs(lastOutboundSummary.at) || "Unknown time" : "Send a test text to populate this summary.")}</div>
      <div class="meta">${escapeHtml(lastOutboundSummary ? truncatePreview(lastOutboundSummary.text, 84) || "No preview text captured." : "Send a test text to populate this summary.")}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Latest Inbound</strong>
        ${lastInboundSummary ? badge(lastInboundSummary.status || "inbound") : statusChip("No recent inbound", "unknown")}
      </div>
      <div class="meta">From: ${escapeHtml(lastInboundSummary ? maskPhone(lastInboundSummary.phone) : "No inbound reply yet")}</div>
      <div class="meta">Received: ${escapeHtml(lastInboundSummary ? formatTs(lastInboundSummary.at) || "Unknown time" : "Reply STOP, START, or HELP to populate this summary.")}</div>
      <div class="meta">${escapeHtml(lastInboundSummary ? truncatePreview(lastInboundSummary.text, 84) || "No preview text captured." : "Reply STOP, START, or HELP to populate this summary.")}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Consent Totals</strong>
        ${statusChip("Audience", "accepted")}
      </div>
      <div class="meta">Opted in: ${escapeHtml(formatCount(model.optedInCount))}</div>
      <div class="meta">Opted out: ${escapeHtml(formatCount(model.optedOutCount))}</div>
      <div class="meta">Suppressed: ${escapeHtml(formatCount(model.suppressedCount))}</div>
      <div class="meta">New opt-ins (24h): ${escapeHtml(formatCount(model.newOptIns24h))}</div>
    </article>
  `;
}

function renderMessages(items) {
  const rows = Array.isArray(items) ? items : [];
  messagesEl.innerHTML = rows.length
    ? rows.map((item) => `
        <article class="list-item">
          <div class="row">
            <strong>${escapeHtml(item.direction)}</strong>
            ${badge(item.status)}
          </div>
          <div class="meta">${escapeHtml(item.phone_from)} -> ${escapeHtml(item.phone_to)}</div>
          <div class="meta">${escapeHtml(formatTs(item.at))}</div>
          <p>${escapeHtml(item.text || "")}</p>
          <div class="meta">Message ID: ${escapeHtml(item.message_id || "n/a")}</div>
        </article>
      `).join("")
    : `<p class="empty">No messages found.</p>`;
}

function renderContacts(items) {
  const rows = Array.isArray(items) ? items : [];
  contactsEl.innerHTML = rows.length
    ? rows.map((item) => `
        <button type="button" class="list-item contact-item" data-phone="${escapeHtml(item.phone_e164)}">
          <div class="row">
            <strong>${escapeHtml(`${item.first_name || ""} ${item.last_name || ""}`.trim() || item.phone_e164)}</strong>
            ${badge(item.status || "unknown")}
          </div>
          <div class="meta">${escapeHtml(item.phone_e164)}</div>
          <div class="meta">Keyword: ${escapeHtml(item.last_inbound_keyword || "none")}</div>
        </button>
      `).join("")
    : `<p class="empty">No contacts found.</p>`;
}

function renderSuppression(items) {
  const rows = Array.isArray(items) ? items : [];
  suppressionEl.innerHTML = rows.length
    ? rows.map((item) => `
        <article class="list-item">
          <div class="row">
            <strong>${escapeHtml(item.phone_e164)}</strong>
            ${badge(item.status || "opted_out")}
          </div>
          <div class="meta">${escapeHtml(`${item.first_name || ""} ${item.last_name || ""}`.trim() || "Unnamed contact")}</div>
          <div class="meta">Revoked: ${escapeHtml(formatTs(item.revoked_at) || "unknown")}</div>
          <div class="meta">Keyword: ${escapeHtml(item.last_inbound_keyword || "none")}</div>
        </article>
      `).join("")
    : `<p class="empty">No suppressed contacts found.</p>`;
}

function renderConversation(data) {
  const model = isRecord(data) ? data : {};
  const items = Array.isArray(model.items) ? model.items : [];
  const consent = isRecord(model.consent) ? model.consent : null;
  conversationEl.innerHTML = `
    <div class="conversation-summary">
      <strong>${escapeHtml(model.phone || "No contact selected")}</strong>
      <div class="meta">Consent: ${consent ? escapeHtml(consent.status || "unknown") : "unknown"}</div>
      <div class="meta">Last keyword: ${escapeHtml(consent?.last_inbound_keyword || "none")}</div>
    </div>
    ${items.length
      ? items.map((item) => `
          <article class="list-item">
            <div class="row">
              <strong>${escapeHtml(item.direction)}</strong>
              ${badge(item.status)}
            </div>
            <div class="meta">${escapeHtml(formatTs(item.at))}</div>
            <p>${escapeHtml(item.text || "")}</p>
          </article>
        `).join("")
      : `<p class="empty">No conversation history yet.</p>`}
  `;
}

async function loadStatus() {
  const data = await api("/api/admin/texting/status");
  renderStatus(data);
}

async function loadMessages() {
  const q = encodeURIComponent(String(messagesSearchInput?.value || "").trim());
  const data = await api(`/api/admin/texting/messages?limit=50${q ? `&q=${q}` : ""}`);
  renderMessages(data.items || []);
}

async function loadContacts() {
  const q = encodeURIComponent(String(contactsSearchInput?.value || "").trim());
  const filter = encodeURIComponent(String(contactsFilterInput?.value || "all").trim());
  const data = await api(`/api/admin/texting/contacts?limit=50&filter=${filter}${q ? `&q=${q}` : ""}`);
  renderContacts(data.items || []);
}

async function loadSuppression() {
  const data = await api("/api/admin/texting/suppression?limit=25");
  renderSuppression(data.items || []);
}

async function loadConversation(phone) {
  if (!phone) {
    renderConversation({ phone: "", items: [] });
    return;
  }
  const data = await api(`/api/admin/texting/conversations?phone=${encodeURIComponent(phone)}`);
  renderConversation(data);
}

async function loadSection(name, loader, onError, failures) {
  try {
    await loader();
  } catch (error) {
    if (shouldReturnToAuth(error)) throw error;
    onError(error);
    failures.push(`${name}: ${error.message}`);
  }
}

async function refreshAll({ includeStatus = true, announceSuccess = false } = {}) {
  const failures = [];
  const tasks = [
    loadSection(
      "Messages",
      () => loadMessages(),
      (error) => renderEmptyMessage(messagesEl, `Unable to load messages. ${error.message}`),
      failures
    ),
    loadSection(
      "Contacts",
      () => loadContacts(),
      (error) => renderEmptyMessage(contactsEl, `Unable to load contacts. ${error.message}`),
      failures
    ),
    loadSection(
      "Suppression",
      () => loadSuppression(),
      (error) => renderEmptyMessage(suppressionEl, `Unable to load suppression list. ${error.message}`),
      failures
    ),
  ];

  if (includeStatus) {
    tasks.unshift(
      loadSection(
        "System Status",
        () => loadStatus(),
        (error) => renderStatusFallback(`Unable to load system status. ${error.message}`),
        failures
      )
    );
  }

  if (selectedPhone) {
    tasks.push(
      loadSection(
        "Conversation",
        () => loadConversation(selectedPhone),
        (error) => renderEmptyMessage(conversationEl, `Unable to load conversation. ${error.message}`),
        failures
      )
    );
  } else {
    renderConversation({ phone: "", items: [] });
  }

  await Promise.all(tasks);

  if (failures.length) {
    const summary = failures.length === 1
      ? failures[0]
      : `${failures.length} sections had issues. ${failures[0]}`;
    setStatus(authStatusEl, `Portal refreshed with warnings. ${summary}`, true);
    return failures;
  }

  if (announceSuccess) {
    setStatus(authStatusEl, "Portal refreshed.");
  }

  return failures;
}

async function connectPortal() {
  const key = getAdminKey();
  if (!key) {
    returnToAuth("Enter the admin key first.");
    return;
  }

  try {
    await loadStatus();
    localStorage.setItem(STORAGE_KEY, key);
    localStorage.setItem(STORAGE_EMAIL, getActorEmail());
    shellEl.hidden = false;
    renderConversation({ phone: "", items: [] });
    const failures = await refreshAll({ includeStatus: false });
    if (!failures.length) {
      setStatus(authStatusEl, "Portal loaded.");
    }
  } catch (error) {
    returnToAuth(error.message, { clearStoredKey: shouldReturnToAuth(error) });
  }
}

function updatePreview() {
  const { to, text } = currentSinglePayload();
  const ready = Boolean(to && text);
  previewBox.hidden = !ready;
  previewSummary.textContent = ready
    ? `Review send to ${to}: ${text}`
    : "";
  return ready;
}

function renderBroadcastPreview(data) {
  const items = data?.previewRecipients || [];
  broadcastPreviewState = {
    token: data?.approval?.token || "",
    issuedAt: data?.approval?.issuedAt || "",
  };
  broadcastPreviewBox.hidden = false;
  broadcastPreviewSummary.textContent = `Audience size: ${data.count}. Batch ID: ${data.batchId}. Previewing first ${items.length} recipients.`;
  broadcastPreviewList.innerHTML = items.length
    ? items.map((item) => `
        <div class="preview-list-item">
          <strong>${escapeHtml(`${item.first_name || ""} ${item.last_name || ""}`.trim() || item.phone_e164)}</strong>
          <div class="meta">${escapeHtml(item.phone_e164)}</div>
        </div>
      `).join("")
    : `<p class="empty">No recipients match the selected audience.</p>`;
}

async function downloadCsv(path, fallbackName) {
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch (_error) {
    setApiDiagnostic("network_error", "CSV download request failed before the API responded.");
    throw makeFriendlyApiError();
  }
  const location = response.headers.get("location") || "";
  if (
    response.type === "opaqueredirect" ||
    ((response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) &&
      isAccessLoginLocation(location))
  ) {
    setApiDiagnostic("access_missing", "Cloudflare Access redirected the CSV download request to login.", response.status || 302);
    throw makeFriendlyApiError();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    setApiDiagnostic(response.status === 401 ? "unauthorized" : "error", body?.error || `Download failed (${response.status})`, response.status);
    throw makeFriendlyApiError();
  }
  setApiDiagnostic("csv", "CSV response received from API.", response.status);
  const blob = await response.blob();
  const filename = parseFilename(response.headers.get("content-disposition"), fallbackName);
  triggerDownload(blob, filename);
}

connectBtn?.addEventListener("click", () => {
  connectPortal().catch((error) => setStatus(authStatusEl, error.message, true));
});

clearBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_EMAIL);
  keyInput.value = "";
  actorEmailInput.value = "";
  shellEl.hidden = true;
  clearSinglePreview();
  clearBroadcastPreview();
  setStatus(authStatusEl, "Saved key cleared.");
});

refreshBtn?.addEventListener("click", () => {
  refreshAll({ announceSuccess: true }).catch((error) => {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(authStatusEl, error.message, true);
  });
});

previewBtn?.addEventListener("click", async () => {
  if (!updatePreview()) {
    setStatus(sendStatusEl, "Enter a destination and message first.", true);
    return;
  }
  try {
    const payload = {
      ...currentSinglePayload(),
      dry_run: true,
    };
    const data = await api("/api/admin/texting/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    singlePreviewState = {
      to: data?.preview?.to || "",
      text: data?.preview?.text || "",
      token: data?.approval?.token || "",
      issuedAt: data?.approval?.issuedAt || "",
    };
    previewBox.hidden = false;
    previewSummary.textContent = `Ready to send from ${data.preview.from} to ${data.preview.to}: ${data.preview.text}`;
    setStatus(sendStatusEl, "Preview generated. Review and click Send now to transmit.", false);
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(sendStatusEl, error.message, true);
  }
});

sendForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!singlePreviewState?.token || !singlePreviewState?.issuedAt) {
    setStatus(sendStatusEl, "Run Preview before sending.", true);
    return;
  }

  try {
    const payload = {
      ...currentSinglePayload(),
      preview_token: singlePreviewState.token,
      preview_issued_at: singlePreviewState.issuedAt,
    };
    const data = await api("/api/admin/texting/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    sendForm.reset();
    clearSinglePreview();
    setStatus(sendStatusEl, `Message accepted by Telnyx as ${data.providerId}.`);
    await refreshAll();
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(sendStatusEl, error.message, true);
  }
});

broadcastPreviewBtn?.addEventListener("click", async () => {
  try {
    const payload = {
      ...currentBroadcastPayload(),
      dry_run: true,
    };
    const data = await api("/api/admin/texting/send-batch", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderBroadcastPreview(data);
    setStatus(broadcastStatusEl, "Broadcast preview generated.");
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(broadcastStatusEl, error.message, true);
  }
});

broadcastForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!broadcastPreviewState?.token || !broadcastPreviewState?.issuedAt) {
    setStatus(broadcastStatusEl, "Run broadcast preview before sending.", true);
    return;
  }

  try {
    const payload = {
      ...currentBroadcastPayload(),
      dry_run: false,
      confirmed: true,
      preview_token: broadcastPreviewState.token,
      preview_issued_at: broadcastPreviewState.issuedAt,
    };
    const data = await api("/api/admin/texting/send-batch", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus(broadcastStatusEl, `Broadcast ${data.batchId} sent ${data.sentCount} messages with ${data.failedCount} failures.`);
    clearBroadcastPreview();
    await refreshAll();
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(broadcastStatusEl, error.message, true);
  }
});

messagesSearchInput?.addEventListener("change", () => {
  loadMessages().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsSearchInput?.addEventListener("change", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsFilterInput?.addEventListener("change", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

[sendToInput, sendTextInput].forEach((el) => {
  el?.addEventListener("input", () => {
    if (!singlePreviewState) return;
    clearSinglePreview();
    setStatus(sendStatusEl, "Preview cleared because the message changed. Run Preview again.", false);
  });
});

[broadcastTextInput, broadcastLimitInput].forEach((el) => {
  el?.addEventListener("input", () => {
    if (!broadcastPreviewState) return;
    clearBroadcastPreview();
    setStatus(broadcastStatusEl, "Broadcast preview cleared because the audience or message changed.", false);
  });
});

broadcastFilterSelect?.addEventListener("change", () => {
  if (!broadcastPreviewState) return;
  clearBroadcastPreview();
  setStatus(broadcastStatusEl, "Broadcast preview cleared because the audience or message changed.", false);
});

contactsEl?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-phone]");
  if (!target) return;
  selectedPhone = target.getAttribute("data-phone") || "";
  loadConversation(selectedPhone).catch((error) => setStatus(authStatusEl, error.message, true));
});

const savedKey = localStorage.getItem(STORAGE_KEY);
const savedEmail = localStorage.getItem(STORAGE_EMAIL);
if (savedKey) keyInput.value = savedKey;
if (savedEmail) actorEmailInput.value = savedEmail;
if (savedKey) {
  connectPortal().catch((error) => {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(authStatusEl, error.message, true);
  });
}

downloadContactsBtn?.addEventListener("click", () => {
  downloadCsv("/api/admin/texting/contacts.csv", "texting-contacts.csv")
    .catch((error) => {
      if (shouldReturnToAuth(error)) {
        returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
        return;
      }
      setStatus(authStatusEl, error.message, true);
    });
});

downloadSuppressedBtn?.addEventListener("click", () => {
  downloadCsv("/api/admin/texting/suppressed.csv", "texting-suppressed.csv")
    .catch((error) => {
      if (shouldReturnToAuth(error)) {
        returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
        return;
      }
      setStatus(authStatusEl, error.message, true);
    });
});
