<!-- docs/UpsertOptinData.md -->
# Upsert Opt-In Data

This document covers the CSV transform and import workflow for signup-sheet style opt-in data in the `skovgard2026` repo.

## Current Source Of Truth

- Primary application DB: `ballot_sources`, bound as `DB` in [worker/wrangler.toml](/home/anchor/projects/skovgard2026/worker/wrangler.toml).
- Canonical SMS consent: `consent_status`.
- Texting-facing contact identity: `contacts`.
- Canonical email consent: `newsletter_subscribers`.
- Volunteer compatibility flag for texting/admin audience queries: `sms_optins.is_volunteer`.
- Operational volunteer intake table: `volunteers`.
- `WY_DB` is separate. It is only for voter matching and phone mirroring. This workflow does not import into `WY_DB`.

## Canonical Vs Compatibility

- Canonical tables:
  - `consent_status`
  - `contacts`
  - `newsletter_subscribers`
- Compatibility / operational tables:
  - `sms_optins`
    Current role here is volunteer compatibility, not canonical SMS consent.
  - `volunteers`
    This holds volunteer intake records, even for rows that do not create `consent_status`.

## Standard Working Folder

- Raw CSV working copies and generated CSV output for this workflow belong under:
  - `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/`
- `.gitignore` already ignores `/home/anchor/projects/skovgard2026/docs/db/data/`.
- Do not commit raw signup CSV files.
- Do not commit generated CSV output, generated SQL, or temp SQLite files.

## Expected Source CSV

The transform script expects these columns:

```text
row,name,email,phone,city_town,opt_in_text,opt_in_email,volunteer,notes
```

Normalization rules:

- Trim whitespace on all text fields.
- Lowercase email before importing.
- Normalize phone to the repo's E.164 convention when possible.
- Convert `Yes` and blank values to the exact booleans and integers needed by the target tables.
- Do not invent address, county, district, voter-match, state, or country data when the source CSV does not provide it.

## Name Parsing Rule

Combined names are collapsed to the first person only.

- Split on ` and `, ` & `, ` / `, or ` + `.
- If the first segment already has a full name, keep it.
- If the first segment is only a first name and the trailing segment clearly carries a shared surname, attach that surname.
- If parsing is uncertain, keep the safest first-person interpretation.

Example:

```text
Becky and Larry Salvador -> Becky Salvador
```

Raw input names stay in the transform audit CSV only. They are not written into permanent tables because none of the target schemas have a dedicated raw-name column.

## Target Tables And Field Mapping

### `contacts`

Used when `opt_in_text=Yes` and a valid phone normalizes to E.164.

| Source column | Target column |
|---|---|
| `name` | `first_name`, `last_name` |
| `phone` | `phone_e164` |
| import metadata | `created_at`, `updated_at` |
| no source field | `tags` = blank |
| no source field | `welcome_sent_at` = blank |

### `consent_status`

Used when `opt_in_text=Yes` and a valid phone normalizes to E.164.

| Source column | Target column |
|---|---|
| `phone` | `phone_e164` |
| `name` | `first_name`, `last_name` |
| `email` | `email` |
| `city_town` | `city` |
| `opt_in_text=Yes` | `status='opted_in'`, `consented_at=<transform timestamp>` |
| `opt_in_email=Yes` | `consent_email=1` |
| `opt_in_email` blank | `consent_email=0` |
| no source field | `source='manual_import'` |
| no source field | `source_detail='signup_sheet_csv'` |
| no source field | `consent_version=<transform consent version>` |
| no source field | `created_at`, `updated_at=<transform timestamp>` |

Columns left blank on purpose:

- `wy_voter`
- `county`
- `zip`
- `address1`
- `address2`
- `state`
- `country`
- `state_house_district`
- `state_senate_district`
- `user_agent`
- `ip_hash`
- `revoked_at`
- `last_inbound_keyword`

### `newsletter_subscribers`

Used when `opt_in_email=Yes` and email is valid.

| Source column | Target column |
|---|---|
| `email` | `email`, `email_norm` |
| `opt_in_email=Yes` | `consent_email=1`, `active=1` |
| no source field | `consent_version=<transform consent version>` |
| no source field | `source='skovgard2026:signup_sheet_import'` |
| no source field | `created_at`, `updated_at=<transform timestamp>` |

Columns left blank on purpose:

- `confirmed_at`
- `user_agent`
- `ip_hash`

### `sms_optins`

Used only for volunteer compatibility rows when `volunteer=Yes` and a valid phone exists.

| Source column | Target column |
|---|---|
| `name` | `name`, `first_name`, `last_name` |
| `phone` | `phone` digits-only legacy key |
| `email` | `email` |
| `opt_in_text=Yes` | `consent=1` |
| `opt_in_text` blank | `consent=0` |
| `opt_in_email=Yes` | `consent_email=1` |
| `volunteer=Yes` | `is_volunteer=1` |
| no source field | `consent_version=<transform consent version>` |
| no source field | `source='skovgard2026:signup_sheet_import'` |
| no source field | `created_at=<transform timestamp>` |

Columns left blank or defaulted on purpose:

- `user_agent`
- `ip_hash`
- `county`
- `zip`
- `wy_voter` defaults to `0` during import if blank

### `volunteers`

Used when `volunteer=Yes`, even if the row does not create a canonical SMS consent row.

| Source column | Target column |
|---|---|
| generated from normalized phone/email/name | `id` |
| `name` | `first_name`, `last_name` |
| `email` | `email` |
| `phone` | `phone` |
| `notes` | `notes` |
| no source field | `source='import'` |
| no source field | `status='new'` |
| no source field | `tags_json='[]'` |
| no source field | `created_at`, `updated_at=<transform timestamp>` |

## Conservative Upsert Behavior

The import script is intentionally conservative.

- Existing `consent_status.status='opted_out'` rows are not reactivated by this import.
- Existing inactive newsletter rows are not reactivated by this import.
- Existing volunteer rows are matched by phone and email before insert, then updated by `id`.
- Existing profile fields are generally filled when blank rather than overwritten aggressively.

## Transform Step

Example with the current signup file from Windows Downloads mounted in WSL:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/transform-optin-csv.mjs \
  --source /mnt/c/Users/ancho/Downloads/signup_optins_lines_1_2_5_7_8.csv \
  --output-root /home/anchor/projects/skovgard2026/docs/db/data/optin-import
```

This creates a run directory under `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/` containing:

- `source-audit.csv`
- `contacts.csv`
- `consent_status.csv`
- `newsletter_subscribers.csv`
- `sms_optins.csv`
- `volunteers.csv`
- `summary.json`

## Local Import Step

### Safe isolated SQLite test

Create a temp SQLite DB from the current repo migrations, then import into that DB:

```bash
cd /home/anchor/projects/skovgard2026
tmp_db=/tmp/skovgard2026-optin-import.sqlite
rm -f "$tmp_db"
for f in worker/migrations/*.sql; do
  sqlite3 "$tmp_db" < "$f"
done

node scripts/optins/upsert-optin-data.mjs \
  --input-dir /home/anchor/projects/skovgard2026/docs/db/data/optin-import/<run-dir> \
  --sqlite "$tmp_db" \
  --apply
```

### Local D1 state

Apply the generated SQL to the repo's local `ballot_sources` D1 state:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/upsert-optin-data.mjs \
  --input-dir /home/anchor/projects/skovgard2026/docs/db/data/optin-import/<run-dir> \
  --local \
  --apply
```

### Remote D1

Preview or production can be targeted explicitly:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/upsert-optin-data.mjs \
  --input-dir /home/anchor/projects/skovgard2026/docs/db/data/optin-import/<run-dir> \
  --remote \
  --env production \
  --apply
```

The import script also writes:

- `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/<run-dir>/generated-upsert.sql`

## Verification Queries

### Check canonical SMS rows

```bash
sqlite3 -header -column /tmp/skovgard2026-optin-import.sqlite "
SELECT phone_e164, status, first_name, last_name, email, consent_email, city
FROM consent_status
ORDER BY phone_e164;
"
```

### Check canonical email rows

```bash
sqlite3 -header -column /tmp/skovgard2026-optin-import.sqlite "
SELECT email_norm, consent_email, active, source
FROM newsletter_subscribers
ORDER BY email_norm;
"
```

### Check volunteer compatibility rows

```bash
sqlite3 -header -column /tmp/skovgard2026-optin-import.sqlite "
SELECT phone, consent, consent_email, is_volunteer, first_name, last_name
FROM sms_optins
ORDER BY phone;
"
```

### Check volunteer intake rows

```bash
sqlite3 -header -column /tmp/skovgard2026-optin-import.sqlite "
SELECT id, first_name, last_name, email, phone, status, notes
FROM volunteers
ORDER BY COALESCE(email, phone, id);
"
```

## Duplicate Reruns

The workflow is designed to be rerun safely.

- Run the same `upsert-optin-data.mjs` command again against the same output directory.
- Canonical tables stay keyed by `phone_e164` or `email_norm`.
- `sms_optins` stays keyed by legacy `phone`.
- `volunteers` first resolves existing rows by phone and email, then updates by resolved `id`.

Duplicate rerun check:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/upsert-optin-data.mjs \
  --input-dir /home/anchor/projects/skovgard2026/docs/db/data/optin-import/<run-dir> \
  --sqlite /tmp/skovgard2026-optin-import.sqlite \
  --apply
```

Re-run the same command and confirm row counts stay stable.

## Automated Test

Use the built-in workflow test:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/test-optin-import.mjs /mnt/c/Users/ancho/Downloads/signup_optins_lines_1_2_5_7_8.csv
```

That test:

- builds a temp SQLite DB from `worker/migrations/*.sql`
- uses the real signup rows from `/mnt/c/Users/ancho/Downloads/signup_optins_lines_1_2_5_7_8.csv`
- adds synthetic rows for volunteer-only and safety cases
- verifies transform counts
- verifies import counts
- verifies combined-name parsing
- verifies volunteer compatibility behavior
- verifies duplicate reruns

## Do Not Commit Local Data

- Never commit raw signup CSVs.
- Never commit generated transform CSVs.
- Never commit generated SQL files.
- Never commit temp SQLite files.
- Keep all of them under ignored paths such as `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/` or `/tmp`.
