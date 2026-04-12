// static/js/pulse-optin.js
import { API_URL, isLocalEnv } from '/js/env.js';

const form = document.getElementById('optin-form');
if (form) {
  /* ---------- small helpers ---------- */
  const HOME_URL = '/';
  const $ = (sel) => form.querySelector(sel && (sel[0] === '#' || sel[0] === '.') ? sel : ('#' + sel));
  const consentPanel = $('#consent-panel');
  const consentCheckbox = $('#consent_sms');
  const consentError = $('#consent-error');

  const msg = document.createElement('div');
  msg.setAttribute('aria-live', 'polite');
  form.appendChild(msg);

  const err = (t) => { msg.className = 'optin-error';   msg.textContent = t; };
  const ok  = (t) => { msg.className = 'optin-success'; msg.textContent = t; };

  const clearConsentError = () => {
    consentPanel?.classList.remove('has-error');
    if (consentError) {
      consentError.textContent = '';
      consentError.classList.add('hidden');
    }
    if (consentCheckbox) consentCheckbox.removeAttribute('aria-invalid');
  };

  const showConsentError = (text = 'To continue, check the box agreeing to receive campaign text messages.') => {
    msg.className = '';
    msg.textContent = '';
    consentPanel?.classList.add('has-error');
    if (consentError) {
      consentError.textContent = text;
      consentError.classList.remove('hidden');
    }
    if (consentCheckbox) {
      consentCheckbox.setAttribute('aria-invalid', 'true');
      consentCheckbox.focus({ preventScroll: true });
    }
    consentPanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const setBtn = (txt, { disabled = false, success = false } = {}) => {
    const btn = $('#optin-submit'); if (!btn) return;
    btn.textContent = txt;
    btn.disabled = disabled;
    btn.style.setProperty('background', success ? '#059669' : '#2563eb', 'important');
    btn.style.setProperty('color', '#fff', 'important');
    btn.style.setProperty('opacity', (success && disabled) ? '.9' : '', 'important');
  };

  const normalize10 = (raw) => {
    const d = (raw || '').replace(/\D/g, '');
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  };

  /* ---------- hide honeypot at runtime ---------- */
  {
    const hpWrap = form.querySelector('.hp-field');
    if (hpWrap) {
      hpWrap.setAttribute('aria-hidden', 'true');
      hpWrap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
      const hpInput = hpWrap.querySelector('input');
      if (hpInput) hpInput.setAttribute('tabindex', '-1');
    }
  }

  /* ---------- success modal ---------- */
  const modal = (() => {
    const host = document.createElement('div');
    host.id = 'optin-modal';
    host.innerHTML = `
      <div class="optin-dialog" role="dialog" aria-modal="true" aria-labelledby="optin-modal-title">
        <h2 id="optin-modal-title">Success!</h2>
        <p>Thank you for confirming your opt-in. You’ll receive updates soon.</p>
        <div class="actions"><button id="optin-ok">OK</button></div>
      </div>`;
    document.body.appendChild(host);
    const okBtn = host.querySelector('#optin-ok');
    const goHome = () => { window.location.assign(HOME_URL); };
    const show = () => {
      host.classList.add('show'); okBtn.focus();
      const onKey = (e) => { if (e.key === 'Escape') goHome(); };
      document.addEventListener('keydown', onKey, { once: true });
      okBtn.onclick = goHome;
      host.onclick = (e) => { if (e.target === host) goHome(); };
    };
    return { show };
  })();

/* ---------- Turnstile explicit render ONCE + on-demand token ---------- */

// Sitekey resolution (HTML > window > env default)
const slotEl = document.getElementById('ts-slot');
const htmlKey = slotEl?.dataset?.sitekey || slotEl?.getAttribute?.('data-sitekey');
const TS_SITEKEY = htmlKey
  || (window.__TS_SITEKEY || (isLocalEnv ? '1x00000000000000000000AA' : '0x4AAAAAAB0HbT-nnpITnPNj'));

let tsWidgetId = null;
let tsToken = '';
let tsRendered = false;
let tsRendering = false;
let tsWaiters = [];

// Simple TTL for tokens (Turnstile tokens are short-lived)
let tsIssuedAt = 0;
const TOKEN_TTL_MS = 90 * 1000; // refresh after ~90s

function _flushWaiters(token) {
  const arr = tsWaiters.slice();
  tsWaiters = [];
  for (const fn of arr) { try { fn(token || ''); } catch {} }
}

function _tokenFresh() {
  return tsToken && (Date.now() - tsIssuedAt) < TOKEN_TTL_MS;
}

function renderTurnstileOnce() {
  if (tsRendered || tsRendering || !window.turnstile) return;
  const slot = slotEl || document.querySelector('#ts-slot');
  if (!slot) return;

  tsRendering = true;
  try {
    const existing = slot.querySelector('iframe[src*="challenges.cloudflare.com"]');
    if (existing && existing.id) {
      // Widget already in DOM (SSR/rehydrate). Capture its id for execute().
      tsWidgetId = existing.id;
      tsRendered = true;
    } else {
      tsToken = '';
      tsIssuedAt = 0;

      tsWidgetId = window.turnstile.render('#ts-slot', {
        sitekey: TS_SITEKEY,
        theme: 'auto',
        action: 'optin',
        execution: 'execute',                 // invisible, we will execute on demand
        callback: (token) => {                // fires after execute() succeeds
          tsToken = token || '';
          tsIssuedAt = Date.now();
          _flushWaiters(tsToken);
        },
        'expired-callback': () => { tsToken = ''; tsIssuedAt = 0; },
        'error-callback':   () => { tsToken = ''; tsIssuedAt = 0; }
      });

      tsRendered = true;
    }

    // ---- DEV helpers (console) ----
    if (!window._ts) {
      window._ts = {
        id:     () => tsWidgetId,
        get:    () => (window.turnstile ? window.turnstile.getResponse(tsWidgetId) : ''),
        exec:   () => (window.turnstile ? window.turnstile.execute(tsWidgetId) : undefined),
        reset:  () => { tsToken = ''; tsIssuedAt = 0; try { window.turnstile?.reset(tsWidgetId); } catch {} }
      };
    }
    // --------------------------------
  } catch (e) {
    console.warn('[turnstile] render error:', e);
    // mark rendered so we don’t loop; token fetch will retry render after next load
    tsRendered = true;
  } finally {
    tsRendering = false;
  }
}

// Ensure widget exists when the API is available (prod only)
if (!isLocalEnv) {
  if (window.turnstile) renderTurnstileOnce();
  else window.addEventListener('load', renderTurnstileOnce);
}

// Refresh token when page regains focus (avoid stale token on long idle)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !_tokenFresh()) {
    try { window.turnstile?.reset(tsWidgetId); } catch {}
    tsToken = ''; tsIssuedAt = 0;
  }
});

// Promise-based token getter with timeout and single execution
function ensureTurnstileReady(timeoutMs = 4000) {
  if (window.turnstile && tsRendered) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (window.turnstile) {
        renderTurnstileOnce();
        if (tsRendered) return resolve();
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('Turnstile not ready'));
      setTimeout(tick, 40);
    })();
  });
}

async function getTurnstileToken(timeoutMs = 8000) {
  await ensureTurnstileReady();

  // Fresh token already available
  if (_tokenFresh()) return tsToken;

  // Set up a one-shot waiter for callback()
  const tokenPromise = new Promise((resolve, reject) => {
    tsWaiters.push(resolve);
    const to = setTimeout(() => {
      const i = tsWaiters.indexOf(resolve);
      if (i !== -1) tsWaiters.splice(i, 1);
      reject(new Error('Turnstile timeout'));
    }, timeoutMs);
    const oldResolve = resolve;
    tsWaiters[tsWaiters.length - 1] = (t) => { clearTimeout(to); oldResolve(t); };
  });

  // Execute (id must be known)
  if (!tsWidgetId) renderTurnstileOnce();
  try { window.turnstile.execute(tsWidgetId); } catch { /* will timeout and reject */ }

  const token = await tokenPromise;
  return token || '';
}

function resetTurnstile() {
  tsToken = '';
  tsIssuedAt = 0;
  try { window.turnstile?.reset(tsWidgetId); } catch {}
}

  /* ---------- time-trap ---------- */
  const disableTrap = isLocalEnv || new URLSearchParams(location.search).has('noTrap');
  const MIN_WAIT_MS = isLocalEnv ? 0 : 1200;
  const tsStartEl = $('#ts_start');
  const setStart = () => { if (tsStartEl) tsStartEl.value = String(Date.now()); };
  document.addEventListener('DOMContentLoaded', setStart, { once: true });
  window.addEventListener('load', () => { setStart(); setTimeout(setStart, 50); }, { once: true });
  setStart();

  /* ---------- bind + guard initial button ---------- */
  form.dataset.js = 'ready';
  (() => {
    const btn = $('#optin-submit'); if (!btn) return;
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, MIN_WAIT_MS);
  })();

  consentCheckbox?.addEventListener('change', () => {
    if (consentCheckbox.checked) clearConsentError();
  });

  /* ---------- submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';
    clearConsentError();

    // honeypot: silent success
    if ((form.querySelector('#website')?.value || '').trim() !== '') {
      setBtn('Opt-In Confirmed', { disabled: true, success: true });
      ok('Thanks!'); modal.show(); return;
    }

    // time-trap (disabled in local with ?noTrap)
    const tsStart = parseInt(tsStartEl?.value || '0', 10);
    const elapsed = Date.now() - (Number.isFinite(tsStart) ? tsStart : 0);
    if (!disableTrap && !isLocalEnv && (!tsStart || elapsed < MIN_WAIT_MS)) {
      return err('Please wait a moment and try again.');
    }

    // fields
    const first_name    = $('#first_name')?.value.trim() || '';
    const last_name     = $('#last_name')?.value.trim() || '';
    const address1      = $('#address1')?.value.trim() || '';
    const address2      = $('#address2')?.value.trim() || '';
    const city          = $('#city')?.value.trim() || '';
    const state         = ($('#state')?.value || '').trim().toUpperCase();
    const zip           = ($('#zip')?.value || '').replace(/\D/g, '');
    const phone10       = normalize10($('#phone')?.value || '');
    const email         = ($('#email')?.value || '').trim();
    const consent_sms   = $('#consent_sms')?.checked || false;
    const consent_email = $('#consent_email')?.checked || false;

    // client validation
    if (!first_name) return err('First name is required.');
    if (!last_name)  return err('Last name is required.');
    if (!address1)   return err('Street address is required.');
    if (!city)       return err('City is required.');
    if (!state)      return err('State is required.');
    if (state !== 'WY') return err('This SMS list is for Wyoming addresses only.');
    if (!/^\d{5}$/.test(zip)) return err('Enter a 5-digit Wyoming ZIP.');
    if (phone10.length !== 10) return err('Enter a valid 10-digit mobile.');
    if (!consent_sms) {
      showConsentError();
      return;
    }
    if (email && !/.+@.+\..+/.test(email)) return err('Enter a valid email address.');
    if (email && !consent_email) return err('Check the email opt-in to receive emails.');

    // token
    let tsToken = '';
    if (isLocalEnv) {
      // Local dev: skip Turnstile entirely
      tsToken = 'local-bypass';
    } else {
      try {
        tsToken = await getTurnstileToken(8000);
      } catch {
        resetTurnstile();
        return err('Verification not ready. Please try again.');
      }
      if (!tsToken || tsToken.length < 40) {
        resetTurnstile();
        return err('Verification failed. Please refresh and try again.');
      }
    }
    // 2) POST: send token via header (preferred) and body (compat)
    //    also send elapsed timing fields instead of ts_client
    try {
      setBtn('Validating…', { disabled: true });
      const res = await fetch(`${API_URL}/api/optin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-turnstile-response': tsToken
        },
        body: JSON.stringify({
          first_name,
          last_name,
          address1,
          address2: address2 || null,
          city,
          state,
          country: 'US',
          zip,
          phone: phone10,
          email: email || null,
          consent_sms: !!consent_sms,
          consent_email: !!consent_email,
          consent_version: 'v3-2026-03-31',
          turnstile_token: tsToken,      // keep for older server code
          ts_start_ms: tsStart,
          ts_elapsed_ms: elapsed
        }),
        mode: 'cors',
        credentials: 'omit'
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      form.reset();
      resetTurnstile();
      setBtn('Opt-In Confirmed', { disabled: true, success: true });
      $('#optin-submit').style.display = 'none';
      ok('Thanks! You’re on the SMS list. Reply STOP anytime to opt out.');
      modal.show();
    } catch (e3) {
      console.error('opt-in error', e3);
      setBtn('Confirm Opt-In', { disabled: false });
      err(e3?.message || 'Sorry—something went wrong. Please try again.');
      resetTurnstile(); // never reuse a failed/expired token
    }
  });
}
