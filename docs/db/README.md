# Skovgard2026 Database: Master Index

Purpose: document our data model, its sources, and how data flows through the project.  
Source of truth: Cloudflare D1 in production, with a local-only SQLite mirror for localhost testing.

## Environments

- **Master DB (production binding):** `ballot_sources`  
  Bound as `DB` in `worker/wrangler.toml`. Holds opt-ins and volunteers.

- **Secondary DBs:**  
  - `events_db` — Town Hall and topic data for the site experience.  
  - `events_db_preview` — Preview subset of the events schema for testing.

## Data flow overview

**Inputs → Worker → D1 → Local mirror → Analytics and ops**

1. **Inputs**
   - Web forms and SMS capture new contacts and preferences.
   - Coordinator updates add or edit volunteer records.

2. **Worker**
   - Validates requests and rate limits submissions.
   - Writes to the master DB tables.

3. **D1 (production)**
   - Stores authoritative rows for opt-ins, volunteers, and submission logs.

4. **Local mirror (SQLite)**
   - `~/projects/data/skovgard2026/data/pulse_local.sqlite` is a local-only copy.
   - Refreshed via scripts, never committed to Git.

5. **Analytics and ops**
   - CSV snapshots in `~/projects/data/skovgard2026/backups/d1/`.
   - Used for analysis, assignments, and messaging plans.

## Databases and tables

### Master: `ballot_sources`

| Table           | Purpose |
|-----------------|---------|
| `sms_optins`    | Phone and email opt-ins collected via web flows. Includes consent flags and minimal demographics for targeting. Unique index on `phone`. |
| `volunteers`    | People who raised a hand to help. Minimal schema with `tags_json` for skills and availability. Unique indexes on `email` and `phone` when present. |
| `rl_submissions`| Rate limit ledger that stores `ip_hash` and timestamps to throttle abusive or accidental repeat posts. |
| `ballot_sources`| Registry of reference links and labels used by the Worker or admin tools for election resources. |
| `d1_migrations` | System table for applied migrations. Not documented further. |
| `_cf_KV`        | System table created by Cloudflare. Not documented further. |

### Secondary: `events_db`

| Table              | Purpose |
|--------------------|---------|
| `candidates`       | Public candidates data for the site’s civic features. |
| `events`           | Site events or Town Hall sessions stored for discovery. |
| `topic_index`      | Normalized list of topics and friendly slugs for routing and search. |
| `topic_requests`   | Incoming requests for new topics from users. |
| `townhall_posts`   | Posts or messages within a Town Hall thread. |
| `user_preferences` | Site-level preferences and flags per user. |
| `user_topic_prefs` | User follows, mutes, or priority on topics. |
| `d1_migrations`    | System table for applied migrations. Not documented further. |
| `_cf_KV`           | System table created by Cloudflare. Not documented further. |

### Secondary: `events_db_preview`

Subset of the events schema for safe preview builds.

| Table           | Purpose |
|-----------------|---------|
| `candidates`    | Same structure as production, smaller set. |
| `events`        | Preview events used during testing. |
| `townhall_posts`| Preview posts used during testing. |
| `d1_migrations` | System table for applied migrations. Not documented further. |
| `_cf_KV`        | System table created by Cloudflare. Not documented further. |

## Field notes and standards

- **IDs**: text UUID or ULID, lowercase.
- **Timestamps**: UTC in ISO-like format, for example `2025-09-29T14:00:00.000Z`.
- **Phones**: store as E.164 when practical.
- **Email**: normalize to lowercase.
- **Consent**: `consent` for SMS, `consent_email` for email. Track `consent_version` for disclosures.
- **JSON**: flexible columns stored as JSON text. `tags_json` in `volunteers` is for skills, availability, and flags.

## Scripts

- `scripts/pulse-sync.sh` — mirror `sms_optins` into local SQLite and CSV.  
- `scripts/volunteers-sync.sh` — mirror `volunteers` into local SQLite and CSV.  
- Optional combined refresh can rebuild both tables into the local mirror.

## Do not commit local data

- Local DB: `~/projects/data/skovgard2026/data/pulse_local.sqlite`  
- Backups: `~/projects/data/skovgard2026/backups/d1/`  
- Covered by `.gitignore`. Never add these paths to the repo.

