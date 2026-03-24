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

const STORAGE_KEY = "skovgard_admin_texting_key";
const STORAGE_EMAIL = "skovgard_admin_texting_email";

let selectedPhone = "";
let previewReady = false;
let broadcastPreviewReady = null;
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
  const telnyx = data?.telnyx || {};
  statusEl.innerHTML = `
    <article class="status-item">
      <strong>Webhook</strong>
      <div class="meta">Live: ${telnyx.webhookRouteLive ? "yes" : "no"}</div>
      <div class="meta">Last webhook: ${escapeHtml(formatTs(telnyx.lastWebhookReceivedAt) || "none yet")}</div>
      <div class="meta">Last invalid signature: ${escapeHtml(formatTs(telnyx.lastInvalidSignatureAt) || "none yet")}</div>
    </article>
    <article class="status-item">
      <strong>Outbound</strong>
      <div class="meta">Last outbound: ${escapeHtml(formatTs(data.lastOutboundAt) || "none yet")}</div>
      <div class="meta">Last inbound: ${escapeHtml(formatTs(data.lastInboundAt) || "none yet")}</div>
      <div class="meta">Failed deliveries: ${escapeHtml(String(data.failedDeliveries ?? 0))}</div>
    </article>
    <article class="status-item">
      <strong>Consent</strong>
      <div class="meta">Opted in: ${escapeHtml(String(data.optedInCount ?? 0))}</div>
      <div class="meta">Opted out: ${escapeHtml(String(data.optedOutCount ?? 0))}</div>
      <div class="meta">New opt-ins (24h): ${escapeHtml(String(data.newOptIns24h ?? 0))}</div>
    </article>
    <article class="status-item">
      <strong>Secrets and Tables</strong>
      <div class="meta">Telnyx public key: ${telnyx.envPresent?.telnyxPublicKey ? "present" : "missing"}</div>
      <div class="meta">Telnyx API key: ${telnyx.envPresent?.telnyxApiKey ? "present" : "missing"}</div>
      <div class="meta">Telnyx from number: ${telnyx.envPresent?.telnyxFromNumber ? "present" : "missing"}</div>
      <div class="meta">Audit log table: ${telnyx.tables?.texting_audit_log ? "present" : "missing"}</div>
    </article>
    <article class="status-item">
      <strong>Browser/API</strong>
      <div class="meta">Origin: ${escapeHtml(window.location.origin)}</div>
      <div class="meta">API base: ${escapeHtml(apiBaseForDisplay())}</div>
      <div class="meta">Last response: ${escapeHtml(lastApiDiagnostic.kind)}</div>
      <div class="meta">Last status: ${escapeHtml(lastApiDiagnostic.status ?? "n/a")}</div>
      <div class="meta">${escapeHtml(lastApiDiagnostic.message)}</div>
    </article>
  `;
}

function renderMessages(items) {
  messagesEl.innerHTML = items.length
    ? items.map((item) => `
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
  contactsEl.innerHTML = items.length
    ? items.map((item) => `
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
  suppressionEl.innerHTML = items.length
    ? items.map((item) => `
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
  const items = data?.items || [];
  const consent = data?.consent;
  conversationEl.innerHTML = `
    <div class="conversation-summary">
      <strong>${escapeHtml(data?.phone || "No contact selected")}</strong>
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

async function refreshAll() {
  await Promise.all([
    loadStatus(),
    loadMessages(),
    loadContacts(),
    loadSuppression(),
    selectedPhone ? loadConversation(selectedPhone) : Promise.resolve(renderConversation({ phone: "", items: [] })),
  ]);
}

async function connectPortal() {
  const key = getAdminKey();
  if (!key) {
    setStatus(authStatusEl, "Enter the admin key first.", true);
    keyInput?.focus();
    return;
  }

  try {
    await loadStatus();
    localStorage.setItem(STORAGE_KEY, key);
    localStorage.setItem(STORAGE_EMAIL, getActorEmail());
    shellEl.hidden = false;
    setStatus(authStatusEl, "Portal loaded.");
    await Promise.all([loadMessages(), loadContacts(), loadSuppression()]);
    renderConversation({ phone: "", items: [] });
  } catch (error) {
    shellEl.hidden = true;
    setStatus(authStatusEl, error.message, true);
  }
}

function updatePreview() {
  const to = document.getElementById("send_to")?.value.trim() || "";
  const text = document.getElementById("send_text")?.value.trim() || "";
  previewReady = Boolean(to && text);
  previewBox.hidden = !previewReady;
  previewSummary.textContent = previewReady
    ? `Review send to ${to}: ${text}`
    : "";
}

function renderBroadcastPreview(data) {
  const items = data?.previewRecipients || [];
  broadcastPreviewReady = data;
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
  setStatus(authStatusEl, "Saved key cleared.");
});

refreshBtn?.addEventListener("click", () => {
  refreshAll().catch((error) => setStatus(authStatusEl, error.message, true));
});

previewBtn?.addEventListener("click", async () => {
  updatePreview();
  if (!previewReady) {
    setStatus(sendStatusEl, "Enter a destination and message first.", true);
    return;
  }
  try {
    const payload = {
      to: document.getElementById("send_to")?.value.trim(),
      text: document.getElementById("send_text")?.value.trim(),
      dry_run: true,
    };
    const data = await api("/api/admin/texting/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    previewBox.hidden = false;
    previewSummary.textContent = `Ready to send from ${data.preview.from} to ${data.preview.to}: ${data.preview.text}`;
    setStatus(sendStatusEl, "Preview generated. Review and click Send now to transmit.", false);
  } catch (error) {
    setStatus(sendStatusEl, error.message, true);
  }
});

sendForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!previewReady) {
    setStatus(sendStatusEl, "Run Preview before sending.", true);
    return;
  }

  try {
    const payload = {
      to: document.getElementById("send_to")?.value.trim(),
      text: document.getElementById("send_text")?.value.trim(),
    };
    const data = await api("/api/admin/texting/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    sendForm.reset();
    previewBox.hidden = true;
    previewReady = false;
    setStatus(sendStatusEl, `Message accepted by Telnyx as ${data.providerId}.`);
    await refreshAll();
  } catch (error) {
    setStatus(sendStatusEl, error.message, true);
  }
});

broadcastPreviewBtn?.addEventListener("click", async () => {
  try {
    const payload = {
      filter: document.getElementById("broadcast_filter")?.value || "opted_in",
      text: document.getElementById("broadcast_text")?.value.trim() || "",
      limit: Number(document.getElementById("broadcast_limit")?.value || 100),
      dry_run: true,
    };
    const data = await api("/api/admin/texting/send-batch", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderBroadcastPreview(data);
    setStatus(broadcastStatusEl, "Broadcast preview generated.");
  } catch (error) {
    setStatus(broadcastStatusEl, error.message, true);
  }
});

broadcastForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!broadcastPreviewReady) {
    setStatus(broadcastStatusEl, "Run broadcast preview before sending.", true);
    return;
  }

  try {
    const payload = {
      filter: document.getElementById("broadcast_filter")?.value || "opted_in",
      text: document.getElementById("broadcast_text")?.value.trim() || "",
      limit: Number(document.getElementById("broadcast_limit")?.value || 100),
      dry_run: false,
      confirmed: true,
    };
    const data = await api("/api/admin/texting/send-batch", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus(broadcastStatusEl, `Broadcast ${data.batchId} sent ${data.sentCount} messages with ${data.failedCount} failures.`);
    broadcastPreviewReady = null;
    broadcastPreviewBox.hidden = true;
    await refreshAll();
  } catch (error) {
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

downloadContactsBtn?.addEventListener("click", () => {
  downloadCsv("/api/admin/texting/contacts.csv", "texting-contacts.csv")
    .catch((error) => setStatus(authStatusEl, error.message, true));
});

downloadSuppressedBtn?.addEventListener("click", () => {
  downloadCsv("/api/admin/texting/suppressed.csv", "texting-suppressed.csv")
    .catch((error) => setStatus(authStatusEl, error.message, true));
});
