<!-- docs/db/EmailConsolidationPlan.md -->
# Email Contact Consolidation Plan

Status: **draft / living document** — this plan will change as decisions are made. Add
dated entries to the Decisions Log at the bottom rather than silently rewriting history.

Last updated: 2026-07-07

Purpose: today, "who do we have an email for and why" is spread across ~10 tables in
two databases, each built to solve one problem at a time (opt-ins, volunteers,
candidates, hunters, a voter-file import). This document inventories what exists,
names the real decision this project faces, and lays out a phased plan toward one
canonical contact table instead of one table per purpose.

## 1. Current state — every table touching email

### `ballot_sources` (this repo's D1, binding `DB`)

| Table | Purpose | Notes |
|---|---|---|
| `consent_status` | Canonical SMS consent + profile (name/email/address/district) | Keyed by `phone_e164` |
| `contacts` | Texting-facing identity | Keyed by `phone_e164` |
| `newsletter_subscribers` | Canonical **email** consent | Keyed by `email_norm`; treated as authoritative for `consent_email` |
| `sms_optins` | Legacy compatibility table | Still the only place `is_volunteer` lives; still joined live into every admin-email audience query |
| `email_suppressions` | Hard suppression list | Driven only by Resend bounce/complaint webhooks |
| `volunteers` | Volunteer intake | Independent of consent tables; has its own `status`/`tags_json` |
| `donors` | FEC donor-of-record | Has `email`, but a legally distinct relationship, not an outreach list |
| `email_blast_jobs` / `email_blast_log` / `email_optin_tokens` / `share_sends` | Send-pipeline plumbing | Not contact-identity tables, but reference email addresses |

### `wy` DB (shared D1, binding `WY_DB`, owned jointly with Candidates/grassrootsmvt/voterdata projects)

| Table / view | Purpose | Notes |
|---|---|---|
| `voter_emails` | Raw matched/unmatched email inventory (includes the "hunters" source data) | "Hunters" is a `source` tag on rows here, not its own table |
| `voter_demographics`, `deliverable_stage_norm` | The ~89k-row deliverable import and its voter-registry match/staleness computation | `deliverable_stage_norm` has no dedupe key yet |
| `v_unique_name_email_not_stale` | The view the Blast page's `voter_file` audience filter actually queries (~61.6k rows) | Not opt-in-gated — excludes opt-outs only |
| `candidates` / `candidate_email_suppressions` | Filed-candidate outreach (Candidates sub-project) | Different consent model: public filer, not subscriber |

### Outside this repo, but relevant

`voterdata/wyoming` already defines a **fleet-wide canonical model** — `people` +
`comms_consent(person_id, channel, status)` + audit history — intended to be the
single source of truth across all Wyoming projects. Its own docs state that no
project currently syncs to it, and that resolving phone/email to a shared
`person_id` across projects is "an open problem, not a solved one."

## 2. The real decision

Two paths, not one:

- **(A) Local canonical table**, scoped to skovgard2026 only, in `ballot_sources`.
  Fast, fully under this repo's control, reversible. Downside: becomes one more
  local collection point alongside the ones the fleet-wide doc already flags as
  drifted.
- **(B) Sync into the existing fleet-wide `comms_consent` model.** Avoids building
  a competing design, but requires identity resolution across projects that
  doesn't exist yet, and cross-repo coordination this repo doesn't own.

**Decision (2026-07-07): proceed with (A) first.** Per this repo's Project Scope
Guard, we don't inherit another repo's schema as authoritative without an explicit
decision to do so, and the identity-resolution prerequisite for (B) isn't solved
anywhere in the fleet yet. A well-shaped local table is also a smaller, reversible
step that doesn't foreclose syncing into (B) later if the fleet-wide work matures.

## 3. Scope

**Decision (2026-07-07): everything goes in.** All email data — subscribers,
volunteers, candidates, voter-file/hunters — belongs in one canonical table, not
one table per purpose. This resolves the earlier open Q1: candidate outreach is
in scope, even though `candidates` lives in the separate `WY_DB`. Since D1 can't
join live across databases, candidate rows (and voter-file rows) are brought in
by a one-way sync/copy step, tagged with their source, not a live cross-DB query.

**Out of scope**, still deliberately: `donors` (FEC legal record, not a marketing
list) and one-off transactional fields (guide correction submitter emails,
notification timestamps) — these represent different relationships, not outreach
audiences.

**On voter-file identity linkage**: in an ideal world every contact would carry a
unique ID back to the canonical raw voter file. In practice, only a portion of
records will ever match (the ~89k deliverable import matched roughly half). The
table is designed around that reality — the link (`lalvoterid`) is nullable and
best-effort, not a precondition for a row to exist. We plan and build with the
match rate we actually have, and let it improve over time as re-matching runs.

### 3a. The "purged_voter" category (added 2026-07-07)

The voter-file backfill only loaded rows where `v_unique_name_email_all.is_stale = 0`
(matched an *active* voter in the Aug 2025 registry snapshot). The excluded
`is_stale = 1` rows aren't worthless — a person can be administratively purged
from active rolls for not voting and still be a real, reachable person who just
needs to re-register at the county clerk. **Decision: bring these in too**, as a
distinct, lower-confidence purpose (`purged_voter`, priority 0 — never overwrites
a higher-confidence contact, only adds a purpose tag or fills a gap).

**Important caveat, verified against the live data, not assumed**: as of this
backfill, 0 of the 47,111 stale rows carry `stale_reason =
'voter_status_not_active_in_snapshot'` (an actual matched-but-inactive voter).
The real split is 41,766 with no voter-ID match at all and 5,345 matched to a
voter ID that simply isn't in the Aug 2025 snapshot (moved, deceased, or
genuinely removed — indistinguishable from this data alone).

**The 41,766 "no voter-ID match at all" bucket is broader than "purged."** It
also includes people who have simply never registered to vote — someone who
chose not to register produces the exact same signal here (no voter-ID match)
as someone who registered once, went inactive, and was later removed from the
rolls. We don't have a way to tell those two cases apart from this data alone.
So `purged_voter` is **our own working label covering multiple real
possibilities — administratively purged, moved, deceased, or never registered
at all — not a verified purge status**, and not literally "everyone in this
bucket was purged." Don't present it to end users as confirmed purge data
without re-verifying against a current registry pull.

Reconciliation of the raw source files against final counts:

| Step | Rows / distinct emails | What happens here |
|---|---|---|
| Hunters (2 files) loaded into `voter_emails` | 38,838 | 100% loaded, matches docs/email_guide.md exactly |
| L2 deliverable raw rows staged | 89,275 | Same file also copied into `voter_emails` (87,450 rows had a usable email) |
| Combined + grouped by unique name+email (`v_unique_name_email_all`) | 108,697 / 107,864 | ~17.5k rows dropped here — genuine duplicates/overlap, mostly the same L2 file loaded into two pipeline tables |
| Not stale (matched an active voter) → `voter_file` purpose | 61,586 / 61,220 | ~47.1k dropped here — **not duplicates**, a data-quality/match gap |
| Stale → `purged_voter` purpose | 47,111 / 47,111 | Brought in separately, 2026-07-07, priority 0 |
| Candidates (`WY_DB`) → `candidate` purpose | 1,869 rows / 1,717 emails | Cross-DB, includes 1 suppressed → `opted_out` |
| Same-DB sources → `subscriber` / `volunteer` purposes | 121 rows / 71 emails | `newsletter_subscribers`, `sms_optins.is_volunteer`, `volunteers` |
| **Final `email_contacts` total** | **109,368** | Sum of all of the above minus overlap (467 emails hold both `voter_file` and `purged_voter`, plus smaller overlaps elsewhere) |

## 4. Schema (Phase 1 — implemented)

A single `email_contacts` table in `ballot_sources`, keyed by `email_norm`, plus a
companion `email_contact_purposes` table (not a JSON/tags blob — kept as a real
table per this repo's WORM protocol, so purposes stay queryable and manageable
without a code change):

- **Consent modeled per contact, not implied by table membership** — an explicit
  `consent_status` enum (`opted_in` / `opted_out` / `no_signal`) so that voter-file
  contacts (opt-out-only) and newsletter contacts (opt-in-gated) can coexist in one
  table without conflating the two models.
- **`email_contact_purposes(email_contact_id, purpose, source, added_at)`**,
  unique on `(email_contact_id, purpose)` — replaces "which table is this row in"
  as the signal for why a contact exists. A contact can carry more than one
  purpose (e.g. `subscriber` + `volunteer`).
- **`lalvoterid`** — nullable link to the raw voter file, populated only when a
  match exists. This is the "unique ID back to the canonical voter file" the
  perfect-world version of this table would guarantee for every row; here it's
  best-effort and expected to stay partially populated.
- **Source lineage columns** (`source`, `source_detail`, `import_batch`,
  `first_seen_at`, `updated_at`) so upserts from CSV imports, forms, and webhooks
  stay traceable, matching the existing `consent_status.source` pattern.
- **No stored district data.** `docs/email_guide.md`'s WORM reasoning (a stored
  `senate_district` column was tried once and reverted because live joins
  self-correct and stored copies don't) applies directly here — district stays a
  live join keyed off `lalvoterid`/`email_norm` against `wy_address_district_lookup`
  / `WY_DB`, never a cached column on this table.
- **Suppression stays a separate table**, joined at query time — `email_suppressions`
  already works this way and there's no reason to fold it in.

Implemented in `worker/migrations/026_email_contacts.sql`.

## 5. Open questions remaining (cutover phase)

Resolved during Phase 2:

- ~~`is_volunteer` migration~~ — done. `sms_optins` rows with `is_volunteer=1`
  and `volunteers` table rows both feed `email_contact_purposes(purpose='volunteer')`.
  Rows with no email were correctly excluded (no `email_contacts` row to attach
  a purpose to); phone-only volunteers are unaffected since `sms_optins`/`volunteers`
  keep their own tables for phone-based flows.
- ~~`deliverable_stage_norm` dedupe~~ — sidestepped, not solved: the backfill
  sources voter-file rows from `v_unique_name_email_not_stale`, which already
  groups to unique name+email and resolves staleness. The raw staging table's
  lack of a unique key is still true and still a concern for the `wy` DB's own
  pipeline, just not a blocker for `email_contacts`.

Still open:

1. **Two independent "is this row stale/matched" computations** exist today
   (`voter_demographics.is_stale` vs. the inline recompute inside
   `v_unique_name_email_all`). Worth collapsing to one before any re-sync of
   `email_contacts` from `WY_DB` — right now a re-run would reflect whichever
   inconsistency exists in the view at that time.
2. **Cutover mechanics**: `email_contacts` now holds a full backfilled snapshot
   alongside the existing tables (dual-write hasn't started — new signups still
   only land in the legacy tables until Phase 3). Decide: migrate the admin-email
   audience queries (`ADMIN_EMAIL_CONTACTS_CTE`, `worker/src/index.js:1202-1301`)
   to read from `email_contacts` first and dual-write after, or wire up dual-write
   on every ingestion path first and cut audience queries over once confident?
3. **Re-sync cadence**: the WY_DB-sourced backfill (candidates, voter-file) was a
   one-time snapshot via manually exported JSON. Decide whether/how often
   `scripts/email_contacts_backfill/02_generate_wy_db_backfill.mjs` should be
   re-run as those source tables change, and whether that becomes a scheduled
   job or stays manual.

## 6. Phased plan (high level — will be refined as decisions land)

- **Phase 0 (done)**: inventory + fork decision (this document).
- **Phase 1 (done, 2026-07-07)**: `email_contacts` + `email_contact_purposes`
  schema (`worker/migrations/026_email_contacts.sql`, `027_email_contacts_source_priority.sql`),
  applied to preview and production.
- **Phase 2 (done, 2026-07-07)**: backfilled from all four sources without
  touching/deleting originals. See Decisions Log for final counts. No
  dual-write yet — new signups still only land in the legacy tables.
- **Phase 3 (done, 2026-07-07)**: Blast/Emails Portal audience filters
  (`opted_in` [was `emailable`], `volunteers`, `voter_file`) migrated to read
  from `email_contacts`, additive alongside the untouched legacy CTE (used for
  unmigrated filters and for any filter combined with city/HD/SD narrowing,
  since `email_contacts` stores no district data by design). Added two
  audience options with no prior equivalent: `candidate` and `every_email`.
  `purged_voter` intentionally excluded from the sendable dropdown. Dual-write
  added at 2 hook points (`upsertNewsletterSubscriber`, `applyOptinResponse`)
  — narrowed from an originally-approved 4 after tracing the actual call
  sites showed the other 2 would never fire independently or would conflate
  SMS/bounce signals with explicit email consent (see plan file history via
  `git log -p` on this doc, or the design-decisions section preserved in the
  implementation commit message, for the full reasoning).
  All new-path counts verified directly against production D1 before deploy:
  `opted_in`=62 (exact match to legacy `emailable`), `volunteers`=46,
  `candidate`=1,716, `voter_file`=61,220, `every_email`=62,803. Deployed to
  production (`skovgard2026-api` Worker + Astro Pages), commit `d26e277`.
  **Not yet done**: an authenticated live test-send/blast-job against the new
  `candidate` filter (couldn't authenticate as admin from this environment —
  needs a manual check).
- **Phase 4 (not started)**: once verified in production for a full send cycle,
  retire the superseded tables (`sms_optins`, and any others fully subsumed)
  per this repo's existing "Notes for future cleanup" precedent in
  `docs/db/README.md`. Also revisit the deferred dual-write paths (admin
  contact editor, Telnyx START/HELP, sms_optins volunteer toggle, CSV import)
  and the open questions in §5 (staleness dedup, re-sync cadence).

## Decisions Log

- **2026-07-07**: Initial inventory completed; decided to pursue (A) a
  skovgard2026-local canonical table rather than (B) syncing into the fleet-wide
  `comms_consent` model, given the unsolved cross-project identity-resolution
  prerequisite for (B).
- **2026-07-07**: Scope decided — all email data (subscribers, volunteers,
  candidates, voter-file/hunters) belongs in the one canonical table, including
  sources that live in `WY_DB` (brought in via one-way sync, not a live cross-DB
  join). Voter-file identity linkage (`lalvoterid`) is nullable/best-effort by
  design, not a blocker. Schema implemented in
  `worker/migrations/026_email_contacts.sql`.
- **2026-07-07**: `026_email_contacts.sql` applied to both `ballot_sources_preview`
  and production `ballot_sources`, verified (unique `email_norm` constraint,
  purposes join) on preview before promoting. Purely additive — no existing table
  or Worker code path touched yet, so no redeploy was needed. Phase 1 (schema) is
  complete; Phase 2 (backfill) has not started.
- **2026-07-07**: Dedup method decided — not CSV-mediated merging. Same-DB
  sources (`newsletter_subscribers`, `sms_optins`, `volunteers`) merge via plain
  `INSERT ... SELECT ... ON CONFLICT(email_norm) DO UPDATE`, matching the CASE-
  based per-field merge style already used in `scripts/generate-email-backfill-sql.mjs`.
  Cross-DB sources (`candidates`, `v_unique_name_email_not_stale`) can't be
  joined live from `ballot_sources` — `wrangler d1 execute wy --json` exports
  are merged/deduped in memory (`scripts/email_contacts_backfill/02_generate_wy_db_backfill.mjs`,
  mirroring `scripts/wy_email_pipeline/sync_to_d1.mjs`'s existing pattern) and
  applied as generated SQL, never persisted as a full CSV. Small CSVs (a 6-row
  summary and a 12-row per-purpose sample) were generated to the session
  scratchpad for human review only, per instruction to keep review artifacts
  small — not committed, not a data source.
  - Added `email_contacts.source_priority` (migration `027`) so upserts can
    tell whether an incoming source outranks the value on file without
    re-deriving rank from free-text labels each time.
  - Resolved the `deliverable_stage_norm` dedupe gap (§5, old Q3) by sourcing
    voter-file rows from `v_unique_name_email_not_stale` instead of the raw
    staging table — that view already groups to unique name+email and resolves
    staleness, so the dedupe problem doesn't need solving again here.
  - `consent_status='opted_out'` is sticky across every merge — once any
    source marks a contact opted out, no lower-or-equal-priority source can
    un-set it.
- **2026-07-07**: Phase 2 backfill executed on preview then production. Final
  production state: 62,804 contacts, 63,044 purpose tags (61,220 voter_file,
  1,717 candidate, 61 subscriber, 46 volunteer), 1 opted_out (a suppressed
  candidate email), 41,959 with a `lalvoterid` match. Counts matched exactly
  between the local dry-run, preview, and production before each promotion.
- **2026-07-07**: Added the `purged_voter` category (§3a) — the `is_stale=1`
  rows previously excluded from the voter-file backfill. Verified the data
  doesn't currently distinguish "confirmed inactive voter" from "never
  matched"/"matched ID missing from snapshot" (0 rows carry the
  matched-but-inactive reason), so this is documented as a working label, not a
  verified purge status. Backfilled via
  `scripts/email_contacts_backfill/03_generate_purged_voters_backfill.mjs`,
  priority 0. Applied to preview then production, counts matched exactly
  (47,111 unique emails, 467 overlapping with existing `voter_file` contacts).
  Final production state: **109,368 contacts**, 110,155 purpose tags
  (61,220 voter_file, 47,111 purged_voter, 1,717 candidate, 61 subscriber,
  46 volunteer).
- **2026-07-07**: Phase 3 (Blast cutover) shipped to production. Plan
  reviewed before implementation (`/home/anchor/.claude/plans/glittery-wobbling-parnas.md`)
  and caught two real issues before they shipped: a `purged_voter` leak into
  the new `every_email` filter, and city/HD/SD geo-narrowing silently
  disappearing for migrated filters (fixed by routing any filter+geo
  combination through the existing legacy/WY_DB path, since only those
  sources carry district columns). Scope was narrowed from 4 approved
  dual-write hooks to 2 after tracing real call sites. All new-path SQL
  verified directly against production D1 (exact match to legacy counts)
  before the Worker was deployed. Commit `d26e277`.
