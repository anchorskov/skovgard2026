// static/js/pulse-optin.js
import { API_URL, isLocalEnv } from '/js/env.js';

const form = document.getElementById('optin-form');
if (form) {
  const HOME_URL = '/';

  // Accepts '#id', '.class', or bare 'id'
  const $ = (sel) => form.querySelector(sel && (sel[0] === '#' || sel[0] === '.') ? sel : ('#' + sel));

  const msg = document.createElement('div');
  msg.setAttribute('aria-live','polite');
  form.appendChild(msg);

  // Hide honeypot at runtime (avoid greppable CSS)
  const hpWrap = form.querySelector('.hp-field');
  if (hpWrap) {
    hpWrap.setAttribute('aria-hidden','true');
    hpWrap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    const hpInput = hpWrap.querySelector('input');
    if (hpInput) hpInput.setAttribute('tabindex','-1');
  }

  // Swallow noisy extension errors only
  window.addEventListener('unhandledrejection', (e) => {
    const m = String(e?.reason && (e.reason.message || e.reason));
    if (m.includes('Could not establish connection') && m.includes('Receiving end does not exist')) {
      e.preventDefault();
    }
  });

  // Success modal
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
      setTimeout(goHome, 3000);
    };
    return { show };
  })();

  // If you use explicit rendering via a #ts-slot container, this will render Invisible and
  // fall back to Managed if a token doesn’t appear quickly. If you use the static widget
  // (<div class="cf-turnstile" ...>), this block exits early.
  (function maybeRenderTurnstile() {
    const slot = $('#ts-slot');
    const hasStaticWidget = !!document.querySelector('.cf-turnstile');
    if (!slot || hasStaticWidget) return;

    const SITE_KEY = '0x4AAAAAAB0HbT-nnpITnPNj'; // your site key
    const fallbackToManaged = () => {
      try { window.turnstile.reset(slot); } catch {}
      window.turnstile?.render?.('#ts-slot', {
        sitekey: SITE_KEY, appearance: 'interaction-only', theme: 'auto'
      });
    };
    const tryInvisible = () => {
      window.turnstile?.render?.('#ts-slot', {
        sitekey: SITE_KEY, appearance: 'execute', theme: 'auto',
        'error-callback': fallbackToManaged, 'timeout-callback': fallbackToManaged
      });
      setTimeout(() => {
        const tok = form.querySelector('input[name="cf-turnstile-response"]');
        if (!tok || !tok.value) fallbackToManaged();
      }, 2000);
    };
    if (window.turnstile) tryInvisible();
    else window.addEventListener('load', tryInvisible);
  })();

  // Time-trap (faster locally) + optional bypass while testing
  const disableTrap = new URLSearchParams(location.search).has('noTrap');
  const MIN_WAIT_MS = isLocalEnv ? 300 : 1200;
  const tsStartEl = $('#ts_start');
  const setStart = () => { if (tsStartEl) tsStartEl.value = String(Date.now()); };
  document.addEventListener('DOMContentLoaded', setStart, { once: true });
  window.addEventListener('load', () => { setStart(); setTimeout(setStart, 50); }, { once: true });
  setStart();

  const normalize10 = (raw) => {
    const d = (raw || '').replace(/\D/g, '');
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  };

  // Button helper that beats theme !important
  const setBtn = (txt, { disabled = false, success = false } = {}) => {
    const btn = $('#optin-submit'); if (!btn) return;
    btn.textContent = txt;
    btn.disabled = disabled;
    const baseBg = '#2563eb', okBg = '#059669';
    btn.style.setProperty('background', success ? okBg : baseBg, 'important');
    btn.style.setProperty('color', '#fff', 'important');
    btn.style.setProperty('opacity', (success && disabled) ? '.9' : '', 'important');
  };

  const err = (t) => { msg.className='optin-error'; msg.textContent=t; };
  const ok  = (t) => { msg.className='optin-success'; msg.textContent=t; };

  // Mark that JS is bound
  form.dataset.js = 'ready';

  // Prevent instant click before widgets render
  (() => {
    const btn = $('#optin-submit');
    if (!btn) return;
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, MIN_WAIT_MS);
  })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';

    // Honeypot: silent success (don’t tip bots)
    if ((form.querySelector('#website')?.value || '').trim() !== '') {
      setBtn('Opt-In Confirmed', { disabled:true, success:true });
      ok('Thanks!'); modal.show(); return;
    }

    // Time trap with local bypass + diagnostics
    const tsStart = parseInt(tsStartEl?.value || '0', 10);
    const elapsed = Date.now() - (Number.isFinite(tsStart) ? tsStart : 0);
    if (!disableTrap && !isLocalEnv && (!tsStart || elapsed < MIN_WAIT_MS)) {
      console.warn('time-trap: tsStart=%s elapsed=%sms need >= %sms', tsStart, elapsed, MIN_WAIT_MS);
      return err('Please wait a moment and try again.');
    }

    // Read fields
    const first_name    = $('#first_name')?.value.trim() || '';
    const last_name     = $('#last_name')?.value.trim() || '';
    const county        = $('#county')?.value.trim() || '';
    const zip           = ($('#zip')?.value || '').replace(/\D/g, '');
    const phone10       = normalize10($('#phone')?.value || '');
    const wy_voter      = $('#wy_voter')?.checked || false;
    const email         = ($('#email')?.value || '').trim();
    const consent_sms   = $('#consent_sms')?.checked || false;
    const consent_email = $('#consent_email')?.checked || false;

    // Turnstile token (implicit widget injects a hidden input)
    const tsToken = form.querySelector('input[name="cf-turnstile-response"]')?.value || '';

    // Client validations (mirror Worker)
    if (!first_name) return err('First name is required.');
    if (!last_name)  return err('Last name is required.');
    if (!county)     return err('Select your county.');
    if (!/^\d{5}$/.test(zip)) return err('Enter a 5-digit Wyoming ZIP.');
    if (!wy_voter)  return err('This SMS list is for registered Wyoming voters only.');
    if (phone10.length !== 10) return err('Enter a valid 10-digit mobile.');
    if (!consent_sms) return err('Please confirm SMS consent.');
    if (email && !consent_email) return err('Check the email opt-in to receive emails.');
    if (!tsToken) return err('Please complete the verification.');

    try {
      setBtn('Validating…', { disabled:true });
      const res = await fetch(`${API_URL}/api/optin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // NOTE: token included in body; Worker should verify via siteverify API
        body: JSON.stringify({
          first_name, last_name, county, zip, wy_voter: true,
          phone: phone10, email: email || null,
          consent_sms: true, consent_email: !!consent_email,
          consent_version: 'v1-2025-09-08',
          turnstile_token: tsToken,
          ts_client: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      form.reset();
      setBtn('Opt-In Confirmed', { disabled:true, success:true });
      ok('Thanks! You’re on the SMS list. Reply STOP anytime to opt out.');
      modal.show();
    } catch (e2) {
      console.error('opt-in error', e2);
      setBtn('Click to Confirm Opt-In', { disabled:false });
      err('Sorry—something went wrong. Please try again.');
    } finally {
      // Always refresh the widget so a fresh token is ready
      try { window.turnstile?.reset(); } catch {}
    }
  });
}
