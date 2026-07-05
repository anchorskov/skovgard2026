<!-- docs/db/README.md -->
# Skovgard2026 Database Notes

Last updated: 2026-06-22

Purpose: document the current D1 data model, the operational source of truth for opt-ins and texting, and the local mirror/export paths used by the project.

Source of truth: Cloudflare D1 in production. Local SQLite files are mirrors for localhost testing and ops work, not primary records.

## Environments

- Primary application DB: `ballot_sources`
  - Bound as `DB` in [worker/wrangler.toml](/home/anchor/projects/skovgard2026/worker/wrangler.toml).
  - Holds the site/app tables managed by this repo's Worker migrations.
  - Production D1 ID: `9c4b0c27-eb33-46e6-a477-fb49d4c81474`
  - `migrations_dir = "migrations"` is set on all three `ballot_sources` DB bindings (production, preview, shared/dev).
- Preview application DB: `ballot_sources_preview`
  - Bound as `DB` in `[env.preview]` only.
  - Preview D1 ID: `31fde6b7-519b-4e63-9d44-c55b10d9df3f`
  - Receives all migrations before they are applied to production. Always migrate preview first, verify, then apply to production.
- Wyoming voter DB:
  - `wy` for default and production.
  - `wy_preview` for preview.
  - Bound as `WY_DB` in [worker/wrangler.toml](/home/anchor/projects/skovgard2026/worker/wrangler.toml).
  - Used for Wyoming voter matching and phone mirroring (`v_voter_targeting`, `voter_phones`, `v_best_phone`).
- Important distinction:
  - `wy_address_district_lookup` and `wy_district_coverage` live in `ballot_sources`, not `WY_DB`.
  - `WY_DB` is separate and is not the canonical opt-in/texting store.

## Current opt-in and texting model

As of 2026-04-05, the canonical record for SMS consent is `consent_status`.

- `consent_status` stores the live consent state and profile fields for each phone number.
- `contacts` stores the texting-facing contact record keyed by `phone_e164`.
- `newsletter_subscribers` stores email consent records used by admin email, newsletter export, and opted-in campaign email flows.
- `sms_optins` is a legacy compatibility table. It is not canonical, but it is still retained for rollback, volunteer-flag compatibility, and older admin/texting helper queries.

This is the important split:

- Pulse and donate web forms write the canonical consent/profile record into `consent_status`.
- The same flows keep `contacts` in sync for texting UI and send-path behavior.
- Pulse and admin texting flows upsert `newsletter_subscribers` when email consent is present.
- Pulse attempts to mirror the submitted phone into `WY_DB` when the required voter tables/views exist.
- Telnyx inbound STOP/START/HELP updates `consent_status`.
- Admin Pulse export reads from `consent_status`.
- Texting and admin-email audience queries still derive `is_volunteer` from the latest matching row in `sms_optins`.
- District assignment now uses a three-stage lookup:
  - exact/local lookup in `wy_address_district_lookup`
  - US Census geocoder fallback
  - `wy_district_coverage` only when city coverage is unambiguous

## Data flow overview

Inputs -> Worker -> D1 -> Local mirror / CSV -> Ops

1. Web forms
   - Pulse signup posts to `/api/optin`.
   - Donate SMS opt-in posts to `/api/donate/sms-optin`.
   - Both flows write canonical SMS consent/profile data into `consent_status`.
   - Both flows update `contacts`.
   - Pulse writes a full mailing address (`address1`, `address2`, `city`, `state`, `zip`, `country`) and keeps district fields on `consent_status`.
   - When email consent is present, the Worker upserts `newsletter_subscribers`.
   - Pulse also attempts an async phone mirror into `WY_DB` (`voter_phones` and `v_best_phone`) after a unique voter match.

2. Telnyx webhooks
   - Incoming STOP/START/HELP and delivery events arrive at the Worker.
   - Inbound/outbound activity is stored in messaging tables.
   - Current consent state is updated in `consent_status`.

3. Admin tools
   - `/admin/texting/` and its API endpoints read `contacts`, `consent_status`, `inbound_messages`, `outbound_messages`, `telnyx_events`, and `texting_audit_log`.
   - Admin texting compatibility paths still write/query `sms_optins` for volunteer tagging.
   - `/admin/emails/` reads `newsletter_subscribers` plus `consent_status`, and send actions write `admin_email_audit_log`.
   - `/admin/exports/` Pulse CSV reads from `consent_status`.

4. Local mirrors and backups
   - `scripts/pulse-sync.sh` mirrors `consent_status` into local SQLite and emits Pulse CSV snapshots.
   - `scripts/sync-wy-district-lookup.mjs` rebuilds the local district lookup tables inside `ballot_sources`.
   - Local mirror DBs and backup CSV/SQL files are not committed.

## `ballot_sources` tables

### Canonical opt-in and texting tables

| Table | Purpose |
|---|---|
| `contacts` | Texting-facing contact identity keyed by `phone_e164`. Holds names plus texting helper fields like `tags` and `welcome_sent_at`. |
| `consent_status` | Canonical SMS consent record keyed by `phone_e164`. Stores live status (`opted_in`, `opted_out`, `unknown`, etc.), consent timestamps, inbound keyword metadata, and Pulse/donate/admin profile fields such as name, email, ZIP, full mailing address, voter flag, consent version, user agent, and IP hash. The `county` column remains for legacy data but is no longer collected by the Pulse form. |
| `wy_address_district_lookup` | Exact Wyoming address-to-district lookup table derived from the normalized Grassroots voter-address dataset. This is the primary local mirror used to assign `state_house_district`, `state_senate_district`, and derived `county` during opt-in writes and backfills. |
| `wy_district_coverage` | City/county-to-district coverage table mirrored from Grassroots for safe fallback when a city maps to exactly one House or Senate district. |
| `inbound_messages` | Raw inbound SMS records from Telnyx webhooks. |
| `outbound_messages` | Outbound SMS records plus delivery status updates. |
| `telnyx_events` | Raw webhook event log for send, delivery, and inbound processing diagnostics. |
| `texting_audit_log` | Admin action log for texting sends and consent-related operational events. |

### Legacy / compatibility tables

| Table | Purpose |
|---|---|
| `sms_optins` | Legacy backup/compatibility opt-in table. It is no longer the canonical source for consent state or Pulse export behavior, but it is still written/read by compatibility paths and currently carries the volunteer flag used by audience queries. |

### Other operational tables in `ballot_sources`

| Table | Purpose |
|---|---|
| `newsletter_subscribers` | Email consent records used by updates signup, Pulse opt-ins with email consent, admin texting contact creation, admin email audience building, and newsletter CSV exports. |
| `admin_email_audit_log` | Audit log for admin email preview/send activity. |
| `share_sends` | Audit log for `/api/share` email sends. Stores `sender_ip_hash`, `message_slug`, `recipient_email`, `created_at`, and `is_admin_send` (0 = public, 1 = admin). The `is_admin_send` flag excludes admin rows from the per-IP rate-limit count. |
| `volunteers` | Volunteer signups and tags. |
| `rl_submissions` | Rate-limit ledger keyed by hashed IP/timestamps. |
| `donors` | Donation contact records. |
| `contributions` | Donation/payment intent records. |
| `contribution_attestations` | Donation compliance attestations and request metadata. |
| `podcast_uploads` | Podcast/audio media metadata. |
| `ballot_sources` | Election-resource reference links/labels used by site and admin tooling. |
| `d1_migrations` | Wrangler D1 migration ledger. Tracks every migration file name and applied timestamp so `wrangler d1 migrations apply` does not re-run already-applied files. Seeded manually for migrations 001–020 that were applied before tracking was established. |
| `_cf_KV` | Cloudflare-managed system table. |

## `WY_DB` objects used by the Worker

These objects are not managed by this repo's `worker/migrations/` files. The Worker only depends on them when the `WY_DB` binding is present and the objects exist.

| Object | Purpose |
|---|---|
| `v_voter_targeting` | View used to attempt a unique Wyoming voter match from submitted name/address/city/zip data. |
| `voter_phones` | Mirror table of observed phone numbers keyed by voter and normalized phone. |
| `v_best_phone` | Current preferred/best phone per voter. |
| `voter_emails` | Raw voter email storage, pre-match. `voter_id` nullable until a matching step runs. Not yet read by this repo's Worker — see `docs/email_guide.md`. |
| `v_best_email` | Current preferred/best email per matched voter (real SQL view, not a materialized table like `v_best_phone`). |

Schema for `voter_emails`/`v_best_email` is authored in `~/projects/voterdata/wyoming/bin/wv.sh` and tracked as a migration in `~/projects/grassrootsmvt/worker/db/migrations/034_add_voter_emails.sql` — neither lives in this repo. Full process detail: `docs/email_guide.md`.

## `WY_DB` objects managed by the Candidates voter guide

The `wy` database also hosts the Wyoming 2026 primary voter guide tables, written by migrations in `Candidates/db/migrations/` and deployed by the `skovgard-candidates` Worker. These tables coexist alongside the voter/phone objects above.

| Table | Purpose |
|---|---|
| `offices` | Wyoming offices (federal, statewide, legislative, county, city) with level, district, and sort_order. Row count grows as counties are added. |
| `candidates` | Primary candidates with base filing data plus 40+ enrichment columns (social URLs, FEC IDs, WYCFIS links, incumbency, photo metadata, data confidence). Row count grows as counties are added. |

**Bindings:**
- `skovgard2026-api` Worker: `WY_DB` → `wy` (production) / `wy_preview` (preview env per `[env.preview]` in `worker/wrangler.toml`) — voter matching only, does not read `offices`/`candidates`
- `skovgard-candidates` Worker: `WY_DB` → `wy` only (`Candidates/wrangler.toml` has no preview env block) — reads/writes `offices`, `candidates`, and `polling_locations`

**Detailed field reference:** `Candidates/candidate_data.md`

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
  - `consent_status.source` / `source_detail` distinguish paths such as `web_form` + `pulse`, `web_form` + `donate`, `admin` + `texting_portal`, or `inbound_sms`.
- Export-oriented profile fields:
  - `first_name`
  - `last_name`
  - `email`
  - `consent_email`
  - `wy_voter`
  - `county` (legacy / optional)
  - `zip`
  - `address1`
  - `address2`
  - `city`
  - `state`
  - `country`
  - `state_house_district`
  - `state_senate_district`
  - `consent_version`
  - `user_agent`
  - `ip_hash`

- District placeholders:
  - `state_house_district` and `state_senate_district` live on `consent_status`.
  - Those fields are populated from `wy_address_district_lookup` when the mirrored Grassroots lookup tables have been loaded into `ballot_sources`.
  - `county` is derivable from the same lookup even though the Pulse form no longer asks the user to choose a county.

## District lookup mirror

- Target database in this repo:
  - `ballot_sources` via the `DB` binding.
  - The lookup tables are separate from `WY_DB`.

- Source of truth for the mirror:
  - `/home/anchor/projects/grassrootsmvt/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
  - Tables mirrored from that project:
    - `voters_addr_norm`
    - `district_coverage`
    - `wy_city_county`

- Mirrored lookup behavior in this repo:
  - Exact match path:
    - Normalize `address1` plus optional `address2`, `city`, and `zip`.
    - Query `wy_address_district_lookup`.
    - If exactly one House/Senate pair matches, save it to `consent_status`.
  - Census fallback path:
    - If the mirrored address tables do not resolve House/Senate, call the US Census geocoder from the Worker.
    - Prefer the coordinates endpoint when `lat/lon` are present.
    - Otherwise call the address endpoint with the submitted mailing address.
    - Read county plus `2024 State Legislative Districts - Upper` / `Lower` from the Census geographies response.
  - Safe fallback path:
    - If neither the mirror nor Census resolves the address, query `wy_district_coverage`.
    - Only use the coverage fallback when a city resolves to exactly one House or Senate district.
    - If the city is ambiguous, leave the district field blank instead of guessing.

- Source-data verification snapshot on 2026-03-31:
  - `grassrootsmvt.voters_addr_norm` rows: `274656`
  - Deduped exact address keys (`address + city + zip`): `166323`
  - Exact-address keys with multiple district pairs: `2`
  - `district_coverage` rows: `549`

- Local/remote sync script:
  - [sync-wy-district-lookup.mjs](/home/anchor/projects/skovgard2026/scripts/sync-wy-district-lookup.mjs)
  - Responsibilities:
    - Rebuild `wy_address_district_lookup`
    - Rebuild `wy_district_coverage`
    - Backfill `consent_status.county`
    - Backfill `consent_status.state_house_district`
    - Backfill `consent_status.state_senate_district`
    - Print verification counts after the sync

## Scripts and local mirrors

- [pulse-sync.sh](/home/anchor/projects/skovgard2026/scripts/pulse-sync.sh)
  - Exports `consent_status` from `ballot_sources`.
  - Rebuilds the local Pulse mirror SQLite file.
  - Emits a Pulse CSV snapshot from canonical consent data.

- Local mirror path:
  - `~/projects/data/skovgard2026/data/pulse_local.sqlite`

- Backup path:
  - `~/projects/data/skovgard2026/backups/d1/`

## Notes for future cleanup

- `sms_optins` should remain available until volunteer-tag compatibility and rollback confidence are no longer needed.
- After that, migrate `is_volunteer` off `sms_optins` and remove the remaining compatibility queries/writes.
- `contacts` still exists separately because the texting portal and send-path logic already rely on it; this refactor moved canonical consent/profile data into `consent_status` without rewriting the whole texting model.

## Migration Workflow

All schema changes to `ballot_sources` (and `ballot_sources_preview`) must go through this workflow. Never ALTER or CREATE TABLE in production directly.

### Naming convention

Migration files live in `worker/migrations/` and follow the pattern:

```
NNN_short_description.sql
```

Where `NNN` is a three-digit zero-padded integer (e.g. `022_`, `023_`). Check the last file in `worker/migrations/` to find the next number. Never reuse or skip numbers.

### Required sequence for every migration

**Step 1 — Back up production first**

```bash
./scripts/db_backup.sh
```

This exports a timestamped SQL dump to `backups/` (gitignored). Store a copy off-repo before proceeding. Do not skip this step.

**Step 2 — Write the migration file**

Create `worker/migrations/NNN_description.sql`. Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`, or `CREATE INDEX IF NOT EXISTS` so the file is safe to inspect on an already-migrated database. Include a header comment:

```sql
-- worker/migrations/NNN_description.sql
-- One-line description of what this migration does and why.
```

**Step 3 — Apply to preview first**

```bash
npx wrangler d1 migrations apply ballot_sources_preview --remote --env preview
```

Verify the migration applied cleanly. Confirm the schema change works as expected via the preview Worker or a direct D1 query.

**Step 4 — Apply to production**

```bash
npx wrangler d1 migrations apply ballot_sources --remote --env production
```

Wrangler checks `d1_migrations` and only runs files not yet recorded there. Confirm the output lists only the new migration(s).

**Step 5 — Deploy the Worker**

If the migration changes a table the Worker reads or writes, redeploy:

```bash
./scripts/deploy_worker.sh
```

### If a migration was applied manually before tracking existed

If you applied SQL manually (without `wrangler d1 migrations apply`) and need to mark it as done:

```sql
INSERT OR IGNORE INTO d1_migrations (name, applied_at)
VALUES ('NNN_description.sql', datetime('now'));
```

Apply that INSERT to both `ballot_sources_preview` and `ballot_sources --remote` so both environments agree.

### Migration tracking status

As of 2026-06-22:

- Migrations 001–020: applied manually; seeded into `d1_migrations` retroactively.
- Migration 021 (`021_share_sends_admin_flag.sql`): first migration tracked through `wrangler d1 migrations apply`. Already applied to both production and preview.
- Migration numbering resumes at `022_`.

## Do not commit local data

- Never commit local SQLite mirrors.
- Never commit local SQL/CSV exports.
- Keep all local data files under ignored paths only.
