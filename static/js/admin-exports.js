import { API_URL } from "/js/env.js";

const keyInput = document.getElementById("admin_key");
const statusEl = document.getElementById("admin-export-status");
const newsletterBtn = document.getElementById("download-newsletter");
const pulseBtn = document.getElementById("download-pulse");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

function getKey() {
  return String(keyInput?.value || "").trim();
}

function makeUrl(path) {
  return `${API_URL}${path}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseFilenameFromDisposition(disposition, fallback) {
  const m = String(disposition || "").match(/filename="?([^"]+)"?/i);
  return m ? m[1] : fallback;
}

async function downloadCsv(endpoint, fallbackName, label) {
  const key = getKey();
  if (!key) {
    setStatus("Enter the admin export key first.", true);
    keyInput?.focus();
    return;
  }

  setStatus(`Downloading ${label}...`);
  const resp = await fetch(makeUrl(endpoint), {
    method: "GET",
    headers: {
      authorization: `Bearer ${key}`,
    },
  });

  if (!resp.ok) {
    let message = `${label} download failed (${resp.status}).`;
    try {
      const body = await resp.json();
      if (body?.error) message = body.error;
    } catch {
      // Ignore non-JSON error bodies.
    }
    setStatus(message, true);
    return;
  }

  const blob = await resp.blob();
  const filename = parseFilenameFromDisposition(
    resp.headers.get("content-disposition"),
    fallbackName
  );
  triggerDownload(blob, filename);
  setStatus(`${label} download ready.`);
}

newsletterBtn?.addEventListener("click", () => {
  downloadCsv(
    "/api/admin/exports/newsletter.csv",
    "newsletter-subscribers.csv",
    "newsletter CSV"
  );
});

pulseBtn?.addEventListener("click", () => {
  downloadCsv("/api/admin/exports/pulse.csv", "pulse-optins.csv", "pulse CSV");
});
