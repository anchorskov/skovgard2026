// static/js/admin-emails-blast.js
(function () {
  'use strict';

  // Server paces sends at ~340ms/email; poll a bit slower than the largest
  // possible chunk (250 * 340ms ≈ 85s) so we never overlap in-flight chunks.
  const INTER_CHUNK_MS = 1500;

  const SHARE_MESSAGE_OPTIONS = [
    { slug: "fleecing-letters",                   title: "The Fleecing Letters" },
    { slug: "postage-bandit",                      title: "Postage Bandit" },
    { slug: "citizens-defend-the-constitution",    title: "Citizens Defend the Constitution" },
    { slug: "jimmys-story",                        title: "Jimmy's Story" },
    { slug: "freedom-vs-control",                  title: "Freedom vs. Control" },
    { slug: "wyoming-voters-choose",               title: "Wyoming Voters Should Choose" },
    { slug: "representatives-work-for",            title: "Who Do Our Representatives Work For?" },
    { slug: "wy-voter-access",                     title: "Wyoming Voter Access Survey" },
    { slug: "wy-primary-election-participation",   title: "Wyoming Primary Election Participation Survey" },
    { slug: "wy-citizen-ballot",                   title: "Citizens Nonpartisan Ballot" },
    { slug: "untrammeled-suffrage",                title: "Untrammeled Suffrage" },
    { slug: "wy-data-centers",                     title: "Wyoming Data Centers Survey" },
    { slug: "wy-four-pillars",                     title: "Wyoming Four Pillars Survey" },
    { slug: "wy-roadless-areas",                   title: "Wyoming Roadless Areas Survey" },
    { slug: "nothing-burger",                      title: "Taxpayer-Funded Nothing Burger" },
    { slug: "changing-health-care",                title: "Changing Health Care" },
    { slug: "candidate-hub",                       title: "Wyoming Candidate Hub" },
    { slug: "primary-candidates",                  title: "One Place to See Every Wyoming Candidate" },
  ];

  // ── State ────────────────────────────────────────────────────────────────
  let adminKey     = '';
  let actorEmail   = '';
  let audienceInfo = null; // { filter, city, hd, sd, sinceHours, total }
  let currentBlast = null; // { blast_id, total_audience, sent, failed, skipped }
  let blasting     = false;
  let paused       = false;
  let shareSlugOptionsPopulated = false;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    bindAuth();
    bindStage1();
    bindStage2();
    bindStage3();
    checkForResume();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  function bindAuth() {
    const connectBtn = $('eb-connect');
    const clearBtn   = $('eb-clear');
    if (!connectBtn) return;

    connectBtn.addEventListener('click', async () => {
      const key   = ($('eb-admin-key')   ?.value || '').trim();
      const email = ($('eb-actor-email') ?.value || '').trim();
      if (!key) { setStatus('eb-auth-status', 'Admin key required.', 'error'); return; }

      setStatus('eb-auth-status', 'Connecting…', 'info');
      try {
        const res  = await apiFetch('/api/admin/emails/blast/jobs', 'GET', null, key, email);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        adminKey   = key;
        actorEmail = email;
        $('eb-auth-form').hidden   = true;
        $('admin-eb-shell').hidden = false;
        setStatus('eb-auth-status', '', '');
        renderJobsTable(data.jobs || []);
      } catch (e) {
        setStatus('eb-auth-status', e.message, 'error');
      }
    });

    clearBtn?.addEventListener('click', () => {
      adminKey = ''; actorEmail = '';
      $('eb-admin-key').value   = '';
      $('eb-actor-email').value = '';
      $('eb-auth-form').hidden   = false;
      $('admin-eb-shell').hidden = true;
    });
  }

  // ── Stage 1: Audience & compose ──────────────────────────────────────────
  function bindStage1() {
    $('eb-mode')?.addEventListener('change', handleModeChange);
    $('eb-share-slug')?.addEventListener('change', () => {});
    $('eb-count-btn')?.addEventListener('click', runAudienceCount);
    $('eb-send-test-btn')?.addEventListener('click', runSendTest);
    $('eb-filter')?.addEventListener('change', handleFilterChange);
    handleFilterChange();
  }

  function handleFilterChange() {
    const filterValue = ($('eb-filter')?.value || '').trim();
    const isTestOnly = filterValue === 'test';
    const hasSelection = filterValue !== '';
    const isVoterFile = filterValue === 'voter_file';

    // Compose fields (message, subject, test-send) stay hidden until
    // something is chosen -- the blank placeholder option means nothing is
    // pre-selected on page load, unlike a real filter default. "Send a test
    // email only" reveals the same compose fields (a test send still needs a
    // subject/body) but hides the audience-count/job-creation controls,
    // since a test send doesn't touch an audience at all.
    const composeSection = $('eb-compose-section');
    if (composeSection) composeSection.hidden = !hasSelection;
    const audienceCountSection = $('eb-audience-count-section');
    if (audienceCountSection) audienceCountSection.hidden = isTestOnly;
    const testSendSection = $('eb-test-send-section');
    if (testSendSection) testSendSection.hidden = !isTestOnly;

    const cityLabel = $('eb-city-label');
    const cityInput = $('eb-city');
    const note = $('eb-voter-file-note');
    if (note) note.hidden = !isVoterFile;
    if (cityLabel) {
      cityLabel.innerHTML = isVoterFile
        ? 'County <span style="font-weight:400;color:#9ca3af">(optional)</span>'
        : 'City <span style="font-weight:400;color:#9ca3af">(optional)</span>';
    }
    if (cityInput) cityInput.placeholder = isVoterFile ? 'e.g. Natrona' : 'e.g. Casper';
  }

  async function runSendTest() {
    const to = ($('eb-test-to')?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
      setStatus('eb-test-status', 'Enter a valid test email address.', 'error');
      return;
    }
    const f = currentComposeFields();
    if (!f.subject) { setStatus('eb-test-status', 'Subject line is required.', 'error'); return; }
    if (f.email_mode === 'custom' && !f.body) {
      setStatus('eb-test-status', 'Email body is required.', 'error'); return;
    }
    if (f.email_mode !== 'custom' && !f.share_slug) {
      setStatus('eb-test-status', 'Select a share message.', 'error'); return;
    }

    const btn = $('eb-send-test-btn');
    if (btn) btn.disabled = true;
    setStatus('eb-test-status', 'Sending test…', 'info');
    try {
      const res = await apiFetch('/api/admin/emails/send-test', 'POST', {
        to,
        subject: f.subject,
        body: f.body,
        email_mode: f.email_mode,
        share_slug: f.share_slug,
        share_intro_text: f.share_intro_text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus('eb-test-status', `Test sent to ${data.to}.`, 'success');
    } catch (e) {
      setStatus('eb-test-status', e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function handleModeChange() {
    const mode = ($('eb-mode')?.value || 'custom');
    const isShare = mode === 'share' || mode === 'share_with_intro';
    const isShareWithIntro = mode === 'share_with_intro';

    if ($('eb-share-picker-field')) $('eb-share-picker-field').hidden = !isShare;
    if ($('eb-share-intro-field'))  $('eb-share-intro-field').hidden  = !isShareWithIntro;
    if ($('eb-body-field'))         $('eb-body-field').hidden         = isShare;

    if (isShare) populateShareSlugOptions();
  }

  function populateShareSlugOptions() {
    const sel = $('eb-share-slug');
    if (shareSlugOptionsPopulated || !sel) return;
    shareSlugOptionsPopulated = true;
    const fragment = document.createDocumentFragment();
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— Select a message —';
    fragment.appendChild(blank);
    SHARE_MESSAGE_OPTIONS.forEach(({ slug, title }) => {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = title;
      fragment.appendChild(opt);
    });
    sel.innerHTML = '';
    sel.appendChild(fragment);
  }

  function currentComposeFields() {
    const mode = ($('eb-mode')?.value || 'custom');
    return {
      filter:      ($('eb-filter')?.value || '').trim(),
      city:        ($('eb-city')?.value || '').trim(),
      hd:          ($('eb-hd')?.value   || '').trim(),
      sd:          ($('eb-sd')?.value   || '').trim(),
      subject:     ($('eb-subject')?.value || '').trim(),
      email_mode:  mode,
      share_slug:  ($('eb-share-slug')?.value || '').trim(),
      share_intro_text: ($('eb-share-intro')?.value || '').trim(),
      body:        ($('eb-body')?.value || '').trim(),
    };
  }

  async function runAudienceCount() {
    const f = currentComposeFields();
    if (!f.filter || f.filter === 'test') { setStatus('eb-stage1-status', 'Select a real audience first.', 'error'); return; }
    if (!f.subject) { setStatus('eb-stage1-status', 'Subject line is required.', 'error'); return; }
    if (f.email_mode === 'custom' && !f.body) {
      setStatus('eb-stage1-status', 'Email body is required.', 'error'); return;
    }
    if (f.email_mode !== 'custom' && !f.share_slug) {
      setStatus('eb-stage1-status', 'Select a share message.', 'error'); return;
    }

    setStatus('eb-stage1-status', 'Checking audience…', 'info');
    setNum('eb-count-btn', true, 'Checking…');

    try {
      const params = new URLSearchParams({ filter: f.filter });
      if (f.city) params.set('city', f.city);
      if (f.hd)   params.set('hd', f.hd);
      if (f.sd)   params.set('sd', f.sd);

      const res  = await apiFetch('/api/admin/emails/blast/audience-count?' + params.toString(), 'GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      audienceInfo = { ...f, total: data.total };
      renderCountCard(data.total);
      setStatus('eb-stage1-status', '', '');
      $('eb-stage2').hidden = false;
      $('eb-stage2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStageActive(1, false);
      setStageActive(2, true);
    } catch (e) {
      setStatus('eb-stage1-status', e.message, 'error');
    } finally {
      setNum('eb-count-btn', false, 'Check Audience Count');
    }
  }

  function renderCountCard(total) {
    const card = $('eb-count-card');
    if (!card) return;
    card.hidden = false;
    const statEl = card.querySelector('.vb-preview-stat');
    const subEl  = card.querySelector('.vb-preview-sub');
    const estMinutes = Math.ceil((total * 0.34) / 60);
    if (statEl) statEl.textContent = total.toLocaleString();
    if (subEl)  subEl.textContent  = `Estimated send time at ~3/sec: ~${estMinutes} min`;
  }

  // ── Stage 2: Approve & Create ─────────────────────────────────────────────
  function bindStage2() {
    $('eb-create-job-btn')?.addEventListener('click', createJob);
  }

  async function createJob() {
    if (!audienceInfo) { setStatus('eb-stage2-status', 'Check the audience count first.', 'error'); return; }
    const confirmed = $('eb-confirm-check')?.checked;
    if (!confirmed) { setStatus('eb-stage2-status', 'Check the confirmation box first.', 'error'); return; }
    const chunkSize = Number($('eb-chunk-size')?.value || 200) || 200;

    setStatus('eb-stage2-status', 'Creating blast job…', 'info');
    setNum('eb-create-job-btn', true, 'Creating…');

    try {
      const res  = await apiFetch('/api/admin/emails/blast/job', 'POST', {
        filter: audienceInfo.filter,
        city: audienceInfo.city, hd: audienceInfo.hd, sd: audienceInfo.sd,
        subject: audienceInfo.subject,
        email_mode: audienceInfo.email_mode,
        share_slug: audienceInfo.share_slug,
        share_intro_text: audienceInfo.share_intro_text,
        body: audienceInfo.body,
        chunk_size: chunkSize,
        confirmed: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      currentBlast = { blast_id: data.blast_id, total_audience: data.total_audience, sent: 0, failed: 0, skipped: 0 };
      sessionStorage.setItem('eb_blast_id', data.blast_id);

      $('eb-blast-id-display').textContent    = data.blast_id;
      $('eb-blast-total-display').textContent = data.total_audience.toLocaleString();
      setStatus('eb-stage2-status', '', '');
      $('eb-stage3').hidden = false;
      $('eb-stage3').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStageActive(2, false);
      setStageActive(3, true);
      updateProgress();
    } catch (e) {
      setStatus('eb-stage2-status', e.message, 'error');
    } finally {
      setNum('eb-create-job-btn', false, 'Create Blast Job');
    }
  }

  // ── Stage 3: Send ─────────────────────────────────────────────────────────
  function bindStage3() {
    $('eb-start-btn')?.addEventListener('click', startBlast);
    $('eb-pause-btn')?.addEventListener('click', pauseBlast);
  }

  function startBlast() {
    if (!currentBlast) return;
    paused   = false;
    blasting = true;
    $('eb-start-btn').disabled = true;
    $('eb-pause-btn').disabled = false;
    setStatus('eb-stage3-status', 'Blast running — do not close this tab.', 'warn');
    sendNextChunk();
  }

  function pauseBlast() {
    paused   = true;
    blasting = false;
    $('eb-start-btn').disabled = false;
    $('eb-start-btn').textContent = 'Resume';
    $('eb-pause-btn').disabled = true;
    setStatus('eb-stage3-status', 'Paused. Click Resume to continue.', 'info');
    apiFetch('/api/admin/emails/blast/pause', 'PATCH', { blast_id: currentBlast.blast_id }).catch(() => {});
  }

  async function sendNextChunk() {
    if (paused || !blasting || !currentBlast) return;

    try {
      const res  = await apiFetch('/api/admin/emails/blast/send-chunk', 'POST', { blast_id: currentBlast.blast_id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      currentBlast.sent    = data.total_sent    || 0;
      currentBlast.failed  = data.total_failed  || 0;
      currentBlast.skipped = data.total_skipped || 0;

      updateProgress();

      if (data.done) {
        blasting = false;
        $('eb-start-btn').disabled = true;
        $('eb-pause-btn').disabled = true;
        sessionStorage.removeItem('eb_blast_id');
        setStatus('eb-stage3-status', `Blast complete! Sent ${currentBlast.sent.toLocaleString()} emails.`, 'success');
        return;
      }

      setTimeout(sendNextChunk, INTER_CHUNK_MS);
    } catch (e) {
      blasting = false;
      $('eb-start-btn').disabled = false;
      $('eb-pause-btn').disabled = true;
      setStatus('eb-stage3-status', `Error: ${e.message} — click Resume to retry.`, 'error');
    }
  }

  function updateProgress() {
    if (!currentBlast) return;
    const total   = currentBlast.total_audience || 1;
    const sent    = currentBlast.sent    || 0;
    const failed  = currentBlast.failed  || 0;
    const skipped = currentBlast.skipped || 0;
    const pct     = Math.min(100, Math.round(((sent + failed + skipped) / total) * 100));

    const bar = $('eb-progress-bar');
    if (bar) bar.style.width = pct + '%';

    setText('eb-stat-sent',    sent.toLocaleString());
    setText('eb-stat-failed',  failed.toLocaleString());
    setText('eb-stat-skipped', skipped.toLocaleString());
    setText('eb-stat-pct',     pct + '%');
  }

  // ── Jobs table ────────────────────────────────────────────────────────────
  function renderJobsTable(jobs) {
    const wrap = $('eb-jobs-wrap');
    if (!wrap) return;
    if (!jobs.length) { wrap.innerHTML = '<p class="vb-help">No blasts yet.</p>'; return; }

    const table = document.createElement('table');
    table.className = 'vb-jobs-table';
    table.innerHTML = `<thead><tr>
      <th>Subject</th><th>Filter</th><th>Audience</th>
      <th>Sent</th><th>Failed</th><th>Status</th><th>Created</th><th></th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');

    jobs.forEach((job) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(job.subject || '')}</td>
        <td>${escapeHtml(job.filter || '')}</td>
        <td>${Number(job.total_audience).toLocaleString()}</td>
        <td>${Number(job.sent_count).toLocaleString()}</td>
        <td>${Number(job.failed_count).toLocaleString()}</td>
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
    const res  = await apiFetch('/api/admin/emails/blast/jobs', 'GET');
    const data = await res.json();
    const job  = (data.jobs || []).find((j) => j.blast_id === blastId);
    if (!job) { alert('Job not found.'); return; }

    currentBlast = {
      blast_id:       job.blast_id,
      total_audience: Number(job.total_audience),
      sent:           Number(job.sent_count),
      failed:         Number(job.failed_count),
      skipped:        Number(job.skipped_count),
    };
    sessionStorage.setItem('eb_blast_id', blastId);

    $('eb-blast-id-display').textContent    = job.blast_id;
    $('eb-blast-total-display').textContent = Number(job.total_audience).toLocaleString();
    $('eb-stage3').hidden = false;
    updateProgress();
    setStageActive(3, true);
    $('eb-stage3').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('eb-stage3-status', 'Resumed. Click Start to continue.', 'info');
  }

  function checkForResume() {
    const saved = sessionStorage.getItem('eb_blast_id');
    if (saved) {
      const notice = $('eb-resume-notice');
      if (notice) {
        notice.hidden = false;
        notice.querySelector('.eb-resume-id').textContent = saved;
        notice.querySelector('.eb-resume-load').addEventListener('click', () => {
          notice.hidden = true;
          resumeJob(saved);
        });
        notice.querySelector('.eb-resume-dismiss').addEventListener('click', () => {
          sessionStorage.removeItem('eb_blast_id');
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
    const num = document.querySelector(`#eb-stage${n} .vb-stage-num`);
    if (!num) return;
    num.classList.toggle('active', active);
    num.classList.toggle('done', !active);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
