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

const STORAGE_KEY = "skovgard_admin_texting_key";
const STORAGE_EMAIL = "skovgard_admin_texting_email";

let selectedPhone = "";
let previewReady = false;

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

function authHeaders() {
  const key = getAdminKey();
  const actorEmail = getActorEmail();
  return {
    authorization: `Bearer ${key}`,
    ...(actorEmail ? { "x-admin-email": actorEmail } : {}),
  };
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

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Request failed (${response.status})`);
  }
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
      <strong>Secrets and Tables</strong>
      <div class="meta">Telnyx public key: ${telnyx.envPresent?.telnyxPublicKey ? "present" : "missing"}</div>
      <div class="meta">Telnyx API key: ${telnyx.envPresent?.telnyxApiKey ? "present" : "missing"}</div>
      <div class="meta">Telnyx from number: ${telnyx.envPresent?.telnyxFromNumber ? "present" : "missing"}</div>
      <div class="meta">Audit log table: ${telnyx.tables?.texting_audit_log ? "present" : "missing"}</div>
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
  const data = await api(`/api/admin/texting/contacts?limit=50${q ? `&q=${q}` : ""}`);
  renderContacts(data.items || []);
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
    await Promise.all([loadMessages(), loadContacts()]);
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

messagesSearchInput?.addEventListener("change", () => {
  loadMessages().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsSearchInput?.addEventListener("change", () => {
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
