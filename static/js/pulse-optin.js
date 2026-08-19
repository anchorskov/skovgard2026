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
  const postJoin = $('#pulse-postjoin');
  const stepTwo = $('#pulse-step-2');
  const postJoinHeading = $('#pulse-postjoin-title');
  const stepTwoHeading = $('#pulse-step-2-heading');
  const joinBtn = $('#pulse-join-btn');
  const updatesOnlyBtn = $('#pulse-updates-only');
  const continuePollBtn = $('#pulse-continue-poll');
  const requestCallbackBtn = $('#pulse-request-callback');
  const imDoneBtn = $('#pulse-im-done');
  const backBtn = $('#pulse-back');
  const submitBtn = $('#optin-submit');

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

  // Which button is "in flight" for a given submission. Drives disabled
  // state and the "Validating..."/error label during a POST /api/optin.
  const activeBtn = () => {
    const mode = form.dataset.submissionMode;
    if (mode === 'poll') return submitBtn;
    if (mode === 'callback') return requestCallbackBtn;
    return joinBtn || updatesOnlyBtn;
  };

  const setBtn = (txt, { disabled = false, success = false } = {}) => {
    const btn = activeBtn();
    if (!btn) return;
    btn.textContent = txt;
    for (const action of [joinBtn, updatesOnlyBtn, continuePollBtn, requestCallbackBtn, imDoneBtn, backBtn, submitBtn]) {
      if (action) action.disabled = disabled;
    }
    if (success) btn.setAttribute('data-success', 'true');
    else btn.removeAttribute('data-success');
  };

  const resetActionLabels = () => {
    if (joinBtn) joinBtn.textContent = 'Join the Effort';
    if (updatesOnlyBtn) updatesOnlyBtn.textContent = 'Join the Effort';
    if (requestCallbackBtn) requestCallbackBtn.textContent = 'Please have Jimmy call me back';
    if (submitBtn) submitBtn.textContent = 'Verify me and get my ballot';
  };

  // Step 1 (contact info) never hides. Email is optional at join time but
  // required if someone continues to the poll, so it has to stay reachable
  // and editable rather than locked inside a section that disappears once
  // they've joined. Only the post-join choice and the poll fields toggle.
  const revealPostJoin = () => {
    if (stepTwo) stepTwo.hidden = true;
    if (postJoin) postJoin.hidden = false;
    msg.className = ''; msg.textContent = '';
    postJoinHeading?.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const revealPollStep = () => {
    if (postJoin) postJoin.hidden = true;
    if (stepTwo) stepTwo.hidden = false;
    msg.className = ''; msg.textContent = '';
    stepTwoHeading?.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const normalize10 = (raw) => {
    const d = (raw || '').replace(/\D/g, '');
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  };

  /* ---------- soft data-quality checks ----------
     Wyoming has a single area code (307) and a contiguous ZIP range. A
     mismatch here isn't proof of a typo. Real WY voters keep out-of-state
     cell numbers or list a different mailing ZIP all the time, so these
     never block submission outright. They just require one extra click to
     confirm, the same way a second look catches a "304 instead of 307"
     fat-finger before it ever reaches voter matching. Flags reset whenever
     the field is edited again. */
  const WY_AREA_CODE = '307';
  const isWyZip = (zip5) => {
    const n = Number(zip5);
    return Number.isFinite(n) && n >= 82001 && n <= 83128;
  };
  let phoneAreaConfirmed = false;
  let zipRangeConfirmed = false;
  $('#phone')?.addEventListener('input', () => { phoneAreaConfirmed = false; });
  $('#zip')?.addEventListener('input', () => { zipRangeConfirmed = false; });

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
    host.className = 'optin-modal-backdrop';
    host.innerHTML = `
      <div class="optin-dialog" role="dialog" aria-modal="true" aria-labelledby="optin-modal-title">
        <h2 id="optin-modal-title">Success!</h2>
        <p id="optin-modal-body">You're in. Watch for updates from Jimmy.</p>
        <div class="actions"><button id="optin-ok">OK</button></div>
      </div>`;
    document.body.appendChild(host);
    const okBtn = host.querySelector('#optin-ok');
    const bodyEl = host.querySelector('#optin-modal-body');
    const goHome = () => { window.location.assign(HOME_URL); };
    const show = (text) => {
      if (text && bodyEl) bodyEl.textContent = text;
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
        'error-callback':   () => { tsToken = ''; tsIssuedAt = 0; _flushWaiters(''); }
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

  /* ---------- bind + guard initial actions ---------- */
  form.dataset.js = 'ready';
  (() => {
    const actions = [joinBtn, updatesOnlyBtn];
    for (const action of actions) {
      if (action) action.disabled = true;
    }
    setTimeout(() => {
      for (const action of actions) {
        if (action) action.disabled = false;
      }
    }, MIN_WAIT_MS);
  })();

  /* ---------- best-effort progress capture (see docs/pulse_flow.md) ----------
     Fires once someone has shown real intent (consent box checked + a
     plausible phone number) so staff can follow up if the form is never
     actually submitted. Fire-and-forget: no UI feedback, no blocking, and
     it never sends consent_sms=false, so it can never itself create a
     phantom opt-in signal server-side. No-ops server-side once a real
     opt-in already exists for the phone, so it's only ever relevant before
     someone joins. There's nothing further to capture here after that. */
  let progressBeaconTimer = null;
  const sendProgressBeacon = () => {
    const phone10 = normalize10($('#phone')?.value || '');
    const consentSms = consentCheckbox?.checked || false;
    if (phone10.length !== 10 || !consentSms) return;
    const firstName = $('#first_name')?.value.trim() || '';
    fetch(`${API_URL}/api/pulse/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        phone: phone10,
        first_name: firstName,
        step_reached: 'consent_checked',
        consent_sms: consentSms,
      }),
    }).catch(() => {});
  };
  const queueProgressBeacon = () => {
    clearTimeout(progressBeaconTimer);
    progressBeaconTimer = setTimeout(sendProgressBeacon, 600);
  };

  consentCheckbox?.addEventListener('change', () => {
    if (consentCheckbox.checked) clearConsentError();
    queueProgressBeacon();
  });
  $('#phone')?.addEventListener('input', queueProgressBeacon);

  /* ---------- show email consent panel only when email is filled ---------- */
  const emailField = $('#email');
  const emailConsentWrap = document.getElementById('email-consent-wrap');
  const updateEmailConsent = () => {
    if (!emailConsentWrap) return;
    const hasEmail = (emailField?.value || '').trim().length > 0;
    emailConsentWrap.style.display = hasEmail ? 'block' : 'none';
    if (!hasEmail) {
      const cb = document.getElementById('consent_email');
      if (cb) cb.checked = false;
    }
  };
  emailField?.addEventListener('input', updateEmailConsent);
  updateEmailConsent();

  const readFields = () => ({
    first_name: $('#first_name')?.value.trim() || '',
    last_name: $('#last_name')?.value.trim() || '',
    address1: $('#address1')?.value.trim() || '',
    address2: $('#address2')?.value.trim() || '',
    city: $('#city')?.value.trim() || '',
    state: ($('#state')?.value || '').trim().toUpperCase(),
    zip: ($('#zip')?.value || '').replace(/\D/g, ''),
    phone10: normalize10($('#phone')?.value || ''),
    email: ($('#email')?.value || '').trim(),
    consent_sms: $('#consent_sms')?.checked || false,
    consent_email: $('#consent_email')?.checked || false,
  });

  const fieldError = (field, text) => {
    err(text);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  };

  const validateContactStep = ({ poll = false } = {}) => {
    clearConsentError();
    const fields = readFields();
    if (!fields.first_name) return fieldError($('#first_name'), 'First name is required.');
    if (!fields.last_name) return fieldError($('#last_name'), 'Last name is required.');
    if (fields.phone10.length !== 10) return fieldError($('#phone'), 'Enter a valid 10-digit mobile number.');
    if (!fields.phone10.startsWith(WY_AREA_CODE) && !phoneAreaConfirmed) {
      phoneAreaConfirmed = true;
      return fieldError($('#phone'), "That doesn't look like a Wyoming (307) number, so check it, then click again to continue if it's correct.");
    }
    if (!fields.consent_sms) {
      showConsentError();
      return false;
    }
    if (fields.email && !/.+@.+\..+/.test(fields.email)) {
      return fieldError($('#email'), 'Enter a valid email address.');
    }
    if (poll && !fields.email) {
      return fieldError($('#email'), 'Enter your email so we can deliver your Citizen Poll ballot.');
    }
    if (fields.email && !fields.consent_email) {
      return fieldError($('#consent_email'), 'Check the email opt-in to receive your ballot and campaign emails.');
    }
    return true;
  };

  const validatePollStep = () => {
    const fields = readFields();
    if (!fields.city) return fieldError($('#city'), 'Enter your city so we can find your voter registration.');
    if (!/^\d{5}$/.test(fields.zip)) return fieldError($('#zip'), 'Enter a valid 5-digit ZIP code.');
    if (!isWyZip(fields.zip) && !zipRangeConfirmed) {
      zipRangeConfirmed = true;
      return fieldError($('#zip'), "That ZIP doesn't look like a Wyoming ZIP code, so check it, then click again to continue if it's correct.");
    }
    return true;
  };

  /* ---------- step 1: join (both variants submit the same basic opt-in) ---------- */
  const handleJoinClick = () => {
    msg.className = ''; msg.textContent = '';
    if (!validateContactStep()) return;
    form.dataset.submissionMode = 'updates';
    form.requestSubmit();
  };
  joinBtn?.addEventListener('click', handleJoinClick);
  updatesOnlyBtn?.addEventListener('click', handleJoinClick);

  /* ---------- post-join choice (full variant only) ---------- */
  continuePollBtn?.addEventListener('click', () => {
    form.dataset.submissionMode = 'poll';
    revealPollStep();
  });

  requestCallbackBtn?.addEventListener('click', () => {
    form.dataset.submissionMode = 'callback';
    form.requestSubmit();
  });

  imDoneBtn?.addEventListener('click', () => {
    modal.show("You're in. Watch for updates from Jimmy.");
  });

  backBtn?.addEventListener('click', () => {
    form.dataset.submissionMode = '';
    resetActionLabels();
    revealPostJoin();
  });

  /* ---------- submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';
    clearConsentError();

    const submissionMode = form.dataset.submissionMode || 'updates';

    if (!validateContactStep({ poll: submissionMode === 'poll' })) return;
    if (submissionMode === 'poll' && !validatePollStep()) return;

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

    const {
      first_name, last_name, address1, address2, city, state, zip,
      phone10, email, consent_sms, consent_email,
    } = readFields();

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
          address1: submissionMode === 'poll' ? (address1 || null) : null,
          address2: submissionMode === 'poll' ? (address2 || null) : null,
          city: submissionMode === 'poll' ? city : '',
          state,
          country: 'US',
          zip: submissionMode === 'poll' ? zip : '',
          phone: phone10,
          email: email || null,
          consent_sms: !!consent_sms,
          consent_email: !!consent_email,
          request_callback: submissionMode === 'callback',
          consent_version: 'v3-2026-03-31',
          turnstile_token: tsToken,      // keep for older server code
          ts_start_ms: tsStart,
          ts_elapsed_ms: elapsed
        }),
        mode: 'cors',
        credentials: 'omit'
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      resetTurnstile();
      const verificationStatus = data?.verification?.status || 'not_attempted';
      const isFullVariant = form.dataset.variant !== 'updates';

      if (submissionMode === 'updates' && isFullVariant) {
        // First join in the full flow: don't end the flow here, reveal the
        // Citizen Poll / callback / done choice instead.
        setBtn('Joined!', { disabled: false, success: true });
        const channels = consent_email ? 'text and email lists' : 'SMS list';
        ok(`Thanks! You're on our ${channels}. Reply STOP anytime to opt out of texts.`);
        revealPostJoin();
        return;
      }

      // End of the flow: the "updates" variant's Get Updates, a completed
      // poll step, or a callback request.
      form.reset();
      setBtn('Opt-In Confirmed', { disabled: true, success: true });
      const channels = consent_email ? 'text and email lists' : 'SMS list';
      const spamNote = consent_email
        ? ' Check your inbox (and spam/junk folder) for a message from pulse@grassrootsmvt.org.'
        : '';

      let verifyNote = '';
      if (verificationStatus === 'matched' && data?.verification?.pollLink) {
        verifyNote = " You're verified as a Wyoming voter, and your Citizen Poll ballot link is on its way.";
      } else if (verificationStatus === 'matched') {
        verifyNote = " You're verified as a Wyoming voter. We could not create your ballot link yet, so we'll follow up.";
      } else if (verificationStatus === 'matched_no_email') {
        verifyNote = " You're verified as a Wyoming voter. Add your email above and resubmit to get your Citizen Poll link.";
      } else if (verificationStatus === 'already_sent') {
        verifyNote = " You're verified as a Wyoming voter, and you already received your Citizen Poll ballot link by text or email.";
      } else if (verificationStatus === 'ambiguous' || verificationStatus === 'no_match') {
        verifyNote = " We couldn't automatically verify your voter registration, so we'll follow up if we can confirm it.";
      } else if (verificationStatus === 'callback_requested') {
        verifyNote = " We got your callback request, and someone from our team will call you back to finish your Citizen Poll verification.";
      }

      ok(`Thanks! You're on our ${channels}. Reply STOP anytime to opt out of texts.${spamNote}${verifyNote}`);
      const modalText = submissionMode === 'poll'
        ? verificationStatus === 'matched' && data?.verification?.pollLink
          ? "You're verified. Your Citizen Poll ballot link is on its way by text and email."
          : verificationStatus === 'already_sent'
            ? "You're verified. You already received your Citizen Poll ballot link. Check your earlier texts or email."
            : verificationStatus === 'ambiguous' || verificationStatus === 'no_match'
              ? "Your opt-in is confirmed. We couldn't automatically match your voter registration, so our team will review it."
              : "Your opt-in is confirmed. We'll follow up about your Citizen Poll ballot."
        : submissionMode === 'callback'
          ? "Your callback request is confirmed. Someone from our team will call you back to finish your Citizen Poll verification."
          : consent_email
            ? "You're in. Watch for updates from Jimmy. Check your inbox and spam or junk folder for our welcome message."
            : "You're in. Watch for updates from Jimmy.";
      modal.show(modalText);
    } catch (e3) {
      console.error('opt-in error', e3);
      const fallbackLabel =
        submissionMode === 'poll' ? 'Verify me and get my ballot'
        : submissionMode === 'callback' ? 'Please have Jimmy call me back'
        : 'Join the Effort';
      setBtn(fallbackLabel, { disabled: false });
      resetActionLabels();
      err(e3?.message || 'Sorry, something went wrong. Please try again.');
      resetTurnstile(); // never reuse a failed/expired token
    }
  });
}
