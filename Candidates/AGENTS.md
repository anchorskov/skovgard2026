# Candidates Sub-project — Agent Instructions

Voter guide for the Wyoming 2026 primary. Lives at `candidates.skovgard2026.org`,
served by the `skovgard-candidates` Worker. This file covers everything
specific to `Candidates/`. For campaign-wide rules see the root `AGENTS.md`.

---

## Quick reference

| Thing | Value |
|---|---|
| Worker name | `skovgard-candidates` |
| D1 binding | `WY_DB` → database `wy` (ID `4b4227f1-bf30-4fcf-8a08-6967b536a5ab`) |
| Secondary D1 | `LOOKUP_DB` → `ballot_sources` |
| ALLOW_ORIGIN | `https://candidates.skovgard2026.org` (defined in `wrangler.toml`, not currently read by any runtime code) |
| Deploy script | `./scripts/deploy_candidates.sh` from repo root |
| Data-only redeploy | `SKIP_BUILD=1 ./scripts/deploy_candidates.sh` |

---

## Key reference docs

- **`Candidates/candidate_data.md`** — full D1 schema for `offices` and `candidates`, field definitions, enrichment batch workflow, migration history. Read this before any database work.
- **`Candidates/docs/county_seed.md`** — step-by-step guide for adding a new county's candidates. Read this before writing any county seed SQL.
- **`Candidates/docs/rubrics/README.md`** — canonical rubric authoring, generated artifacts, D1 runtime loading, and versioning workflow.
- **`Candidates/docs/multi_selection.md`** — domain spec for multi-candidate-selection contests (rules, UI contract, safety constraints). Read before touching `src/lib/selection-limit.ts`, the multi-select UI in `race/[id].astro`, or `multi_seat_race_sources`. `Candidates/candidate_data.md`'s "Multi-candidate selection" section is the shorter pointer.
- **`Candidates/docs/voice_guide.md`** — architecture for the optional Voice Guide / spoken-navigation feature (command grammar, help-topic registry, state model, address-lookup integration). Read before touching `src/components/VoiceGuide.astro`, `src/components/HelpPanel.astro`, or `src/lib/voice-guide/`.
- **`Candidates/docs/election_results_schema.md`**: table relationships, append-only versus mutable-control-data boundaries, source-check lifecycle, snapshot-acceptance rule, source-precedence rule, and the safe localhost migration procedure for the election-results schema (migrations 0028-0036). Read before touching `election_*` tables/views, `extract_election_results_*.py`, `generate_election_results_sql.py`, `../Results/`, or `src/pages/results/`.
- **`Candidates/docs/election_results_2024_local_status.md`**: machine-readable status, verified structural defects, value as a local test corpus, and the mandatory remediation gate that forbids promoting the 2024 results to production.
- **`Candidates/docs/election_results_2026_path_forward.md`**: operational reference for ingesting real 2026 election-night results, format-by-format, plus the full catalog of real parsing anomalies found while building and testing the pipeline against 2024 data.
- **`Candidates/docs/election_results_unreconciled_sources.md`**: guarded policy for official reports that print candidate totals without any contest checksum, including the staging-only Sheridan 2026 record. Read before using `--allow-missing-contest-total` or handling similarly unreconciled source data.
- **`Candidates/docs/recheck_county_election_result_sources.md`**: repeatable 23-county source-audit runbook, including official-site search order, evidence acceptance and rejection gates, WORM source succession, cost controls, validation, and the audit-record template. Read before repeating county result discovery or changing the county source registry.

---

## Turnstile on the ballot lookup form (`src/pages/index.astro`)

The address-lookup form (`#address-form-section`) uses an **invisible, execution-mode**
Turnstile widget (`#ts-widget`) to gate `POST /api/ballot-lookup`. It is disabled entirely
in local dev (`isLocalReview = import.meta.env.DEV`) — `verifyTurnstile()` in
`src/pages/api/ballot-lookup.js` also short-circuits to `true` when `import.meta.env.DEV`,
so **this flow cannot be exercised against a real widget in `npm run dev`; it only runs for
real against the production site key.** Test it in production (or a preview deploy with
`TURNSTILE_SITE_KEY` set) after any change here, not just via `astro build`/`astro check`.

**Explicit render, not implicit auto-render.** The script tag loads
`api.js?render=explicit`, and JS calls `turnstile.render('#ts-widget', {...})` itself
(`ensureTurnstileWidget()`) the first time `window.turnstile` becomes available, keeping the
returned `widgetId` for all later `execute()`/`reset()` calls. Do **not** revert this to the
implicit pattern (`class="cf-turnstile"` + `data-sitekey`/`data-callback` attributes +
plain `api.js`) — that was the actual bug fixed 2026-08-03: Cloudflare's implicit auto-render
scan runs on its own timing relative to when `window.turnstile` appears, so `execute('#ts-widget')`
could silently no-op on a genuinely first page load (no error, no callback — the 12s ceiling in
`getTurnstileToken()` just ran out and the request posted with no token), producing a real,
user-visible "Verification failed. Please reload the page and try again." on the *first* attempt
only, working fine on every retry. `render()` returning a widgetId synchronously is what removes
that race, not more polling.

**Never surface "Verification failed" to a voter.** The submit handler retries once, silently,
with a fresh token whenever the server returns 403 before showing the user anything — see the
comment above the `response.status === 403` check in the submit handler. If you see this message
reappear (even rarely) in production logs/reports, treat it as drift in this widget-readiness
logic first, not a real bot-detection event — re-read this section and the comments in
`ensureTurnstileWidget()`/`getTurnstileToken()` before changing anything.

`src/pages/candidate/[slug].astro` also embeds a Turnstile widget (`#qr-ts-widget`, for the
questionnaire-request form) but it's a **visible, managed checkbox widget** using
`getResponse()`, not `execute()` — a different, still-implicit-render pattern with different
(and so far unreported) failure characteristics. It was not touched by the 2026-08-03 fix; don't
assume the two widgets share state or behavior.

---

## Adding candidates for a new county

Read `Candidates/docs/county_seed.md` before writing any SQL.
Critical reminders:
- `offices.level` CHECK constraint: only `'federal' | 'statewide' | 'wy_senate' | 'wy_house' | 'county' | 'city'`. `'municipal'` and `'state'` are invalid — `INSERT OR IGNORE` silently discards them.
- State house/senate offices are canonical (one per district, `county = NULL`). Check for existence before creating a new one.
- Seed files go in `Candidates/db/seed/`. Naming: `{county_slug}_candidates_{YYYY-MM-DD}.sql`.
- Apply to production: `npx wrangler d1 execute WY_DB --remote --file=db/seed/{file}.sql` (run from `Candidates/`).
- After applying: verify counts, then `SKIP_BUILD=1 ./scripts/deploy_candidates.sh`.

---

## D1 migrations

Migrations live in `Candidates/db/migrations/`. The tracker (`migrations_dir`) is set in `wrangler.toml` but was NOT bootstrapped — migrations 0001–0010 were applied manually before the tracker existed. Only apply 0011+ through the tracker or via direct `execute`.

Never run old migrations (0001–0010) again — they contain non-idempotent `ALTER TABLE ADD COLUMN` statements.

The rubric's only manually edited definition is `data/rubrics/wy-primary-2026-v1.md`.
Run `npm run rubric:build` after editing it; never edit its generated JSON, PDF, or SQL.

---

## Deploy rules

- **Always use `./scripts/deploy_candidates.sh`** from the repo root.
- The script requires the project-local pinned Wrangler and deploys through
  `npx --no-install wrangler`; it must not download a CLI during deployment.
- Do NOT run `npx wrangler deploy --env production` — there is no `[env.production]` block and Wrangler will deploy as `skovgard-candidates-production`.
- Do NOT mix this Worker with `skovgard2026-api` or `skovgard-guide`.

---

## Research and evidence files

- `Candidates/_research/` — local only (gitignored). Contains candidate evidence sheets and research notes.
- `Candidates/_research/TEMPLATE_evidence_sheet.md` — template for new evidence sheets.

---

## Planning and context

- `instructions/candidates_planning.md` (local, gitignored) — project planning notes for the voter guide.
