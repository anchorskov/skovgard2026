# Skovgard2026 Database Notes

Last updated: 2026-03-31

Purpose: document the current D1 data model, the operational source of truth for opt-ins and texting, and the local mirror/export paths used by the project.

Source of truth: Cloudflare D1 in production. Local SQLite files are mirrors for localhost testing and ops work, not primary records.

## Environments

- Master DB: `ballot_sources`
  Bound as `DB` in [wrangler.toml](/home/anchor/projects/skovgard2026/worker/wrangler.toml).
- Secondary DBs:
  - `events_db`
  - `events_db_preview`

## Current opt-in and texting model

As of 2026-03-31, the canonical record for SMS consent is `consent_status`.

- `consent_status` stores the live consent state for each phone number.
- `contacts` stores the texting-facing contact record keyed by `phone_e164`.
- `sms_optins` is now legacy backup data, kept temporarily for rollback and verification. New web opt-ins and texting updates should not rely on it.

This is the important split:

- Pulse and donate web forms write the canonical consent/profile record into `consent_status`.
- The same flows keep `contacts` in sync for texting UI and send-path behavior.
- Telnyx inbound STOP/START/HELP updates `consent_status`.
- Admin Pulse export reads from `consent_status`.
- `sms_optins` remains in D1 only as historical backup while production verifies cleanly after the 2026-03-31 refactor.

## Data flow overview

Inputs -> Worker -> D1 -> Local mirror / CSV -> Ops

1. Web forms
   - Pulse signup posts to `/api/optin`.
   - Donate SMS opt-in posts to `/api/donate/sms-optin`.
   - Both flows write canonical SMS consent/profile data into `consent_status`.
   - Both flows update `contacts`.

2. Telnyx webhooks
   - Incoming STOP/START/HELP and delivery events arrive at the Worker.
   - Inbound/outbound activity is stored in messaging tables.
   - Current consent state is updated in `consent_status`.

3. Admin tools
   - `/admin/texting/` reads `contacts`, `consent_status`, `inbound_messages`, `outbound_messages`, `telnyx_events`, and `texting_audit_log`.
   - `/admin/exports/` Pulse CSV now reads from `consent_status`.

4. Local mirrors and backups
   - `scripts/pulse-sync.sh` mirrors `consent_status` into local SQLite and emits Pulse CSV snapshots.
   - Local mirror DBs and backup CSV/SQL files are not committed.

## Master DB tables

### Canonical opt-in and texting tables

| Table | Purpose |
|---|---|
| `contacts` | Texting-facing contact identity keyed by `phone_e164`. Holds names plus texting helper fields like `tags` and `welcome_sent_at`. |
| `consent_status` | Canonical SMS consent record keyed by `phone_e164`. Stores live status (`opted_in`, `opted_out`, `unknown`, etc.), consent timestamps, inbound keyword metadata, and Pulse/donate profile fields such as name, email, county, ZIP, voter flag, consent version, user agent, and IP hash. |
| `inbound_messages` | Raw inbound SMS records from Telnyx webhooks. |
| `outbound_messages` | Outbound SMS records plus delivery status updates. |
| `telnyx_events` | Raw webhook event log for send, delivery, and inbound processing diagnostics. |
| `texting_audit_log` | Admin action log for texting sends and consent-related operational events. |

### Legacy / compatibility tables

| Table | Purpose |
|---|---|
| `sms_optins` | Legacy backup of older SMS opt-in data. Historical only as of 2026-03-31; no longer the canonical source for current opt-in/export behavior. |

### Other operational tables in `ballot_sources`

| Table | Purpose |
|---|---|
| `newsletter_subscribers` | Email-only newsletter signups and consent metadata. |
| `volunteers` | Volunteer signups and tags. |
| `rl_submissions` | Rate-limit ledger keyed by hashed IP/timestamps. |
| `donors` | Donation contact records. |
| `contributions` | Donation/payment intent records. |
| `contribution_attestations` | Donation compliance attestations and request metadata. |
| `podcast_uploads` | Podcast/audio media metadata. |
| `ballot_sources` | Election-resource reference links/labels used by site and admin tooling. |
| `d1_migrations` | Cloudflare D1 migration ledger. |
| `_cf_KV` | Cloudflare-managed system table. |

## Consent field conventions

- Phone keys:
  - `contacts.phone_e164`
  - `consent_status.phone_e164`
  - Stored as E.164 when valid.
- Live SMS consent:
  - `consent_status.status` is the operational truth.
  - `consent_status.consented_at` records affirmative opt-in timing.
  - `consent_status.revoked_at` records opt-out timing.
  - `consent_status.last_inbound_keyword` tracks STOP/START/HELP when present.
- Export-oriented profile fields:
  - `first_name`
  - `last_name`
  - `email`
  - `consent_email`
  - `wy_voter`
  - `county`
  - `zip`
  - `consent_version`
  - `user_agent`
  - `ip_hash`

## Scripts and local mirrors

- [pulse-sync.sh](/home/anchor/projects/skovgard2026/scripts/pulse-sync.sh)
  - Exports `consent_status` from D1.
  - Rebuilds the local Pulse mirror SQLite file.
  - Emits a Pulse CSV snapshot from canonical consent data.

- Local mirror path:
  - `~/projects/data/skovgard2026/data/pulse_local.sqlite`

- Backup path:
  - `~/projects/data/skovgard2026/backups/d1/`

## Notes for future cleanup

- `sms_optins` should remain available until production verification and rollback confidence are complete.
- After that verification window, the remaining legacy references to `sms_optins` can be removed entirely.
- `contacts` still exists separately because the texting portal and send-path logic already rely on it; this refactor moved canonical consent/profile data into `consent_status` without rewriting the whole texting model.

## Do not commit local data

- Never commit local SQLite mirrors.
- Never commit local SQL/CSV exports.
- Keep all local data files under ignored paths only.
