import { API_URL, isLocalEnv } from '/js/env.js';

const form = document.getElementById('newsletter-form');
if (form) {
  const $ = (sel) => form.querySelector(sel[0] === '#' ? sel : `#${sel}`);
  const msg = document.createElement('div');
  msg.setAttribute('aria-live', 'polite');
  form.appendChild(msg);

  const err = (t) => { msg.className = 'optin-error'; msg.textContent = t; };
  const ok = (t) => { msg.className = 'optin-success'; msg.textContent = t; };

  const setBtn = (txt, { disabled = false, success = false } = {}) => {
    const btn = $('#newsletter-submit');
    if (!btn) return;
    btn.textContent = txt;
    btn.disabled = disabled;
    btn.style.setProperty('background', success ? '#059669' : '#2563eb', 'important');
    btn.style.setProperty('color', '#fff', 'important');
    btn.style.setProperty('opacity', (success && disabled) ? '.9' : '', 'important');
  };

  // Honeypot hidden at runtime
  {
    const hpWrap = form.querySelector('.hp-field');
    if (hpWrap) {
      hpWrap.setAttribute('aria-hidden', 'true');
      hpWrap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
      const hpInput = hpWrap.querySelector('input');
      if (hpInput) hpInput.setAttribute('tabindex', '-1');
    }
  }

  // Turnstile explicit render
  const slotEl = document.getElementById('ts-slot');
  const htmlKey = slotEl?.dataset?.sitekey || slotEl?.getAttribute?.('data-sitekey');
  const TS_SITEKEY = htmlKey
    || (window.__TS_SITEKEY || (isLocalEnv ? '1x00000000000000000000AA' : '0x4AAAAAAB0HbT-nnpITnPNj'));

  let tsWidgetId = null;
  let tsToken = '';
  let tsIssuedAt = 0;
  let tsRendered = false;
  let tsRendering = false;
  let tsWaiters = [];
  const TOKEN_TTL_MS = 90 * 1000;

  const _tokenFresh = () => tsToken && (Date.now() - tsIssuedAt) < TOKEN_TTL_MS;
  const _flushWaiters = (token) => {
    const arr = tsWaiters.slice();
    tsWaiters = [];
    for (const fn of arr) {
      try { fn(token || ''); } catch {}
    }
  };

  function renderTurnstileOnce() {
    if (tsRendered || tsRendering || !window.turnstile) return;
    if (!slotEl) return;
    tsRendering = true;
    try {
      tsWidgetId = window.turnstile.render('#ts-slot', {
        sitekey: TS_SITEKEY,
        theme: 'auto',
        action: 'newsletter',
        execution: 'execute',
        callback: (token) => {
          tsToken = token || '';
          tsIssuedAt = Date.now();
          _flushWaiters(tsToken);
        },
        'expired-callback': () => { tsToken = ''; tsIssuedAt = 0; },
        'error-callback': () => { tsToken = ''; tsIssuedAt = 0; },
      });
      tsRendered = true;
    } finally {
      tsRendering = false;
    }
  }

  async function ensureTurnstileReady(timeoutMs = 4000) {
    if (window.turnstile && tsRendered) return;
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (window.turnstile) {
        renderTurnstileOnce();
        if (tsRendered) return;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error('Turnstile not ready');
  }

  async function getTurnstileToken(timeoutMs = 8000) {
    await ensureTurnstileReady();
    if (_tokenFresh()) return tsToken;

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
    return tokenPromise;
  }

  function resetTurnstile() {
    tsToken = '';
    tsIssuedAt = 0;
    try { window.turnstile?.reset(tsWidgetId); } catch {}
  }

  if (!isLocalEnv) {
    if (window.turnstile) renderTurnstileOnce();
    else window.addEventListener('load', renderTurnstileOnce);
  }

  // Time trap
  const MIN_WAIT_MS = isLocalEnv ? 0 : 1200;
  const tsStartEl = $('#ts_start');
  const setStart = () => { if (tsStartEl) tsStartEl.value = String(Date.now()); };
  document.addEventListener('DOMContentLoaded', setStart, { once: true });
  window.addEventListener('load', () => { setStart(); setTimeout(setStart, 50); }, { once: true });
  setStart();

  // Initial button hold
  const submitBtn = $('#newsletter-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    setTimeout(() => { submitBtn.disabled = false; }, MIN_WAIT_MS);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = '';
    msg.textContent = '';

    // Honeypot: silent success
    if ((form.querySelector('#website')?.value || '').trim() !== '') {
      setBtn('Subscribed', { disabled: true, success: true });
      ok('Thanks! You are subscribed.');
      return;
    }

    const tsStart = parseInt(tsStartEl?.value || '0', 10);
    const elapsed = Date.now() - (Number.isFinite(tsStart) ? tsStart : 0);
    if (!isLocalEnv && (!tsStart || elapsed < MIN_WAIT_MS)) {
      return err('Please wait a moment and try again.');
    }

    const email = ($('#email')?.value || '').trim();
    const consent_email = $('#consent_email')?.checked || false;
    if (!/.+@.+\..+/.test(email)) return err('Enter a valid email address.');
    if (!consent_email) return err('Please confirm email consent.');

    let tsToken = '';
    if (isLocalEnv) {
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

    try {
      setBtn('Submitting…', { disabled: true });
      const res = await fetch(`${API_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-turnstile-response': tsToken,
        },
        body: JSON.stringify({
          email,
          consent_email: true,
          consent_version: 'email-v1-2026-02-19',
          turnstile_token: tsToken,
          ts_start_ms: tsStart,
          ts_elapsed_ms: elapsed,
        }),
        mode: 'cors',
        credentials: 'omit',
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      form.reset();
      resetTurnstile();
      setBtn('Subscribed', { disabled: true, success: true });
      ok('Thanks! You are on the email updates list.');
    } catch (e2) {
      console.error('newsletter signup error', e2);
      setBtn('Join Email Updates', { disabled: false });
      err(e2?.message || 'Sorry—something went wrong. Please try again.');
      resetTurnstile();
    }
  });
}
