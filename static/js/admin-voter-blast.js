// static/js/admin-voter-blast.js
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const CHUNK_SIZE     = 20;    // messages per worker request
  const INTER_CHUNK_MS = 2500;  // pause between chunks (server already does 1s/msg)
  const STOP_FOOTER    = '\n\nReply STOP to opt out.';

  // CTIA quiet hours in Mountain Time (America/Denver handles DST automatically)
  const MT_WINDOW_OPEN  = 8 * 60;   // 8:00 AM = 480 min
  const MT_WINDOW_CLOSE = 21 * 60;  // 9:00 PM = 1260 min
  const WY_COUNTIES = [
    'ALBANY','BIG HORN','CAMPBELL','CARBON','CONVERSE','CROOK','FREMONT',
    'GOSHEN','HOT SPRINGS','JOHNSON','LARAMIE','LINCOLN','NATRONA','NIOBRARA',
    'PARK','PLATTE','SHERIDAN','SUBLETTE','SWEETWATER','TETON','UINTA',
    'WASHAKIE','WESTON',
  ];

  // ── State ────────────────────────────────────────────────────────────────
  let adminKey      = '';
  let actorEmail    = '';
  let previewResult = null;  // { total, samples, preview: { issuedAt, token } }
  let currentBlast  = null;  // { blast_id, total_audience, sent, failed, skipped }
  let blasting      = false;
  let paused        = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Bootstrap ────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Party filter starts disabled — enabled only after a look-up method is chosen
    const partySel = $('vb-party');
    if (partySel) partySel.disabled = true;

    bindAuth();
    bindStage1();
    bindStage2();
    bindStage3();
    checkForResume();
  });

  // ── Stage 1: Targeting ───────────────────────────────────────────────────
  function bindStage1() {
    $('vb-lookup-by')?.addEventListener('change', onLookupByChange);
    $('vb-preview-btn')?.addEventListener('click', runPreview);
    $('vb-text')?.addEventListener('input', updateMsgPreview);
  }

  function onLookupByChange() {
    const method   = ($('vb-lookup-by')?.value || '');
    const partySel = $('vb-party');

    // Clear value and disable every secondary field before switching
    [
      ['vb-county-field',   'vb-county'],
      ['vb-city-field',     'vb-city'],
      ['vb-district-field', 'vb-district-num'],
    ].forEach(([fieldId, selId]) => {
      const field = $(fieldId);
      const sel   = $(selId);
      if (field) field.hidden = true;
      if (sel)   { sel.value = ''; sel.disabled = true; }
    });

    // Party: enabled only when a method is active
    if (partySel) partySel.disabled = !method;

    switch (method) {
      case 'county':
        populateCountySelect();
        $('vb-county').disabled     = false;
        $('vb-county-field').hidden = false;
        break;
      case 'city':
        $('vb-city-field').hidden = false;
        if (adminKey) fetchAllCities();
        else setCityPlaceholder($('vb-city'), '— Connect first —', true);
        break;
      case 'house':
        $('vb-district-label').textContent = 'House District (1–62)';
        populateDistrictSelect(62);
        $('vb-district-num').disabled   = false;
        $('vb-district-field').hidden   = false;
        break;
      case 'senate':
        $('vb-district-label').textContent = 'Senate District (1–31)';
        populateDistrictSelect(31);
        $('vb-district-num').disabled   = false;
        $('vb-district-field').hidden   = false;
        break;
      default:
        // statewide or blank — no secondary field
        break;
    }
  }

  function populateCountySelect() {
    const sel = $('vb-county');
    if (!sel || sel.options.length > 1) return; // already populated
    WY_COUNTIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = titleCase(c);
      sel.appendChild(opt);
    });
  }

  function populateDistrictSelect(max) {
    const sel = $('vb-district-num');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select —</option>';
    for (let i = 1; i <= max; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      sel.appendChild(opt);
    }
  }

  async function fetchAllCities() {
    const citySel = $('vb-city');
    if (!citySel) return;
    // Already populated — just re-enable
    if (citySel.options.length > 1) { citySel.disabled = false; return; }
    setCityPlaceholder(citySel, 'Loading cities…', true);
    try {
      const res  = await apiFetch('/api/admin/voter-blast/cities', 'GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      citySel.innerHTML = '';
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = `— Select a city (${data.cities.length} in WY) —`;
      citySel.appendChild(allOpt);

      (data.cities || []).forEach(({ city, county }) => {
        const opt = document.createElement('option');
        opt.value = city.toUpperCase();
        opt.textContent = `${city} — ${county}`;
        citySel.appendChild(opt);
      });
      citySel.disabled = false;
    } catch (e) {
      console.error('[voter-blast] fetchAllCities failed:', e);
      setCityPlaceholder(citySel, '— Failed to load cities —', false);
      setStatus('vb-stage1-status', `City load failed: ${e.message}`, 'error');
    }
  }

  function setCityPlaceholder(citySel, text, disabled) {
    citySel.innerHTML = `<option value="">${text}</option>`;
    citySel.disabled  = disabled;
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  function bindAuth() {
    const connectBtn = $('vb-connect');
    const clearBtn   = $('vb-clear');
    if (!connectBtn) return;

    connectBtn.addEventListener('click', async () => {
      const key   = ($('vb-admin-key')   ?.value || '').trim();
      const email = ($('vb-actor-email') ?.value || '').trim();
      if (!key) { setStatus('vb-auth-status', 'Admin key required.', 'error'); return; }

      setStatus('vb-auth-status', 'Connecting…', 'info');
      try {
        const res  = await apiFetch('/api/admin/voter-blast/jobs', 'GET', null, key, email);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        adminKey   = key;
        actorEmail = email;
        $('vb-auth-form').hidden   = true;
        $('admin-vb-shell').hidden = false;
        setStatus('vb-auth-status', '', '');
        renderJobsTable(data.jobs || []);
        // If "City" was already selected before auth, fetch now
        if ($('vb-lookup-by')?.value === 'city') fetchAllCities();
      } catch (e) {
        setStatus('vb-auth-status', e.message, 'error');
      }
    });

    clearBtn?.addEventListener('click', () => {
      adminKey = ''; actorEmail = '';
      $('vb-admin-key').value    = '';
      $('vb-actor-email').value  = '';
      $('vb-auth-form').hidden   = false;
      $('admin-vb-shell').hidden = true;
    });
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  async function runPreview() {
    const method = ($('vb-lookup-by')?.value || '');
    const text   = ($('vb-text')?.value || '').trim();

    if (!method) { setStatus('vb-stage1-status', 'Select a look-up method first.', 'error'); return; }
    if (!text)   { setStatus('vb-stage1-status', 'Write the message first.', 'error'); return; }

    let county = null, city = null, districtType = null, district = null;

    switch (method) {
      case 'county':
        county = ($('vb-county')?.value || '').trim().toUpperCase() || null;
        if (!county) { setStatus('vb-stage1-status', 'Select a county.', 'error'); return; }
        break;
      case 'city':
        city = ($('vb-city')?.value || '').trim().toUpperCase() || null;
        if (!city) { setStatus('vb-stage1-status', 'Select a city.', 'error'); return; }
        break;
      case 'house':
        districtType = 'house';
        district = ($('vb-district-num')?.value || '').trim() || null;
        if (!district) { setStatus('vb-stage1-status', 'Select a house district number.', 'error'); return; }
        break;
      case 'senate':
        districtType = 'senate';
        district = ($('vb-district-num')?.value || '').trim() || null;
        if (!district) { setStatus('vb-stage1-status', 'Select a senate district number.', 'error'); return; }
        break;
      case 'statewide':
        // no geographic filter
        break;
    }

    const party = ($('vb-party')?.value || '') || null;

    setStatus('vb-stage1-status', 'Previewing audience…', 'info');
    setNum('vb-preview-btn', true, 'Previewing…');

    try {
      const params = new URLSearchParams({ text });
      if (county)       params.set('county', county);
      if (city)         params.set('city', city);
      if (party)        params.set('party', party);
      if (districtType) params.set('district_type', districtType);
      if (district)     params.set('district', district);

      const res  = await apiFetch('/api/admin/voter-blast/preview?' + params.toString(), 'GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      previewResult = data;
      renderPreviewCard(data);
      setStatus('vb-stage1-status', '', '');
      $('vb-stage2').hidden = false;
      $('vb-stage2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStageActive(1, false);
      setStageActive(2, true);
    } catch (e) {
      setStatus('vb-stage1-status', e.message, 'error');
    } finally {
      setNum('vb-preview-btn', false, 'Preview Audience');
    }
  }

  function renderPreviewCard(data) {
    const card = $('vb-preview-card');
    if (!card) return;
    card.hidden = false;

    const statEl = card.querySelector('.vb-preview-stat');
    const subEl  = card.querySelector('.vb-preview-sub');
    const costEl = card.querySelector('.vb-preview-cost');
    const listEl = card.querySelector('.vb-sample-list');

    if (statEl) statEl.textContent = data.total.toLocaleString();
    if (subEl)  subEl.textContent  = `Estimated send time at 1 msg/sec: ~${data.estimatedMinutes} min`;

    if (costEl && data.cost) {
      const { segments, baseCost, maxCost } = data.cost;
      costEl.innerHTML =
        `<strong>Estimated cost:</strong> $${baseCost.toFixed(2)}–$${maxCost.toFixed(2)} ` +
        `<span class="vb-cost-detail">(${segments} SMS segment${segments > 1 ? 's' : ''} \xd7 ${data.total.toLocaleString()} recipients \xb7 ` +
        `$0.0040/seg base + carrier surcharges up to ~$0.0042/seg)</span>`;
    }

    if (listEl) {
      listEl.innerHTML = '';
      (data.samples || []).forEach((s) => {
        const li = document.createElement('li');
        li.className = 'vb-sample-chip';
        li.textContent = `${s.name} · ${s.city}`;
        listEl.appendChild(li);
      });
    }
  }

  // ── Stage 2: Approve & Create ─────────────────────────────────────────────
  function bindStage2() {
    $('vb-text')?.addEventListener('input', updateMsgPreview);
    $('vb-create-job-btn')?.addEventListener('click', createJob);
  }

  function updateMsgPreview() {
    const raw       = ($('vb-text')?.value || '').trim();
    const sample    = raw.replace(/\{first_name\}/gi, 'Sarah');
    const full      = sample + STOP_FOOTER;
    const previewEl = $('vb-msg-preview');
    const counterEl = $('vb-char-counter');
    if (previewEl) previewEl.textContent = full;
    if (counterEl) {
      const len  = full.length;
      const segs = len <= 160 ? 1 : Math.ceil(len / 153);
      counterEl.textContent = `${len} chars · ${segs} SMS segment${segs > 1 ? 's' : ''}`;
      counterEl.className   = 'vb-char-counter' + (segs > 2 ? ' warn' : '');
    }
  }

  async function createJob() {
    if (!previewResult) { setStatus('vb-stage2-status', 'Run Preview first.', 'error'); return; }

    const method    = ($('vb-lookup-by')?.value || '');
    const text      = ($('vb-text')?.value || '').trim();
    const confirmed = $('vb-confirm-check')?.checked;

    if (!text)      { setStatus('vb-stage2-status', 'Message is empty.', 'error'); return; }
    if (!confirmed) { setStatus('vb-stage2-status', 'Check the confirmation box first.', 'error'); return; }

    let county = null, city = null, districtType = null, district = null;
    switch (method) {
      case 'county':  county       = ($('vb-county')?.value       || '').trim().toUpperCase() || null; break;
      case 'city':    city         = ($('vb-city')?.value         || '').trim().toUpperCase() || null; break;
      case 'house':   districtType = 'house';  district = ($('vb-district-num')?.value || '').trim() || null; break;
      case 'senate':  districtType = 'senate'; district = ($('vb-district-num')?.value || '').trim() || null; break;
    }
    const party = ($('vb-party')?.value || '') || null;

    setStatus('vb-stage2-status', 'Creating blast job…', 'info');
    setNum('vb-create-job-btn', true, 'Creating…');

    try {
      const res  = await apiFetch('/api/admin/voter-blast/job', 'POST', {
        county, city, party, district_type: districtType, district, text,
        preview_token:     previewResult.preview.token,
        preview_issued_at: previewResult.preview.issuedAt,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      currentBlast = { blast_id: data.blast_id, total_audience: data.total_audience, sent: 0, failed: 0, skipped: 0 };
      sessionStorage.setItem('vb_blast_id', data.blast_id);

      $('vb-blast-id-display').textContent    = data.blast_id;
      $('vb-blast-total-display').textContent = data.total_audience.toLocaleString();
      setStatus('vb-stage2-status', '', '');
      $('vb-stage3').hidden = false;
      $('vb-stage3').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStageActive(2, false);
      setStageActive(3, true);
    } catch (e) {
      setStatus('vb-stage2-status', e.message, 'error');
    } finally {
      setNum('vb-create-job-btn', false, 'Create Blast Job');
    }
  }

  // ── Stage 3: Send ─────────────────────────────────────────────────────────
  function bindStage3() {
    $('vb-start-btn')?.addEventListener('click', startBlast);
    $('vb-pause-btn')?.addEventListener('click', pauseBlast);
    // Close modal when clicking the backdrop
    $('vb-time-modal')?.addEventListener('click', (e) => {
      if (e.target === $('vb-time-modal')) hideSendModal();
    });
  }

  function startBlast() {
    if (!currentBlast) return;
    showSendModal(() => {
      paused   = false;
      blasting = true;
      $('vb-start-btn').disabled = true;
      $('vb-pause-btn').disabled = false;
      setStatus('vb-stage3-status', 'Blast running — do not close this tab.', 'warn');
      sendNextChunk();
    });
  }

  // ── Time guardrail modal ─────────────────────────────────────────────────
  function getMTMinutes() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour').value);
    const m = Number(parts.find(p => p.type === 'minute').value);
    return (h === 24 ? 0 : h) * 60 + m;
  }

  function fmtMT(totalMins) {
    const h    = Math.floor(totalMins / 60) % 24;
    const m    = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm} MT`;
  }

  function fmtDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function checkSendWindow(totalAudience) {
    const now     = getMTMinutes();
    const durMins = Math.ceil(totalAudience / 60);
    const endMins = now + durMins;

    if (now < MT_WINDOW_OPEN || now >= MT_WINDOW_CLOSE) {
      return {
        status:  'red',
        title:   'Outside Permitted Hours',
        canSend: false,
        now, durMins, endMins,
      };
    }
    const remaining = MT_WINDOW_CLOSE - now;
    if (endMins <= MT_WINDOW_CLOSE) {
      return { status: 'green', title: 'Clear to Send', canSend: true, now, durMins, endMins, remaining };
    }
    return { status: 'yellow', title: 'Partial Window Warning', canSend: true, now, durMins, endMins, remaining };
  }

  function showSendModal(onConfirm) {
    const total   = currentBlast?.total_audience || 0;
    const check   = checkSendWindow(total);
    const overlay = $('vb-time-modal');
    const header  = $('vb-modal-header');
    const msgEl   = $('vb-modal-msg');
    const btnsEl  = $('vb-modal-btns');

    header.className   = `vb-modal-header ${check.status}`;
    header.textContent = check.title;
    msgEl.innerHTML    = '';
    btnsEl.innerHTML   = '';

    // ── Build content rows ──
    const row = document.createElement('div');
    row.className = 'vb-modal-row';

    const addKV = (label, value) => {
      const kv = document.createElement('div');
      kv.className = 'vb-modal-kv';
      kv.innerHTML = `<span class="vb-modal-label">${label}</span><span class="vb-modal-value">${value}</span>`;
      row.appendChild(kv);
    };

    addKV('Current time', fmtMT(check.now));
    addKV('Audience', total.toLocaleString() + ' voters');
    addKV('Est. duration', fmtDuration(check.durMins));

    if (check.status === 'green') {
      addKV('Est. finish', fmtMT(check.endMins));
      addKV('Window closes', fmtMT(MT_WINDOW_CLOSE));
    } else if (check.status === 'yellow') {
      const maxInWindow = check.remaining * 60;
      addKV('Window closes', fmtMT(MT_WINDOW_CLOSE));
      addKV('Fits in window', maxInWindow.toLocaleString() + ' msgs');
    }
    msgEl.appendChild(row);

    const note = document.createElement('p');
    note.className = 'vb-modal-note';

    if (check.status === 'green') {
      note.textContent = `This blast will finish around ${fmtMT(check.endMins)} MT, before the 9:00 PM carrier cutoff. You're clear to send.`;
    } else if (check.status === 'yellow') {
      const maxInWindow = check.remaining * 60;
      note.className += ' warn';
      note.textContent = `Only ${fmtDuration(check.remaining)} remain before carriers enforce quiet hours at 9:00 PM MT. `
        + `Approximately ${maxInWindow.toLocaleString()} of ${total.toLocaleString()} messages can be sent tonight. `
        + `You must pause before 9:00 PM MT and resume tomorrow at 8:00 AM MT.`;
    } else {
      note.className += ' alert';
      const opensAt = now < MT_WINDOW_OPEN ? fmtMT(MT_WINDOW_OPEN) + ' MT today' : '8:00 AM MT tomorrow';
      note.textContent = `CTIA guidelines prohibit sending before 8:00 AM or after 9:00 PM in the recipient's time zone. `
        + `Carriers actively filter messages outside this window. Sending resumes at ${opensAt}.`;
    }
    msgEl.appendChild(note);

    // ── Buttons ──
    if (check.canSend) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className   = 'vb-btn vb-btn-primary';
      confirmBtn.textContent = check.status === 'yellow' ? 'I understand — Start Blast' : 'Confirm & Start';
      confirmBtn.addEventListener('click', () => { hideSendModal(); onConfirm(); });
      btnsEl.appendChild(confirmBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.className   = 'vb-btn vb-btn-outline';
    dismissBtn.textContent = check.canSend ? 'Cancel' : 'Got it';
    dismissBtn.addEventListener('click', hideSendModal);
    btnsEl.appendChild(dismissBtn);

    overlay.hidden = false;
  }

  function hideSendModal() {
    $('vb-time-modal').hidden = true;
  }

  function pauseBlast() {
    paused   = true;
    blasting = false;
    $('vb-start-btn').disabled = false;
    $('vb-start-btn').textContent = 'Resume';
    $('vb-pause-btn').disabled = true;
    setStatus('vb-stage3-status', 'Paused. Click Resume to continue.', 'info');
  }

  async function sendNextChunk() {
    if (paused || !blasting || !currentBlast) return;

    try {
      const res  = await apiFetch('/api/admin/voter-blast/send-chunk', 'POST', { blast_id: currentBlast.blast_id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      currentBlast.sent    = data.total_sent || 0;
      currentBlast.failed  = data.total_failed  !== undefined ? data.total_failed  : (currentBlast.failed  || 0) + (data.failed  || 0);
      currentBlast.skipped = data.total_skipped !== undefined ? data.total_skipped : (currentBlast.skipped || 0) + (data.skipped || 0);

      updateProgress();

      if (data.done) {
        blasting = false;
        $('vb-start-btn').disabled = true;
        $('vb-pause-btn').disabled = true;
        sessionStorage.removeItem('vb_blast_id');
        setStatus('vb-stage3-status', `Blast complete! Sent ${currentBlast.sent.toLocaleString()} messages.`, 'success');
        return;
      }

      setTimeout(sendNextChunk, INTER_CHUNK_MS);
    } catch (e) {
      blasting = false;
      $('vb-start-btn').disabled = false;
      $('vb-pause-btn').disabled = true;
      setStatus('vb-stage3-status', `Error: ${e.message} — click Resume to retry.`, 'error');
    }
  }

  function updateProgress() {
    if (!currentBlast) return;
    const total   = currentBlast.total_audience || 1;
    const sent    = currentBlast.sent    || 0;
    const failed  = currentBlast.failed  || 0;
    const skipped = currentBlast.skipped || 0;
    const pct     = Math.min(100, Math.round(((sent + failed + skipped) / total) * 100));

    const bar = $('vb-progress-bar');
    if (bar) bar.style.width = pct + '%';

    setText('vb-stat-sent',    sent.toLocaleString());
    setText('vb-stat-failed',  failed.toLocaleString());
    setText('vb-stat-skipped', skipped.toLocaleString());
    setText('vb-stat-pct',     pct + '%');

    const remaining = total - sent - failed - skipped;
    setText('vb-eta', remaining > 0 ? formatDuration(remaining) : '—');
  }

  // ── Jobs table ────────────────────────────────────────────────────────────
  function geoLabel(job) {
    if (job.district_type === 'house')  return `HD-${job.district}`;
    if (job.district_type === 'senate') return `SD-${job.district}`;
    if (job.county)                     return `County: ${titleCase(job.county)}`;
    if (job.city)                       return `City: ${titleCase(job.city)}`;
    return 'Statewide';
  }

  function renderJobsTable(jobs) {
    const wrap = $('vb-jobs-wrap');
    if (!wrap) return;
    if (!jobs.length) { wrap.innerHTML = '<p class="vb-help">No blasts yet.</p>'; return; }

    const table = document.createElement('table');
    table.className = 'vb-jobs-table';
    table.innerHTML = `<thead><tr>
      <th>Target</th><th>Party</th><th>Audience</th>
      <th>Sent</th><th>Failed</th><th>Status</th><th>Created</th><th></th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');

    jobs.forEach((job) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${geoLabel(job)}</td>
        <td>${job.party || 'All'}</td>
        <td>${Number(job.total_audience).toLocaleString()}</td>
        <td>${Number(job.sent_count).toLocaleString()}</td>
        <td>${(Number(job.failed_count) + Number(job.delivery_failed_count || 0)).toLocaleString()}</td>
        <td><span class="vb-status-pill ${job.status}">${job.status}</span></td>
        <td>${job.created_at?.slice(0, 10) || ''}</td>
        <td>${(job.status === 'paused' || job.status === 'running') ? `<button class="vb-resume-btn" data-id="${job.blast_id}">Resume</button>` : ''}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);

    wrap.querySelectorAll('.vb-resume-btn').forEach((btn) => {
      btn.addEventListener('click', () => resumeJob(btn.dataset.id));
    });
  }

  async function resumeJob(blastId) {
    const res  = await apiFetch('/api/admin/voter-blast/jobs', 'GET');
    const data = await res.json();
    const job  = (data.jobs || []).find((j) => j.blast_id === blastId);
    if (!job) { alert('Job not found.'); return; }

    currentBlast = {
      blast_id:       job.blast_id,
      total_audience: Number(job.total_audience),
      sent:           Number(job.sent_count),
      failed:         Number(job.failed_count) + Number(job.delivery_failed_count || 0),
      skipped:        Number(job.skipped_count),
    };
    sessionStorage.setItem('vb_blast_id', blastId);

    $('vb-blast-id-display').textContent    = job.blast_id;
    $('vb-blast-total-display').textContent = Number(job.total_audience).toLocaleString();
    $('vb-stage3').hidden = false;
    updateProgress();
    setStageActive(3, true);
    $('vb-stage3').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('vb-stage3-status', 'Resumed. Click Start to continue.', 'info');
  }

  function checkForResume() {
    const saved = sessionStorage.getItem('vb_blast_id');
    if (saved) {
      const notice = $('vb-resume-notice');
      if (notice) {
        notice.hidden = false;
        notice.querySelector('.vb-resume-id').textContent = saved;
        notice.querySelector('.vb-resume-load').addEventListener('click', () => {
          notice.hidden = true;
          resumeJob(saved);
        });
        notice.querySelector('.vb-resume-dismiss').addEventListener('click', () => {
          sessionStorage.removeItem('vb_blast_id');
          notice.hidden = true;
        });
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  async function apiFetch(path, method = 'GET', body = null, key = adminKey, email = actorEmail) {
    const url = new URL(path, window.location.origin);
    if (key)   url.searchParams.set('key', key);
    if (email) url.searchParams.set('actor_email', email);
    const headers = { 'content-type': 'application/json' };
    return fetch(url.toString(), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  function setStatus(id, msg, type) {
    const el = $(id);
    if (!el) return;
    if (!msg) { el.className = 'vb-status'; el.textContent = ''; return; }
    el.className = `vb-status show ${type}`;
    el.textContent = msg;
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function setNum(id, disabled, label) {
    const el = $(id);
    if (!el) return;
    el.disabled = disabled;
    if (label) el.textContent = label;
  }

  function setStageActive(n, active) {
    const num = document.querySelector(`#vb-stage${n} .vb-stage-num`);
    if (!num) return;
    num.classList.toggle('active', active);
    num.classList.toggle('done', !active);
  }

  function titleCase(str) {
    return String(str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDuration(seconds) {
    if (seconds < 60)   return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
})();
