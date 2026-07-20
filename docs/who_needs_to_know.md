<!-- docs/who_needs_to_know.md -->
# Who Needs to Know — Notification Inventory

Every place this site emails or texts a human being (staff or donor) when
something happens, verified against the current code and production
`worker/wrangler.toml`, not assumed from memory. Update this doc whenever a
new flow adds, removes, or changes who gets notified — its whole purpose is
to stop admin items from going stale because nobody remembered they needed
watching.

**Correction to a working assumption**: `jimmy@grassrootsmvt.org` is not a
notification recipient anywhere in this codebase. It only appears as a
public "reply to Jimmy" contact address baked into donor/subscriber-facing
email copy (`worker/src/email-template.js`) and on public pages (`Footer.astro`,
`support/index.astro`, etc.). The actual Pulse staff-review recipient is
`pulse@grassrootsmvt.org` — see below.

## 1. Pulse opt-in staff notification

- **File**: `worker/src/pulse-email.js` (`buildStaffEmail`, called from
  `sendPulseOptInEmails`)
- **Trigger**: `POST /api/optin` with `shouldSendStaffEmail = !wasOptedIn`
  (`worker/src/index.js`) — fires **once per phone number, ever**, on the
  first time it's ever opted in. A resubmission from an already-opted-in
  contact never re-fires it.
- **Recipient**: `env.PULSE_STAFF_NOTIFY_TO`, defaults to
  `pulse@grassrootsmvt.org` if unset. Production has it set explicitly.
- **Requires**: `PULSE_EMAIL_ENABLED=1`, `RESEND_API_KEY`, `PULSE_EMAIL_FROM`
  all present, or the whole email step silently no-ops
  (`{sent:false, reason:"disabled_or_missing_config"}` — nothing logs this
  as an error). `GET /api/health` reports `envPresent.pulseStaffNotifyTo`
  as a boolean if you want to check the address is configured at all
  without exposing the value.
- **Content**: name, phone, email, consent flags, address, districts,
  source — the same fixed template for *every* opt-in regardless of
  outcome. It always includes a static link to
  `/admin/pulse-voter-review/index.html`, but **does not say whether this
  particular submission is one of the ones that needs review** — you get
  the same email whether the voter match was clean or landed in the
  ambiguous/no-match queue. At any real volume this becomes background
  noise that's easy to stop reading closely.
- **Does NOT fire for**: the new staff-completed verbal opt-in path
  (`POST /api/admin/pulse-abandoned-signups/complete-optin`, added
  2026-07-19) — deliberately, since the phone call itself is the "were you
  notified" moment for that one. Confirm this is the behavior you want;
  it means a verbally-completed opt-in leaves no email trail at all beyond
  `texting_audit_log`.

## 2. Inbound SMS reply notification

- **File**: `worker/src/telnyx.js` (`processTelnyxWebhookEvent`)
- **Trigger**: any inbound text reply that isn't a STOP/START/HELP keyword
  (those are handled separately, silently, via the opt-out/opt-in machinery).
- **Recipient**: `env.INBOUND_SMS_NOTIFY_TO` — `support@grassrootsmvt.org`
  in production. **Empty string in the preview environment** — inbound
  reply notifications are silently disabled on preview by design.
- **Requires**: `RESEND_API_KEY` and a non-empty `notifyTo`; failures are
  swallowed (`catch (_) {}`) so a broken notification never blocks the
  webhook.
- **Content**: from/to numbers, message text, timestamp, link to the
  texting admin portal. Immediate, one email per reply.

## 3. Donation notification

- **File**: `worker/src/index.js` (Stripe webhook handler, `~line 3805`)
- **Trigger**: Stripe payment webhook status becomes `succeeded_webhook`.
- **Recipient**: **hardcoded** `donate@grassrootsmvt.org` — this is the one
  notify address that is *not* an env var. Changing it requires a code
  edit + deploy, unlike the other two above. Worth flagging as an
  inconsistency if this address ever needs to change on short notice.
- **Content**: donor name/email/location, amount, election period, FEC
  aggregate-limit remaining, employer/occupation, payment ID. Immediate,
  one per donation.

## 4. Flows with no staff notification (by design)

- `POST /api/newsletter/subscribe` — no staff email. Silent by design;
  high volume, low individual urgency.
- `POST /api/share` — the recipient is the friend the visitor is sharing
  with, not staff. No staff copy is sent.

## 5. Email-verification cron — PAUSED 2026-07-19 (no credits)

`worker/src/index.js`'s scheduled email-verification batch job used to run
on `"*/2 * * * *"` and had been silently failing every tick with
`error_credit` (EmailListVerify account out of credits) — discovered this
session purely because a `wrangler tail` happened to be running for an
unrelated reason. **This is now a deliberate TODO, not a silent failure**:
the user decided not to purchase more credits right now, so the cron
trigger was removed from `worker/wrangler.toml`
(`[env.production.triggers]`) entirely. `runEmailVerificationBatch` itself
is untouched (still callable manually via
`POST /api/admin/emails/verification/run-batch`) — resuming it later is a
one-line `wrangler.toml` change (re-add `"*/2 * * * *"` to the `crons`
array and branch on it in `scheduled()`, same pattern the digest cron
below already uses).

## 6. New admin queues with no notification at all (added 2026-07-19)

Three things landed today (`docs/pulse_flow.md` §5a/§5b) that currently
have **zero push notification** — the only way to know they need attention
is to remember to open the admin page:

- **`pulse_voter_match_review` unresolved rows** (ambiguous/no-match voter
  matches). Partially covered by §1's generic staff email, but only as an
  undifferentiated static link — no distinct alert, no count, no "this one
  needs you" signal.
- **`pulse_voter_match_review` call-tracking** (`call_status`,
  `called_at`) — nothing prompts a follow-up call or a second attempt; a
  row can sit at `not_called` or `left_voicemail` indefinitely.
- **`pulse_abandoned_signups`** (never-submitted `/pulse` starts) — this
  one is the most acute gap: it's captured via `POST /api/pulse/progress`,
  which never calls `sendPulseOptInEmails` or any other notifier. **This
  queue is entirely invisible unless someone manually opens
  `/admin/pulse-followup/index.html`.**

## Implemented 2026-07-19

All items below were built and deployed the same day this doc was written.

1. **Distinct "review needed" staff email** — `sendPulseReviewNeededEmail`
   (`worker/src/pulse-email.js`), fired from both insert sites for
   `pulse_voter_match_review` (`POST /api/optin` and
   `POST /api/admin/pulse-abandoned-signups/complete-optin`). Subject:
   `Pulse review needed: <name>`, separate from the generic per-opt-in
   notice in §1, so it can't blend into routine signup volume.
2. **`pulse_abandoned_signups` visibility** — folded into the digest (item
   3) rather than a real-time email per capture, to avoid inbox noise from
   people who abandon the form and never call back (a real-time email per
   abandonment could be high-volume and low-signal; the digest keeps it to
   one line a day).
3. **Daily digest** — `runPulseFollowUpDigest` (`worker/src/index.js`),
   wired to the new `"0 14 * * *"` cron trigger (replaced the paused
   `"*/2 * * * *"` from §5). Summarizes unresolved
   `pulse_voter_match_review` count + count older than 48h, and open
   `pulse_abandoned_signups` count + count older than 48h. Only sends when
   at least one item is open, via `sendPulseFollowUpDigest`
   (`worker/src/pulse-email.js`).
4. **Staleness badges** — both `/admin/pulse-voter-review/index.html` and
   `/admin/pulse-followup/index.html` now render an "Open >48h" badge on
   any row older than 48 hours, computed client-side from
   `created_at`/`captured_at` — no new backend query needed.
5. **`DONATE_NOTIFY_TO` env var** — the previously-hardcoded
   `donate@grassrootsmvt.org` in the donation-webhook notifier
   (`worker/src/index.js`) now reads `env.DONATE_NOTIFY_TO`, matching the
   `PULSE_STAFF_NOTIFY_TO`/`INBOUND_SMS_NOTIFY_TO` pattern (empty in
   `[env.preview.vars]` = disabled, same as inbound SMS).
6. **Repeated-cron-failure alerting** — not built; moot once §5's cron was
   paused entirely rather than fixed. Revisit if/when the email-verification
   cron is resumed.

## Maintenance note

Add a new entry here any time a flow gains, loses, or changes a
notification recipient or trigger condition — check the actual code
(`grep -rn "NOTIFY_TO\|sendResendEmail\|sendPulseOptInEmails"
worker/src/`) rather than trusting memory of what an address is supposed
to be, the same way this doc's opening correction had to.
