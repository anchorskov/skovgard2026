// static/js/admin-pulse-followup.js
import { API_URL } from "/js/env.js";

const STORAGE_KEY = "admin_pf_key";
const STORAGE_EMAIL = "admin_pf_actor_email";

const authForm = document.getElementById("admin-pf-auth");
const shellEl = document.getElementById("admin-pf-shell");
const authStatusEl = document.getElementById("admin-pf-auth-status");
const keyInput = document.getElementById("admin_pf_key");
const actorEmailInput = document.getElementById("admin_pf_actor_email");
const connectBtn = document.getElementById("admin-pf-connect");
const clearBtn = document.getElementById("admin-pf-clear");
const refreshBtn = document.getElementById("admin-pf-refresh");
const summaryEl = document.getElementById("admin-pf-summary");
const actionStatusEl = document.getElementById("admin-pf-action-status");
const listEl = document.getElementById("admin-pf-list");

const CALL_STATUS_LABELS = {
  not_called: "Not called",
  left_voicemail: "Left voicemail",
  reached_confirmed: "Reached -- confirmed",
  reached_declined: "Reached -- declined",
  bad_number: "Bad number",
  do_not_call: "Do not call",
};

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

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#991b1b" : "";
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
  const url = new URL(normalizedPath, base);
  if (key) url.searchParams.set("key", key);
  if (actorEmail) url.searchParams.set("actor_email", actorEmail);
  if (!API_URL && url.origin === window.location.origin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return url.toString();
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
    throw new Error("The follow-up queue API could not be reached. Check your network or Cloudflare Access session.");
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error("Received HTML instead of JSON. Your Access session may not be active for this route.");
  }

  const json = await response.json().catch(() => null);
  if (!json) throw new Error("Response could not be parsed as JSON.");

  if (!response.ok) {
    if (response.status === 401) throw new Error("The admin key was rejected.");
    throw new Error(json?.error || `Request failed (${response.status})`);
  }

  return json;
}

function callStatusLabel(status) {
  return CALL_STATUS_LABELS[status] || status || "Not called";
}

function callStatusOptionsHtml(selected) {
  return Object.entries(CALL_STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function stepLabel(step) {
  if (step === "step2_reached") return "Reached Citizen Poll step (city/ZIP not submitted)";
  return "Checked SMS consent";
}

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function staleBadgeHtml(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  if (Date.now() - date.getTime() < STALE_AFTER_MS) return "";
  return `<span class="status-badge status-stale">Open &gt;48h</span>`;
}

function renderItem(item) {
  const badge = item.call_status && item.call_status !== "not_called"
    ? `<span class="status-badge status-call-${escapeHtml(item.call_status)}">${escapeHtml(callStatusLabel(item.call_status))}</span>`
    : "";
  const meta = item.called_at
    ? `<div class="help">Last call: ${escapeHtml(formatTs(item.called_at))} by ${escapeHtml(item.called_by || "unknown")} (${escapeHtml(String(item.call_attempts || 0))} attempt${Number(item.call_attempts) === 1 ? "" : "s"})</div>`
    : "";
  const notes = item.call_notes ? `<div class="help">Notes: ${escapeHtml(item.call_notes)}</div>` : "";

  return `
    <article class="pf-item" data-row-id="${escapeHtml(item.id)}">
      <div class="pf-item-head">
        <strong>${escapeHtml(item.first_name || "Unnamed")}</strong>
        ${badge}
        ${staleBadgeHtml(item.captured_at)}
      </div>
      <div class="help">Phone: ${escapeHtml(item.phone_e164)}</div>
      <div class="help">${escapeHtml(stepLabel(item.step_reached))} -- started ${escapeHtml(formatTs(item.captured_at))}</div>
      ${meta}
      ${notes}

      <div class="pf-item-resolve">
        <select class="pf-call-status-select" data-id="${escapeHtml(item.id)}">
          ${callStatusOptionsHtml(item.call_status || "not_called")}
        </select>
        <input type="text" class="pf-call-notes-input" data-id="${escapeHtml(item.id)}" placeholder="Call notes (optional)" />
        <button type="button" class="pf-log-call-btn secondary" data-id="${escapeHtml(item.id)}">Log call</button>
        <button type="button" class="pf-toggle-optin-btn" data-id="${escapeHtml(item.id)}">Complete opt-in verbally</button>
      </div>

      <form class="pf-optin-form" data-id="${escapeHtml(item.id)}" hidden>
        <div class="field-inline">
          <div class="field">
            <label>First name</label>
            <input type="text" class="pf-optin-first-name" value="${escapeHtml(item.first_name || "")}" required />
          </div>
          <div class="field">
            <label>Last name</label>
            <input type="text" class="pf-optin-last-name" required />
          </div>
        </div>
        <div class="field-inline">
          <div class="field">
            <label>Email <span class="help">(optional)</span></label>
            <input type="email" class="pf-optin-email" />
          </div>
          <div class="field pf-optin-consent-email-field">
            <label><input type="checkbox" class="pf-optin-consent-email" /> Verbal email consent given</label>
          </div>
        </div>
        <p class="help">Voter-verification fields (optional -- only if given on the call; enables a Citizen Poll ballot mint):</p>
        <div class="field-inline">
          <div class="field">
            <label>Street address</label>
            <input type="text" class="pf-optin-address1" />
          </div>
          <div class="field">
            <label>City</label>
            <input type="text" class="pf-optin-city" />
          </div>
          <div class="field">
            <label>ZIP</label>
            <input type="text" class="pf-optin-zip" maxlength="5" />
          </div>
        </div>
        <div class="button-row">
          <button type="button" class="pf-submit-optin-btn" data-id="${escapeHtml(item.id)}">Save verbal opt-in</button>
        </div>
      </form>
    </article>
  `;
}

let currentItems = [];

function renderList() {
  if (!listEl) return;
  if (!currentItems.length) {
    listEl.innerHTML = `<p class="help">No open follow-up calls. 🎉</p>`;
    summaryEl.textContent = "0 open items.";
    return;
  }
  summaryEl.textContent = `${currentItems.length} open item${currentItems.length === 1 ? "" : "s"}.`;
  listEl.innerHTML = currentItems.map(renderItem).join("");
}

async function loadItems() {
  setStatus(actionStatusEl, "");
  summaryEl.textContent = "Loading...";
  try {
    const data = await api("/api/admin/pulse-abandoned-signups?open=1");
    currentItems = Array.isArray(data.items) ? data.items : [];
    renderList();
  } catch (error) {
    summaryEl.textContent = "Failed to load.";
    setStatus(actionStatusEl, error?.message || "Failed to load follow-up queue.", true);
  }
}

async function logCall(id, { callStatus, callNotes } = {}) {
  setStatus(actionStatusEl, "");
  try {
    const data = await api("/api/admin/pulse-abandoned-signups/log-call", {
      method: "POST",
      body: JSON.stringify({ id, call_status: callStatus, call_notes: callNotes || undefined }),
    });
    if (data.callStatus === "do_not_call") {
      currentItems = currentItems.filter((item) => String(item.id) !== String(id));
      setStatus(actionStatusEl, "Marked do-not-call and removed from the queue.");
    } else {
      currentItems = currentItems.map((item) =>
        String(item.id) === String(id)
          ? {
              ...item,
              call_status: data.callStatus,
              call_attempts: (Number(item.call_attempts) || 0) + 1,
              called_at: new Date().toISOString(),
              called_by: getActorEmail() || item.called_by,
            }
          : item
      );
      setStatus(actionStatusEl, "Call logged.");
    }
    renderList();
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to log call.", true);
  }
}

async function completeOptin(id, payload) {
  setStatus(actionStatusEl, "");
  try {
    const data = await api("/api/admin/pulse-abandoned-signups/complete-optin", {
      method: "POST",
      body: JSON.stringify({ id, ...payload }),
    });
    currentItems = currentItems.filter((item) => String(item.id) !== String(id));
    renderList();
    let message = "Verbal opt-in saved.";
    if (data?.pollLink) {
      const smsText = data?.sms?.sent ? "sent" : `not sent (${data?.sms?.reason || "unknown"})`;
      const emailText = data?.email?.sent ? "sent" : `not sent (${data?.email?.reason || "unknown"})`;
      message = `Verbal opt-in saved. Poll link -- SMS: ${smsText}, Email: ${emailText}.`;
    } else if (data?.matchResult?.attempted && !data?.matchResult?.matched) {
      message = "Verbal opt-in saved. No clean voter match -- filed to the review queue.";
    }
    setStatus(actionStatusEl, message);
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to save verbal opt-in.", true);
  }
}

listEl?.addEventListener("click", (event) => {
  const logCallBtn = event.target.closest(".pf-log-call-btn");
  if (logCallBtn) {
    const id = logCallBtn.dataset.id;
    const article = logCallBtn.closest(".pf-item");
    const select = article?.querySelector(".pf-call-status-select");
    const notesInput = article?.querySelector(".pf-call-notes-input");
    logCall(id, { callStatus: select?.value, callNotes: notesInput?.value.trim() });
    return;
  }

  const toggleBtn = event.target.closest(".pf-toggle-optin-btn");
  if (toggleBtn) {
    const article = toggleBtn.closest(".pf-item");
    const form = article?.querySelector(".pf-optin-form");
    if (form) form.hidden = !form.hidden;
    return;
  }

  const submitBtn = event.target.closest(".pf-submit-optin-btn");
  if (submitBtn) {
    const id = submitBtn.dataset.id;
    const article = submitBtn.closest(".pf-item");
    const firstName = article?.querySelector(".pf-optin-first-name")?.value.trim() || "";
    const lastName = article?.querySelector(".pf-optin-last-name")?.value.trim() || "";
    const email = article?.querySelector(".pf-optin-email")?.value.trim() || "";
    const consentEmail = article?.querySelector(".pf-optin-consent-email")?.checked || false;
    const address1 = article?.querySelector(".pf-optin-address1")?.value.trim() || "";
    const city = article?.querySelector(".pf-optin-city")?.value.trim() || "";
    const zip = article?.querySelector(".pf-optin-zip")?.value.trim() || "";

    if (!firstName || !lastName) {
      setStatus(actionStatusEl, "First and last name are required.", true);
      return;
    }
    if (email && !consentEmail) {
      setStatus(actionStatusEl, "Check verbal email consent to save an email address.", true);
      return;
    }

    completeOptin(id, {
      first_name: firstName,
      last_name: lastName,
      email: email || undefined,
      consent_email: consentEmail,
      address1: address1 || undefined,
      city: city || undefined,
      zip: zip || undefined,
    });
  }
});

async function attemptConnect(key, actorEmail) {
  setStatus(authStatusEl, "Connecting...");
  if (connectBtn) connectBtn.disabled = true;
  try {
    const data = await api("/api/admin/pulse-abandoned-signups?open=1");
    currentItems = Array.isArray(data.items) ? data.items : [];
    localStorage.setItem(STORAGE_KEY, key);
    if (actorEmail) localStorage.setItem(STORAGE_EMAIL, actorEmail);
    else localStorage.removeItem(STORAGE_EMAIL);
    setStatus(authStatusEl, "");
    authForm.hidden = true;
    shellEl.hidden = false;
    renderList();
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    setStatus(authStatusEl, error?.message || "Failed to connect.", true);
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

connectBtn?.addEventListener("click", () => {
  const key = getAdminKey();
  if (!key) {
    setStatus(authStatusEl, "Admin key is required.", true);
    return;
  }
  attemptConnect(key, getActorEmail());
});

clearBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_EMAIL);
  keyInput.value = "";
  actorEmailInput.value = "";
  shellEl.hidden = true;
  authForm.hidden = false;
  setStatus(authStatusEl, "Key cleared.");
});

refreshBtn?.addEventListener("click", () => loadItems());

const savedKey = localStorage.getItem(STORAGE_KEY);
const savedEmail = localStorage.getItem(STORAGE_EMAIL);
if (savedKey) {
  keyInput.value = savedKey;
  if (savedEmail) actorEmailInput.value = savedEmail;
  attemptConnect(savedKey, savedEmail || "");
}
