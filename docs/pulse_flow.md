<!-- docs/pulse_flow.md -->
# Pulse Opt-In Flow

`/pulse` is the campaign's SMS+email opt-in form and the front door to the
Citizen Poll (candidate-choice poll). This doc describes the flow as it
exists today, end to end, and the open design gap around voters who can't
be matched to the Wyoming voter file.

Last updated: 2026-07-15.

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
   - "Join updates without voting" → submits immediately, skips step 2
2. **Step 2 — Citizen Poll verification**: city (required), zip (required),
   street address (optional). These are what `findUniqueWyTargetMatch`
   needs to resolve a Wyoming voter record.

City/zip became mandatory on the poll path specifically because the old
optional `<details>` voter-verification section let people request a poll
link without submitting enough to ever match one — see §5.

## 2. Data model

Canonical table: `consent_status` (`ballot_sources` D1, `DB` binding),
keyed by `phone_e164`. Written by `upsertConsentStatus` (`worker/src/telnyx.js`)
on every submission, `overwriteProfile: true` from `/pulse` (whatever's
posted overwrites the stored profile — see `docs/test_data.md` for what
this means for a reused test identity).

Relevant columns: `status`, `consent_email`, `first_name`, `last_name`,
`email`, `address1`, `address2`, `city`, `state`, `zip`,
`state_house_district`, `state_senate_district`, `poll_link_sent_at`.

**There is currently no `voter_id` column on `consent_status`.** The only
place a phone-to-voter link is recorded is `WY_DB.voter_phones` /
`v_best_phone`, keyed by phone — a different database, and (as of §4) only
written once SMS delivery is confirmed. See §6 for why this is a real gap.

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

Cascading passes against `WY_DB.v_voter_targeting`, tried in order,
first unique hit wins:

1. name + city + zip + address1
2. name + city + zip
3. name + zip only (city dropped — mailing city often differs from the
   voter file's registered city; added 2026-07-13, see commit `19d2891`)

Zero hits → `no_match`. More than one hit at any tier → `ambiguous_*`.
Both land in `pulse_voter_match_review` for manual staff resolution
(`/admin/pulse-voter-review/index.html`) — no poll link, no district beyond
what §3 already resolved.

### 4b. Poll link mint (`mintPollInviteLinksForChunk`, `worker/src/index.js`)

Server-to-server call to grassmvt_survey's `POST /api/poll/admin/mint-invite-token`,
authenticated via `POLL_MINT_SERVICE_KEY`. **Hard-requires `voter_id` and
`email_norm`** — 400 without both. This is the actual, sole hard blocker for
unmatched voters (see §6 — district/precinct resolution itself is *not*
the blocker, it's already generic).

The mint is **not idempotent in the token sense**: `ON CONFLICT(poll_slug, voter_id)
DO UPDATE` replaces `token_hash` on every call, invalidating whatever token
was previously issued to that voter. Re-minting without re-delivering
silently breaks an already-sent link — this is why delivery is gated (§4c).

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

Before this fix: an *existing* subscriber resubmitting `/pulse` specifically
to get the poll got a "your ballot link is on its way" success message and
nothing arrived, on any channel, no matter how many times they resubmitted
— both delivery channels were silently no-ops for anyone previously
welcomed/confirmed.

## 5. `verification.status` values (API response + frontend copy)

| Status | Meaning | Frontend copy source |
|---|---|---|
| `not_attempted` | No `city` submitted (updates-only path) | `pulse-optin.js` |
| `matched` | Unique voter match; `pollLink` present if minted | same |
| `matched_no_email` | Matched, but no email to mint/deliver to | same |
| `already_sent` | Matched; link already delivered previously, not re-minted | same |
| `ambiguous` / `no_match` | Landed in `pulse_voter_match_review` | same |

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

### What's missing on this repo's side, concretely

1. **`consent_status.voter_id` column** — once `findUniqueWyTargetMatch`
   succeeds, nothing durable records that link locally today. The only
   record is the phone-keyed `WY_DB` mirror (§6), which is a different
   database, keyed by a mutable field (phone), and now delivery-gated —
   none of which make it a reliable "is this contact voter X" lookup for
   this repo's own tables. A migration adding this column, set at match
   time in `/api/optin`, is a clean, low-risk win independent of everything
   else in this section.
2. **Address capture is optional today.** `address1` is present in the
   step-2 form but not required (only city+zip are). A submitted street
   address materially improves match precision (tier 1 vs. tier 3 in §4a)
   and is required input for Census/GIS precinct resolution. Worth making
   it required specifically on the poll-verification step, not the
   updates-only path.
3. **No fallback path exists for a `no_match`/`ambiguous` submitter to
   get *anything* poll-related** — not even an honest "you're in HD-X,
   we just can't confirm you're a registered voter there yet" message.
   They currently get generic "we'll follow up if we can confirm it" copy
   and silence.

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
- Ship the two low-risk, skovgard2026-only wins now: `voter_id` column
  (item 1) and required address on the poll step (item 2) — these reduce
  how often someone falls into "unmatched" in the first place, and make
  matches durable once they happen.
- For someone who still lands in `no_match`/`ambiguous`, use the
  district/precinct we can already resolve (§3, §7 first bullet) to give
  them an honest, useful message — "you're likely in District X, a
  campaign volunteer will follow up to confirm your registration" — instead
  of silence, without granting a real ballot.
- If self-attested poll participation is ever wanted, that's a distinct,
  explicit decision requiring a grassmvt_survey-side conversation, not
  something to build unilaterally from this repo.

## 8. Test data

Real (not fake) test identity for exercising this whole flow end to end —
name, address, matching `voter_id`, and known gotchas (`welcome_sent_at`
stickiness, name overwrite behavior): [docs/test_data.md](/home/anchor/projects/skovgard2026/docs/test_data.md).
`scripts/optins/reset-pulse-test-contact.mjs --phone <number>` resets the
send-gating state (`consent_status` row + `contacts.welcome_sent_at`) for a
standing test contact so a resubmission looks brand-new again.

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
