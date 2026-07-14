// static/js/admin-pulse-voter-review.js
import { API_URL } from "/js/env.js";

const STORAGE_KEY = "admin_pvr_key";
const STORAGE_EMAIL = "admin_pvr_actor_email";

const authForm = document.getElementById("admin-pvr-auth");
const shellEl = document.getElementById("admin-pvr-shell");
const authStatusEl = document.getElementById("admin-pvr-auth-status");
const keyInput = document.getElementById("admin_pvr_key");
const actorEmailInput = document.getElementById("admin_pvr_actor_email");
const connectBtn = document.getElementById("admin-pvr-connect");
const clearBtn = document.getElementById("admin-pvr-clear");
const refreshBtn = document.getElementById("admin-pvr-refresh");
const summaryEl = document.getElementById("admin-pvr-summary");
const actionStatusEl = document.getElementById("admin-pvr-action-status");
const listEl = document.getElementById("admin-pvr-list");

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
    throw new Error("The review-queue API could not be reached. Check your network or Cloudflare Access session.");
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

function matchModeLabel(mode) {
  if (mode === "ambiguous_address") return "Ambiguous (address)";
  if (mode === "ambiguous_name_city_zip") return "Ambiguous (name/city/zip)";
  if (mode === "no_match") return "No match found";
  return mode || "Unknown";
}

function renderItem(item) {
  const isAmbiguous = item.match_mode === "ambiguous_address" || item.match_mode === "ambiguous_name_city_zip";
  const candidates = Array.isArray(item.candidate_voter_ids) ? item.candidate_voter_ids : [];

  const resolveControl = isAmbiguous
    ? `<select class="pvr-voter-select" data-id="${escapeHtml(item.id)}">
        <option value="">Choose voter_id...</option>
        ${candidates.map((vid) => `<option value="${escapeHtml(vid)}">${escapeHtml(vid)}</option>`).join("")}
      </select>`
    : `<input type="text" class="pvr-voter-input" data-id="${escapeHtml(item.id)}" placeholder="voter_id (if known)" />`;

  const submittedName = `${item.submitted_first_name || ""} ${item.submitted_last_name || ""}`.trim() || "Unnamed";
  const submittedAddress = [item.submitted_address1, item.submitted_city, item.submitted_zip]
    .filter(Boolean)
    .join(", ");

  return `
    <article class="pvr-item" data-row-id="${escapeHtml(item.id)}">
      <div class="pvr-item-head">
        <strong>${escapeHtml(submittedName)}</strong>
        <span class="status-badge status-${escapeHtml(item.match_mode)}">${escapeHtml(matchModeLabel(item.match_mode))}</span>
      </div>
      <div class="help">Phone: ${escapeHtml(item.phone_e164)}</div>
      <div class="help">Submitted: ${escapeHtml(submittedAddress || "no address given")}</div>
      <div class="help">Received: ${escapeHtml(formatTs(item.created_at))}</div>
      <div class="pvr-item-resolve">
        ${resolveControl}
        <button type="button" class="pvr-resolve-btn" data-id="${escapeHtml(item.id)}">Resolve</button>
        <button type="button" class="pvr-dismiss-btn secondary" data-id="${escapeHtml(item.id)}">Dismiss (no real match)</button>
      </div>
    </article>
  `;
}

let currentItems = [];

function renderList() {
  if (!listEl) return;
  if (!currentItems.length) {
    listEl.innerHTML = `<p class="help">No unresolved review items. 🎉</p>`;
    summaryEl.textContent = "0 unresolved items.";
    return;
  }
  summaryEl.textContent = `${currentItems.length} unresolved item${currentItems.length === 1 ? "" : "s"}.`;
  listEl.innerHTML = currentItems.map(renderItem).join("");
}

async function loadItems() {
  setStatus(actionStatusEl, "");
  summaryEl.textContent = "Loading...";
  try {
    const data = await api("/api/admin/pulse-voter-review?unresolved=1");
    currentItems = Array.isArray(data.items) ? data.items : [];
    renderList();
  } catch (error) {
    summaryEl.textContent = "Failed to load.";
    setStatus(actionStatusEl, error?.message || "Failed to load review queue.", true);
  }
}

async function resolveItem(id, { voterId = "", dismiss = false } = {}) {
  setStatus(actionStatusEl, "");
  try {
    await api("/api/admin/pulse-voter-review/resolve", {
      method: "POST",
      body: JSON.stringify(dismiss ? { id, dismiss: true } : { id, voter_id: voterId }),
    });
    currentItems = currentItems.filter((item) => String(item.id) !== String(id));
    renderList();
    setStatus(actionStatusEl, dismiss ? "Dismissed." : "Resolved.");
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to resolve item.", true);
  }
}

listEl?.addEventListener("click", (event) => {
  const resolveBtn = event.target.closest(".pvr-resolve-btn");
  if (resolveBtn) {
    const id = resolveBtn.dataset.id;
    const article = resolveBtn.closest(".pvr-item");
    const select = article?.querySelector(".pvr-voter-select");
    const input = article?.querySelector(".pvr-voter-input");
    const voterId = String(select?.value || input?.value || "").trim();
    if (!voterId) {
      setStatus(actionStatusEl, "Enter or choose a voter_id before resolving.", true);
      return;
    }
    resolveItem(id, { voterId });
    return;
  }

  const dismissBtn = event.target.closest(".pvr-dismiss-btn");
  if (dismissBtn) {
    resolveItem(dismissBtn.dataset.id, { dismiss: true });
  }
});

function showShell() {
  authForm.hidden = true;
  shellEl.hidden = false;
  loadItems();
}

connectBtn?.addEventListener("click", () => {
  const key = getAdminKey();
  if (!key) {
    setStatus(authStatusEl, "Admin key is required.", true);
    return;
  }
  localStorage.setItem(STORAGE_KEY, key);
  const actorEmail = getActorEmail();
  if (actorEmail) localStorage.setItem(STORAGE_EMAIL, actorEmail);
  else localStorage.removeItem(STORAGE_EMAIL);
  setStatus(authStatusEl, "");
  showShell();
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
  showShell();
}
