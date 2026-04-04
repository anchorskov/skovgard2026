// static/js/admin-texting.js
import { API_URL } from "/js/env.js";

const authForm = document.getElementById("admin-texting-auth");
const shellEl = document.getElementById("admin-texting-shell");
const authStatusEl = document.getElementById("admin-texting-auth-status");
const keyInput = document.getElementById("admin_texting_key");
const actorEmailInput = document.getElementById("admin_actor_email");
const connectBtn = document.getElementById("admin-texting-connect");
const clearBtn = document.getElementById("admin-texting-clear");
const startOptInBtn = document.getElementById("admin-texting-start-optin");
const refreshBtn = document.getElementById("admin-texting-refresh");
const optInForm = document.getElementById("admin-texting-optin");
const optInStatusEl = document.getElementById("admin-texting-optin-status");
const optInGoEmailsBtn = document.getElementById("admin-optin-go-emails");
const sendForm = document.getElementById("admin-texting-send");
const sendStatusEl = document.getElementById("admin-texting-send-status");
const previewBtn = document.getElementById("text-preview");
const previewBox = document.getElementById("text-preview-box");
const previewSummary = document.getElementById("text-preview-summary");
const statusEl = document.getElementById("admin-texting-status");
const messagesEl = document.getElementById("admin-texting-messages");
const messagesClearVisibleBtn = document.getElementById("messages_clear_visible");
const messagesActionStatusEl = document.getElementById("messages-action-status");
const contactsEl = document.getElementById("admin-texting-contacts");
const conversationEl = document.getElementById("admin-texting-conversation");
const conversationClearBtn = document.getElementById("conversation_clear");
const conversationActionStatusEl = document.getElementById("conversation-action-status");
const messagesSearchInput = document.getElementById("messages_search");
const contactsSearchInput = document.getElementById("contacts_search");
const contactsFilterInput = document.getElementById("contacts_filter");
const contactsCityInput = document.getElementById("contacts_city");
const contactsHdInput = document.getElementById("contacts_hd");
const contactsSdInput = document.getElementById("contacts_sd");
const contactsSelectAllInput = document.getElementById("contacts_select_all");
const contactsAddSelectedBtn = document.getElementById("contacts_add_selected");
const contactsClearSelectionBtn = document.getElementById("contacts_clear_selection");
const contactsSelectionStatusEl = document.getElementById("contacts-selection-status");
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
const recipientTraySummary = document.getElementById("recipient-tray-summary");
const recipientTrayList = document.getElementById("recipient-tray-list");
const recipientTrayClearBtn = document.getElementById("recipient-tray-clear");

const STORAGE_KEY = "skovgard_admin_texting_key";
const STORAGE_EMAIL = "skovgard_admin_texting_email";
const EMAILS_STORAGE_KEY = "skovgard_admin_emails_key";
const EMAILS_STORAGE_EMAIL = "skovgard_admin_emails_email";

let selectedPhone = "";
let singlePreviewState = null;
let broadcastPreviewState = null;
let contactsDataset = [];
let visibleMessages = [];
let visibleContacts = [];
let visibleConversationMessages = [];
const selectedContactPhones = new Set();
const knownContacts = new Map();
const recipientTray = new Map();
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

function hasManualOptInHash() {
  return window.location.hash === "#admin-texting-optin";
}

function startManualOptInFlow({ smooth = true, updateHash = true } = {}) {
  if (!optInForm || shellEl?.hidden) return;
  if (updateHash) window.history.replaceState(null, "", "#admin-texting-optin");
  optInForm.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  window.setTimeout(() => {
    document.getElementById("admin_optin_first_name")?.focus();
  }, smooth ? 180 : 0);
}

function returnToAuth(message, { clearStoredKey = false } = {}) {
  shellEl.hidden = true;
  clearSinglePreview();
  clearBroadcastPreview();
  contactsDataset = [];
  visibleMessages = [];
  selectedContactPhones.clear();
  recipientTray.clear();
  visibleContacts = [];
  visibleConversationMessages = [];
  renderConversation({ phone: "", items: [] });
  renderMessages([]);
  renderRecipientTray();
  updateSelectionUi();
  setStatus(optInStatusEl, "");
  setStatus(messagesActionStatusEl, "");
  setStatus(conversationActionStatusEl, "");
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

function contactDisplayName(item) {
  return `${item?.first_name || ""} ${item?.last_name || ""}`.trim() || item?.phone_e164 || "Unnamed contact";
}

function normalizeFacetText(value) {
  return String(value || "").trim();
}

function normalizeCityValue(value) {
  return normalizeFacetText(value).toLocaleLowerCase();
}

function normalizeDistrictValue(value) {
  const text = normalizeFacetText(value);
  if (!text) return "";
  const digits = text.match(/\d+/)?.[0];
  return digits ? String(Number(digits)) : text.toLocaleUpperCase();
}

function formatDistrictValue(value) {
  const normalized = normalizeDistrictValue(value);
  return normalized || "";
}

function compareDistrictLabels(a, b) {
  const aNumber = Number.parseInt(a, 10);
  const bNumber = Number.parseInt(b, 10);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function setSelectOptions(selectEl, options, defaultLabel) {
  if (!selectEl) return;
  const currentValue = String(selectEl.value || "");
  const values = Array.isArray(options) ? options : [];
  selectEl.innerHTML = [
    `<option value="">${escapeHtml(defaultLabel)}</option>`,
    ...values.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`),
  ].join("");
  const hasCurrent = currentValue && values.some((option) => option.value === currentValue);
  selectEl.value = hasCurrent ? currentValue : "";
}

function buildContactFacetOptions(rows) {
  const cityMap = new Map();
  const hdMap = new Map();
  const sdMap = new Map();

  rows.forEach((item) => {
    const city = normalizeFacetText(item?.city);
    if (city) {
      const key = normalizeCityValue(city);
      if (!cityMap.has(key)) cityMap.set(key, city);
    }

    const hd = formatDistrictValue(item?.state_house_district);
    if (hd && !hdMap.has(hd)) hdMap.set(hd, hd);

    const sd = formatDistrictValue(item?.state_senate_district);
    if (sd && !sdMap.has(sd)) sdMap.set(sd, sd);
  });

  const cities = [...cityMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
    .map(([, label]) => ({ value: label, label }));
  const hds = [...hdMap.values()]
    .sort(compareDistrictLabels)
    .map((value) => ({ value, label: value }));
  const sds = [...sdMap.values()]
    .sort(compareDistrictLabels)
    .map((value) => ({ value, label: value }));

  return { cities, hds, sds };
}

function syncContactFacetOptions(rows) {
  const options = buildContactFacetOptions(rows);
  setSelectOptions(contactsCityInput, options.cities, "All cities");
  setSelectOptions(contactsHdInput, options.hds, "All HDs");
  setSelectOptions(contactsSdInput, options.sds, "All SDs");
}

function contactMatchesLocalFilters(item) {
  const selectedCity = normalizeCityValue(contactsCityInput?.value || "");
  const selectedHd = normalizeDistrictValue(contactsHdInput?.value || "");
  const selectedSd = normalizeDistrictValue(contactsSdInput?.value || "");

  if (selectedCity && normalizeCityValue(item?.city) !== selectedCity) return false;
  if (selectedHd && normalizeDistrictValue(item?.state_house_district) !== selectedHd) return false;
  if (selectedSd && normalizeDistrictValue(item?.state_senate_district) !== selectedSd) return false;
  return true;
}

function contactLocationText(item) {
  const parts = [];
  const city = normalizeFacetText(item?.city);
  const hd = formatDistrictValue(item?.state_house_district);
  const sd = formatDistrictValue(item?.state_senate_district);
  if (city) parts.push(`City: ${city}`);
  if (hd) parts.push(`HD: ${hd}`);
  if (sd) parts.push(`SD: ${sd}`);
  return parts.join(" | ");
}

function districtText(item) {
  const hd = formatDistrictValue(item?.state_house_district);
  const sd = formatDistrictValue(item?.state_senate_district);
  return [hd ? `HD: ${hd}` : null, sd ? `SD: ${sd}` : null].filter(Boolean).join(" | ");
}

function trayRecipientPhones() {
  return [...recipientTray.keys()];
}

function invalidateBroadcastPreview(message) {
  if (!broadcastPreviewState) return;
  clearBroadcastPreview();
  if (message) setStatus(broadcastStatusEl, message, false);
}

function updateBroadcastAudienceControls() {
  const usingTray = recipientTray.size > 0;
  if (broadcastFilterSelect) broadcastFilterSelect.disabled = usingTray;
  if (broadcastLimitInput) broadcastLimitInput.disabled = usingTray;
}

function updateSelectionUi() {
  const visiblePhones = visibleContacts.map((item) => item.phone_e164).filter(Boolean);
  const visibleSelectedCount = visiblePhones.filter((phone) => selectedContactPhones.has(phone)).length;
  const selectedCount = selectedContactPhones.size;
  if (contactsSelectionStatusEl) {
    contactsSelectionStatusEl.classList.remove("is-error");
    contactsSelectionStatusEl.textContent = visibleSelectedCount !== selectedCount
      ? `${selectedCount} selected, ${visibleSelectedCount} visible in the current filters.`
      : `${selectedCount} selected.`;
  }
  if (!contactsSelectAllInput) return;
  contactsSelectAllInput.checked = Boolean(visiblePhones.length) && visibleSelectedCount === visiblePhones.length;
  contactsSelectAllInput.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visiblePhones.length;
  contactsSelectAllInput.disabled = visiblePhones.length === 0;
}

function renderRecipientTray() {
  const items = [...recipientTray.values()];
  updateBroadcastAudienceControls();
  if (recipientTraySummary) {
    recipientTraySummary.textContent = items.length
      ? `${items.length} recipient${items.length === 1 ? "" : "s"} in tray. Preview/send uses opted-in contacts only.`
      : "No recipients selected.";
  }
  if (!recipientTrayList) return;
  recipientTrayList.innerHTML = items.length
    ? items.map((item) => `
        <article class="list-item tray-item">
          <div class="row">
            <div>
              <strong>${escapeHtml(contactDisplayName(item))}</strong>
              <div class="meta">${escapeHtml(item.phone_e164)}</div>
            </div>
            <div class="tray-actions">
              ${badge(item.status || "unknown")}
              <button type="button" class="secondary tray-remove" data-phone="${escapeHtml(item.phone_e164)}">Remove</button>
            </div>
          </div>
          <div class="meta">${escapeHtml(contactLocationText(item) || "City / HD / SD unavailable")}</div>
        </article>
      `).join("")
    : `<p class="empty">Add contacts from the list below to build a recipient tray.</p>`;
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
  const recipients = trayRecipientPhones();
  return {
    filter: broadcastFilterSelect?.value || "opted_in",
    text: broadcastTextInput?.value.trim() || "",
    limit: Number(broadcastLimitInput?.value || 100),
    recipients,
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
  visibleMessages = rows;
  messagesEl.innerHTML = rows.length
    ? rows.map((item) => `
        <article class="list-item">
          <div class="row">
            <div class="message-heading">
              <strong>${escapeHtml(item.direction)}</strong>
              ${badge(item.status)}
            </div>
            <button
              type="button"
              class="secondary message-delete"
              data-direction="${escapeHtml(item.direction)}"
              data-row-id="${escapeHtml(item.row_id)}"
            >Delete</button>
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
  visibleContacts = rows;
  rows.forEach((item) => {
    if (!item?.phone_e164) return;
    knownContacts.set(item.phone_e164, item);
    if (recipientTray.has(item.phone_e164)) {
      recipientTray.set(item.phone_e164, item);
    }
  });
  contactsEl.innerHTML = rows.length
    ? rows.map((item) => `
        <article class="list-item contact-item">
          <div class="row">
            <label class="checkbox-inline" for="contact-select-${escapeHtml(item.phone_e164)}">
              <input
                id="contact-select-${escapeHtml(item.phone_e164)}"
                type="checkbox"
                class="contact-select"
                data-phone="${escapeHtml(item.phone_e164)}"
                ${selectedContactPhones.has(item.phone_e164) ? "checked" : ""}
              />
              <span>Select</span>
            </label>
            <div class="contact-heading">
              <strong>${escapeHtml(contactDisplayName(item))}</strong>
              <div class="contact-badges">
                ${badge(item.status || "unknown")}
                ${Number(item?.is_volunteer || 0) === 1 ? statusChip("Volunteer", "accepted") : ""}
              </div>
            </div>
            <div class="contact-actions">
              <button
                type="button"
                class="contact-tray-toggle"
                data-phone="${escapeHtml(item.phone_e164)}"
              >${recipientTray.has(item.phone_e164) ? "Remove from tray" : "Add to tray"}</button>
              <button type="button" class="secondary contact-thread" data-phone="${escapeHtml(item.phone_e164)}">View thread</button>
            </div>
          </div>
          <div class="meta">${escapeHtml(item.phone_e164)}</div>
          <div class="meta">City: ${escapeHtml(normalizeFacetText(item?.city) || "\u2014")}</div>
          <div class="meta">${escapeHtml(districtText(item) || "HD / SD unavailable")}</div>
          <div class="meta contact-volunteer-row">
            <label class="checkbox-inline" for="contact-volunteer-${escapeHtml(item.phone_e164)}">
              <input
                id="contact-volunteer-${escapeHtml(item.phone_e164)}"
                type="checkbox"
                class="contact-volunteer-toggle"
                data-phone="${escapeHtml(item.phone_e164)}"
                ${Number(item?.is_volunteer || 0) === 1 ? "checked" : ""}
              />
              <span>Volunteer</span>
            </label>
          </div>
          <div class="meta">Keyword: ${escapeHtml(item.last_inbound_keyword || "none")}</div>
        </article>
      `).join("")
    : `<p class="empty">No contacts found.</p>`;
  updateSelectionUi();
  renderRecipientTray();
}

async function updateContactVolunteer(phone, isVolunteer) {
  try {
    const data = await api("/api/admin/texting/contacts/volunteer", {
      method: "POST",
      body: JSON.stringify({
        phone,
        is_volunteer: isVolunteer,
      }),
    });
    await loadContacts();
    const item = data?.item || knownContacts.get(phone);
    setStatus(
      contactsSelectionStatusEl,
      `${contactDisplayName(item)} volunteer ${data?.isVolunteer ? "enabled" : "cleared"}.`
    );
  } catch (error) {
    await loadContacts().catch(() => {});
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(contactsSelectionStatusEl, error.message, true);
  }
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
  visibleConversationMessages = items;
  const consent = isRecord(model.consent) ? model.consent : null;
  const location = contactLocationText({
    city: consent?.city,
    state_house_district: consent?.state_house_district,
    state_senate_district: consent?.state_senate_district,
  });
  if (conversationClearBtn) {
    conversationClearBtn.disabled = !(model.phone && items.length);
  }
  conversationEl.innerHTML = `
    <div class="conversation-summary">
      <strong>${escapeHtml(model.phone || "No contact selected")}</strong>
      <div class="meta">Consent: ${consent ? escapeHtml(consent.status || "unknown") : "unknown"}</div>
      <div class="meta">Last keyword: ${escapeHtml(consent?.last_inbound_keyword || "none")}</div>
      <div class="meta">${escapeHtml(location || "City / HD / SD unavailable")}</div>
    </div>
    ${items.length
      ? items.map((item) => `
          <article class="list-item">
            <div class="row">
              <div class="message-heading">
                <strong>${escapeHtml(item.direction)}</strong>
                ${badge(item.status)}
              </div>
              <button
                type="button"
                class="secondary conversation-message-delete"
                data-direction="${escapeHtml(item.direction)}"
                data-row-id="${escapeHtml(item.row_id)}"
              >Delete</button>
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
  const data = await api(
    `/api/admin/texting/contacts?limit=5000&filter=${filter}${q ? `&q=${q}` : ""}`
  );
  contactsDataset = Array.isArray(data?.items) ? data.items : [];
  syncContactFacetOptions(contactsDataset);
  renderContacts(contactsDataset.filter(contactMatchesLocalFilters));
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

function normalizeDeleteMessageItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      direction: String(item?.direction || "").trim().toLowerCase(),
      row_id: Number(item?.row_id || 0),
    }))
    .filter((item) => (item.direction === "inbound" || item.direction === "outbound") && Number.isInteger(item.row_id) && item.row_id > 0);
}

async function deleteMessageItems(items, { statusEl = messagesActionStatusEl, confirmText = "", successMessage = "" } = {}) {
  const normalizedItems = normalizeDeleteMessageItems(items);
  if (!normalizedItems.length) {
    setStatus(statusEl, "No messages selected to delete.", true);
    return;
  }
  const prompt = confirmText || `Delete ${normalizedItems.length} message${normalizedItems.length === 1 ? "" : "s"}? This permanently removes the rows from the texting tables.`;
  if (!window.confirm(prompt)) return;

  try {
    const data = await api("/api/admin/texting/messages/delete", {
      method: "POST",
      body: JSON.stringify({ items: normalizedItems }),
    });
    await refreshAll();
    const deletedCount = Number(data?.deletedCount || 0);
    setStatus(
      statusEl,
      successMessage || `${deletedCount} message${deletedCount === 1 ? "" : "s"} deleted permanently from the texting tables.`
    );
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(statusEl, error.message, true);
  }
}

async function clearSelectedConversation() {
  if (!selectedPhone) {
    setStatus(conversationActionStatusEl, "Select a conversation first.", true);
    return;
  }
  if (!visibleConversationMessages.length) {
    setStatus(conversationActionStatusEl, "No conversation messages to clear.", true);
    return;
  }
  if (!window.confirm(`Clear all messages for ${selectedPhone}? This permanently removes the conversation rows from the texting tables.`)) return;

  try {
    const data = await api("/api/admin/texting/conversations/clear", {
      method: "POST",
      body: JSON.stringify({ phone: selectedPhone }),
    });
    await refreshAll();
    const deletedCount = Number(data?.deletedCount || 0);
    setStatus(
      conversationActionStatusEl,
      `${deletedCount} message${deletedCount === 1 ? "" : "s"} deleted for ${selectedPhone}.`
    );
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(conversationActionStatusEl, error.message, true);
  }
}

async function clearMessagesBySearch() {
  const q = String(messagesSearchInput?.value || "").trim();
  const scopeText = q ? `all messages matching "${q}"` : "ALL messages";
  const promptLabel = q ? "DELETE MATCHES" : "DELETE ALL";
  const confirmation = window.prompt(
    `Type ${promptLabel} to permanently remove ${scopeText} from the inbound and outbound message tables.`
  );
  if (confirmation !== promptLabel) {
    setStatus(messagesActionStatusEl, `Deletion cancelled. Type ${promptLabel} exactly to confirm.`, true);
    return;
  }

  try {
    const data = await api("/api/admin/texting/messages/clear", {
      method: "POST",
      body: JSON.stringify({ q }),
    });
    await refreshAll();
    const deletedCount = Number(data?.deletedCount || 0);
    setStatus(
      messagesActionStatusEl,
      q
        ? `${deletedCount} matching message${deletedCount === 1 ? "" : "s"} deleted from the texting tables.`
        : `${deletedCount} message${deletedCount === 1 ? "" : "s"} deleted from the texting tables.`
    );
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(messagesActionStatusEl, error.message, true);
  }
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
    if (hasManualOptInHash()) {
      startManualOptInFlow({ smooth: false, updateHash: false });
    }
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
  const mode = data?.mode === "explicit" ? "tray" : "audience";
  broadcastPreviewSummary.textContent = mode === "tray"
    ? `Recipient tray: ${data.audienceCount}. Sendable now: ${data.count}. Skipped by safeguards: ${data.skippedCount || 0}. Batch ID: ${data.batchId}. Previewing first ${items.length} sendable recipients.`
    : `Audience size: ${data.audienceCount}. Sendable now: ${data.count}. Skipped by safeguards: ${data.skippedCount || 0}. Batch ID: ${data.batchId}. Previewing first ${items.length} recipients.`;
  broadcastPreviewList.innerHTML = items.length
    ? items.map((item) => `
        <div class="preview-list-item">
          <strong>${escapeHtml(contactDisplayName(item))}</strong>
          <div class="meta">${escapeHtml(item.phone_e164)}</div>
          <div class="meta">${escapeHtml(contactLocationText({
            city: item.city,
            state_house_district: item.hd,
            state_senate_district: item.sd,
          }) || "City / HD / SD unavailable")}</div>
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

function addSelectedContactsToTray() {
  const phones = [...selectedContactPhones];
  let added = 0;
  phones.forEach((phone) => {
    const item = knownContacts.get(phone);
    if (!item) return;
    if (!recipientTray.has(phone)) added += 1;
    recipientTray.set(phone, item);
  });
  if (!phones.length) {
    setStatus(contactsSelectionStatusEl, "Select one or more contacts first.", true);
    return;
  }
  selectedContactPhones.clear();
  updateSelectionUi();
  renderRecipientTray();
  invalidateBroadcastPreview("Broadcast preview cleared because the recipient tray changed.");
  setStatus(
    contactsSelectionStatusEl,
    added ? `${added} contact${added === 1 ? "" : "s"} added to the recipient tray.` : "All selected contacts were already in the recipient tray."
  );
}

connectBtn?.addEventListener("click", () => {
  connectPortal().catch((error) => setStatus(authStatusEl, error.message, true));
});

startOptInBtn?.addEventListener("click", () => {
  startManualOptInFlow();
});

optInGoEmailsBtn?.addEventListener("click", () => {
  const key = getAdminKey();
  const actorEmail = getActorEmail();
  if (key) localStorage.setItem(EMAILS_STORAGE_KEY, key);
  if (actorEmail) localStorage.setItem(EMAILS_STORAGE_EMAIL, actorEmail);
  else localStorage.removeItem(EMAILS_STORAGE_EMAIL);
  window.location.assign("/admin/emails/");
});

clearBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_EMAIL);
  keyInput.value = "";
  actorEmailInput.value = "";
  shellEl.hidden = true;
  clearSinglePreview();
  clearBroadcastPreview();
  contactsDataset = [];
  visibleMessages = [];
  selectedContactPhones.clear();
  recipientTray.clear();
  visibleContacts = [];
  visibleConversationMessages = [];
  renderRecipientTray();
  renderMessages([]);
  renderConversation({ phone: "", items: [] });
  updateSelectionUi();
  setStatus(optInStatusEl, "");
  setStatus(messagesActionStatusEl, "");
  setStatus(conversationActionStatusEl, "");
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

optInForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(optInForm);
  const payload = {
    first_name: String(formData.get("admin_optin_first_name") || "").trim(),
    last_name: String(formData.get("admin_optin_last_name") || "").trim(),
    phone: String(formData.get("admin_optin_phone") || "").trim(),
    email: String(formData.get("admin_optin_email") || "").trim(),
    consent_email: formData.get("admin_optin_consent_email") === "on",
    wy_voter: formData.get("admin_optin_wy_voter") === "on",
    is_volunteer: formData.get("admin_optin_is_volunteer") === "on",
  };

  try {
    const data = await api("/api/admin/texting/optins", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    optInForm.reset();
    setStatus(
      optInStatusEl,
      data?.result === "updated"
        ? `Updated opted-in contact for ${data.phoneE164}.`
        : `Created opted-in contact for ${data.phoneE164}.`
    );
    selectedPhone = data?.phoneE164 || selectedPhone;
    await refreshAll();
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(optInStatusEl, error.message, true);
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
    setStatus(
      broadcastStatusEl,
      `Broadcast ${data.batchId} sent ${data.sentCount} messages with ${data.failedCount} failures and ${data.skippedCount || 0} skipped by safeguards.`
    );
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

messagesClearVisibleBtn?.addEventListener("click", () => {
  clearMessagesBySearch();
});

contactsSearchInput?.addEventListener("change", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsFilterInput?.addEventListener("change", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

[contactsCityInput, contactsHdInput, contactsSdInput].forEach((el) => {
  el?.addEventListener("change", () => {
    renderContacts(contactsDataset.filter(contactMatchesLocalFilters));
  });
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

contactsSelectAllInput?.addEventListener("change", (event) => {
  const checked = Boolean(event.target?.checked);
  visibleContacts.forEach((item) => {
    if (!item?.phone_e164) return;
    if (checked) selectedContactPhones.add(item.phone_e164);
    else selectedContactPhones.delete(item.phone_e164);
  });
  renderContacts(visibleContacts);
});

contactsAddSelectedBtn?.addEventListener("click", () => {
  addSelectedContactsToTray();
});

contactsClearSelectionBtn?.addEventListener("click", () => {
  selectedContactPhones.clear();
  renderContacts(visibleContacts);
  setStatus(contactsSelectionStatusEl, "Selection cleared.");
});

contactsEl?.addEventListener("change", (event) => {
  const volunteerToggle = event.target.closest(".contact-volunteer-toggle");
  if (volunteerToggle) {
    const phone = volunteerToggle.getAttribute("data-phone") || "";
    if (!phone) return;
    updateContactVolunteer(phone, volunteerToggle.checked);
    return;
  }
  const target = event.target.closest(".contact-select");
  if (!target) return;
  const phone = target.getAttribute("data-phone") || "";
  if (!phone) return;
  if (target.checked) selectedContactPhones.add(phone);
  else selectedContactPhones.delete(phone);
  updateSelectionUi();
});

contactsEl?.addEventListener("click", (event) => {
  const trayButton = event.target.closest(".contact-tray-toggle");
  if (trayButton) {
    const phone = trayButton.getAttribute("data-phone") || "";
    if (!phone) return;
    if (recipientTray.has(phone)) {
      recipientTray.delete(phone);
      renderContacts(visibleContacts);
      invalidateBroadcastPreview("Broadcast preview cleared because the recipient tray changed.");
      setStatus(contactsSelectionStatusEl, `Removed ${phone} from the recipient tray.`);
      return;
    }
    const item = knownContacts.get(phone);
    if (!item) return;
    recipientTray.set(phone, item);
    renderContacts(visibleContacts);
    invalidateBroadcastPreview("Broadcast preview cleared because the recipient tray changed.");
    setStatus(contactsSelectionStatusEl, `Added ${contactDisplayName(item)} to the recipient tray.`);
    return;
  }
  const threadButton = event.target.closest(".contact-thread");
  if (!threadButton) return;
  const phone = threadButton.getAttribute("data-phone") || "";
  if (!phone) return;
  selectedPhone = phone;
  loadConversation(selectedPhone).catch((error) => setStatus(authStatusEl, error.message, true));
});

messagesEl?.addEventListener("click", (event) => {
  const target = event.target.closest(".message-delete");
  if (!target) return;
  const rowId = Number(target.getAttribute("data-row-id") || 0);
  const direction = String(target.getAttribute("data-direction") || "").trim().toLowerCase();
  const item = visibleMessages.find((row) => Number(row?.row_id || 0) === rowId && String(row?.direction || "").trim().toLowerCase() === direction);
  deleteMessageItems(item ? [item] : [{ row_id: rowId, direction }], {
    statusEl: messagesActionStatusEl,
    confirmText: "Delete this message? This permanently removes the row from the texting tables.",
  });
});

conversationEl?.addEventListener("click", (event) => {
  const target = event.target.closest(".conversation-message-delete");
  if (!target) return;
  const rowId = Number(target.getAttribute("data-row-id") || 0);
  const direction = String(target.getAttribute("data-direction") || "").trim().toLowerCase();
  const item = visibleConversationMessages.find((row) => Number(row?.row_id || 0) === rowId && String(row?.direction || "").trim().toLowerCase() === direction);
  deleteMessageItems(item ? [item] : [{ row_id: rowId, direction }], {
    statusEl: conversationActionStatusEl,
    confirmText: "Delete this conversation message? This permanently removes the row from the texting tables.",
  });
});

conversationClearBtn?.addEventListener("click", () => {
  clearSelectedConversation();
});

recipientTrayList?.addEventListener("click", (event) => {
  const target = event.target.closest(".tray-remove");
  if (!target) return;
  const phone = target.getAttribute("data-phone") || "";
  if (!phone) return;
  recipientTray.delete(phone);
  renderRecipientTray();
  invalidateBroadcastPreview("Broadcast preview cleared because the recipient tray changed.");
});

recipientTrayClearBtn?.addEventListener("click", () => {
  if (!recipientTray.size) return;
  recipientTray.clear();
  renderRecipientTray();
  invalidateBroadcastPreview("Broadcast preview cleared because the recipient tray changed.");
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

renderRecipientTray();
updateSelectionUi();
