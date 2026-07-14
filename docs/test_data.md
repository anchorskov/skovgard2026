<!-- docs/test_data.md -->
# Test Data — Real Identities Used for End-to-End Testing

Reusable, real (not fake) contact identities for exercising flows that need a
genuine phone/email round trip (SMS delivery, email delivery, Turnstile-gated
forms, WY voter-file matching). Prefer these over inventing new fake data so
test artifacts (opt-ins, tokens, audit log rows) accumulate on one identity
instead of scattering across the database.

Add a new entry here whenever a test needs a real phone/email and none of the
existing ones fit — don't create a fresh throwaway identity per session.

## Jimmy Skovgard (candidate/campaign owner)

- **Phone**: 307-277-2260 (`+13072772260`)
- **Email**: anchorskov@gmail.com
- **Use for**: `/pulse` opt-in flow (SMS + email consent, welcome text,
  confirmation email, poll-link mint), Telnyx SMS round trips, Resend email
  round trips.
- **Real WY voter record**: `voter_id 158596` in the `wy` D1 database
  (`voters_addr_norm`: fn `JIMMY`, ln `SKOVGARD`, addr1 `5685 HANLY ST`, city
  `CASPER`, zip `82604`; House 59, Senate 29, Natrona county, precinct `8-1`,
  political_party `Republican`). Posting `first_name/last_name/address1/city/
  zip` matching this to `/api/optin` resolves via `findUniqueWyTargetMatch`
  mode `name_city_zip_address` and writes a real `voter_phones`/`v_best_phone`
  mirror row linking this phone to voter_id 158596.
  **Correction (2026-07-14)**: this is the *same* voter_id referenced in
  `grassmvt_survey/docs/poll_summary.md` as "Jimmy's own real test identity"
  (1 pre-existing `poll_invite_tokens` row from 2026-07-11, minted via the
  email-match blast path with a different email than anchorskov@gmail.com on
  it at the time) — not a separate identity as an earlier version of this note
  claimed. Minting a poll link for this phone via `/api/optin` updates that
  *same* `poll_invite_tokens` row in place (`ON CONFLICT(poll_slug, voter_id)`)
  — `email_norm` and `token_hash` get overwritten to the new submission's
  values (any previously-issued link for this voter_id stops working), but
  `created_at` and the row count stay the same. Confirmed working end-to-end
  2026-07-14: submitting with the address above produced a real
  `poll_invite_tokens` update (`email_norm` now `anchorskov@gmail.com`) and the
  welcome SMS included a working `https://grassrootsmvt.org/poll/2026-primary/
  ?token=...` link. Submitting *without* an address/city/zip instead hits the
  no-voter-match fallback (`syncSubmittedPhoneToWyVoter` returns `skipped:
  missing_lookup_fields`) — welcome text/email still send, just with no poll
  link appended.
- **`contacts.welcome_sent_at` blocks resends** — `maybeSendWelcomeText`
  no-ops once it's set, and **`consent_status.consent_email = 1` blocks the
  confirmation email resend** (`/api/optin`'s `shouldSendConfirmationEmail`
  check). It was first set 2026-05-11 from an earlier `/pulse` test
  (`texting_audit_log` action `pulse_welcome_send`, id 141) and stayed set
  through several no-op re-tests. **Reset and re-verified 2026-07-14**: ran
  `UPDATE contacts SET welcome_sent_at = NULL` and
  `UPDATE consent_status SET consent_email = 0` for this phone, then
  resubmitted `/api/optin` — confirmed a real Telnyx send landed
  (`outbound_messages`, status `delivered`, 2026-07-14 16:55:59) with the new
  spam-guidance welcome-text copy present verbatim, and the confirmation-email
  eligibility check passed with no errors logged (real inbox receipt not
  independently confirmed — check anchorskov@gmail.com, including spam, to be
  sure). The test submission itself then reset `consent_email` back to `1`
  and `welcome_sent_at` back to a real timestamp, so **this identity is
  sticky again** — repeat this same clear-then-resubmit sequence for any
  future test that needs to see a real send rather than a silent no-op.
- **`consent_status.first_name`/`last_name` is not stable across tests.**
  `/api/optin` always upserts with `overwriteProfile: true`, so whatever name
  is posted overwrites what's there. This identity's stored name has already
  been overwritten at least twice this way — it was `Becky` (a placeholder
  from the 2026-05-11 `/pulse` test) until a 2026-07-14 test changed it to
  `Jimmy Skovgard`. The `Becky` name is why older `send_preview`/`send_message`
  admin-texting audit rows through 2026-06-27 are personalized "Hi Becky" —
  that's this same test number, not a real contact. Don't be alarmed by a
  name mismatch in audit history; check `consent_status.updated_at` against
  the audit trail before assuming a name change indicates a real problem.
- Real sends: submitting this through `/pulse` (or `/api/optin` directly)
  against production bindings sends a real Telnyx SMS to this phone (when
  `welcome_sent_at` isn't already set) and a real Resend email to this
  address (when the confirmation-email eligibility check in `/api/optin`
  passes — it's skipped if this identity is already opted in with email
  consent from a prior test), and always writes/updates a real
  `consent_status` row. Not a sandbox — treat test sends here as real
  campaign contacts, not disposable requests.

## Notes for future entries

- Include: phone, email, what it's good for, and any known matching state in
  the WY voter file (`wy` D1 database) so a future session doesn't have to
  re-derive it by querying production.
- If a test identity gets opted out, marked do-not-contact, or otherwise
  changed state during testing, note that here too so it isn't reused
  assuming a clean slate.
