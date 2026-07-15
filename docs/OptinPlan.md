<!-- docs/OptinPlan.md -->
# Opt-In Growth Plan — Email + SMS from Voting-Age Wyomingites

Status: **draft / living document** — record decisions in the Decisions Log at the
bottom rather than rewriting history above it.

Last updated: 2026-07-13

## 1. Why this doc exists

The 2026 primary candidate-choice poll (`grassmvt_survey/docs/poll_summary.md`) is
built and paused before its mass send: emailing the L2-derived voter file (even the
EmailListVerify-"good" subset) reads to Gmail as unsolicited mail from a young sending
domain, and lands in spam regardless of content quality. That's not a poll-specific
problem — it's the ceiling on *any* mass send built on top of the raw voter file.

The fix is not a bigger or cleaner L2 pull. It's building a real, consented audience
and sending to that instead. This doc is the concept and phased plan for growing that
audience — email and SMS both — from voting-age Wyomingites broadly, not just people
who've already found the campaign.

**Headline finding: this does not require a rewrite.** The canonical consent
architecture already exists and is sound (§2). The gap is narrower than it looked at
first: one ingestion path doesn't write into it, nothing is actively driving traffic
into it, and there's no admin visibility into its growth. Sections 4–7 scope exactly
that work.

## 2. Current state (verified against production, 2026-07-13)

### The canonical tables already exist and are correct

- **Email**: `email_contacts` / `email_contact_purposes`
  (`worker/migrations/026_email_contacts.sql`), `consent_status` column =
  `opted_in | opted_out | no_signal`. Built and backfilled per
  `docs/db/EmailConsolidationPlan.md` (Phases 1–3, shipped 2026-07-07).
- **SMS**: `consent_status` table (phone-keyed) — already the single canonical SMS
  consent source, no consolidation needed (per `docs/UpsertOptinData.md`).

### The best entry point already exists and is well-built

`/pulse` (`src/pages/pulse/index.astro`, `src/pages/pulse/signup/index.astro`,
component `src/components/PulseOptInForm.astro`) is a real, explicit,
TCPA-appropriate double-consent form today:

- Mobile number **required**, gated by its own **required** checkbox with real
  consent copy ("I agree to receive campaign text messages... Reply STOP to opt
  out... Consent is not a condition of donation") — not implied consent from just
  typing a number.
- Email **optional**, with its **own separate** opt-in checkbox — not bundled with
  the SMS consent.
- On submit (`worker/src/index.js` ~3900–4020): always writes `consent_status`
  (SMS canonical); when `consent_email` is checked, also calls
  `upsertNewsletterSubscriber` → writes `newsletter_subscribers` **and**
  dual-writes `email_contacts`/`email_contact_purposes` via
  `upsertEmailContactSubscriber` (purpose `subscriber`, priority 4 — wins over
  backfilled voter-file data, sticky against overwriting an existing opt-out).
  Also mirrors the phone to the WY voter file for district resolution
  (`syncSubmittedPhoneToWyVoter`) and sends a welcome text + confirmation email.

**Conclusion: there is no need to design a new opt-in form.** `/pulse` is already
the correct front door for both channels. What's missing is (a) traffic to it, and
(b) making sure every *other* ingestion path is as clean as this one.

### The real numbers (queried live, 2026-07-13)

`email_contacts` totals: **109,368** contacts.

| consent_status | count |
|---|---|
| opted_in | **62** |
| opted_out | 252 |
| no_signal | 109,054 |

By purpose (a contact can carry more than one):

| purpose | opted_in | no_signal | opted_out |
|---|---|---|---|
| subscriber (Pulse/newsletter) | 61 | — | 251 |
| volunteer | 36 | 9 | 1 |
| candidate | 6 | 1,710 | 1 |
| voter_file | 4 | 61,018 | 198 |
| purged_voter | 4 | 47,055 | 52 |

Against a poll-eligible voter-file audience in the 14,000–25,000 range, genuine
opted-in coverage today is **~0.3%**. This is the concrete size of the gap — not "we
have some data," but "we have a rounding error's worth of data relative to what a
mass send needs."

### The known gap: CSV signup-sheet import never reaches `email_contacts`

The in-person event pipeline (`docs/UpsertOptinData.md`,
`scripts/optins/upsert-optin-data.mjs`) writes directly to `contacts`,
`consent_status`, `newsletter_subscribers`, `sms_optins`, and `volunteers` via
generated SQL — bypassing the Worker entirely, so the dual-write hooks that live
inside `worker/src/index.js` (`upsertEmailContactSubscriber`, called from
`upsertNewsletterSubscriber`/`applyOptinResponse`) never fire. Anyone signing an
in-person sheet gets a correct `newsletter_subscribers` row but **no**
`email_contacts` row — meaning event-collected consent is invisible to anything
that reads the canonical table, including a future poll-audience filter.

This is the one concretely scoped fix in this doc (§4). The other deferred paths
noted in `docs/db/EmailConsolidationPlan.md` (admin contact editor, Telnyx
START/HELP, `sms_optins` volunteer toggle) have the same gap in principle but are
out of scope here — lower volume, already tracked as Phase 4 work in that doc.

## 3. Concept: what "the opt-in flow" actually is

Not a new build. Three things running in parallel:

1. **Traffic** into the existing `/pulse` front door — social, in-person events
   (as a companion to or replacement for paper sheets), QR codes, referral shares.
   This is the actual "start gathering email/text from voting-age Wyomingites" ask —
   it's a marketing/promotion problem, not an engineering one (see §5).
2. **Parity** across every ingestion path, so a sheet signed at a county fair counts
   the same as a `/pulse` submission. §4 scopes the one concrete gap.
3. **Visibility**, so growth is a number you can watch, not a guess. §6.

Everything downstream — the poll's mass send, any future email/SMS campaign to
"everyone who's opted in" — reads from `email_contacts.consent_status = 'opted_in'`
(email) and `consent_status.status = 'opted_in'` (SMS). Nothing new to build there
either; it's a matter of pointing consumers at what already exists (§7).

## 4. Phase 1 — CSV dual-write fix (scoped, not yet implemented)

**File**: `scripts/optins/upsert-optin-data.mjs`

**Change**: add one new statement-builder function, `emailContactsStatement(row)`,
mirroring `upsertEmailContactSubscriber`'s SQL exactly (same priority-4 /
sticky-opted_out `ON CONFLICT` logic against `email_contacts`, plus an
`INSERT OR IGNORE ... 'subscriber'` row into `email_contact_purposes`) — same shape
as the existing `newsletterStatement(row)` at line 382, just targeting
`email_contacts`/`email_contact_purposes` instead of `newsletter_subscribers`.

**Wiring**: in `buildSql()` (line 534), add one more loop —
`for (const row of runData.newsletterRows) statements.push(emailContactsStatement(row));`
right after the existing `newsletterStatement` loop (line 546) — reuses the exact
same row set (rows already gated on `opt_in_email=Yes` + valid email during
transform), so no new transform-side logic is needed. Add `email_contacts` to the
`counts` object for the run summary.

**Source tag**: `email_contacts_dual_write:signup_sheet_import`, distinct from the
Worker's own `email_contacts_dual_write:email_optin_response` tag, so a future audit
can tell which channel produced a given `email_contacts` row.

**Docs**: add one more "Verification Queries" block to `docs/UpsertOptinData.md`
(mirroring the existing `newsletter_subscribers` one) checking `email_contacts` /
`email_contact_purposes` for the imported rows.

**Not in scope for this fix**: SMS side needs no change — `consent_status` is
already the canonical SMS table and the CSV import already writes to it correctly.

**Testing**: the existing `scripts/optins/test-optin-import.mjs` harness already
builds a temp SQLite DB and re-runs the import twice to check idempotency — extend
its assertions to also check the new `email_contacts` rows, rather than writing a
separate test.

## 5. Phase 2 — driving traffic to `/pulse`

This is the actual lead-generation work, and it's a promotion decision more than a
build decision. Options, not mutually exclusive (flagging for discussion, not
deciding here):

- **Paid/organic social** pointing directly at `/pulse` (or a race/issue-specific
  landing variant of it) — "join the list to see where Wyoming stands on X."
- **In-person events**: hand people a phone to fill out `/pulse` directly instead of
  (or alongside) a paper sheet — removes the CSV-import step and its lag entirely
  for anyone with a signal. Paper stays as the fallback for people without one.
- **QR codes** on yard signs, mailers, event signage → `/pulse`.
- **Referral**: a share link from existing Pulse members ("bring a neighbor").
- **The poll itself as bait**, once a public/self-serve entry exists (raised in the
  prior conversation turn, still an open idea, not scoped here) — "see how your
  district is leaning" as the hook that gets someone to opt in, rather than opt-in
  being a precondition to seeing the poll at all. Worth revisiting once Phase 1–3
  here are done, since it would need its own token/consent-capture design.

**Open question for you**: which of these do you want to actually run, and is there
a budget/timeline for paid social, or is this organic + in-person only for now?

## 6. Phase 3 — admin reconciliation view

A **read-only** view (WORM-compliant — no new hardcoded lists, no editable dropdown;
just a query surface over the canonical tables), so growth is trackable instead of
guessed. Suggested breakdown:

- Total opted-in (email), opted-in (SMS), opted-in-both.
- Opted-in **and** voter-matched (`lalvoterid` populated or resolvable via the
  existing address-district cascade) — i.e. poll-invite-ready today.
- Opted-in but **unmatched** to a voter record — still emailable/textable for
  general campaign content, but can't get a precinct-specific poll invite without
  further address resolution.
- Breakdown by `source` (Pulse web, signup-sheet import, admin manual entry,
  volunteer intake) — shows which channel is actually producing growth, which
  tells you whether Phase 2's traffic bets are working.

Not scoped in detail here (a follow-up build once Phase 1 lands and there's
meaningful data to look at) — flagging the shape so it's not forgotten.

## 7. Phase 4 — re-point the poll (and future sends) at the consented audience

Once Phase 1 is live and Phase 2 has run long enough to matter: change
`poll_invite_2026`'s audience source (`worker/src/index.js`,
`queryPollInviteAudienceChunk` and friends) from
`email_verification_queue.verdict='good'` to `email_contacts.consent_status='opted_in'`
intersected with the existing voter-match/district-resolution logic (unchanged —
token minting, `{poll_link}` personalization, the whole send pipeline stays as
built). This was scoped in detail in the prior conversation turn; restating here
only to anchor it as the actual finish line this plan is building toward.

A parallel **SMS invite path** is also worth considering once this is live —
`consent_status`-opted-in-but-not-email-opted-in contacts could get the poll link
by text via the existing Telnyx integration, sidestepping email deliverability
entirely for that segment. Not scoped — flagging as a real option given SMS
consent already outnumbers email consent in a lot of the existing data.

## 8. Explicitly deferred / not part of this plan

- Public/self-serve (non-token) poll entry as a lead magnet — real idea from the
  prior conversation, needs its own design pass once this plan's phases land.
- Mirroring/running the poll from `this-is-us.org` — already flagged as deferred in
  `grassmvt_survey/docs/poll_summary.md`, unrelated to opt-in growth.
- Closing the *other* deferred dual-write gaps (admin contact editor, Telnyx
  START/HELP, `sms_optins` volunteer toggle) — real, tracked in
  `docs/db/EmailConsolidationPlan.md`, lower volume than the CSV path, not blocking
  Phase 1.
- Double opt-in *beyond* what `/pulse` already does (its SMS checkbox is already
  explicit, real consent — this isn't a gap, just flagging that "double opt-in" as a
  term usually means an additional confirmation-click step, which this doesn't have
  yet and isn't scoped here).

## Decisions Log

- **2026-07-13**: confirmed no architectural rewrite is needed — `email_contacts` +
  `consent_status` + `/pulse` are sound; scope narrowed to closing the CSV
  dual-write gap, driving traffic, and adding visibility. CSV fix scoped in detail
  (§4), not yet implemented.
- **2026-07-13**: Phase 1 (§4) implemented and tested. `scripts/optins/upsert-optin-data.mjs`
  gained `emailContactsStatement()`, wired into `buildSql()` right after the
  existing `newsletterStatement()` loop — every signup-sheet row that creates a
  `newsletter_subscribers` row now also dual-writes `email_contacts`/
  `email_contact_purposes`, mirroring `upsertEmailContactSubscriber`'s exact SQL
  (priority 4, sticky opted_out on `consent_status` only — `source`/`source_detail`
  follow the same equal-priority-wins rule as the Worker's version, confirmed via a
  seeded pre-existing-opted-out test case). `docs/UpsertOptinData.md` and
  `scripts/optins/test-optin-import.mjs` updated to match; full test suite passes,
  including rerun-idempotency for both new tables. Not yet applied to production —
  the next real signup-sheet import run will be the first to exercise this against
  live data. §5 (traffic) is next, pending discussion.
