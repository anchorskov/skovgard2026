<!-- AGENTS.md -->
# Agent Instructions for `skovgard2026`

This file is repo-local. It applies only inside:

- `/home/anchor/projects/skovgard2026`
- Git remote: `git@github.com:anchorskov/skovgard2026.git`
- Public site/domain references for this repo: `skovgard2026.org`, `www.skovgard2026.org`, and project assets already used in this codebase

If instructions, names, domains, emails, or policies from another project appear here or in generated work, treat that as drift and do not apply them without explicit user approval.

## Documentation Index

**The entire `docs/` folder is gitignored (as of 2026-07-22)** — every file
listed below exists only on this machine's working copy, not in git or on
any remote. A fresh clone of this repo will have an empty (or absent)
`docs/` folder; none of these are recoverable from git history going
forward. Keep that in mind before assuming a doc will be there after a
clone, rebase onto a fresh checkout, or when handing this repo to someone
else — they'll need these files transferred out-of-band.

**Read `docs/management_of_change.md` before and after making any change to
this project.** It's the canonical method for keeping this repo's
instruction and workflow docs in sync with reality — required reading since
`docs/` is gitignored and `git diff` won't catch drift on its own.

Every file in `docs/` (and its subdirectories), one line each. The topic
sections below also link the relevant doc(s) inline where they're needed —
this table exists so nothing gets orphaned (found 3 unlinked docs on
2026-07-16 before adding this index). **Keep this list current**: add a row
here whenever a new `docs/*.md` file is created, remove the row if a file
is deleted.

| File | What it's for |
|---|---|
| `docs/management_of_change.md` | The method for keeping this repo's instruction/workflow docs in sync with reality — read first |
| `docs/OptinPlan.md` | Opt-in growth plan (email + SMS) — current state, the CSV-import dual-write gap, phased roadmap |
| `docs/PODCAST_WORKFLOW.md` | Operational how-to: adding a hosted episode, multi-part episodes, campaign videos |
| `docs/podcast_notes.md` | Podcast flow architecture + known issues (live-vs-dead file trap, caching incident) |
| `docs/UpsertOptinData.md` | CSV signup-sheet import — technical field mapping and script reference |
| `docs/after_verification.md` | Runbook for after the EmailListVerify queue finishes — poll-audience data-quality phases |
| `docs/blast_tracking.md` | Email Blast flow debugging notes and incident history |
| `docs/cloudflare_workerPlan.md` | Cloudflare Workers account plan tier history and the incident that motivated an upgrade |
| `docs/conf.md` | Local `.dev.vars` secrets management across `worker/`, `Candidates/`, `Guide/` |
| `docs/db/EmailConsolidationPlan.md` | Plan for consolidating ~10 email tables into one canonical `email_contacts` table |
| `docs/db/README.md` | Full D1 schema and data-flow reference — read before any database-related change |
| `docs/db/UserInformationResolutionPlan.md` | Discussion draft for project-wide progressive identity, address, geography, district, consent, and contact resolution |
| `docs/deploy.md` | Cloudflare Pages Git-integration build configuration reference |
| `docs/email_guide.md` | `voter_emails`/`v_best_email` pipeline — schema, tiering, match/import process |
| `docs/media/AddCampaignVideo.md` | Adding a campaign video to the site (R2 + D1 mechanics) |
| `docs/media/AddMessage.md` | Canonical process for adding a new video/essay/survey/tool to /messages — includes the required-inputs checklist for asking the user for missing content |
| `docs/polling/AddPollingLocations.md` | Adding polling locations for a new Wyoming county |
| `docs/pulse_flow.md` | `/pulse` opt-in + Citizen Poll flow architecture, data model, and the open unmatched-voter design gap |
| `docs/worker_map.md` | Inventory of Cloudflare Workers/Pages deploy targets, Wrangler version ownership, and the safe Wrangler upgrade runbook |
| `docs/who_needs_to_know.md` | Inventory of every staff/donor notification trigger site-wide — recipient, condition, and known gaps (start here before assuming who gets emailed when) |
| `docs/share/AddShareMessage.md` | Checklist for adding a new `/share/<slug>` shareable message |
| `docs/share/show_shares.md` | Tracks `/share` and `/share/more-shares` card display order (array order, not date-sorted) — update after adding or reordering a share card |
| `docs/social_media.md` | Open Graph / Twitter card requirements for both `skovgard2026.org` and `candidates.skovgard2026.org` |
| `docs/test_data.md` | Reusable real (not fake) phone/email identities for end-to-end testing |
| `docs/update_new_contact_emails_texts.md` | Human-facing operations guide for the CSV contact-import workflow |
| `docs/ai_philosophy/understanding_agents_start.md` | Starting observations on agent context, working reliability, execution horizon, and drift |
| `docs/security_notes.md` | Incident log and hard rules for handling secrets in terminal commands — no secret values, key names and lessons only |
| `docs/DonationsFlow.md` | Stripe donation flow: schema, status lifecycle, the abandoned-checkout reconciliation gap and its fix, admin endpoints |

## Framework: Astro (not Hugo)

This project **migrated from Hugo to Astro** in early April 2026. All code changes must target the Astro environment.

- The frontend is an **Astro 6 static site** (`output: 'static'` in `astro.config.mjs`). There is no Hugo build.
- Pages live in `src/pages/` as `.astro` files. Layouts live in `src/layouts/`. Components live in `src/components/`.
- The `content/` directory contains legacy Hugo content files that are **not routed by Astro**. Do not create new pages there.
- `static/` is configured as Astro's `publicDir` (via `publicDir: 'static'` in `astro.config.mjs`). Files in `static/` are served at the site root as static assets.
- Admin pages (`static/admin/texting/index.html`, `static/admin/emails/index.html`) are standalone HTML files served from `static/`, not Astro pages. They load their own CSS/JS directly.
- The build command is `npm run build` (outputs to `dist/`). There is no `hugo` binary involved.
- The local dev server is `npm run dev` (Astro on port 4321), not `hugo server`.
- Do not suggest Hugo commands (`hugo`, `hugo server`, `hugo --minify`), Hugo template syntax (`{{ .Params }}`, `{{ partial }}`), Hugo pipes (`resources.Get | fingerprint`), or Hugo config files (`config.toml`, `config/_default/`). None of these exist in the project.
- If you encounter references to Hugo patterns in older files or memory, treat them as outdated and do not apply them.

## Project Scope Guard

- Do not import policy from other repos or organizations into this repo just because names or files look similar.
- If a rule mentions another project by name, stop treating it as authoritative for this repo unless the user explicitly says to reuse it here.
- Prefer values already established in this repo over values remembered from other work.
- Before changing public-facing campaign identity fields such as emails, domains, org names, donation links, form destinations, or legal/contact copy, verify them against this repo first.

## Brand System (theme-frontier)

The locked brand specification for this branch lives in `brand/BRAND.md`.
Read it before generating front-end code, campaign copy, or visual assets.

### Hard rules

- NEVER introduce a color not defined in `brand/palette.json`.
- Treat `wy-*` token names as intentional legacy aliases. On this branch:
  - `wy-navy` maps to charcoal, not blue
  - `wy-gold` maps to sandstone
  - `wy-stone` maps to bone
  - `wy-sky` maps to sage
- NEVER "correct" those alias names by intuition alone. Check `src/styles/global.css` first.
- NEVER swap the primary fonts on this branch. Headlines: Bitter. Body/UI: Source Sans 3.
  Merriweather and Inter remain fallbacks only.
- Bone (`#F1ECE1`) is the dominant background. Charcoal (`#2B2B2B`) is the structural dark.
- Ember (`#B22234`) is the primary accent. Ember-dark (`#8B1A26`) is hover/pressed state only.
- Sandstone is the secondary warm accent. Sage is quiet support chrome, not lead CTA color.
- Do not import the `theme-civic` palette, tokens, or rules onto this branch unless the user explicitly asks.
- Do NOT use the Wyoming Bucking Horse trademark in campaign materials.
- If a brand decision is ambiguous, say so and ask instead of guessing.

### Brand files

- `brand/BRAND.md` — locked human-readable spec
- `brand/palette.json` — machine-readable token map plus alias rules
- `brand/typography.json` — font families, fallback order, and type rules
- `brand/voice.md` — copy tone, word choice, sentence style
- `brand/photography.md` — image guidance, alt text, settings
- `brand/channel-rules.md` — website, email, social, event, video guidance

### Live implementation reference

The frontier theme is already implemented on this branch. The primary reference files are:

- `src/styles/global.css`
- `src/layouts/Base.astro`
- `src/components/Nav.astro`
- `src/components/Footer.astro`
- `src/pages/index.astro`

If another branch or old chat mentions `theme-civic`, treat that as historical exploration.
For this branch and current campaign media direction, `theme-frontier` is authoritative.

## Local Source of Truth

When deciding what is valid for `skovgard2026`, check local files first:

- `astro.config.mjs` — Astro configuration (site URL, publicDir, integrations)
- `src/pages/` — Astro page routes
- `src/layouts/` — Astro layouts
- `src/components/` — Astro components
- `src/constants.ts` — shared constants (e.g. `MEDIA_BASE_URL`)
- `static/` — static assets served at site root (CSS, JS, images, standalone admin HTML)
- `worker/wrangler.toml` — Worker config, env vars, routes
- `worker/src/` — Worker source code
- repo docs that explicitly describe this site

## Database Reference

**Primary data reference:** `docs/db/README.md` — covers all D1 databases used by this repo, the canonical consent/opt-in model, data flow, district lookup, migration workflow, and which Worker reads/writes each table. Read this before touching any database-related code.

- `ballot_sources` D1 (`DB` binding, production) — campaign app tables: `consent_status`, `contacts`, `newsletter_subscribers`, texting/email audit logs, district lookup mirrors.
- `ballot_sources_preview` D1 (`DB` binding, `[env.preview]` only) — isolated copy of `ballot_sources` for migration testing. Always migrate and verify here before applying to production.
- `wy` D1 (`WY_DB` binding) — Wyoming voter data (voter matching, `voter_phones`, `v_best_phone`, `voter_emails`, `v_best_email`) plus the voter guide tables (`offices`, `candidates`). Production: `--remote`. Local dev: no flag (local SQLite in `.wrangler/state/`).
- Voter guide detail: `Candidates/candidate_data.md` — field-by-field reference for `offices` and `candidates`.
- Voter email pipeline detail: `docs/email_guide.md` — `voter_emails`/`v_best_email` schema, why it spans `voterdata/wyoming` + `grassrootsmvt` + this repo, and the full match/tier/import/production-sync process. Read this before adding a new email source or touching `voter_emails`.
- Post-verification candidate-choice poll planning: `docs/after_verification.md` — required sequence after EmailListVerify completes: audit addresses missing from the queue, run any supplemental verification, mirror verification results into `wy`, build pre-consent voter phone/email and district-distribution views, validate district coverage, and resolve canonical consent handling before volunteer assignments. Read this before changing or operationalizing that flow.
- Email/demographics linkage pipeline (`voter_demographics`, `voter_registry_detail`, `people`, `deliverable_stage_norm`, and the `v_unique_name_email_*` / `v_demographics_email` views) — the only `wy` objects whose schema is tracked in this repo (`worker/wy_migrations/024_wy_email_demographics_pipeline.sql` — note the separate folder, see below). See `docs/db/README.md` → "Email/demographics linkage pipeline" for the full table and the sync script.

`worker/wy_migrations/` vs. `worker/migrations/`: the latter is `ballot_sources`'s tracked-migration folder, scanned wholesale by `wrangler d1 migrations apply ballot_sources` (by filename, not by which database the SQL targets). Any migration touching the shared `wy` database must go in `worker/wy_migrations/` instead and be applied by hand (`wrangler d1 execute wy --file=...`), never through `migrations apply` — a `wy`-targeted file left in `worker/migrations/` will get run against `ballot_sources` and fail.

These D1 databases support multiple projects and workflows beyond the current task. Renaming, moving, rebinding, replacing, or bulk-rebuilding them can have far-reaching unintended effects outside this repo area. Before any database read, write, migration, import, export, or local mirror change, agents must verify the exact project, `wrangler.toml`, binding name, database name, database id, `--local` vs `--remote` target, and backing local SQLite file when applicable. Do not assume similarly named databases such as `wy`, `wy_preview`, or local mirror files are interchangeable.

## Cross-Project Consent Source of Truth

`~/projects/voterdata/wyoming/wy.sqlite` (`comms_consent` / `comms_events`) is the canonical, cross-project record of communication consent (opt-in/opt-out per channel), maintained by a separate project. This repo does not read or write those tables directly.

- This repo's own consent tables — `consent_status`, `newsletter_subscribers`, `sms_optins` (all in `ballot_sources`) — are collection points only. Do not treat them as authoritative for cross-project suppression or outreach decisions; they only reflect what happened through this campaign's own forms/imports.
- No automated sync from this repo's consent tables into `comms_events` exists. Do not assume one does, and do not build sync/export code for it without checking with the user first — it requires matching local phone/email to a canonical `person_id`, which is an open problem, not a solved one.
- If a task ever requires cross-referencing against the canonical consent record, treat `voterdata/wyoming`'s own docs (`docs/OptinOptout.md`, `docs/CommsEventMapping.md`) as authoritative for that lookup — don't duplicate their keyword vocabulary (STOP/START/UNSUBSCRIBE mapping) here from memory.

## D1 Migration Workflow

Full workflow with naming convention, backup step, and tracking notes: `docs/db/README.md` → "Migration Workflow".

Required steps for any `ballot_sources` schema change:

1. **Back up**: `./scripts/db_backup.sh` — timestamped SQL dump to `backups/` (gitignored). Do not skip.
2. **Write**: create `worker/migrations/NNN_description.sql` (three-digit sequential number). Use `IF NOT EXISTS` forms.
3. **Preview first**: `npx wrangler d1 migrations apply ballot_sources_preview --remote --env preview` — verify before touching production.
4. **Production**: `npx wrangler d1 migrations apply ballot_sources --remote --env production`
5. **Redeploy Worker** if the migration affects a table the Worker reads or writes: `./scripts/deploy_worker.sh`

Use the next available number after the highest `NNN_` file already in `worker/migrations/` — do not hardcode a specific resume point here, it will go stale. Check `ls worker/migrations/` before naming a new file; two agents/sessions working in parallel can otherwise pick the same number. Never ALTER or CREATE TABLE in production directly without going through this workflow.

Do not reference `config/_default/config.toml`, `layouts/`, or Hugo-era paths — those directories no longer exist.

If those files conflict with a generic instruction file or prior memory, the repo content wins unless the user directs otherwise.

## WORM Data Protocol

WORM protocol is in effect for this project. Treat operational records as write-once/read-many data unless the user explicitly authorizes a corrective migration or administrative update.

- Do not hard-code dropdown options, form action choices, campaign workflow statuses, or admin-select lists in frontend JavaScript, Astro pages, or standalone HTML when those values represent operational data.
- Link dropdowns and other form actions to the appropriate database-backed tables or API endpoints. If the table or endpoint does not exist yet, propose or add the table/API path rather than embedding a static list.
- Keep display labels, ordering, active/inactive flags, and form action metadata in tables where admins or migrations can maintain them.
- Static hard-coded lists are acceptable only for true UI constants that are not operational records, such as view modes, layout preferences, or client-only sorting controls.
- When converting a hard-coded form list to table-backed data, preserve existing submitted values and avoid rewriting historical records unless a user-approved migration requires it.

## Cloudflare Worker Naming

- Never guess at Worker names for preview or production.
- Before suggesting `wrangler secret`, `wrangler deploy`, `wrangler tail`, `wrangler d1`, or route-related commands against a named environment, check `worker/wrangler.toml` first and state the exact Worker name implied by the config.
- Treat Wrangler environment naming as authoritative: if `name = "X"` and the command uses `--env production`, assume Wrangler will target `X-production` unless the repo config explicitly shows otherwise.
- If the user is about to run a production command and the real remote Worker name has not been verified yet, tell them to verify it first rather than guessing or inventing a name.
- Do not recommend creating a new production Worker just because Wrangler prompts for one unless the user explicitly wants a new Worker created.

## Local Dev Secrets (.dev.vars)

See `docs/conf.md` (gitignored, local only) for how local `.dev.vars` files are managed
across `worker/`, `Candidates/`, and `Guide/`. No secrets discussion belongs in any
committed file — if you need to explain or change that workflow, edit `docs/conf.md`,
not this file.

**Never `source` a secrets/env file (`secrets/dev-shared.vars`, any `.dev.vars*`) in a
shell command.** `source` executes the file as bash, not as a safe key=value parser — a
line that isn't valid bash gets echoed back on failure (or worse, executed, if a value
contains shell metacharacters). To use one specific key's value, extract only that line
with `grep '^KEY_NAME=' file | cut -d'=' -f2-`, and never echo/print the extracted value.
See `docs/security_notes.md` for the incident that established this rule.

## Deploy Notes

- `scripts/deploy_cf.sh` is a site deploy helper for Cloudflare Pages. For the Astro frontend it should deploy `dist/`, not `public/`.
- **`DIRECT=1 ./scripts/deploy_cf.sh` is the deploy path — always use it.** Policy as of 2026-07-24: this machine is the source of truth for what's live, not `origin/main`. Cloudflare Pages Git integration was confirmed disconnected 2026-07-24 (see `docs/deploy.md`) — a push to `main` no longer triggers anything on Cloudflare's side.
- Plain `./scripts/deploy_cf.sh` (no flags) only builds and pushes as a verification/version-control step — it does not deploy and should not be treated as one.
- That script does not publish the Worker in `worker/`.
- Cloudflare Pages Git builds for the Astro site must use Node `22.12.0` or newer. If dashboard settings still reference Hugo or `public/`, correct them before debugging app code.
- `scripts/deploy_worker.sh` is the canonical production Worker deploy helper. It requires the project-local pinned CLI and runs `npx --no-install wrangler deploy --env production --name skovgard2026-api` from `worker/` so Wrangler cannot download a moving version or drift to `skovgard2026-api-production`.
- For the production Worker routes currently attached to `skovgard2026-api`, use `./scripts/deploy_worker.sh`.
- Do not use plain `npx wrangler deploy --env production` for this repo unless the target service name has been reverified; Wrangler may try to publish `skovgard2026-api-production`, which conflicts with the existing routed Worker.

## Environment Sync Check

When asked whether localhost, the repo, or production are in sync — or before recommending a deploy — always run this check sequence first:

1. **Determine the branch**: `git branch --show-current`
2. **Check local changes**: `git status` — any modified or untracked files are not yet committed
3. **Check unpushed commits**: `git log origin/<branch>..HEAD` — any output means commits exist locally that have not been pushed

**If the current branch is `main`:**
- **This machine is the source of truth for what's live, not `origin/main`.** A clean `git log origin/main..HEAD` means the repo is in sync — it says nothing about whether production has actually been redeployed since. Never treat a push, by itself, as a deploy.
- Neither deploy target has automated CD: `DIRECT=1 ./scripts/deploy_cf.sh` (Astro Pages) and `scripts/deploy_worker.sh` (API Worker) must both be run explicitly from this machine. Cloudflare Pages Git integration was confirmed disconnected 2026-07-24 (see `docs/deploy.md`) — a push to `main` no longer triggers anything on Cloudflare's side.
- If it is unclear whether either deploy script has been run since the last local change, ask the user rather than assuming production is current.

**If the current branch is anything other than `main`:**
- Do **not** check or reference production — production only mirrors `main`.
- Limit the sync check to: working tree vs last commit, and local branch vs its remote tracking branch.

## Contact and Email Guardrails

- Do not replace an existing project email address with one from another project without explicit user approval.
- Do not invent, suggest, or publish new contact addresses unless the user asks for that change.
- If updating CTAs, forms, support text, or contact blocks, reuse addresses already present in this repo and keep changes consistent with the surrounding page and config.
- If multiple addresses exist in this repo, prefer the one already used by the relevant page or feature rather than normalizing the whole site opportunistically.
- If the correct contact address is ambiguous, ask the user or present the conflicting in-repo references before changing them.

## Media Workflow

### MP4 Creation (ffmpeg)

When creating audio/video files with `ffmpeg`, review `instructions/how_to_mp4.md` first. If the user asks to create an MP4 from an audio file and image, follow that process.

### Podcast — Two Content Streams

The podcast page and the homepage's "Latest From Jimmy" section pull from two independent sources.

| Stream | Source | Endpoint | Maintenance |
|---|---|---|---|
| Daily Substack episodes | `jimskovgard.substack.com/feed` | `/api/podcast-feed` | Zero — post to Substack |
| Hosted episodes (R2/D1) | R2 bucket + `podcast_uploads` table | `/api/podcasts` | One D1 row per file |

**Full podcast workflow:** `docs/PODCAST_WORKFLOW.md`

**Architecture notes and known issues before changing this flow:** [docs/podcast_notes.md](/home/anchor/projects/skovgard2026/docs/podcast_notes.md) —
covers the live-vs-dead `index.js`/`router.js` trap, why `cf: { cacheEverything: true }`
must never be added to the Substack upstream fetch (real recurring incident,
use `cacheTtlByStatus` instead), and other known gaps.

**Adding a campaign video to the site:** `docs/media/AddCampaignVideo.md` covers the R2 upload + D1 registration mechanics (still current).

**Adding a new video/essay/survey/tool to /messages ("Latest From Jimmy"):**
`docs/media/AddMessage.md` — the canonical process, launched 2026-07-24 alongside
the content-first `/messages` redesign. **Requires both** an R2 upload + D1
row (per `AddCampaignVideo.md`, feeds the homepage's "More to hear" row and
`/podcast`) **and** a `src/content/messages/<slug>.md` entry (feeds
`/messages` itself) — the two systems are independent; registering in only
one leaves the video missing from the other's surface.

**Hard rule: do not invent campaign message content.** The user uploads
videos often and expects to supply (or explicitly approve) the substantive
copy. If asked to add a message and given a video plus only a short
summary, ask for the body/explanation content — or explicit permission to
draft it for review — before publishing. A summary is not license to
write the rest yourself. Full checklist of what to ask for is in
`docs/media/AddMessage.md`.

Key rules for hosted episodes (D1 side):
- R2 bucket is `podcasts`; CDN host is `https://media.skovgard2026.org`
- `r2_key` in D1 has **no** leading slash; public URL = `${MEDIA_BASE_URL}/${r2_key}`
- Campaign videos use `guest_slug = 'campaign'` and keys like `videos/{name}.mp4`
- `summary` column is JSON: `{"title":"...","slug":"share-slug-or-null","duration":"M:SS"}`
- After inserting a D1 row, it appears automatically in the homepage's "More to hear" row — but *featuring* a video (the large embedded player) is always a manual edit to `src/pages/index.astro` plus a deploy
- Use `INSERT OR IGNORE` — never UPDATE or DELETE rows except via an approved migration

Do NOT follow `docs/PODCAST_WORKFLOW.md` instructions that reference Hugo, `media.this-is-us.org`, shortcodes, or `content/podcast.md` — those sections are outdated. The file has been rewritten for the current Astro architecture.

### Media Asset Paths

- The canonical public media host for this repo is `https://media.skovgard2026.org`.
- Do not introduce or switch frontend links back to `https://media.this-is-us.org` unless the user explicitly asks for that shared legacy domain.
- For Astro pages and components, prefer the shared constant in `/home/anchor/projects/skovgard2026/src/constants.ts` rather than hardcoding media hosts inline.
- `worker/wrangler.toml` is authoritative for the deployed `MEDIA_BASE_URL` value.
- Public-facing media URLs should look like `https://media.skovgard2026.org/{r2_key}` where `r2_key` has no leading slash.
- Example public URLs used by the site:
  - `https://media.skovgard2026.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3`
  - `https://media.skovgard2026.org/videos/wyoming-not-for-sale.mp4`
  - `https://media.skovgard2026.org/townhall/intro_townhall.mp4`
- If a media asset appears broken, verify all three separately before changing code:
  - the URL emitted by the Astro page or API response
  - the canonical host in `src/constants.ts`
  - the `MEDIA_BASE_URL` in `worker/wrangler.toml` `[env.production.vars]`

## Test Data

Reusable real (not fake) phone/email identities for end-to-end testing (SMS,
email, voter-match flows) live in [docs/test_data.md](/home/anchor/projects/skovgard2026/docs/test_data.md).
Check it before inventing a new throwaway identity for a test, and add an
entry there when a test establishes a new one worth reusing. These are real
contacts — sends against production bindings are real, not sandboxed.

## Repository Hygiene

- Suggest cleanup of odd or stray files created in the project root when you notice them.
- Keep edits scoped to the user request. Do not fold in unrelated cleanup or cross-project standardization unless asked.

## Manual Single-Contact Add

To add one contact directly (name + phone and/or email, provided verbally or in person):

Read `instructions/manual_contact_add.md` for the exact SQL patterns, phone number formatting, and verification query. This folder is git-ignored — do not commit files from it.

- SMS only: insert into `contacts` + `consent_status` (status `opted_in`)
- Email only: insert into `newsletter_subscribers` (active `1`)
- Both: all three tables; also set `email` and `consent_email=1` on the `consent_status` row
- Use `source = 'admin_manual'` and `source_detail = 'admin add YYYY-MM-DD'`
- For 10+ contacts use the CSV import workflow below instead

## CSV Import Workflow

When a user provides a signup-sheet CSV to add contacts to the SMS/email systems:

- The admin portals (`static/admin/texting/index.html`, `static/admin/emails/index.html`) are **read-only UIs** — do not edit them to add contacts. Contacts flow in via the transform + upsert scripts into the D1 database.
- Human-facing operations guide: [docs/update_new_contact_emails_texts.md](/home/anchor/projects/skovgard2026/docs/update_new_contact_emails_texts.md)
- Technical field mapping and script reference: [docs/UpsertOptinData.md](/home/anchor/projects/skovgard2026/docs/UpsertOptinData.md)
- Standard working folder for raw or generated CSV import artifacts: `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/` (git-ignored — never commit these files)

### Required sequence

1. Normalize source CSV columns to match: `row,name,email,phone,city_town,opt_in_text,opt_in_email,volunteer,notes`
2. Run `scripts/optins/transform-optin-csv.mjs` and review `source-audit.csv` — surface all skip reasons and data quality issues to the user before touching any database.
3. Test against an isolated SQLite DB (`--sqlite /tmp/...`) and verify counts.
4. Confirm with the user before the production push (`--remote --env production`).

### Data quality gates — do not skip

- Flag any TextOptIn=Yes row with no valid phone number.
- Flag any phone number with `?`, partial digits, or fewer than 10 US digits.
- Do not silently import rows with known-invalid phone numbers.
- Do not reactivate opted-out contacts (the upsert script is conservative by design).
- Never commit raw signup CSVs, normalized CSVs, or generated SQL/CSV output.

## Candidates Sub-project (Wyoming 2026 Voter Guide)

**Sub-project agent instructions:** `Candidates/AGENTS.md` — read this file first when doing any work inside `Candidates/`. It covers the Worker name, D1 bindings, migration warnings, deploy rules, and county seed workflow.

The voter guide lives in `Candidates/` — a standalone Astro 6 SSR project deployed to `candidates.skovgard2026.org` via Cloudflare Pages. It has its own `wrangler.toml`, D1 databases, and package.

**Data reference:** `Candidates/candidate_data.md` — start there for the full D1 schema, field definitions, migration history, and enrichment batch workflow.

**Adding candidates for a new county:** Read `Candidates/docs/county_seed.md` before writing any SQL. It covers the required pre-flight checks, the `offices.level` CHECK constraint (the most common silent failure), slug conventions, verification queries, and the deploy/commit sequence. Do not skip it — `INSERT OR IGNORE` will silently discard rows with an invalid `level` value.

Key points for agents:

- Two D1 tables: `offices` and `candidates`, binding name `WY_DB` (row counts grow as counties are added — query D1 for current totals).
- Local D1: `wy` (no `--remote` — local SQLite in `.wrangler/state/`). Production D1: `wy --remote`.
- Enrichment data comes from batch CSVs in `Candidates/db/seed/`. All 10 batches (rows 1–200) are complete.
- To regenerate enrichment SQL after adding new batch CSVs: `node Candidates/scripts/generate_enrichment_sql.mjs` then apply the output to D1.
- `Candidates/wrangler.toml` is the authoritative config for the sub-project's Worker name (`skovgard-candidates`), D1 bindings, and environment vars.
- Do not mix Candidates Worker names or D1 bindings with the main `skovgard2026-api` Worker.
- Before changing Candidates data, verify that `WY_DB` resolves to the intended D1 target and local backing file. The same D1 database names and local state directory may contain data used by other project areas; never rename, move, replace, or rebuild a database file just because it appears stale without first checking the intended delta and the app-facing binding.

## Candidates Domain Deploy Guard

When working on `candidates.skovgard2026.org`, treat the live app as the
`Candidates/` Astro SSR project served by the `skovgard-candidates` Worker.

**Use the canonical deploy script from the repo root:**
```bash
./scripts/deploy_candidates.sh
```

The script: validates `Candidates/wrangler.toml` name, guards against an
accidental `[env.production]` block, builds the Astro site, then deploys with
the project-local pinned CLI via
`npx --no-install wrangler deploy --name skovgard-candidates` (no `--env` flag).

To redeploy without rebuilding (e.g. after a data-only change):
```bash
SKIP_BUILD=1 ./scripts/deploy_candidates.sh
```

After deploy, confirm Wrangler reported:
- Worker name: `skovgard-candidates`
- `WY_DB` binding → `wy`
- `LOOKUP_DB` binding → `ballot_sources`

Notes:
- Do **not** run `npx wrangler deploy --env production` directly — there is no
  `[env.production]` section and Wrangler may deploy as `skovgard-candidates-production`.
- `wrangler pages deploy` is not sufficient for the live custom-domain route.
- Do not deploy through the main `skovgard2026` Pages project or `skovgard2026-api` Worker.
- The canonical config is `Candidates/wrangler.toml`.

## Guide Sub-project (Voter Guide Admin)

**Sub-project agent instructions:** `Guide/AGENTS.md` — read this file first when doing any work inside `Guide/`. It covers the Cloudflare Pages project name, WY_DB bindings, migration steps, deploy rules, and guide table descriptions.

The guide admin lives in `Guide/` — a standalone Astro 6 SSR project deployed to `guide.skovgard2026.org` as a **Cloudflare Pages** project (`skovgard-guide`). It shares the same `wy` D1 database as the Candidates sub-project.

Deploy:
```bash
./scripts/deploy_guide.sh
SKIP_BUILD=1 ./scripts/deploy_guide.sh   # data-only redeploy
```

Do NOT run `npx wrangler pages deploy` directly — the deploy script validates the Pages project name and guards against `[env.production]` misrouting.

---

## Polling Location Workflow

To add polling locations for a new Wyoming county, follow the step-by-step procedure in:

- [docs/polling/AddPollingLocations.md](/home/anchor/projects/skovgard2026/docs/polling/AddPollingLocations.md)

Key rules:
- `polling_locations` table lives in `WY_DB` (`wy` in both environments).
- Apply each SQL file to **both** databases before moving to the next step — do not batch.
  Production: `npx wrangler d1 execute wy --remote --file=...`
  Local: `npx wrangler d1 execute wy --file=...` (no `--remote`)
- **`wy_preview` is not the Candidates local database.** It appears only in the main
  `worker/wrangler.toml` `[env.preview]` block for the `skovgard2026-api` Worker's
  Cloudflare preview environment. Do not target `wy_preview` for Candidates D1 work.
- `city` is the **voter's home city** (lookup key), NOT the polling location's physical city.
  For cross-community precincts (voter in town A votes at venue in town B), `city = 'A'`
  and the full venue address goes in `address`.
- Seed files: `Candidates/db/seed/polling_locations_{county_slug}.csv` and `_insert.sql`.
- Address corrections go in a separate `_addr_patch.sql` — never re-run the original
  INSERT SQL after data exists (it creates duplicates).
- `getPollingLocations()` uses `SELECT DISTINCT location_name, address` — multiple precincts
  at the same venue collapse automatically. Keep unique locations per city to ≤ 3.
- Polling coverage changes often. Do not store fixed completed/missing county counts in this
  file. Query `polling_locations`, `county_gis`, and `precinct_polygons` in `WY_DB` when
  current coverage is needed.

### ArcGIS Spatial Polling Lookup

Some Wyoming counties publish precinct boundaries as public ArcGIS REST MapServer layers.
When available, `ballot-lookup.js` fires a point-in-polygon query using the voter's
geocoded lat/lon and returns the exact precinct polling place — more precise than city-based lookup.

**How it works:**
1. `county_gis` table (migration `0007`) stores confirmed endpoints.
2. `lookupPollingByGIS()` checks the table for the voter's county. If an active row exists
   and `lat`/`lon` are available from the Census geocoder, it fires an ArcGIS spatial query.
3. Result `gisPollingLocation` is included in the ballot-lookup API response alongside
   `d1PollingLocations` (city-based fallback). Frontend should prefer `gisPollingLocation`.

**Adding a county to the registry:**
```sql
INSERT OR IGNORE INTO county_gis
  (county, mapserver_url, precinct_layer, precinct_field, location_field, address_field, status, last_verified)
VALUES ('COUNTY', 'https://gis.{county}.gov/.../MapServer', LAYER_ID, 'FIELD1', 'FIELD2', 'FIELD3', 'active', 'YYYY-MM-DD');
```
Apply to both local (`wy`) and production (`wy --remote`), then seed `db/seed/county_gis_{slug}_seed.sql`.

To check active GIS counties, query `county_gis` in `WY_DB`; do not hard-code a static list here.

## Share Message Workflow

**New messages go to `/messages`, not `/share`.** As of 2026-07-24, new
content (video, essay, survey, tool) is added via the content-first
`/messages` hub — see "Adding a new video/essay/survey/tool to /messages"
under Media Workflow above and `docs/media/AddMessage.md`. The process
below governs the ~27 pre-existing `/share/<slug>` pages only, until each
is gradually converted (see `docs/share/AddShareMessage.md`'s transition
notice for the conversion path).

To add a new shareable message at `/share/<slug>` (legacy pages only), follow the step-by-step checklist in:

- [docs/share/AddShareMessage.md](/home/anchor/projects/skovgard2026/docs/share/AddShareMessage.md)

Key files involved: `worker/src/email-template.js` (SHARE_MESSAGES registry), `src/components/ShareListing.astro` (card grid), and a new `src/pages/share/<slug>.astro` detail page. No D1 migration is needed for a new message.

- If a share email makes verifiable public claims, create `src/pages/share/<slug>/sources.astro` and point the email CTA (`body_html` link in `SHARE_MESSAGES`) to `https://skovgard2026.org/share/<slug>/sources/` — not back to the share page itself.

## Pulse Flow (opt-in + Citizen Poll)

The `/pulse` opt-in form and its Citizen Poll (candidate-choice poll)
integration span voter matching, poll-link minting/delivery, and voter phone
promotion. Read [docs/pulse_flow.md](/home/anchor/projects/skovgard2026/docs/pulse_flow.md)
before changing anything in this flow — it covers the two-step form, the
`consent_status` data model (and why it currently lacks a `voter_id`
column), the voter-matching cascade, why poll-link delivery and voter-phone
promotion are gated the way they are (both fixed 2026-07-15 after real
silent-failure bugs), and the open design gap around submitters who can't
be matched to the Wyoming voter file.

Key files: `src/components/PulseOptInForm.astro`, `static/js/pulse-optin.js`,
`worker/src/index.js` (`/api/optin`), `worker/src/telnyx.js`
(`maybeSendWelcomeText`, `sendPollLinkText`), `worker/src/pulse-email.js`
(`sendPollLinkEmail`), `worker/src/voter-phone.js` (`promoteDeliveredOptInPhone`).
Staff call-follow-up (added 2026-07-19, `docs/pulse_flow.md` §5a/§5b):
`static/admin/pulse-voter-review/index.html` (call-tracking on the existing
review queue) and `static/admin/pulse-followup/index.html` +
`static/js/admin-pulse-followup.js` (abandoned/never-submitted `/pulse`
starts, `pulse_abandoned_signups` table) — neither is a consent record; a
verbal opt-in completed there writes through the normal `upsertConsentStatus`
path, tagged `source='staff_call'`.

## Blast Flow (email) — active debugging

The email Blast flow (`static/admin/emails/blast.html` +
`static/js/admin-emails-blast.js`, `/api/admin/emails/blast/*` +
`/api/resend/webhook` in `worker/src/index.js`/`worker/src/resend-webhooks.js`)
is under active debugging as of 2026-07-08. Before touching this flow, read:

- `docs/blast_tracking.md` (gitignored, local working notes — not in git,
  won't be there after a fresh clone; check with whoever has been working
  this flow if the file's missing)

It has real incident history worth knowing before you change chunk sizing,
webhook config, or audience routing — including a Cloudflare subrequest
limit that silently dropped 300 real recipients, and a Resend webhook that
pointed at the wrong domain for an unknown period before 2026-07-08.

## Social Media Sharing

Full requirements for Open Graph tags, Twitter/X cards, meme images, and per-domain
setup across `skovgard2026.org` and `candidates.skovgard2026.org`:

- [docs/social_media.md](/home/anchor/projects/skovgard2026/docs/social_media.md)

Key rules:
- Every public page that can be linked on social must emit `og:title`, `og:description`,
  `og:image` (absolute URL, ≥ 1200 × 630 px), and the matching `twitter:card` tags.
- Main site OG tags live in `src/layouts/Base.astro` (accepts `ogImage` prop).
- Candidates site OG tags live in `Candidates/src/layouts/Base.astro` **and** must be
  kept in sync in `Candidates/src/pages/index.astro` (which has its own inline `<head>`).
- Meme images for share pages: `static/images/share/meme-<slug>.png`.
- Candidates site default OG image: `Candidates/public/og-image.png` →
  `https://candidates.skovgard2026.org/og-image.png`.
- After updating any OG image, run the URL through the Facebook Sharing Debugger
  (`developers.facebook.com/tools/debug`) and click "Scrape Again" to clear Meta's cache.

## Local Testing Servers

- When starting local servers for testing, treat them as temporary and close them when the test is complete.
- Before finishing a task that used `wrangler dev` or another local server, verify that the listener has been shut down.
- Do not leave background test servers running after validation unless the user explicitly asks to keep one open.

## Admin Pages (standalone HTML in `static/`)

Admin pages like `static/admin/texting/index.html` and `static/admin/emails/index.html` are **standalone HTML files**, not Astro pages. They are served directly from the `static/` publicDir.

### Asset loading

- Each admin page is a complete HTML document with its own `<head>`. It loads CSS and JS via standard `<link>` and `<script>` tags in `<head>` — no build pipeline or Astro component needed.
- Cache-busting: append a version query string (`?v=2`) when updating CSS/JS to avoid stale caches after deploy.

### Cross-admin navigation: use `<a>`, not `<button>`

When a control navigates to another admin page (e.g. "Go to Emails"), use a styled `<a href="...">` tag rather than a `<button>` with a JS `location.assign`. Reasons:

- Correct semantic element for navigation.
- No JS event listener needed.

Style it to match the secondary button variant using the same ID-targeted rule pattern described in the Button CSS Rules section.

### Local dev access

Start the dev server with `npm run dev` or `./startDev.sh` (runs Astro dev on port 4321). Admin pages in `static/` must be accessed with the explicit filename: `http://localhost:4321/admin/texting/index.html`. Astro's dev server does not auto-resolve `index.html` for static directory URLs. In production (Cloudflare Pages), trailing-slash directory index resolution works automatically.

## Button CSS Rules (admin pages)

The global CSS reset in `global.css` and `forms.css` zeroes out all button appearance (`background: none; border: 0; padding: 0`). Every `<button>` on admin pages **must** be covered by an explicit CSS rule that restores its visual treatment.

### Specificity pitfall

`forms.css` contains `main .optin-form button[type="submit"]` with specificity **(0, 2, 2)**. Any admin-page button rule that uses only class selectors (e.g. `.admin-texting-shell .button-row button` = **(0, 2, 1)**) will **lose** for `type="submit"` buttons inside an `.optin-form`, stripping their border, radius, and padding. Use an **ID selector** on the closest ancestor section to raise specificity above (0, 2, 2):

```css
/* CORRECT — uses the section's actual ID, specificity (1, 1, 1) */
#admin-texting-shell .button-row button { ... }

/* WRONG — class-only, specificity (0, 2, 1) — loses to forms.css for submit buttons */
.admin-texting-shell .button-row button { ... }
```

### Pattern for new admin pages

1. Wrap all button groups in a `<div class="button-row">` inside a container that has a unique `id`.
2. In the page-specific CSS, write button rules keyed to that ID (`#my-section-id .button-row button { ... }`).
3. The primary button style: `display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: .6rem 1.1rem; border: 1px solid #2563eb; border-radius: .7rem; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer;`
4. Secondary variant: swap `background` and `border-color` to `#64748b`.
5. Danger variant: `border: 1px solid #b91c1c; background: #fef2f2; color: #991b1b;`.
6. Standalone buttons outside `.button-row` (e.g. a single action in a card header) need their own ID-targeted rule rather than relying on a class selector.
