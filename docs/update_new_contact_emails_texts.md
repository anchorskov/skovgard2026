# Process: Adding New Contacts from Signup Sheets

This document describes the repeatable workflow for importing new contacts collected at events, signup tables, or other in-person outreach into the campaign's SMS and email systems.

The canonical technical spec is [docs/UpsertOptinData.md](UpsertOptinData.md). This document is the human-facing operations guide.

---

## Overview

New contacts arrive as a CSV from a signup sheet (paper or digital). The CSV is transformed into normalized import bundles, verified against a local SQLite test, then applied to the production D1 database (`ballot_sources`).

The admin portals ([/admin/texting/](../static/admin/texting/index.html) and [/admin/emails/](../static/admin/emails/index.html)) surface the new contacts automatically after import — no changes to the HTML files are needed.

---

## Step 1 — Prepare the Source CSV

Raw signup sheets often use different column names than the transform script expects. Normalize the CSV to match the required format before running the transform.

**Required columns:**

```
row,name,email,phone,city_town,opt_in_text,opt_in_email,volunteer,notes
```

**Common source → target column mappings:**

| Source column | Required column |
|---|---|
| `Name` | `name` |
| `Email` | `email` |
| `Phone` | `phone` |
| `CityTown` | `city_town` |
| `TextOptIn` | `opt_in_text` |
| `EmailOptIn` | `opt_in_email` |
| `Volunteer` | `volunteer` |

Add a `row` number column and a `notes` column (can be blank). Use `Yes` or blank for boolean columns.

Save the normalized CSV to the ignored working folder:

```
docs/db/data/optin-import/<source-name>_normalized.csv
```

**Do not commit this file to git.**

---

## Step 2 — Run the Transform

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/transform-optin-csv.mjs \
  --source docs/db/data/optin-import/<source-name>_normalized.csv \
  --output-root docs/db/data/optin-import \
  --run-name <event-YYYY-MM-DD>
```

The transform creates a run directory with:

- `source-audit.csv` — one row per input, shows what was included or skipped and why
- `contacts.csv`, `consent_status.csv`, `newsletter_subscribers.csv`, `sms_optins.csv`, `volunteers.csv`
- `summary.json`

**Review the audit CSV before proceeding.** Common skip reasons:

| `skip_reasons` value | Meaning |
|---|---|
| `text_yes_without_valid_phone` | TextOptIn=Yes but no usable phone number |
| `no_import_targets` | No consent given and no volunteer flag — row not imported |

Flag any rows with suspicious data (incomplete phone numbers, unclear names) and verify with the contact before the production push.

---

## Step 3 — Test Against Local SQLite

```bash
tmp_db=/tmp/skovgard2026-optin-import.sqlite
rm -f "$tmp_db"
for f in worker/migrations/*.sql; do
  sqlite3 "$tmp_db" < "$f"
done

node scripts/optins/upsert-optin-data.mjs \
  --input-dir docs/db/data/optin-import/<run-dir> \
  --sqlite "$tmp_db" \
  --apply
```

Verify the counts look right and spot-check rows:

```bash
sqlite3 -header -column "$tmp_db" "SELECT phone_e164, status, first_name, last_name, email, consent_email, city FROM consent_status ORDER BY phone_e164;"
sqlite3 -header -column "$tmp_db" "SELECT email_norm, consent_email, active FROM newsletter_subscribers ORDER BY email_norm;"
sqlite3 -header -column "$tmp_db" "SELECT first_name, last_name, email, phone, status FROM volunteers ORDER BY last_name;"
```

---

## Step 4 — Push to Production D1

Once the SQLite test looks clean, apply to production:

```bash
cd /home/anchor/projects/skovgard2026
node scripts/optins/upsert-optin-data.mjs \
  --input-dir docs/db/data/optin-import/<run-dir> \
  --remote \
  --env production \
  --apply
```

---

## Step 5 — Verify in Admin Portals

1. Open [/admin/texting/](https://www.skovgard2026.org/admin/texting/index.html), authenticate, and confirm new contacts appear in the Contacts table.
2. Open [/admin/emails/](https://www.skovgard2026.org/admin/emails/index.html), authenticate, and confirm new email opt-ins appear under the Emailable filter.

---

## Data Quality Checklist

Before the production push, confirm:

- [ ] All TextOptIn=Yes rows have a valid 10-digit US phone number
- [ ] Phone numbers with `?`, `(?)`, or partial digits are verified or removed
- [ ] Email addresses look valid (no typos, correct domain)
- [ ] Volunteer=Yes rows without a phone are expected (volunteer-only rows skip `sms_optins`)
- [ ] Contacts with no opt-in and no volunteer flag are expected to be skipped

---

## Example: Sheridan Contacts — 2026-05-11

**Source file:** `C:\Users\ancho\Downloads\sheridan_contacts.csv` (Windows), mounted at `/mnt/c/Users/ancho/Downloads/sheridan_contacts.csv` in WSL.

**Normalized to:** `docs/db/data/optin-import/sheridan_contacts_normalized.csv`

**Run dir:** `docs/db/data/optin-import/sheridan-2026-05-11`

**Results:**

| Name | SMS | Email | Volunteer | Notes |
|---|---|---|---|---|
| Carol Gregory | ✗ skipped | ✗ | — | TextOptIn=Yes but no phone; email not opted in |
| Amy Jolley | — | ✓ | — | |
| Rosie Berger | — | ✓ | — | |
| Daisy Delaney | ✗ skipped | ✗ | — | TextOptIn=Yes but no phone; email not opted in |
| Karen Zinel | ✓ | — | — | SMS only |
| Ron Ziniel | — | ✓ | — | |
| Pat Trout | ✗ skipped | ✗ | — | No opt-in indicated |
| Christine Roberts | ✓ | ✓ | ✓ | Full opt-in |
| Patty Gingles | ⚠️ hold | — | ✓ | Phone `307-683-308(?)` is incomplete — verify before production |

**Counts imported (SQLite test):** 3 SMS, 4 email, 2 volunteers.

**Action items before production:**
- Confirm Patty Gingles' complete phone number.
- Confirm whether Carol Gregory and Daisy Delaney should also opt into email.

---

## File Hygiene

- **Never commit** raw signup CSVs, normalized CSVs, or generated SQL/CSV output files.
- All working files live under `docs/db/data/optin-import/` which is git-ignored.
- The only committed artifacts from this workflow are: this doc and any updates to `AGENTS.md` or `CLAUDE.md`.
