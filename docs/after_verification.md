# After Email Verification

This runbook describes what to do after the production EmailListVerify queue
finishes. Its goal is to create a reliable, district-aware pool of active
registered voters who have both a verified-good email and a best phone number,
then support planning for the 2026 candidate-choice poll volunteer calling
workflow.

Do not treat possession of an email address or phone number as consent to
contact. The output described here is a **pre-consent data-quality view**, not a
send list or call list.

## Systems and database boundary

The required data currently spans two Cloudflare D1 databases:

| Data | Database | Binding in `worker/wrangler.toml` |
|---|---|---|
| `email_verification_queue` | `ballot_sources` | `DB` |
| `voter_emails`, `v_best_email`, `v_best_phone`, `voter_registry_detail` | `wy` | `WY_DB` |

An ordinary D1 view cannot join across these databases. Adding `voter_id` to
`email_verification_queue` would not remove that limitation and would model the
data poorly: verification describes an email address, while `voter_emails`
already provides the potentially one-to-many `email_norm` → `voter_id` bridge.

The intended design is therefore:

```text
ballot_sources.email_verification_queue
                ↓ controlled mirror
wy.email_verification_results_mirror
                ↓ email_norm
wy.voter_emails
                ↓ voter_id
wy.voter_registry_detail + wy.v_best_phone
                ↓
pre-consent poll-calling and district-distribution views
```

## Phase 1 — Finish and verify the current run

1. Confirm the production target before querying:
   - Project config: `worker/wrangler.toml`
   - Worker base name: `skovgard2026-api`
   - `DB` production database: `ballot_sources`
   - `WY_DB` production database: `wy`
   - Production queries use `--remote` and the appropriate environment.
2. Query `email_verification_queue` and verify:
   - `COUNT(*)` total
   - `checked_at IS NOT NULL` processed
   - `checked_at IS NULL` remaining
   - Breakdown by `verdict` and `status`
   - Most recent `checked_at`
3. Wait until the remaining count is zero and confirm the cron is no longer
   finding unchecked rows.
4. Preserve a dated aggregate report of the completed run. Do not export or
   commit raw email addresses.

The cron runs against production `ballot_sources`. A local D1 database or
`ballot_sources_preview` is not evidence that the production run completed.

## Phase 2 — Audit addresses missing from the queue

Queue completion only proves that every **queued** address was checked. It does
not prove that every voter email was placed in the queue.

After the main run finishes, compare normalized emails from the intended voter
source against all `email_verification_queue.email_norm` values. At minimum,
audit active `voter_registry_detail` rows joined through:

```text
voter_registry_detail
  → voter_emails
  → v_best_phone
```

Produce aggregate counts for:

- Present in the queue and checked
- Present in the queue but unchecked
- Missing from the queue
- Duplicate email-to-voter relationships
- Voters with multiple email addresses
- Emails associated with multiple voter IDs
- Missing counts by House district, Senate district, and county

A prior working analysis found an apparent House District 2 coverage gap that
was caused by unqueued and unchecked addresses, not an absence of voter
phone/email data. Treat any zero or unusually low district as a linkage or
queue-seeding problem until investigated.

Do not silently add missing addresses to production. First document the source,
normalization rule, deduplication behavior, and expected count.

## Phase 3 — Run a supplemental verification pass

If the audit finds valid addresses that were never queued:

1. Back up `ballot_sources` with `./scripts/db_backup.sh`.
2. Prepare an idempotent import that adds only missing normalized addresses.
3. Test the import against an isolated/local database and
   `ballot_sources_preview` first.
4. Report expected insert counts and obtain user confirmation before the
   production write.
5. Insert without changing existing verification results.
6. Let EmailListVerify process the supplemental rows.
7. Repeat the completion and district-gap audit.

Do not proceed to an authoritative mirror snapshot until both the main and
supplemental runs are complete.

## Phase 4 — Back up and prepare the `wy` schema

The `wy` database is shared by multiple projects. Before any schema or data
change, verify its binding, database name, database ID, remote/local target, and
the consumers that read it.

Any schema change targeting `wy` belongs in `worker/wy_migrations/`, **not**
`worker/migrations/`. Files in `worker/migrations/` are scanned as
`ballot_sources` migrations and must never contain `wy` SQL.

Before production:

1. Back up the affected databases.
2. Check the highest existing migration number in `worker/wy_migrations/`.
3. Create the next sequential, idempotent migration.
4. Test against the intended local `wy` backing database.
5. Verify row counts, indexes, query plans, and downstream compatibility.
6. Apply the `wy` migration manually only after user approval.

## Phase 5 — Mirror verification results into `wy`

Create a table similar to:

```sql
CREATE TABLE IF NOT EXISTS email_verification_results_mirror (
  email_norm       TEXT PRIMARY KEY,
  status           TEXT,
  verdict          TEXT,
  checked_at       TEXT,
  source_database  TEXT NOT NULL DEFAULT 'ballot_sources',
  mirrored_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The final migration must include appropriate indexes and provenance fields.
Do not copy unnecessary personal data into the mirror.

Create a dedicated sync script that:

1. Reads only required fields from production `ballot_sources`.
2. Normalizes and validates `email_norm` consistently.
3. Writes SQL or a reviewable staging artifact before applying changes.
4. Defaults to dry-run/no-write behavior.
5. Reports inserts, changed verification results, unchanged rows, and errors.
6. Applies only with an explicit flag and confirmed target.
7. Never deletes verification history merely because a source row is absent.

Because verification results may be corrected or refreshed, document the
mirror's update policy explicitly. Do not rewrite unrelated operational history.

## Phase 6 — Create the pre-consent contact-quality view

Once the mirror is populated, create a view in `wy` similar to:

```sql
CREATE VIEW v_poll_call_candidates_preconsent AS
SELECT
  vr.voter_id,
  vr.first_name,
  vr.last_name,
  vr.house_district,
  vr.senate_district,
  vr.county,
  vr.precinct,
  vr.political_party,
  ve.email_norm,
  ev.verdict AS email_verdict,
  ev.status AS email_status,
  ev.checked_at AS email_checked_at,
  bp.phone_e164,
  bp.confidence_code AS phone_confidence_code
FROM voter_registry_detail vr
JOIN voter_emails ve
  ON ve.voter_id = vr.voter_id
JOIN email_verification_results_mirror ev
  ON ev.email_norm = ve.email_norm
 AND ev.verdict = 'good'
JOIN v_best_phone bp
  ON bp.voter_id = vr.voter_id
WHERE LOWER(TRIM(COALESCE(vr.status, 'active'))) = 'active'
  AND TRIM(COALESCE(bp.phone_e164, '')) != '';
```

Treat this SQL as a design example, not a migration ready to apply. Before
finalizing it, decide and document:

- Phone-confidence requirements
- Handling voters with multiple good emails
- Handling emails associated with multiple voters
- District normalization (`2` versus `02`)
- Whether one row per voter or one row per voter/email pair is required
- How stale registry, phone, or email records are excluded

The name must retain `preconsent` unless the view actually applies the canonical
cross-project communication-consent record.

## Phase 7 — Create district-distribution views

Create aggregate views for House and Senate planning, for example:

- `v_poll_call_house_distribution`
- `v_poll_call_senate_distribution`

Each should expose, where available:

- District
- Active registered-voter total
- Registered voters with an email
- Registered voters with a best phone
- Registered voters with both
- Addresses present in the verification mirror
- Good, risky, bad, and unchecked verification counts
- Good-email voters with a best phone
- Coverage percentage relative to active registered voters

Use left joins from the complete district set so a missing district appears as
zero rather than disappearing from the report.

Do not store fixed district counts in documentation. Query the views whenever a
current planning number is needed.

## Phase 8 — Validate before outreach planning

Validation must include:

1. All expected House and Senate districts appear.
2. No unexplained zero-count district remains.
3. Statewide totals reconcile with detail rows.
4. One-row-per-voter and one-row-per-email counts are reported separately.
5. Coverage percentages use active registered voters as their denominator.
6. Phone/email duplicates and cross-voter email matches are quantified.
7. Samples are manually checked without publishing personal data.
8. Local and production query behavior is compared against the intended target.

If a district remains anomalous, stop and investigate the source pipeline before
using the view for volunteer quotas.

## Phase 9 — Apply consent and operational exclusions

The pre-consent view is not authorization to call, text, or email.

The canonical cross-project consent record is
`~/projects/voterdata/wyoming/wy.sqlite` (`comms_consent` / `comms_events`).
This repo does not read or write it directly, and no automated sync from this
repo's collection tables exists.

Before producing volunteer assignments, define a user-approved process for:

- Phone do-not-call events
- Wrong-number reports
- Email opt-outs and suppressions
- Prior call attempts and attempt limits
- One-time permission to email a poll link
- Matching records to the canonical `person_id`

Do not infer general newsletter or campaign-email consent from permission to
send one candidate-choice poll link.

## Phase 10 — Volunteer pilot handoff

Only after the data and consent workflow is validated should the project create
volunteer assignments.

Begin with a small pilot and record append-only call events. Measure:

- Calls attempted per hour
- Valid-phone and wrong-number rates
- Live-answer rate
- Permission rate for one poll email
- Email delivery and link-open rates
- Completed candidate-choice ballots
- Do-not-call and complaint rates
- Results by House and Senate district

Use observed pilot conversion rates to set the final respondent goal and
volunteer requirement. Do not describe the voluntary candidate-choice poll as a
scientific or representative statewide poll.

## Completion checklist

- [ ] Main verification queue complete in production
- [ ] Missing-from-queue audit complete
- [ ] Supplemental addresses reviewed and verified
- [ ] Production backups completed
- [ ] `wy` migration tested locally
- [ ] Verification mirror populated and reconciled
- [ ] Pre-consent view validated
- [ ] House and Senate aggregate views validated
- [ ] Consent/suppression handoff approved
- [ ] Volunteer pilot design approved
- [ ] No raw voter contact exports committed

