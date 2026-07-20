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

const CALL_STATUS_LABELS = {
  not_called: "Not called",
  left_voicemail: "Left voicemail",
  reached_confirmed: "Reached -- confirmed",
  reached_declined: "Reached -- declined",
  bad_number: "Bad number",
  do_not_call: "Do not call",
};

function callStatusLabel(status) {
  return CALL_STATUS_LABELS[status] || status || "Not called";
}

function callStatusOptionsHtml(selected) {
  return Object.entries(CALL_STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function callTrackingHtml(item) {
  const badge = item.call_status && item.call_status !== "not_called"
    ? `<span class="status-badge status-call-${escapeHtml(item.call_status)}">${escapeHtml(callStatusLabel(item.call_status))}</span>`
    : "";
  const meta = item.called_at
    ? `<div class="help">Last call: ${escapeHtml(formatTs(item.called_at))} by ${escapeHtml(item.called_by || "unknown")} (${escapeHtml(String(item.call_attempts || 0))} attempt${Number(item.call_attempts) === 1 ? "" : "s"})</div>`
    : "";
  const notes = item.call_notes ? `<div class="help">Notes: ${escapeHtml(item.call_notes)}</div>` : "";
  return `
    <div class="pvr-call-tracking" data-id="${escapeHtml(item.id)}">
      <div class="pvr-item-head">
        <strong>Call to verify</strong>
        ${badge}
      </div>
      ${meta}
      ${notes}
      <div class="pvr-item-resolve">
        <select class="pvr-call-status-select" data-id="${escapeHtml(item.id)}">
          ${callStatusOptionsHtml(item.call_status || "not_called")}
        </select>
        <input type="text" class="pvr-call-notes-input" data-id="${escapeHtml(item.id)}" placeholder="Call notes (optional)" />
        <button type="button" class="pvr-log-call-btn secondary" data-id="${escapeHtml(item.id)}">Log call</button>
      </div>
    </div>
  `;
}

function matchModeLabel(mode) {
  if (mode === "ambiguous_address") return "Ambiguous (address)";
  if (mode === "ambiguous_name_city_zip") return "Ambiguous (name/city/zip)";
  if (mode === "ambiguous_name_zip") return "Ambiguous (name/zip, city didn't match)";
  if (mode === "ambiguous_name_city") return "Unconfirmed (name+city, no ZIP submitted)";
  if (mode === "ambiguous_name_city_zip_conflict") return "Unconfirmed (name+city match, submitted ZIP didn't match)";
  if (mode === "ambiguous_phone") return "Ambiguous (phone matches multiple voters)";
  if (mode === "ambiguous_email") return "Ambiguous (email matches multiple voters)";
  if (mode === "phone_belongs_to_other_voter") return "Clean match, but phone linked to a different voter";
  if (mode === "missing_lookup_fields") return "Insufficient data submitted";
  if (mode === "no_match") return "No match found";
  // Clean-match tiers below normally auto-accept in the live /pulse flow
  // and never reach the review queue -- they only show up here via
  // "Re-check match" surfacing a single confirmed candidate for staff to
  // click Resolve on.
  if (mode === "phone_match") return "Match found by phone (confirm to resolve)";
  if (mode === "email_match") return "Match found by email (confirm to resolve)";
  if (mode === "name_city_zip_address") return "Match found by name/city/zip/address (confirm to resolve)";
  if (mode === "name_city_zip") return "Match found by name/city/zip (confirm to resolve)";
  if (mode === "name_zip") return "Match found by name/zip, city didn't match (confirm to resolve)";
  return mode || "Unknown";
}

// Purely a display aid over the same match_mode already stored -- no new
// data, just translating the raw mode into "how much should I trust this
// without independent verification" for staff scanning the queue.
const CONFIDENCE_HIGH = new Set([
  "phone_belongs_to_other_voter", "phone_match", "email_match",
  "name_city_zip_address", "name_city_zip",
]);
const CONFIDENCE_MEDIUM = new Set([
  "ambiguous_address", "ambiguous_name_city_zip", "ambiguous_name_zip",
  "ambiguous_phone", "ambiguous_email", "name_zip",
]);

function confidenceBadgeHtml(mode) {
  if (CONFIDENCE_HIGH.has(mode)) return `<span class="pvr-confidence pvr-confidence-high">High confidence</span>`;
  if (CONFIDENCE_MEDIUM.has(mode)) return `<span class="pvr-confidence pvr-confidence-medium">Medium confidence</span>`;
  return `<span class="pvr-confidence pvr-confidence-low">Low confidence</span>`;
}

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function staleBadgeHtml(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  if (Date.now() - date.getTime() < STALE_AFTER_MS) return "";
  return `<span class="status-badge status-stale">Open &gt;48h</span>`;
}

// candidate_voter_ids rows are either a plain voter_id string (legacy rows
// written before 2026-07-19) or a {voter_id, first_name, last_name, city,
// zip, addr1} object (current) -- render whichever shape shows up so old
// unresolved queue rows don't break.
function candidateOptionHtml(candidate, selected = false) {
  const selectedAttr = selected ? " selected" : "";
  if (typeof candidate === "string" || typeof candidate === "number") {
    return `<option value="${escapeHtml(candidate)}"${selectedAttr}>${escapeHtml(candidate)}</option>`;
  }
  const voterId = candidate?.voter_id;
  if (!voterId) return "";
  const addressBits = [candidate.addr1, candidate.city, candidate.zip].filter(Boolean).join(", ");
  const label = addressBits ? `${voterId} -- ${addressBits}` : String(voterId);
  return `<option value="${escapeHtml(voterId)}"${selectedAttr}>${escapeHtml(label)}</option>`;
}

function renderItem(item) {
  const candidates = Array.isArray(item.candidate_voter_ids) ? item.candidate_voter_ids : [];
  const hasCandidates = candidates.length > 0;

  // A single candidate is pre-selected (still requires clicking Resolve --
  // never auto-submitted) since an empty-looking <select> that already has
  // the only real option sitting in it just reads as "nothing found" until
  // someone thinks to open it. Multiple candidates stay on the placeholder
  // -- genuine ambiguity should force an active choice.
  const resolveControl = hasCandidates
    ? `<select class="pvr-voter-select" data-id="${escapeHtml(item.id)}">
        <option value="">Choose voter_id...</option>
        ${candidates.map((c) => candidateOptionHtml(c, candidates.length === 1)).join("")}
      </select>`
    : `<input type="text" class="pvr-voter-input" data-id="${escapeHtml(item.id)}" placeholder="voter_id (if known)" />`;

  const submittedName = `${item.submitted_first_name || ""} ${item.submitted_last_name || ""}`.trim() || "Unnamed";
  const submittedAddress = [item.submitted_address1, item.submitted_city, item.submitted_zip]
    .filter(Boolean)
    .join(", ");

  const flagBadges = [
    Number(item.phone_area_flag) === 1 ? `<span class="pvr-flag-badge">non-307 phone</span>` : "",
    Number(item.zip_range_flag) === 1 ? `<span class="pvr-flag-badge">ZIP outside WY range</span>` : "",
  ].join("");

  if (item._resolved) {
    return `
      <article class="pvr-item" data-row-id="${escapeHtml(item.id)}">
        <div class="pvr-item-head">
          <strong>${escapeHtml(submittedName)}</strong>
          <span class="status-badge status-resolved">Resolved -- voter ${escapeHtml(item.resolved_voter_id || "")}</span>
        </div>
        <div class="help">Phone: ${escapeHtml(item.phone_e164)}</div>
        <div class="pvr-item-resolve">
          <button type="button" class="pvr-mint-btn" data-id="${escapeHtml(item.id)}">Mint &amp; send poll link</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="pvr-item" data-row-id="${escapeHtml(item.id)}">
      <div class="pvr-item-head">
        <strong>${escapeHtml(submittedName)}</strong>
        <span class="status-badge status-${escapeHtml(item.match_mode)}">${escapeHtml(matchModeLabel(item.match_mode))}</span>
        ${confidenceBadgeHtml(item.match_mode)}
        ${staleBadgeHtml(item.created_at)}
        ${flagBadges}
      </div>
      <div class="help">Phone: ${escapeHtml(item.phone_e164)}</div>
      <div class="help">Submitted: ${escapeHtml(submittedAddress || "no address given")}</div>
      <div class="help">Received: ${escapeHtml(formatTs(item.created_at))}</div>
      <div class="pvr-item-resolve">
        ${resolveControl}
        <button type="button" class="pvr-resolve-btn" data-id="${escapeHtml(item.id)}">Resolve</button>
        <button type="button" class="pvr-dismiss-btn secondary" data-id="${escapeHtml(item.id)}">Dismiss (no real match)</button>
        <button type="button" class="pvr-recheck-btn secondary" data-id="${escapeHtml(item.id)}">Re-check match</button>
        <button type="button" class="pvr-search-toggle-btn secondary" data-id="${escapeHtml(item.id)}">Search voter file</button>
      </div>
      <div class="pvr-manual-search" data-id="${escapeHtml(item.id)}" hidden>
        <div class="pvr-item-resolve">
          <input type="text" class="pvr-search-input" placeholder="Search by name, city, or address..." />
          <button type="button" class="pvr-search-btn" data-id="${escapeHtml(item.id)}">Search</button>
        </div>
        <div class="pvr-search-results help"></div>
      </div>
      ${callTrackingHtml(item)}
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
  const unresolvedCount = currentItems.filter((item) => !item._resolved).length;
  const resolvedPendingCount = currentItems.length - unresolvedCount;
  summaryEl.textContent = `${unresolvedCount} unresolved item${unresolvedCount === 1 ? "" : "s"}`
    + (resolvedPendingCount ? `, ${resolvedPendingCount} resolved pending send.` : ".");
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
    if (dismiss) {
      // Nothing to send for a dismissed row -- remove it like before.
      currentItems = currentItems.filter((item) => String(item.id) !== String(id));
      setStatus(actionStatusEl, "Dismissed.");
    } else {
      // Keep the row visible (resolved rows drop out of the unresolved=1
      // queue on refresh) so staff can immediately mint & send the poll
      // link without having to re-find this contact elsewhere.
      currentItems = currentItems.map((item) =>
        String(item.id) === String(id) ? { ...item, _resolved: true, resolved_voter_id: voterId } : item
      );
      setStatus(actionStatusEl, "Resolved.");
    }
    renderList();
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to resolve item.", true);
  }
}

async function logCall(id, { callStatus, callNotes } = {}) {
  setStatus(actionStatusEl, "");
  try {
    const data = await api("/api/admin/pulse-voter-review/log-call", {
      method: "POST",
      body: JSON.stringify({ id, call_status: callStatus, call_notes: callNotes || undefined }),
    });
    currentItems = currentItems.map((item) =>
      String(item.id) === String(id)
        ? {
            ...item,
            call_status: data.callStatus,
            call_attempts: (Number(item.call_attempts) || 0) + 1,
            call_notes: callNotes || item.call_notes,
            called_at: new Date().toISOString(),
            called_by: getActorEmail() || item.called_by,
          }
        : item
    );
    renderList();
    setStatus(actionStatusEl, "Call logged.");
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to log call.", true);
  }
}

async function recheckItem(id) {
  setStatus(actionStatusEl, "");
  try {
    const data = await api("/api/admin/pulse-voter-review/recheck", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    currentItems = currentItems.map((item) =>
      String(item.id) === String(id)
        ? { ...item, match_mode: data.matchMode, candidate_voter_ids: data.candidates || [] }
        : item
    );
    renderList();
    const count = (data.candidates || []).length;
    setStatus(actionStatusEl, count ? `Re-checked: ${count} candidate${count === 1 ? "" : "s"} found.` : "Re-checked: still no match.");
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to re-check match.", true);
  }
}

function setResolveVoterId(article, voterId, label) {
  const select = article.querySelector(".pvr-voter-select");
  const input = article.querySelector(".pvr-voter-input");
  if (select) {
    let option = [...select.options].find((o) => o.value === String(voterId));
    if (!option) {
      option = document.createElement("option");
      option.value = String(voterId);
      option.textContent = label || String(voterId);
      select.appendChild(option);
    }
    select.value = String(voterId);
  } else if (input) {
    input.value = String(voterId);
  }
}

async function searchVoters(id, query) {
  const article = listEl?.querySelector(`.pvr-item[data-row-id="${CSS.escape(String(id))}"]`);
  const resultsEl = article?.querySelector(".pvr-search-results");
  if (!resultsEl) return;
  if (!query) {
    resultsEl.innerHTML = `<span class="help">Enter a name, city, or address to search.</span>`;
    return;
  }
  resultsEl.textContent = "Searching...";
  try {
    const data = await api(`/api/admin/pulse-voter-review/search-voters?q=${encodeURIComponent(query)}`);
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      resultsEl.innerHTML = `<span class="help">No voter-file matches.</span>`;
      return;
    }
    resultsEl.innerHTML = items
      .map((candidate) => {
        const html = candidateOptionHtml(candidate);
        const label = html.replace(/<[^>]+>/g, "").trim();
        return `<div class="pvr-search-result">
          <span>${escapeHtml(label)}</span>
          <button type="button" class="pvr-use-candidate-btn" data-id="${escapeHtml(id)}" data-voter-id="${escapeHtml(candidate.voter_id)}" data-label="${escapeHtml(label)}">Use</button>
        </div>`;
      })
      .join("");
  } catch (error) {
    resultsEl.innerHTML = `<span class="help">${escapeHtml(error?.message || "Search failed.")}</span>`;
  }
}

async function mintAndSendItem(id) {
  setStatus(actionStatusEl, "");
  try {
    const data = await api("/api/admin/pulse-voter-review/mint-and-send", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    currentItems = currentItems.filter((item) => String(item.id) !== String(id));
    renderList();
    // Both channels always fire (worker/src/index.js mint-and-send) -- show
    // which ones actually landed instead of a generic "sent" that leaves
    // staff guessing whether SMS went out at all (found 2026-07-20: it was
    // sending correctly the whole time, the UI just never said so).
    const smsText = data?.sms?.sent ? "sent" : `not sent (${data?.sms?.reason || "unknown"})`;
    const emailText = data?.email?.sent ? "sent" : `not sent (${data?.email?.reason || "unknown"})`;
    setStatus(actionStatusEl, data?.pollLink ? `Poll link minted -- SMS: ${smsText}, Email: ${emailText}.` : "Sent.");
  } catch (error) {
    setStatus(actionStatusEl, error?.message || "Failed to mint/send poll link.", true);
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
    return;
  }

  const mintBtn = event.target.closest(".pvr-mint-btn");
  if (mintBtn) {
    mintAndSendItem(mintBtn.dataset.id);
    return;
  }

  const logCallBtn = event.target.closest(".pvr-log-call-btn");
  if (logCallBtn) {
    const id = logCallBtn.dataset.id;
    const wrap = logCallBtn.closest(".pvr-call-tracking");
    const select = wrap?.querySelector(".pvr-call-status-select");
    const notesInput = wrap?.querySelector(".pvr-call-notes-input");
    logCall(id, { callStatus: select?.value, callNotes: notesInput?.value.trim() });
    return;
  }

  const recheckBtn = event.target.closest(".pvr-recheck-btn");
  if (recheckBtn) {
    recheckItem(recheckBtn.dataset.id);
    return;
  }

  const searchToggleBtn = event.target.closest(".pvr-search-toggle-btn");
  if (searchToggleBtn) {
    const article = searchToggleBtn.closest(".pvr-item");
    const panel = article?.querySelector(".pvr-manual-search");
    if (panel) panel.hidden = !panel.hidden;
    return;
  }

  const searchBtn = event.target.closest(".pvr-search-btn");
  if (searchBtn) {
    const id = searchBtn.dataset.id;
    const panel = searchBtn.closest(".pvr-manual-search");
    const input = panel?.querySelector(".pvr-search-input");
    searchVoters(id, input?.value.trim());
    return;
  }

  const useCandidateBtn = event.target.closest(".pvr-use-candidate-btn");
  if (useCandidateBtn) {
    const id = useCandidateBtn.dataset.id;
    const article = listEl.querySelector(`.pvr-item[data-row-id="${CSS.escape(String(id))}"]`);
    if (article) setResolveVoterId(article, useCandidateBtn.dataset.voterId, useCandidateBtn.dataset.label);
    setStatus(actionStatusEl, `voter_id ${useCandidateBtn.dataset.voterId} filled in -- click Resolve to confirm.`);
  }
});

listEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest(".pvr-search-input");
  if (!input) return;
  event.preventDefault();
  const panel = input.closest(".pvr-manual-search");
  searchVoters(panel?.dataset.id, input.value.trim());
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
