// static/js/admin-emails.js
import { API_URL } from "/js/env.js";

const SHARE_MESSAGE_OPTIONS = [
  { slug: "fleecing-letters",                   title: "The Fleecing Letters",                         defaultSubject: "Official mail paid for by you. Here's what's in it." },
  { slug: "postage-bandit",                      title: "Postage Bandit",                               defaultSubject: "Postage Bandit: FEC complaint filed against Rep. Hageman" },
  { slug: "citizens-defend-the-constitution",    title: "Citizens Defend the Constitution",             defaultSubject: "Citizens defend the Constitution — a Wyoming message from Jimmy Skovgard" },
  { slug: "jimmys-story",                        title: "Jimmy's Story",                                defaultSubject: "Your neighbor wanted you to hear about Jimmy Skovgard for Wyoming" },
  { slug: "freedom-vs-control",                  title: "Freedom vs. Control",                          defaultSubject: "Wyoming's election legislation — freedom vs. control" },
  { slug: "wyoming-voters-choose",               title: "Wyoming Voters Should Choose",                 defaultSubject: "Wyoming voters should choose" },
  { slug: "representatives-work-for",            title: "Who Do Our Representatives Work For?",         defaultSubject: "Who do our representatives work for?" },
  { slug: "wy-voter-access",                     title: "Wyoming Voter Access Survey",                  defaultSubject: "Wyoming Voter Access Survey" },
  { slug: "wy-primary-election-participation",   title: "Wyoming Primary Election Participation Survey",defaultSubject: "Wyoming Primary Election Participation Survey" },
  { slug: "wy-citizen-ballot",                   title: "Citizens Nonpartisan Ballot",                  defaultSubject: "Wyoming voter choice: Citizens Nonpartisan Ballot" },
  { slug: "untrammeled-suffrage",                title: "Untrammeled Suffrage",                         defaultSubject: "Test access to Untrammeled Suffrage, a Wyoming voter outreach tool" },
  { slug: "wy-data-centers",                     title: "Wyoming Data Centers Survey",                  defaultSubject: "Wyoming data centers: what safeguards should come first?" },
  { slug: "wy-four-pillars",                     title: "Wyoming Four Pillars Survey",                  defaultSubject: "Wyoming Four Pillars Survey" },
  { slug: "wy-roadless-areas",                   title: "Wyoming Roadless Areas Survey",                defaultSubject: "Wyoming roadless areas: what standards should come first?" },
  { slug: "nothing-burger",                      title: "Taxpayer-Funded Nothing Burger",               defaultSubject: "Wyoming public lands: why did Montana get protection Wyoming didn't?" },
  { slug: "changing-health-care",                title: "Changing Health Care",                         defaultSubject: "Wyoming health care: the honest constitutional path" },
  { slug: "candidate-hub",                       title: "Wyoming Candidate Hub",                        defaultSubject: "Wyoming Candidate Hub: every candidate, one place" },
  { slug: "primary-candidates",                  title: "One Place to See Every Wyoming Candidate",     defaultSubject: "One place to see every Wyoming candidate" },
];

const authForm = document.getElementById("admin-emails-auth");
const shellEl = document.getElementById("admin-emails-shell");
const authStatusEl = document.getElementById("admin-emails-auth-status");
const keyInput = document.getElementById("admin_emails_key");
const actorEmailInput = document.getElementById("admin_emails_actor_email");
const connectBtn = document.getElementById("admin-emails-connect");
const clearBtn = document.getElementById("admin-emails-clear");
const refreshBtn = document.getElementById("admin-emails-refresh");
const composeForm = document.getElementById("admin-emails-compose");
const composeStatusEl = document.getElementById("admin-emails-compose-status");
const audienceFilterInput = document.getElementById("email_filter");
const limitInput = document.getElementById("email_limit");
const subjectInput = document.getElementById("email_subject");
const bodyInput = document.getElementById("email_body");
const previewBtn = document.getElementById("email-preview");
const sendBtn = document.getElementById("email-send");
const testToInput = document.getElementById("email_test_to");
const sendTestBtn = document.getElementById("email-send-test");
const sendTestStatusEl = document.getElementById("email-send-test-status");
const previewBox = document.getElementById("email-preview-box");
const previewSummary = document.getElementById("email-preview-summary");
const previewList = document.getElementById("email-preview-list");
const statusEl = document.getElementById("admin-emails-status");
const contactsEl = document.getElementById("admin-emails-contacts");
const contactsSearchInput = document.getElementById("email_contacts_search");
const contactsFilterInput = document.getElementById("email_contacts_filter");
const contactsCityInput = document.getElementById("email_contacts_city");
const contactsHdInput = document.getElementById("email_contacts_hd");
const contactsSdInput = document.getElementById("email_contacts_sd");
const contactsSelectAllInput = document.getElementById("email_contacts_select_all");
const contactsAddSelectedBtn = document.getElementById("email_contacts_add_selected");
const contactsClearSelectionBtn = document.getElementById("email_contacts_clear_selection");
const contactsSelectionStatusEl = document.getElementById("email-contacts-selection-status");
const recipientTraySummary = document.getElementById("email-recipient-tray-summary");
const recipientTrayList = document.getElementById("email-recipient-tray-list");
const recipientTrayClearBtn = document.getElementById("email-recipient-tray-clear");
const sendReceiptEl = document.getElementById("email-send-receipt");
const sendReceiptSummaryEl = document.getElementById("email-send-receipt-summary");
const sendReceiptToggleBtn = document.getElementById("email-send-receipt-toggle");
const sendReceiptListEl = document.getElementById("email-send-receipt-list");
const emailModeInput = document.getElementById("email_mode");
const shareSlugInput = document.getElementById("share_slug");
const shareIntroInput = document.getElementById("share_intro_text");
const sharePickerField = document.getElementById("share-picker-field");
const shareIntroField = document.getElementById("share-intro-field");
const emailBodyField = document.getElementById("email-body-field");

const STORAGE_KEY = "skovgard_admin_emails_key";
const STORAGE_EMAIL = "skovgard_admin_emails_email";

let contactsDataset = [];
let visibleContacts = [];
let previewState = null;
let sendPathReady = false;
let sendInFlight = false;
const selectedContactEmails = new Set();
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

function clearPreview() {
  previewState = null;
  if (previewBox) previewBox.hidden = true;
  if (previewSummary) previewSummary.textContent = "";
  if (previewList) previewList.innerHTML = "";
  updateSendButtonState();
}

function clearPortalState() {
  clearPreview();
  contactsDataset = [];
  visibleContacts = [];
  selectedContactEmails.clear();
  knownContacts.clear();
  recipientTray.clear();
  renderContacts([]);
  renderRecipientTray();
  renderStatusFallback("Portal is not loaded yet.");
  updateSelectionUi();
  setStatus(contactsSelectionStatusEl, "");
  setStatus(composeStatusEl, "");
  if (sendReceiptEl) sendReceiptEl.hidden = true;
}

function renderSendReceipt(sentCount, failedCount, recipients) {
  if (!sendReceiptEl || !sendReceiptSummaryEl || !sendReceiptListEl) return;
  const label = failedCount
    ? `Sent ${sentCount} message${sentCount === 1 ? "" : "s"} · ${failedCount} failed`
    : `Sent ${sentCount} message${sentCount === 1 ? "" : "s"}`;
  sendReceiptSummaryEl.textContent = label;
  sendReceiptListEl.innerHTML = recipients.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ");
    const display = name ? `${name} — ${r.email || r.email_norm || ""}` : (r.email || r.email_norm || r);
    return `<li>${escapeHtml(display)}</li>`;
  }).join("");
  sendReceiptListEl.hidden = true;
  if (sendReceiptToggleBtn) sendReceiptToggleBtn.textContent = "Show recipients";
  sendReceiptEl.hidden = false;
}

sendReceiptToggleBtn?.addEventListener("click", () => {
  if (!sendReceiptListEl) return;
  const isHidden = sendReceiptListEl.hidden;
  sendReceiptListEl.hidden = !isHidden;
  sendReceiptToggleBtn.textContent = isHidden ? "Hide recipients" : "Show recipients";
});

function returnToAuth(message, { clearStoredKey = false } = {}) {
  if (shellEl) shellEl.hidden = true;
  clearPortalState();
  if (clearStoredKey) {
    localStorage.removeItem(STORAGE_KEY);
    if (keyInput) keyInput.value = "";
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
      return new Error("Your Access session for the email API is not active. Re-authenticate to Cloudflare Access for this hostname and try again.");
    case "unauthorized":
      return new Error("The admin key was rejected.");
    case "network_error":
      return new Error("The email API could not be reached. Check your network or Cloudflare Access session.");
    case "html":
      return new Error("The email API returned HTML instead of JSON. Your Access session may not be active for the API route.");
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "n/a";
}

function statusChip(label, tone = "unknown") {
  return `<span class="status-badge status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function badge(status) {
  const s = String(status || "unknown").toLowerCase();
  return `<span class="status-badge status-${escapeHtml(s)}">${escapeHtml(s)}</span>`;
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
  const hd = formatDistrictValue(item?.state_house_district || item?.hd);
  const sd = formatDistrictValue(item?.state_senate_district || item?.sd);
  if (city) parts.push(`City: ${city}`);
  if (hd) parts.push(`HD: ${hd}`);
  if (sd) parts.push(`SD: ${sd}`);
  return parts.join(" | ");
}

function contactDisplayName(item) {
  return `${item?.first_name || ""} ${item?.last_name || ""}`.trim() || item?.email || "Unnamed contact";
}

function hasVolunteerPhone(item) {
  return Boolean(String(item?.phone_e164 || "").trim());
}

function trayRecipientEmails() {
  return [...recipientTray.keys()];
}

let shareSlugOptionsPopulated = false;

function populateShareSlugOptions() {
  if (shareSlugOptionsPopulated || !shareSlugInput) return;
  shareSlugOptionsPopulated = true;
  const fragment = document.createDocumentFragment();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— Select a message —";
  fragment.appendChild(blank);
  SHARE_MESSAGE_OPTIONS.forEach(({ slug, title }) => {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = title;
    fragment.appendChild(opt);
  });
  shareSlugInput.innerHTML = "";
  shareSlugInput.appendChild(fragment);
}

function currentEmailMode() {
  return String(emailModeInput?.value || "custom").trim();
}

function isShareMode() {
  const m = currentEmailMode();
  return m === "share" || m === "share_with_intro";
}

function handleModeChange() {
  const mode = currentEmailMode();
  const isShare = mode === "share" || mode === "share_with_intro";
  const isShareWithIntro = mode === "share_with_intro";

  if (sharePickerField) sharePickerField.hidden = !isShare;
  if (shareIntroField) shareIntroField.hidden = !isShareWithIntro;
  if (emailBodyField) emailBodyField.hidden = isShare;

  if (isShare) populateShareSlugOptions();

  if (!isShare) {
    if (subjectInput && !subjectInput.dataset.userEdited) subjectInput.value = "";
  }

  invalidatePreview("Preview cleared because email type changed.");
}

function handleShareSlugChange() {
  const slug = String(shareSlugInput?.value || "").trim();
  const option = SHARE_MESSAGE_OPTIONS.find((o) => o.slug === slug);
  if (subjectInput && option && !subjectInput.dataset.userEdited) {
    subjectInput.value = option.defaultSubject;
  }
  invalidatePreview("Preview cleared because share message changed.");
}

function invalidatePreview(message) {
  if (!previewState) return;
  clearPreview();
  if (message) setStatus(composeStatusEl, message);
}

function invalidateFilterPreview(message) {
  if (recipientTray.size > 0) return;
  invalidatePreview(message);
}

function updatePreviewAudienceControls() {
  const usingTray = recipientTray.size > 0;
  if (audienceFilterInput) audienceFilterInput.disabled = usingTray;
  if (limitInput) limitInput.disabled = usingTray;
}

function updateSelectionUi() {
  const visibleEmails = visibleContacts.map((item) => item.email_norm).filter(Boolean);
  const visibleSelectedCount = visibleEmails.filter((email) => selectedContactEmails.has(email)).length;
  const selectedCount = selectedContactEmails.size;
  if (contactsSelectionStatusEl) {
    contactsSelectionStatusEl.classList.remove("is-error");
    contactsSelectionStatusEl.textContent = visibleSelectedCount !== selectedCount
      ? `${selectedCount} selected, ${visibleSelectedCount} visible in the current filters.`
      : `${selectedCount} selected.`;
  }
  if (!contactsSelectAllInput) return;
  contactsSelectAllInput.checked = Boolean(visibleEmails.length) && visibleSelectedCount === visibleEmails.length;
  contactsSelectAllInput.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleEmails.length;
  contactsSelectAllInput.disabled = visibleEmails.length === 0;
}

function renderRecipientTray() {
  const items = [...recipientTray.values()];
  updatePreviewAudienceControls();
  if (recipientTraySummary) {
    recipientTraySummary.textContent = items.length
      ? `${items.length} recipient${items.length === 1 ? "" : "s"} in tray. Preview uses emailable contacts only.`
      : "No recipients selected.";
  }
  if (!recipientTrayList) return;
  recipientTrayList.innerHTML = items.length
    ? items.map((item) => `
        <article class="list-item tray-item">
          <div class="row">
            <div>
              <strong>${escapeHtml(contactDisplayName(item))}</strong>
              <div class="meta">${escapeHtml(item.email)}</div>
            </div>
            <div class="tray-actions">
              ${badge(item.email_status || "unknown")}
              <button type="button" class="secondary tray-remove" data-email="${escapeHtml(item.email_norm)}">Remove</button>
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
  sendPathReady = false;
  updateSendButtonState();
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

function renderStatus(data) {
  const model = isRecord(data) ? data : {};
  const previewPathIssues = Array.isArray(model.previewPathIssues)
    ? model.previewPathIssues.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const sendPathIssues = Array.isArray(model.sendPathIssues)
    ? model.sendPathIssues.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const latestSubscriber = isRecord(model.latestSubscriber) ? model.latestSubscriber : null;
  const envPresent = isRecord(model.envPresent) ? model.envPresent : {};
  const tables = isRecord(model.tables) ? model.tables : {};
  sendPathReady = model.sendPathReady === true;
  updateSendButtonState();

  statusEl.innerHTML = `
    <article class="status-item">
      <div class="row">
        <strong>Preview Path</strong>
        ${statusChip(model.previewPathReady ? "Ready" : "Needs review", model.previewPathReady ? "accepted" : "failed")}
      </div>
      <div class="meta">Sender: ${escapeHtml(model.sender || "Not configured")}</div>
      <div class="meta">Preview route: ${model.previewPathReady ? "Available" : "Blocked"}</div>
      <div class="meta">${escapeHtml(previewPathIssues[0] || "Preview routes and audience query are available.")}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Send Path</strong>
        ${statusChip(model.sendPathReady ? "Ready" : "Scaffold only", model.sendPathReady ? "accepted" : "disabled")}
      </div>
      <div class="meta">Resend key: ${envPresent.resendApiKey ? "Present" : "Missing"}</div>
      <div class="meta">Resend webhook secret: ${envPresent.resendWebhookSecret ? "Present" : "Missing"}</div>
      <div class="meta">Admin email enabled: ${envPresent.adminEmailEnabled ? "Yes" : "No"}</div>
      <div class="meta">${escapeHtml(sendPathIssues[0] || "Send route is available.")}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Audience Totals</strong>
        ${statusChip("Live data", "delivered")}
      </div>
      <div class="meta">Emailable: ${escapeHtml(formatCount(model.emailableCount))}</div>
      <div class="meta">Suppressed: ${escapeHtml(formatCount(model.suppressedCount))}</div>
      <div class="meta">Inactive: ${escapeHtml(formatCount(model.inactiveCount))}</div>
      <div class="meta">No consent: ${escapeHtml(formatCount(model.noConsentCount))}</div>
      <div class="meta">New opt-ins (24h): ${escapeHtml(formatCount(model.newOptIns24h))}</div>
      <div class="meta">Last audience update: ${escapeHtml(formatTs(model.lastAudienceUpdateAt) || "No recent row")}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Backing Tables</strong>
        ${statusChip(tables.newsletter_subscribers && tables.consent_status ? "Present" : "Check schema", tables.newsletter_subscribers && tables.consent_status ? "accepted" : "failed")}
      </div>
      <div class="meta">newsletter_subscribers: ${tables.newsletter_subscribers ? "present" : "missing"}</div>
      <div class="meta">consent_status: ${tables.consent_status ? "present" : "missing"}</div>
      <div class="meta">admin_email_audit_log: ${tables.admin_email_audit_log ? "present" : "missing"}</div>
      <div class="meta">resend_webhook_events: ${tables.resend_webhook_events ? "present" : "missing"}</div>
      <div class="meta">email_suppressions: ${tables.email_suppressions ? "present" : "missing"}</div>
      <div class="meta">Admin key: ${envPresent.adminExportKey ? "Present" : "Missing"}</div>
      <div class="meta">D1 binding: ${envPresent.d1 ? "Present" : "Missing"}</div>
    </article>
    <article class="status-item">
      <div class="row">
        <strong>Latest Signup</strong>
        ${latestSubscriber ? badge("new_opt_ins") : statusChip("No signup yet", "unknown")}
      </div>
      <div class="meta">Email: ${escapeHtml(latestSubscriber?.email || "No subscriber row yet")}</div>
      <div class="meta">Source: ${escapeHtml(latestSubscriber?.source || "n/a")}</div>
      <div class="meta">Created: ${escapeHtml(formatTs(latestSubscriber?.createdAt) || "n/a")}</div>
      <div class="meta">Updated: ${escapeHtml(formatTs(latestSubscriber?.updatedAt) || "n/a")}</div>
    </article>
  `;
}

function renderContacts(items) {
  const rows = Array.isArray(items) ? items : [];
  visibleContacts = rows;
  rows.forEach((item) => {
    if (!item?.email_norm) return;
    knownContacts.set(item.email_norm, item);
    if (recipientTray.has(item.email_norm)) {
      recipientTray.set(item.email_norm, item);
    }
  });
  if (!contactsEl) return;
  contactsEl.innerHTML = rows.length
    ? rows.map((item) => `
        <article class="list-item contact-item">
          <div class="row">
            <label class="checkbox-inline" for="email-contact-${escapeHtml(item.email_norm)}">
              <input
                id="email-contact-${escapeHtml(item.email_norm)}"
                type="checkbox"
                class="contact-select"
                data-email="${escapeHtml(item.email_norm)}"
                ${selectedContactEmails.has(item.email_norm) ? "checked" : ""}
              />
              <span>Select</span>
            </label>
            <div class="contact-heading">
              <strong>${escapeHtml(contactDisplayName(item))}</strong>
              <div class="contact-badges">
                ${badge(item.email_status || "unknown")}
                ${Number(item?.is_volunteer || 0) === 1 ? statusChip("Volunteer", "accepted") : ""}
              </div>
            </div>
            <div class="contact-actions">
              <button
                type="button"
                class="contact-tray-toggle"
                data-email="${escapeHtml(item.email_norm)}"
              >${recipientTray.has(item.email_norm) ? "Remove from tray" : "Add to tray"}</button>
            </div>
          </div>
          <div class="meta">${escapeHtml(item.email || "No email")}</div>
          <div class="meta">${escapeHtml(contactLocationText(item) || "City / HD / SD unavailable")}</div>
          <div class="meta contact-volunteer-row">
            <label class="checkbox-inline" for="email-contact-volunteer-${escapeHtml(item.email_norm)}">
              <input
                id="email-contact-volunteer-${escapeHtml(item.email_norm)}"
                type="checkbox"
                class="contact-volunteer-toggle"
                data-phone="${escapeHtml(item.phone_e164 || "")}"
                ${Number(item?.is_volunteer || 0) === 1 ? "checked" : ""}
                ${hasVolunteerPhone(item) ? "" : "disabled"}
              />
              <span>${hasVolunteerPhone(item) ? "Volunteer" : "Volunteer requires SMS phone"}</span>
            </label>
          </div>
          <div class="meta">Source: ${escapeHtml(item.source || "unknown")}</div>
          <div class="meta">Consent version: ${escapeHtml(item.consent_version || "unknown")}</div>
        </article>
      `).join("")
    : `<p class="empty">No email contacts found.</p>`;
  updateSelectionUi();
  renderRecipientTray();
}

function currentPreviewPayload() {
  const mode = currentEmailMode();
  return {
    filter: String(audienceFilterInput?.value || contactsFilterInput?.value || "emailable").trim(),
    city: String(contactsCityInput?.value || "").trim(),
    hd: String(contactsHdInput?.value || "").trim(),
    sd: String(contactsSdInput?.value || "").trim(),
    subject: String(subjectInput?.value || "").trim(),
    body: String(bodyInput?.value || ""),
    email_mode: mode,
    share_slug: String(shareSlugInput?.value || "").trim(),
    share_intro_text: String(shareIntroInput?.value || "").trim(),
    limit: Number(limitInput?.value || 100),
    recipients: trayRecipientEmails(),
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

async function loadStatus() {
  const data = await api("/api/admin/emails/status");
  renderStatus(data);
}

async function loadContacts() {
  const q = encodeURIComponent(String(contactsSearchInput?.value || "").trim());
  const filter = encodeURIComponent(String(contactsFilterInput?.value || audienceFilterInput?.value || "emailable").trim());
  const data = await api(
    `/api/admin/emails/contacts?limit=5000&filter=${filter}${q ? `&q=${q}` : ""}`
  );
  contactsDataset = Array.isArray(data?.items) ? data.items : [];
  syncContactFacetOptions(contactsDataset);
  renderContacts(contactsDataset.filter(contactMatchesLocalFilters));
}

async function updateContactVolunteer(phone, isVolunteer) {
  const previousItem = contactsDataset.find((item) => item?.phone_e164 === phone) || null;
  try {
    const data = await api("/api/admin/texting/contacts/volunteer", {
      method: "POST",
      body: JSON.stringify({
        phone,
        is_volunteer: isVolunteer,
      }),
    });
    await loadContacts();
    const nextItem = contactsDataset.find((item) => item?.phone_e164 === phone) || previousItem || data?.item || null;
    setStatus(
      contactsSelectionStatusEl,
      `${contactDisplayName(nextItem)} volunteer ${data?.isVolunteer ? "enabled" : "cleared"}.`
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
      "Contacts",
      () => loadContacts(),
      (error) => renderEmptyMessage(contactsEl, `Unable to load contacts. ${error.message}`),
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

function renderPreview(data) {
  const items = Array.isArray(data?.previewRecipients) ? data.previewRecipients : [];
  previewState = {
    token: data?.approval?.token || "",
    issuedAt: data?.approval?.issuedAt || "",
  };
  updateSendButtonState();
  if (previewBox) previewBox.hidden = false;
  if (previewSummary) {
    const mode = data?.mode === "explicit" ? "Recipient tray" : "Audience filter";
    previewSummary.textContent = `${mode}: ${data.audienceCount} candidate${data.audienceCount === 1 ? "" : "s"}. Sendable now: ${data.count}. Skipped by safeguards: ${data.skippedCount || 0}. Previewing first ${items.length} sendable recipient${items.length === 1 ? "" : "s"}.`;
  }
  if (!previewList) return;
  previewList.innerHTML = [
    `
      <article class="preview-list-item">
        <strong>${escapeHtml(data?.preview?.subject || "No subject")}</strong>
        <div class="meta">From: ${escapeHtml(data?.preview?.from || "Not configured")}</div>
        <div class="preview-copy">${escapeHtml(data?.preview?.body || "").replaceAll("\n", "<br>")}</div>
      </article>
    `,
    ...items.map((item) => `
      <article class="preview-list-item">
        <strong>${escapeHtml(contactDisplayName(item))}</strong>
        <div class="meta">${escapeHtml(item.email || "No email")}</div>
        <div class="meta">${escapeHtml(contactLocationText(item) || "City / HD / SD unavailable")}</div>
        <div class="meta">Status: ${escapeHtml(item.email_status || "unknown")}</div>
      </article>
    `),
  ].join("");
}

function updateSendButtonState() {
  if (!sendBtn) return;
  const ready = Boolean(sendPathReady && previewState?.token && previewState?.issuedAt && !sendInFlight);
  sendBtn.disabled = !ready;
  sendBtn.textContent = sendInFlight ? "Sending..." : "Send email";
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
    if (shellEl) shellEl.hidden = false;
    const failures = await refreshAll({ includeStatus: false });
    if (!failures.length) {
      setStatus(authStatusEl, "Portal loaded.");
    }
  } catch (error) {
    returnToAuth(error.message, { clearStoredKey: shouldReturnToAuth(error) });
  }
}

function syncAudienceFilter(value) {
  const normalized = String(value || "emailable").trim() || "emailable";
  if (audienceFilterInput && audienceFilterInput.value !== normalized) audienceFilterInput.value = normalized;
  if (contactsFilterInput && contactsFilterInput.value !== normalized) contactsFilterInput.value = normalized;
}

function addSelectedContactsToTray() {
  const emails = [...selectedContactEmails];
  let added = 0;
  emails.forEach((email) => {
    const item = knownContacts.get(email);
    if (!item) return;
    if (!recipientTray.has(email)) added += 1;
    recipientTray.set(email, item);
  });
  if (!emails.length) {
    setStatus(contactsSelectionStatusEl, "Select one or more contacts first.", true);
    return;
  }
  selectedContactEmails.clear();
  updateSelectionUi();
  renderRecipientTray();
  invalidatePreview("Preview cleared because the recipient tray changed.");
  setStatus(
    contactsSelectionStatusEl,
    added ? `${added} contact${added === 1 ? "" : "s"} added to the recipient tray.` : "All selected contacts were already in the recipient tray."
  );
}

async function runPreview() {
  const payload = currentPreviewPayload();
  if (!payload.subject) {
    setStatus(composeStatusEl, "Enter a subject line first.", true);
    return;
  }
  if (isShareMode()) {
    if (!payload.share_slug) {
      setStatus(composeStatusEl, "Select a share message first.", true);
      return;
    }
  } else if (!String(payload.body || "").trim()) {
    setStatus(composeStatusEl, "Enter an email body first.", true);
    return;
  }

  try {
    const data = await api("/api/admin/emails/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderPreview(data);
    setStatus(
      composeStatusEl,
      sendPathReady
        ? "Preview generated. Review the audience, then send when ready."
        : "Preview generated. Sending is still disabled by configuration."
    );
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(composeStatusEl, error.message, true);
  }
}

async function runSendTest() {
  const to = String(testToInput?.value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    setStatus(sendTestStatusEl, "Enter a valid test email address.", true);
    return;
  }
  const payload = currentPreviewPayload();
  if (!payload.subject) {
    setStatus(sendTestStatusEl, "Enter a subject line first.", true);
    return;
  }
  if (isShareMode()) {
    if (!payload.share_slug) {
      setStatus(sendTestStatusEl, "Select a share message first.", true);
      return;
    }
  } else if (!String(payload.body || "").trim()) {
    setStatus(sendTestStatusEl, "Enter an email body first.", true);
    return;
  }

  if (sendTestBtn) sendTestBtn.disabled = true;
  setStatus(sendTestStatusEl, "Sending test…");
  try {
    const data = await api("/api/admin/emails/send-test", {
      method: "POST",
      body: JSON.stringify({
        to,
        subject: payload.subject,
        body: payload.body,
        email_mode: payload.email_mode,
        share_slug: payload.share_slug,
        share_intro_text: payload.share_intro_text,
      }),
    });
    setStatus(sendTestStatusEl, `Test sent to ${data.to}.`);
  } catch (error) {
    setStatus(sendTestStatusEl, error.message, true);
  } finally {
    if (sendTestBtn) sendTestBtn.disabled = false;
  }
}

async function runSend() {
  if (!sendPathReady) {
    setStatus(composeStatusEl, "Sending is not enabled yet. Check the system status card.", true);
    return;
  }
  if (!previewState?.token || !previewState?.issuedAt) {
    setStatus(composeStatusEl, "Run Preview first.", true);
    return;
  }

  const payload = currentPreviewPayload();
  if (!payload.subject) {
    setStatus(composeStatusEl, "Enter a subject line first.", true);
    return;
  }
  if (isShareMode()) {
    if (!payload.share_slug) {
      setStatus(composeStatusEl, "Select a share message first.", true);
      return;
    }
  } else if (!String(payload.body || "").trim()) {
    setStatus(composeStatusEl, "Enter an email body first.", true);
    return;
  }

  sendInFlight = true;
  updateSendButtonState();
  try {
    const data = await api("/api/admin/emails/send", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        confirmed: true,
        preview_token: previewState.token,
        preview_issued_at: previewState.issuedAt,
      }),
    });
    clearPreview();
    const failedCount = Number(data?.failedCount || 0);
    const sentCount = Number(data?.sentCount || 0);
    // Snapshot tray for the receipt list before clearing it.
    const sentEmails = new Set((Array.isArray(data?.sent) ? data.sent : []).map((r) => String(r.email || "").toLowerCase()));
    const receiptRecipients = [...knownContacts.values()].filter((c) => sentEmails.has(String(c.email_norm || c.email || "").toLowerCase()));
    // Fall back to bare email strings from the API if contacts aren't in knownContacts.
    if (!receiptRecipients.length) {
      (Array.isArray(data?.sent) ? data.sent : []).forEach((r) => receiptRecipients.push({ email: r.email || "" }));
    }
    // Clear the tray so the same addresses cannot be sent to again without
    // explicitly re-adding them. This is the primary duplicate-send guard.
    recipientTray.clear();
    renderRecipientTray();
    renderContacts(contactsDataset.filter(contactMatchesLocalFilters));
    renderSendReceipt(sentCount, failedCount, receiptRecipients);
    const stagedNote = data?.deliveryMode === "staged"
      ? ` Staged in waves of ${Number(data?.batchSize || 0) || "n/a"}.`
      : "";
    const failureSummary = failedCount
      ? ` ${failedCount} failed${Array.isArray(data?.failed) && data.failed[0]?.error ? `: ${data.failed[0].error}` : "."}`
      : "";
    setStatus(
      composeStatusEl,
      `Sent ${sentCount} email${sentCount === 1 ? "" : "s"}.${stagedNote}${failureSummary} Recipient tray cleared.`
    );
  } catch (error) {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(composeStatusEl, error.message, true);
  } finally {
    sendInFlight = false;
    updateSendButtonState();
  }
}

authForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  connectPortal().catch((error) => setStatus(authStatusEl, error.message, true));
});

connectBtn?.addEventListener("click", () => {
  connectPortal().catch((error) => setStatus(authStatusEl, error.message, true));
});

clearBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_EMAIL);
  if (keyInput) keyInput.value = "";
  if (actorEmailInput) actorEmailInput.value = "";
  if (shellEl) shellEl.hidden = true;
  clearPortalState();
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

composeForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runPreview();
});

previewBtn?.addEventListener("click", () => {
  runPreview();
});

sendBtn?.addEventListener("click", () => {
  runSend();
});

sendTestBtn?.addEventListener("click", () => {
  runSendTest();
});

contactsSearchInput?.addEventListener("change", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsSearchInput?.addEventListener("search", () => {
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

audienceFilterInput?.addEventListener("change", () => {
  syncAudienceFilter(audienceFilterInput.value);
  invalidateFilterPreview("Preview cleared because the audience changed.");
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

contactsFilterInput?.addEventListener("change", () => {
  syncAudienceFilter(contactsFilterInput.value);
  invalidateFilterPreview("Preview cleared because the audience changed.");
  loadContacts().catch((error) => setStatus(authStatusEl, error.message, true));
});

[contactsCityInput, contactsHdInput, contactsSdInput].forEach((el) => {
  el?.addEventListener("change", () => {
    renderContacts(contactsDataset.filter(contactMatchesLocalFilters));
    invalidateFilterPreview("Preview cleared because the audience changed.");
  });
});

subjectInput?.addEventListener("input", () => {
  subjectInput.dataset.userEdited = "1";
  invalidatePreview("Preview cleared because the email changed. Run Preview again.");
});

bodyInput?.addEventListener("input", () => {
  invalidatePreview("Preview cleared because the email changed. Run Preview again.");
});

shareIntroInput?.addEventListener("input", () => {
  invalidatePreview("Preview cleared because the email changed. Run Preview again.");
});

emailModeInput?.addEventListener("change", () => {
  delete subjectInput?.dataset?.userEdited;
  handleModeChange();
});

shareSlugInput?.addEventListener("change", () => {
  delete subjectInput?.dataset?.userEdited;
  handleShareSlugChange();
});

limitInput?.addEventListener("input", () => {
  invalidateFilterPreview("Preview cleared because the audience changed.");
});

contactsSelectAllInput?.addEventListener("change", (event) => {
  const checked = Boolean(event.target?.checked);
  visibleContacts.forEach((item) => {
    if (!item?.email_norm) return;
    if (checked) selectedContactEmails.add(item.email_norm);
    else selectedContactEmails.delete(item.email_norm);
  });
  renderContacts(visibleContacts);
});

contactsAddSelectedBtn?.addEventListener("click", () => {
  addSelectedContactsToTray();
});

contactsClearSelectionBtn?.addEventListener("click", () => {
  selectedContactEmails.clear();
  renderContacts(visibleContacts);
  setStatus(contactsSelectionStatusEl, "Selection cleared.");
});

contactsEl?.addEventListener("change", (event) => {
  const volunteerToggle = event.target.closest(".contact-volunteer-toggle");
  if (volunteerToggle) {
    const phone = volunteerToggle.getAttribute("data-phone") || "";
    if (!phone) {
      volunteerToggle.checked = false;
      setStatus(contactsSelectionStatusEl, "Volunteer can only be set for contacts with an SMS phone.", true);
      return;
    }
    updateContactVolunteer(phone, volunteerToggle.checked);
    return;
  }

  const target = event.target.closest(".contact-select");
  if (!target) return;
  const email = target.getAttribute("data-email") || "";
  if (!email) return;
  if (target.checked) selectedContactEmails.add(email);
  else selectedContactEmails.delete(email);
  updateSelectionUi();
});

contactsEl?.addEventListener("click", (event) => {
  const trayButton = event.target.closest(".contact-tray-toggle");
  if (!trayButton) return;
  const email = trayButton.getAttribute("data-email") || "";
  if (!email) return;
  if (recipientTray.has(email)) {
    recipientTray.delete(email);
    renderContacts(visibleContacts);
    invalidatePreview("Preview cleared because the recipient tray changed.");
    setStatus(contactsSelectionStatusEl, `Removed ${email} from the recipient tray.`);
    return;
  }
  const item = knownContacts.get(email);
  if (!item) return;
  recipientTray.set(email, item);
  renderContacts(visibleContacts);
  invalidatePreview("Preview cleared because the recipient tray changed.");
  setStatus(contactsSelectionStatusEl, `Added ${contactDisplayName(item)} to the recipient tray.`);
});

recipientTrayList?.addEventListener("click", (event) => {
  const target = event.target.closest(".tray-remove");
  if (!target) return;
  const email = target.getAttribute("data-email") || "";
  if (!email) return;
  recipientTray.delete(email);
  renderRecipientTray();
  invalidatePreview("Preview cleared because the recipient tray changed.");
});

recipientTrayClearBtn?.addEventListener("click", () => {
  if (!recipientTray.size) return;
  recipientTray.clear();
  renderRecipientTray();
  invalidatePreview("Preview cleared because the recipient tray changed.");
});

actorEmailInput?.addEventListener("change", () => {
  localStorage.setItem(STORAGE_EMAIL, getActorEmail());
});

const savedKey = localStorage.getItem(STORAGE_KEY);
const savedEmail = localStorage.getItem(STORAGE_EMAIL);
if (savedKey && keyInput) keyInput.value = savedKey;
if (savedEmail && actorEmailInput) actorEmailInput.value = savedEmail;
if (savedKey) {
  connectPortal().catch((error) => {
    if (shouldReturnToAuth(error)) {
      returnToAuth("Admin key missing or incorrect. Enter it again to load the portal.", { clearStoredKey: true });
      return;
    }
    setStatus(authStatusEl, error.message, true);
  });
}

syncAudienceFilter(audienceFilterInput?.value || contactsFilterInput?.value || "emailable");
renderRecipientTray();
renderStatusFallback("Portal is not loaded yet.");
updateSelectionUi();
