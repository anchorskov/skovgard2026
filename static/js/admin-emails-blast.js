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
        loadDeliverability();
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
    // HD/SD/city are part of the audience definition too (see currentComposeFields
    // and audienceInfo below) -- changing any of them after a count was already
    // fetched must invalidate that count the same way changing the top-level
    // filter does, or createJob() could submit a district that no longer matches
    // what's on screen.
    $('eb-hd')?.addEventListener('change', invalidateAudienceCheck);
    $('eb-sd')?.addEventListener('change', invalidateAudienceCheck);
    $('eb-city')?.addEventListener('change', invalidateAudienceCheck);
    handleFilterChange();
  }

  // Clears a previously-fetched audience count and folds the wizard back to
  // Stage 1 whenever an audience-defining input changes underneath it. Without
  // this, changing the dropdown after clicking "Check Audience Count" leaves
  // Stage 2 showing (and createJob() would submit) the *previous* selection's
  // filter/city/hd/sd -- audienceInfo is only ever written inside
  // runAudienceCount(), so the DOM and in-memory state can silently diverge.
  // No-ops if a count hasn't been fetched yet, so the initial page-load call
  // and a first-time filter pick don't show a spurious "changed" message.
  function invalidateAudienceCheck() {
    if (!audienceInfo) return;
    audienceInfo = null;
    const card = $('eb-count-card');
    if (card) card.hidden = true;
    if ($('eb-stage2')) $('eb-stage2').hidden = true;
    if ($('eb-confirm-check')) $('eb-confirm-check').checked = false;
    setStageActive(1, true);
    setStageActive(2, false);
    setStatus('eb-stage1-status', 'Audience changed — check the audience count again before continuing.', 'info');
  }

  function handleFilterChange() {
    invalidateAudienceCheck();
    const filterValue = ($('eb-filter')?.value || '').trim();
    const isTestOnly = filterValue === 'test';
    const hasSelection = filterValue !== '';
    // "every_email" is the not-opt-in-gated audience (voter file ∪ local
    // subscriber list, opt-outs excluded) -- see fetchEveryEmailGeoUnion in
    // worker/src/index.js. It replaced the standalone "voter_file" dropdown
    // option, which is retired from the UI but still resumable server-side
    // for any blast job created before this change.
    const isEveryEmail = filterValue === 'every_email';
    // "Unlinked" (purged_voter) has no district data anywhere -- most of it
    // never matched a voter record to derive one from, and email_contacts
    // stores no district column by design (see EMAIL_CONTACTS_FILTERS /
    // countBlastAudienceTotal's geo guard in worker/src/index.js, which
    // returns 0 rather than silently pulling from an unrelated table if HD/SD
    // ever reach the server for this filter). Hiding HD/SD here is the
    // primary guard; the backend zeroing out that combination is the backstop.
    const isPurgedVoter = filterValue === 'purged_voter';

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

    // City is hidden for now (see docs/db/EmailConsolidationPlan.md discussion) --
    // #eb-city-field stays hidden and #eb-city stays empty; HD/SD alone still
    // narrow every audience except purged_voter, through the same data.
    const note = $('eb-voter-file-note');
    if (note) note.hidden = !isEveryEmail;
    const purgedVoterNote = $('eb-purged-voter-note');
    if (purgedVoterNote) purgedVoterNote.hidden = !isPurgedVoter;

    const hdField = $('eb-hd-field');
    const sdField = $('eb-sd-field');
    if (hdField) hdField.hidden = isPurgedVoter;
    if (sdField) sdField.hidden = isPurgedVoter;
    if (isPurgedVoter) {
      // Clear rather than just hide -- currentComposeFields() reads .value
      // directly, so a stale selection from before switching to this filter
      // would otherwise still ride along into the (blocked) geo query.
      if ($('eb-hd')) $('eb-hd').value = '';
      if ($('eb-sd')) $('eb-sd').value = '';
    }
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

    // Chunking exists for resumability on large audiences -- a small
    // audience gets zero benefit from a maxed-out chunk and instead just
    // means one long silent wait with no progress update until the whole
    // thing is done. Default to whichever is smaller so small jobs update
    // visibly more than once. Capped at 20 to match the server-side
    // MAX_SEND_CHUNK_SIZE (worker/src/index.js) -- going higher gets
    // silently clamped there anyway, so don't suggest a number that isn't
    // real.
    const chunkSizeInput = $('eb-chunk-size');
    if (chunkSizeInput) chunkSizeInput.value = Math.max(1, Math.min(20, total));
  }

  // ── Stage 2: Approve & Create ─────────────────────────────────────────────
  function bindStage2() {
    $('eb-create-job-btn')?.addEventListener('click', createJob);
  }

  async function createJob() {
    if (!audienceInfo) { setStatus('eb-stage2-status', 'Check the audience count first.', 'error'); return; }
    const confirmed = $('eb-confirm-check')?.checked;
    if (!confirmed) { setStatus('eb-stage2-status', 'Check the confirmation box first.', 'error'); return; }
    const chunkSize = Number($('eb-chunk-size')?.value || 20) || 20;

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
      refreshBlastLists();
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
    $('eb-start-btn').textContent = 'Working…';
    $('eb-pause-btn').disabled = false;
    // A chunk sends sequentially (one email every ~340ms, not parallel), so
    // it can take tens of seconds before the first response comes back and
    // the real percentage moves at all. Without this, clicking Start looks
    // like nothing happened. setPending() below shows a moving-stripes
    // animation on the bar for the duration of that wait.
    setPending(true);
    setStatus('eb-stage3-status', 'Sending first batch — this can take a while for a large chunk size…', 'warn');
    sendNextChunk();
  }

  function setPending(isPending) {
    const bar = $('eb-progress-bar');
    if (bar) bar.classList.toggle('pending', isPending);
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

    setPending(true);

    try {
      const res  = await apiFetch('/api/admin/emails/blast/send-chunk', 'POST', { blast_id: currentBlast.blast_id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setPending(false);
      currentBlast.sent    = data.total_sent    || 0;
      currentBlast.failed  = data.total_failed  || 0;
      currentBlast.skipped = data.total_skipped || 0;

      updateProgress();
      refreshBlastLists();

      // Auto-paused by the deliverability circuit breaker (worker/src/index.js
      // DELIVERABILITY_BOUNCE_PAUSE_RATE/DELIVERABILITY_COMPLAINT_PAUSE_RATE)
      // is NOT the same as a genuinely finished job -- don't show "complete,"
      // don't disable Start (it's resumable, same as a manual pause), and
      // don't clear the resume prompt, so a reload still surfaces it.
      if (data.autoPaused) {
        blasting = false;
        $('eb-start-btn').disabled = false;
        $('eb-start-btn').textContent = 'Resume';
        $('eb-pause-btn').disabled = true;
        const cb = data.circuitBreaker || {};
        const rate = cb.reason === 'complaint_rate' ? cb.complaintRate : cb.bounceRate;
        const label = cb.reason === 'complaint_rate' ? 'complaint' : 'bounce';
        setStatus(
          'eb-stage3-status',
          `Paused automatically — ${label} rate hit ${(rate * 100).toFixed(2)}%. `
            + `Sent ${currentBlast.sent.toLocaleString()} so far. Review before resuming.`,
          'error'
        );
        return;
      }

      if (data.done) {
        blasting = false;
        $('eb-start-btn').disabled = true;
        $('eb-start-btn').textContent = 'Complete';
        $('eb-pause-btn').disabled = true;
        sessionStorage.removeItem('eb_blast_id');
        setStatus('eb-stage3-status', `Blast complete! Sent ${currentBlast.sent.toLocaleString()} emails.`, 'success');
        return;
      }

      if (data.circuitBreaker?.warning) {
        const cb = data.circuitBreaker;
        setStatus(
          'eb-stage3-status',
          `Blast running — deliverability rate is elevated (bounce ${(cb.bounceRate * 100).toFixed(2)}%, `
            + `complaint ${(cb.complaintRate * 100).toFixed(2)}%). Watching closely.`,
          'warn'
        );
      } else {
        setStatus('eb-stage3-status', 'Blast running — do not close this tab.', 'warn');
      }

      setTimeout(sendNextChunk, INTER_CHUNK_MS);
    } catch (e) {
      setPending(false);
      blasting = false;
      $('eb-start-btn').disabled = false;
      $('eb-start-btn').textContent = 'Resume';
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

  // Both the Recent Blasts table and the Deliverability panel were previously
  // only ever loaded once, at connect time -- creating a job or watching one
  // send left them stale (a just-completed blast still showed "No blasts
  // yet"). Called after job creation and after every chunk response so both
  // panels track a running/just-finished blast instead of only reflecting
  // whatever existed on page load.
  async function refreshBlastLists() {
    try {
      const res  = await apiFetch('/api/admin/emails/blast/jobs', 'GET');
      const data = await res.json();
      if (res.ok) renderJobsTable(data.jobs || []);
    } catch (_) { /* keep whatever was already showing */ }
    loadDeliverability();
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

  // ── Deliverability ───────────────────────────────────────────────────────
  // Separate panel/table rather than folding into renderJobsTable above --
  // keeps the existing jobs table untouched and lets this degrade
  // independently (e.g. before resend_webhook_events has any data yet)
  // without breaking the table admins already rely on for Resume.
  async function loadDeliverability() {
    const wrap = $('eb-deliv-wrap');
    try {
      const res  = await apiFetch('/api/admin/emails/deliverability', 'GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderDeliverability(data);
    } catch (e) {
      if (wrap) wrap.innerHTML = `<p class="vb-help">Couldn't load deliverability stats: ${escapeHtml(e.message)}</p>`;
    }
  }

  function pct(rate) {
    return `${(rate * 100).toFixed(2)}%`;
  }

  // green/amber/red against the same warn/pause thresholds the send-chunk
  // circuit breaker itself uses (worker/src/index.js DELIVERABILITY_*), so
  // the color on screen always matches what would actually trip a pause.
  function rateColor(rate, warnRate, pauseRate) {
    if (rate >= pauseRate) return '#b91c1c';
    if (rate >= warnRate) return '#8a3d23';
    return '#166534';
  }

  function renderDeliverability(data) {
    const t = data.thresholds || {};
    const thresholdsLabel = $('eb-deliv-pause-thresholds');
    if (thresholdsLabel) {
      thresholdsLabel.textContent = `${pct(t.bouncePause || 0)} bounce or ${pct(t.complaintPause || 0)} complaint`;
    }

    const wrap = $('eb-deliv-wrap');
    if (!wrap) return;

    const windows = [
      ['24h', data.account?.window24h],
      ['7d',  data.account?.window7d],
      ['30d', data.account?.window30d],
    ];
    const summaryRow = windows.map(([label, w]) => {
      if (!w) return '';
      return `
        <div style="flex:1;min-width:140px;background:#fff;border:1px solid #e5ddd0;border-radius:8px;padding:12px 16px;">
          <div style="font-size:.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Last ${label} &middot; ${Number(w.sent).toLocaleString()} sent</div>
          <div style="font-size:.9rem;color:${rateColor(w.bounceRate, t.bounceWarn, t.bouncePause)};">Bounce: <strong>${pct(w.bounceRate)}</strong> (${w.bounced})</div>
          <div style="font-size:.9rem;color:${rateColor(w.complaintRate, t.complaintWarn, t.complaintPause)};">Complaint: <strong>${pct(w.complaintRate)}</strong> (${w.complained})</div>
        </div>
      `;
    }).join('');

    const jobs = data.jobs || [];
    const jobRows = jobs.length
      ? jobs.map((job) => `
        <tr>
          <td>${escapeHtml(job.subject || '')}</td>
          <td>${escapeHtml(job.filter || '')}</td>
          <td>${Number(job.sent).toLocaleString()}</td>
          <td style="color:${job.belowMinSample ? '#9ca3af' : rateColor(job.bounceRate, t.bounceWarn, t.bouncePause)};">
            ${job.belowMinSample ? '—' : pct(job.bounceRate)}
          </td>
          <td style="color:${job.belowMinSample ? '#9ca3af' : rateColor(job.complaintRate, t.complaintWarn, t.complaintPause)};">
            ${job.belowMinSample ? '—' : pct(job.complaintRate)}
          </td>
          <td><span class="vb-status-pill ${job.status}">${job.status}</span></td>
        </tr>
      `).join('')
      : '<tr><td colspan="6" class="vb-help">No blasts yet.</td></tr>';

    wrap.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">${summaryRow}</div>
      <table class="vb-jobs-table">
        <thead><tr>
          <th>Subject</th><th>Filter</th><th>Sent</th><th>Bounce</th><th>Complaint</th><th>Status</th>
        </tr></thead>
        <tbody>${jobRows}</tbody>
      </table>
      <p class="vb-help" style="margin:8px 0 0;">
        Rates below ${Number(t.minSample || 0).toLocaleString()} sends show as &mdash; (too small a sample to be meaningful).
      </p>
    `;
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
