<!-- docs/pulse_flow.md -->
# Pulse Opt-In Flow

`/pulse` is the campaign's SMS+email opt-in form and the front door to the
Citizen Poll (candidate-choice poll). This doc describes the flow as it
exists today, end to end, including voter matching, the staff review queue,
and the poll-link mint/send path.

Last updated: 2026-07-20.

## 1. Entry points

- Page: `src/pages/pulse/index.astro`, `src/pages/pulse/signup/index.astro`
- Form component: `src/components/PulseOptInForm.astro` (two-step UI)
- Form JS: `static/js/pulse-optin.js` (bump the `?v=N` query string on every
  edit — Cloudflare Pages caches this asset for 4 hours)
- Submit target: `POST /api/optin` (`worker/src/index.js`)

### Two-step form

1. **Step 1 — Contact & consent**: first/last name, mobile (required, with
   its own required SMS-consent checkbox), email (required if continuing to
   the poll, optional for "updates only"), email consent checkbox.
   - "Continue to Citizen Poll" → step 2 (requires email + email consent)
   - "Join updates without voting" → submits immediately, skips step 2. A
     small non-blocking note under the button nudges toward the poll step
     ("adding your city and ZIP helps us confirm your voter registration")
     without making city/zip required here — this path is intentionally
     low-friction.
2. **Step 2 — Citizen Poll verification**: city (required), zip (required),
   street address (optional). These are what `findUniqueWyTargetMatch`
   uses to resolve a Wyoming voter record.

City/zip became mandatory on the poll path specifically because the old
optional `<details>` voter-verification section let people request a poll
link without submitting enough to ever match one — see §7.

### Client-side data-quality checks (soft, non-blocking)

Wyoming is one of the few states with a single area code (307) for the
entire state, and its ZIP codes fall in a contiguous range (82001–83128).
Neither fact is proof of a typo — real WY voters keep out-of-state cell
numbers and list different mailing ZIPs all the time — so `pulse-optin.js`
never blocks on them. Instead:

- A phone number not starting with `307` shows an inline warning next to
  the field and requires one extra click to proceed (the flag resets if the
  field is edited again).
- A ZIP outside 82001–83128 gets the same treatment on step 2.

These are pure UX nudges to catch a fat-finger (e.g. `304` instead of `307`)
before it ever reaches voter matching — they carry no server-side
enforcement. The server independently recomputes both signals (never trusts
the client) and stores them on any resulting review-queue row — see §4a.

## 2. Data model

Canonical table: `consent_status` (`ballot_sources` D1, `DB` binding),
keyed by `phone_e164`. Written by `upsertConsentStatus` (`worker/src/telnyx.js`)
on every submission, `overwriteProfile: true` from `/pulse` (whatever's
posted overwrites the stored profile — see `docs/test_data.md` for what
this means for a reused test identity).

Relevant columns: `status`, `consent_email`, `first_name`, `last_name`,
`email`, `address1`, `address2`, `city`, `state`, `zip`,
`state_house_district`, `state_senate_district`, `poll_link_sent_at`,
`voter_id`.

**`consent_status.voter_id`** (added `worker/migrations/034_consent_status_voter_id.sql`)
is the durable local record of a resolved WY voter match. It's written by
`POST /api/optin` on a fresh match and by both pulse-voter-review admin
actions (§5), always as `COALESCE(voter_id, new_value)` — **not** gated on
`overwriteProfile` the way most other columns are, since a confirmed match
is a fact that shouldn't be erasable by a later, less-informative
resubmission.

**`overwriteProfile` no longer applies to `address1`/`address2`/`city`/
`state`/`zip`/`country`** (fixed in `upsertConsentStatus`). These fields are
only ever collected on step 2; before this fix, a "join updates without
voting" resubmission (step 1 only, `overwriteProfile: true`, these fields
blank) would blast away a previously-stored address instead of leaving it
alone, because the write used the raw submitted value even when blank. The
fix always prefers the new value when one was actually submitted and falls
back to the existing stored value otherwise, independent of
`overwriteProfile`. `overwriteProfile` still governs `first_name`,
`last_name`, `email`, `consent_email`, `wy_voter`, `county`, `user_agent`,
`ip_hash` as before.

## 3. District resolution runs for *everyone*, matched or not

`upsertConsentStatus` calls `lookupWyLegislativeDistricts` (`worker/src/address-districts.js`)
for every submission, regardless of whether a voter match ever happens:

1. Exact match against `wy_address_district_lookup` (address+zip, then
   address+city)
2. **US Census geocoder fallback** (`lookupViaCensusFallback` → Census
   address/coordinates API)
3. `wy_district_coverage` fallback, only when a city maps to exactly one
   district pair

This is the same cascade `Candidates/src/pages/api/ballot-lookup.js` uses
for the voter guide's ballot lookup (down to sharing `normalizeZip5`/
`canonicalizeCityForLookup`-style helpers) — it does not require a voter
match, works off the raw address alone, and already runs today. So
`consent_status.state_house_district`/`state_senate_district` is populated
reasonably well for unmatched submitters too. This is not the gap.

## 4. Voter matching → poll link mint → delivery

### 4a. Matching (`findUniqueWyTargetMatch`, `worker/src/index.js`)

Only attempted when `city` was submitted (i.e. the poll-verification step
was used) — the "join updates without voting" path never calls this at
all, by design: matching/poll behavior should only run for someone who
actually asked for the Citizen Poll.

Cascading tiers, tried in order, first unique hit wins:

0. **Submitted phone already uniquely linked to a WY voter**
   (`voter_phones`/`v_best_phone`) — may include numbers from other
   sources (e.g. a vendor cell-append), not just this repo's own writes.
1. **Submitted email already uniquely linked to a WY voter**
   (`voter_emails.email_norm`). This table isn't otherwise read by this
   Worker (see `docs/db/README.md`/`docs/email_guide.md`) — this is the
   first place it is.
2. name + city + zip + address1
3. name + city + zip
4. name + zip only (city dropped — mailing city often differs from the
   voter file's registered city; added 2026-07-13, see commit `19d2891`)
5. **name + city only, zip missing** — added alongside the phone/email
   tiers. Unlike every tier above, this one is *never* auto-accepted even
   when the name+city pair is unique: too many people can share a name
   within one city for a ZIP-less match to stand as verification on its
   own. It always lands in the review queue for staff confirmation.
6. **name + city only, zip present but wrong** (added 2026-07-19, mode
   `ambiguous_name_city_zip_conflict`) — final fallback when every
   zip-anchored tier above (2–4) came back with zero hits. A submitted ZIP
   that's wrong-but-plausible (a different real ZIP in the same city —
   Casper alone spans several) previously killed every tier despite
   name+city being a clean match, landing on a bare `no_match` with zero
   candidates for staff to work from (the "Keith Goodenough" case: real
   voter, city matched exactly, wrong-but-real ZIP submitted). Same
   never-auto-accept rule as tier 5 — this only ever adds a real candidate
   to the review queue, never silently accepts one. Distinct `match_mode`
   from tier 5's `ambiguous_name_city` since "no ZIP given" and "ZIP given
   but wrong" are different situations worth flagging differently to the
   reviewer.

Zero hits with no further tier to try → `no_match`. More than one hit at
any tier → `ambiguous_*`. All of these, plus two previously-silent failure
modes, land in `pulse_voter_match_review` for manual staff resolution
(`/admin/pulse-voter-review/index.html`):

- **`missing_lookup_fields`** — city was submitted (so matching was
  attempted at all) but first/last name or both city and zip were empty.
  Previously dropped with no trace; only reachable today via a malformed
  or direct API submission, since the browser form requires city+zip
  together before allowing a step-2 submit.
- **`phone_belongs_to_other_voter`** — the name/city/zip (or phone/email)
  match was clean and unique, but the submitted phone is already linked in
  `WY_DB` to a *different* voter (shared household number, hand-me-down
  cell, wrong number on file). Previously this correct match was thrown
  away with only a `console.log` — worse than a genuine ambiguous case,
  since it discarded a right answer instead of an uncertain one. The
  matched voter is stored as the row's sole candidate, so staff just
  confirms it.

The only skip reasons that do **not** create a review row are genuine
local/infra gaps with nothing to review: `missing_wy_tables` (e.g. local
dev with no `WY_DB` voter-file data seeded) and `invalid_phone`.

Every candidate list is capped at 25 rows (`WY_MATCH_CANDIDATE_LIMIT`), up
from the previous cap of 2 — a real ambiguity in a low-population voter
file was being understated (a 5-way name/zip collision only ever showed 2
candidates to reviewing staff).

Review rows also carry `phone_area_flag`/`zip_range_flag`
(`worker/migrations/035_pulse_voter_match_review_flags.sql`), recomputed
server-side (see §1) — context for staff, not a matching input.

### 4b. Poll link mint (`mintPollInviteLinksForChunk`, `worker/src/index.js`)

Server-to-server call to grassmvt_survey's `POST /api/poll/admin/mint-invite-token`,
authenticated via `POLL_MINT_SERVICE_KEY`. **Hard-requires `voter_id` and
`email_norm`** — 400 without both. This is the actual, sole hard blocker for
unmatched voters (see §7 — district/precinct resolution itself is *not*
the blocker, it's already generic).

The mint is **not idempotent in the token sense**: `ON CONFLICT(poll_slug, voter_id)
DO UPDATE` replaces `token_hash` on every call, invalidating whatever token
was previously issued to that voter. Re-minting without re-delivering
silently breaks an already-sent link — this is why delivery is gated (§4c),
and why the admin mint-and-send action (§5) mints and delivers in the same
call rather than as two separate steps.

### 4c. Delivery (fixed 2026-07-15, commit `369fe5d`)

Two independent channels, each with its own "have I ever sent *this
contact* a poll link" gate — **not** the same gate as the general
welcome/confirmation sends, which only fire once per contact for reasons
unrelated to the poll:

- `sendPollLinkText` (`telnyx.js`) — independent of `contacts.welcome_sent_at`
- `sendPollLinkEmail` (`pulse-email.js`) — independent of the confirmation
  email's `wasOptedIn`/`hadEmailConsent` gate

Both are skipped on a given submission if the general welcome text /
confirmation email already covered this specific delivery (avoids sending
the link twice to a first-time subscriber). `consent_status.poll_link_sent_at`
is set only after a real send succeeds — a failed send still retries next
submission. If a poll link was already delivered once, `/api/optin` does
**not** re-mint (see §4b) — `verification.status` comes back `already_sent`.

## 5. Admin review queue (`pulse_voter_match_review`)

`/admin/pulse-voter-review/index.html` (JS: `static/js/admin-pulse-voter-review.js`,
CSS: `static/css/admin-pulse-voter-review.css`) lists unresolved rows
(`GET /api/admin/pulse-voter-review?unresolved=1`) with the submitted name/
address, `match_mode` (see §4a for the full list of modes), any candidates,
and the `phone_area_flag`/`zip_range_flag` badges.

**`candidate_voter_ids` carries full candidate detail, not just IDs**
(fixed 2026-07-19). It previously stored bare `voter_id` numbers only
(`summarizeMatchCandidates` in `worker/src/index.js` used to be an inline
`.map(row => row?.voter_id)`), which left the dropdown showing staff
anonymous numbers with nothing to compare against the submitted address —
found while investigating why a real, correct candidate for "Keith
Goodenough" wasn't visibly useful even when present. Now stores
`{voter_id, first_name, last_name, city, zip, addr1}` per candidate, and
the dropdown renders `8543 -- 333 S SOCONY PL, CASPER 82609` next to the
"Submitted: ..." line already shown above it. Rows written before this fix
still have the old bare-string shape — `candidateOptionHtml` in
`static/js/admin-pulse-voter-review.js` handles both.

**Resolve** (`POST /api/admin/pulse-voter-review/resolve`, body
`{id, voter_id}` or `{id, dismiss:true}`): records `resolved_voter_id` on
the review row and, for a real (non-dismiss) resolution, writes
`consent_status.voter_id` via the same `COALESCE` semantics as the
auto-match path. If the confirmed voter's phone shows a delivered welcome
SMS in `texting_audit_log`, it's promoted into `voter_phones`/`v_best_phone`
(§6). **This step never sends anything** — it's record-only.

**Mint & send poll link** (`POST /api/admin/pulse-voter-review/mint-and-send`,
body `{id}`) — added alongside the review-queue expansion above, this
closes the gap where a resolved review row (e.g. Mollie Hand's case: one
unique statewide voter, but missing city/zip meant the auto path never ran)
had no path to ever receive a ballot without a completely separate manual
process. Requires the row to already be resolved to a real `voter_id`, and
re-checks — at send time, not from the original submission — that the
contact currently has `status = 'opted_in'` and `consent_email = 1` with a
current email on file, and that no poll link has been sent already. Mints
and delivers (SMS + email, same pattern as §4c) in a single call, since a
mint that isn't immediately followed by delivery would silently invalidate
any link already in the person's inbox/texts (§4b).

The admin UI keeps a resolved row visible (rather than immediately removing
it, since `?unresolved=1` would otherwise hide it) with a single
"Mint & send poll link" button, and removes it only once that call
succeeds.

**Re-check match** (`POST /api/admin/pulse-voter-review/recheck`, added
2026-07-20, body `{id}`): `pulse_voter_match_review` rows are write-once
snapshots of what the cascade found *at submission time* -- nothing ever
re-runs the match against an existing row, so a row written before a
matching-logic fix (or before a `wy` DB data update) stays stuck showing
its stale result forever. Found via the "Keith Goodenough" case (§4a tier
6): his review row still showed zero candidates well after the fix that
would now find him had shipped, because the row itself was never
re-evaluated. Recheck re-runs `findUniqueWyTargetMatch` against the row's
already-stored `submitted_*` fields and refreshes `match_mode`/
`candidate_voter_ids` in place. Record-only, same as Resolve -- never
writes to `consent_status`, never auto-resolves the row even on a single
clean match; staff still confirm via the existing Resolve action.

**Manual voter search** (`GET /api/admin/pulse-voter-review/search-voters?q=...`,
added 2026-07-20): a free-text fallback independent of the automated
cascade, for the cases no tier will ever catch (a genuine first-name typo,
a maiden-name mismatch). Every whitespace-separated token in `q` (max 6)
must appear somewhere across `first_name`/`last_name`/`city`/`addr1`/
`addr_raw` in `v_voter_targeting`. Deliberately **not** fuzzy/typo-tolerant
matching folded into the cascade itself -- that risks false positives on a
voter-registration match; this keeps a human doing the fuzzy matching
instead, with real search results to confirm against. Wired into
`/admin/pulse-voter-review/index.html` as a per-row "Search voter file"
panel; picking a result fills the row's resolve control so staff still
click Resolve themselves.

**Confidence badge** (client-side only, `static/js/admin-pulse-voter-review.js`):
translates the raw `match_mode` into High/Medium/Low for staff scanning the
queue -- no new data, just a display aid over what's already stored.
High is reserved for a single clean candidate (`phone_belongs_to_other_voter`,
or any of the auto-accept-tier modes surfaced via Re-check); anything
genuinely ambiguous (`ambiguous_*`) is Medium or Low depending on how weak
the underlying signal was (zip-anchored vs. name+city-only).

## 5a. Call-tracking on the review queue (`worker/migrations/036`, added 2026-07-19)

`pulse_voter_match_review` rows in §5 are people who *did* submit `/pulse`
for real (they already have SMS/email consent on file) but couldn't be
cleanly matched to a WY voter record. `call_status`/`call_attempts`/
`call_notes`/`called_at`/`called_by` let staff log a phone call made to
verbally confirm the address that resolves the match, via
`POST /api/admin/pulse-voter-review/log-call` (body `{id, call_status,
call_notes}`) — surfaced as a "Call to verify" control on each unresolved
row in `/admin/pulse-voter-review/index.html`. This is bookkeeping only:
confirming a voter_id over the phone still goes through the existing
`/resolve` action (§5) exactly as if staff had confirmed it any other way.
`call_status` is a fixed engineering enum (`not_called`, `left_voicemail`,
`reached_confirmed`, `reached_declined`, `bad_number`, `do_not_call`) — not
a staff-editable list, matching the `match_mode`/`consent_status.status`
precedent.

**Notification** (added 2026-07-19, `docs/who_needs_to_know.md`): every new
unresolved row (from either insert site — auto-match in `/api/optin` or the
admin verbal-completion path in §5b) fires a distinct
`sendPulseReviewNeededEmail` (`worker/src/pulse-email.js`) to
`PULSE_STAFF_NOTIFY_TO`, subject `Pulse review needed: <name>` — separate
from the generic per-opt-in notice so it can't get lost in routine signup
volume. A daily digest (`runPulseFollowUpDigest`, `"0 14 * * *"` cron) also
summarizes the open/unresolved count. Both admin pages render an
"Open >48h" badge on stale rows.

## 5b. Abandoned-signup follow-up (`pulse_abandoned_signups`, `worker/migrations/037`, added 2026-07-19)

Before this, someone who checked the SMS-consent box and typed a phone
number on `/pulse` but never actually clicked submit left **zero trace
anywhere** — checkbox/field state is pure client-side JS until the form's
`submit` handler fires (`static/js/pulse-optin.js`).

`static/js/pulse-optin.js` now fires a best-effort, fire-and-forget beacon
(`POST /api/pulse/progress`, `keepalive: true`) once the SMS-consent
checkbox is checked with a valid 10-digit phone (debounced 600ms), and again
on "Continue to Citizen Poll". The Worker endpoint no-ops unless
`consent_sms: true` and a valid phone are present, so it can never itself
manufacture a phantom opt-in signal, and it silently skips writing anything
if that phone already has a real `consent_status.status = 'opted_in'` row
(avoids queue noise from someone re-visiting a form they already completed).

**`pulse_abandoned_signups` is explicitly not a consent record** — same
doctrine as `docs/after_verification.md`'s pre-consent poll-calling view:
possession of a phone number is not consent to contact. It exists purely so
staff can call and try to complete a real opt-in verbally, via
`/admin/pulse-followup/index.html` (JS: `static/js/admin-pulse-followup.js`).
That page supports the same `log-call` pattern as §5a, plus **"Complete
opt-in verbally"** (`POST /api/admin/pulse-abandoned-signups/complete-optin`,
body `{id, first_name, last_name, email?, consent_email?, address1?, city?,
zip?}`):

- Writes real consent through the same `upsertConsentStatus` (`telnyx.js`)
  path `/api/optin` uses — not a bespoke insert — tagged
  `source = 'staff_call'`, `source_detail = 'pulse_verbal_followup'`,
  `consent_version = 'verbal-callback-v1'` so it's auditable as
  staff-obtained rather than self-submitted. Logs a
  `pulse_verbal_optin_completed` row in `texting_audit_log` with the
  operator's `actor_email`.
- If `city` was captured on the call, runs the same `syncSubmittedPhoneToWyVoter`
  cascade (§4a) a real step-2 submission would: a clean match mints and
  sends a Citizen Poll link (§4b/§4c) exactly like the auto path; an
  ambiguous/no-match result files a `pulse_voter_match_review` row (§4a) for
  later follow-up, same as any other submission.
- Deliberately does **not** re-fire the automated welcome-text/confirmation-email
  flow (`shouldSendStaffEmail`/`shouldSendConfirmationEmail` in §2's
  `POST /api/optin` handler) — the phone call itself was the welcome; those
  gates exist for self-service web submissions.

**Notification** (added 2026-07-19): unlike `pulse_voter_match_review`
above, a new `pulse_abandoned_signups` capture (`POST /api/pulse/progress`)
does **not** send an immediate email — a real-time email per form
abandonment would be high-volume and low-signal for something that isn't
even a consent record yet. It's surfaced instead through the daily digest
(`runPulseFollowUpDigest`, `"0 14 * * *"` cron, see §5a) and the "Open >48h"
staleness badge on `/admin/pulse-followup/index.html`.

## 6. Voter phone promotion is delivery-gated (fixed 2026-07-15, commit `bc6afec`)

`promoteDeliveredOptInPhone` (`worker/src/voter-phone.js`) writes the
`voter_phones`/`v_best_phone` mirror — but only after Telnyx's
`message.delivered` webhook confirms the welcome SMS actually reached the
phone, not merely that Telnyx accepted the send request. The webhook
handler (`processTelnyxWebhookEvent` in `telnyx.js`) reads the matched
`voter_id` back out of the `pulse_welcome_send` audit log entry (or, for
admin-resolved ambiguous matches, `pulse_voter_match_review.resolved_voter_id`)
and promotes at that point. `message.delivery_failed` resets
`contacts.welcome_sent_at` so a bad number gets retried instead of
permanently blocking future welcome/poll-link sends.

Before this fix, a typo'd or dead phone number that still happened to
uniquely match a real name+city+zip would immediately get written as that
voter's best phone in the shared `wy` database — polluting a table other
projects (Candidates, Guide) also read, based on nothing but acceptance,
not delivery.

## 7. Open design gap: voters we can't match to the voter file

**The engineering pieces to serve an unmatched submitter mostly already
exist** — they're just not wired together for this case:

- District resolution: already generic and already runs for everyone (§3).
- Precinct resolution: `resolveDistrictAndPrecinctForAddress` (`index.js`)
  takes a plain `{address1, city, zip}` shape — not a `voter_id` — and runs
  Census geocoding + GIS/polygon precinct lookup (`resolvePrecinct`,
  `worker/src/precinct-lookup.js`), the same mechanism `Candidates` uses.
  It's currently only ever called *after* a voter_id lookup resolves an
  address (`resolveVoterDistrictAndPrecinct`), never directly with the
  submitted address. Wiring it for the unmatched case is a small, low-risk
  addition — the hard part (geocoding, polygon math) is already built and
  proven.
- **The real, hard blocker is grassmvt_survey's mint endpoint**: `poll_invite_tokens`
  is keyed `(poll_slug, voter_id)` and 400s without a real `voter_id`. There
  is no path today to issue a ballot to someone with no voter-file match,
  regardless of how well their district/precinct is known.

### What's done, as of this update

- **`consent_status.voter_id` column** — done (§2).
- **Matching tiers expanded** — phone/email pre-checks, a staff-confirmed
  name+city tier for zip-missing submissions, and every non-infra failure
  mode (including the two previously-silent ones) now reaches the review
  queue (§4a).
- **The review queue can now actually deliver a ballot** — the
  mint-and-send admin action (§5) was the missing half of "resolve"; before
  it, confirming a voter_id in the review queue still left that person with
  no way to receive their poll link short of a fully manual, off-system
  process.

### What's still missing, concretely

1. **Address capture is still optional on step 2.** `address1` is present
   but not required (only city+zip are). A submitted street address
   materially improves match precision (tier 2 vs. tier 4 in §4a) and is
   required input for Census/GIS precinct resolution. Worth making it
   required specifically on the poll-verification step.
2. **No fallback path exists for a `no_match`/genuinely-unresolvable
   submitter to get *anything* poll-related** — not even an honest "you're
   in HD-X, we just can't confirm you're a registered voter there yet"
   message. They currently get generic "we'll follow up if we can confirm
   it" copy and silence. §5a's call-tracking on `pulse_voter_match_review`
   gives staff a *manual* tool to actually act on that "follow up" promise
   (call, verbally confirm the address, resolve) — it doesn't close this
   gap for someone who stays genuinely unresolvable after a real call
   attempt; that person still gets nothing.

### The actual decision, not just an engineering task

Whether to ever let a self-attested (address-only, not voter-file-verified)
person receive a poll ballot is a **poll-integrity policy question**, not
just a missing feature. The candidate-choice poll's value depends on being
a real registered-voter sample; the existing docs (`docs/after_verification.md`)
already avoid claiming it's scientific, but presumably still want it to mean
"real Wyoming voters," not "anyone who typed an address." Extending
`poll_invite_tokens` to accept a non-voter identity is also a
**grassmvt_survey-side schema/API change**, a separate project this repo
doesn't own outright.

**Recommended default**, pending an explicit decision otherwise:

- Keep poll ballot access strictly voter-file-verified (no change to §4b).
- For someone who still lands in `no_match`, use the district/precinct we
  can already resolve (§3, item 1 above) to give them an honest, useful
  message — "you're likely in District X, a campaign volunteer will follow
  up to confirm your registration" — instead of silence, without granting
  a real ballot.
- If self-attested poll participation is ever wanted, that's a distinct,
  explicit decision requiring a grassmvt_survey-side conversation, not
  something to build unilaterally from this repo.

## 8. Test data

Real (not fake) test identity for exercising this whole flow end to end —
name, address, matching `voter_id`, and known gotchas (`welcome_sent_at`
stickiness, name overwrite behavior): [docs/test_data.md](/home/anchor/projects/skovgard2026/docs/test_data.md).
`scripts/optins/reset-pulse-test-contact.mjs --phone <number>` resets the
send-gating state (`consent_status` row + `contacts.welcome_sent_at`) for a
standing test contact so a resubmission looks brand-new again. **Nulling
`welcome_sent_at` is not always sufficient** (found 2026-07-19): `telnyx.js`'s
`maybeSendWelcomeText` also looks up the delivery status of the *most
recent* `pulse_welcome_send` message for that phone, and no-ops with
`pending_or_delivered` if that prior message shows `delivered` — regardless
of `welcome_sent_at`. If a resubmission needs to exercise the welcome-SMS
send path specifically (not just the confirmation email / poll link), that
prior delivery-status check is the thing actually gating it, not the column
the reset script clears. See `docs/test_data.md` for the full gate list.

Turnstile blocks automated (Playwright/curl) testing of the real `/pulse`
page in production — the bot-detection widget can only be solved by an
actual browser session. Local `wrangler dev` bypasses Turnstile for
`localhost`, but the local `wy` D1 database has no voter-file data seeded,
so matching always fails there (`missing_wy_tables`/`no_match`) unless
tables are fabricated for the test. Full live verification of the matching
→ mint → delivery → promotion chain currently requires a human submitting
the real form against production.

## 9. Related docs

- [docs/db/README.md](/home/anchor/projects/skovgard2026/docs/db/README.md) — full D1 schema and data-flow reference
- [docs/after_verification.md](/home/anchor/projects/skovgard2026/docs/after_verification.md) — poll-audience data-quality runbook, consent/suppression handoff before volunteer calling
- [docs/OptinPlan.md](/home/anchor/projects/skovgard2026/docs/OptinPlan.md) — opt-in growth plan, CSV dual-write to `email_contacts`
- [Candidates/src/pages/api/ballot-lookup.js](/home/anchor/projects/skovgard2026/Candidates/src/pages/api/ballot-lookup.js) — the district/precinct resolution cascade this doc's §3/§7 reference
