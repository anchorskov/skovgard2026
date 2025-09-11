// static/js/pulse-optin.js
import { API_URL, isLocalEnv } from '/js/env.js';

const form = document.getElementById('optin-form');
if (form) {
  /* ---------- small helpers ---------- */
  const HOME_URL = '/';
  const $ = (sel) => form.querySelector(sel && (sel[0] === '#' || sel[0] === '.') ? sel : ('#' + sel));

  const msg = document.createElement('div');
  msg.setAttribute('aria-live', 'polite');
  form.appendChild(msg);

  const err = (t) => { msg.className = 'optin-error';   msg.textContent = t; };
  const ok  = (t) => { msg.className = 'optin-success'; msg.textContent = t; };

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
  const TS_SITEKEY = isLocalEnv ? '1x00000000000000000000AA' : '0x4AAAAAAB0HbT-nnpITnPNj';
  let tsWidgetId = null;
  let tsToken = '';
  let tsRendered = false;
  let tsRendering = false;
  let tsWaiters = [];

  function _flushWaiters(token) {
    const arr = tsWaiters.slice();
    tsWaiters = [];
    for (const fn of arr) { try { fn(token || ''); } catch {} }
  }

  function renderTurnstileOnce() {
    if (tsRendered || tsRendering || !window.turnstile) return;
    const slot = $('#ts-slot');
    if (!slot) return;
    tsRendering = true;
    try {
      const already = slot.querySelector('iframe[src*="challenges.cloudflare.com"]');
      if (already) {
        tsRendered = true;
      } else {
        tsToken = '';
        tsWidgetId = window.turnstile.render('#ts-slot', {
          sitekey: TS_SITEKEY,
          theme: 'auto',
          action: 'optin',
          execution: 'execute',
          callback: (token) => {
            tsToken = token || '';
            _flushWaiters(tsToken);
          },
          'expired-callback': () => { tsToken = ''; },
          'error-callback':   () => { tsToken = ''; }
        });
        tsRendered = true;
      }

      // ---- DEV helpers (console) ----
      if (!window._ts) {
        window._ts = {
          id:     () => tsWidgetId,
          get:    () => (window.turnstile ? window.turnstile.getResponse(tsWidgetId) : ''),
          exec:   () => (window.turnstile ? window.turnstile.execute(tsWidgetId) : undefined),
          reset:  () => { tsToken = ''; try { window.turnstile?.reset(tsWidgetId); } catch {} }
        };
      }
      // -------------------------------
    } catch (e) {
      console.warn('[turnstile] render error:', e);
      tsRendered = true;
    } finally {
      tsRendering = false;
    }
  }

  function ensureTurnstileReady(timeoutMs = 4000) {
    if (window.turnstile && tsRendered) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (window.turnstile) {
          renderTurnstileOnce();
          if (tsRendered) return resolve();
        }
        if (Date.now() - start > timeoutMs) return reject(new Error('Turnstile not ready'));
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  async function getTurnstileToken(timeoutMs = 6000) {
    await ensureTurnstileReady();
    if (tsToken) return tsToken;
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
    window.turnstile.execute(tsWidgetId);
    return await tokenPromise;
  }

  function resetTurnstile() {
    tsToken = '';
    try { window.turnstile.reset(tsWidgetId); } catch {}
  }

  if (window.turnstile) renderTurnstileOnce();
  else window.addEventListener('load', renderTurnstileOnce);

  /* ---------- time-trap ---------- */
  const disableTrap = new URLSearchParams(location.search).has('noTrap');
  const MIN_WAIT_MS = isLocalEnv ? 300 : 1200;
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

  /* ---------- submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';

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
    const county        = $('#county')?.value.trim() || '';
    const zip           = ($('#zip')?.value || '').replace(/\D/g, '');
    const phone10       = normalize10($('#phone')?.value || '');
    const wy_voter      = $('#wy_voter')?.checked || false;
    const email         = ($('#email')?.value || '').trim();
    const consent_sms   = $('#consent_sms')?.checked || false;
    const consent_email = $('#consent_email')?.checked || false;

    // client validation
    if (!first_name) return err('First name is required.');
    if (!last_name)  return err('Last name is required.');
    if (!county)     return err('Select your county.');
    if (!/^\d{5}$/.test(zip)) return err('Enter a 5-digit Wyoming ZIP.');
    if (!wy_voter)   return err('This SMS list is for registered Wyoming voters only.');
    if (phone10.length !== 10) return err('Enter a valid 10-digit mobile.');
    if (!consent_sms) return err('Please confirm SMS consent.');
    if (email && !consent_email) return err('Check the email opt-in to receive emails.');

    // token
    let token = '';
    try {
      token = await getTurnstileToken();
      if (!token) return err('Please complete the verification.');
    } catch {
      return err('Verification failed. Please refresh and try again.');
    }
    console.log({ first_name, last_name, county, zip, phone10, email, consent_sms, consent_email });
    // POST
    try {
      setBtn('Validating…', { disabled: true });
      const res = await fetch(`${API_URL}/api/optin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name, last_name, county, zip, wy_voter: true,
          phone: phone10, email: email || null,
          consent_sms: true, consent_email: !!consent_email,
          consent_version: 'v1-2025-09-08',
          turnstile_token: token,
          ts_client: (tsStartEl?.value || '').trim()
        })
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
      setBtn('Click to Confirm Opt-In', { disabled: false });
      err(e3?.message || 'Sorry—something went wrong. Please try again.');
      resetTurnstile();
    }
  });
}