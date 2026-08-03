# Candidates Sub-project — Agent Instructions

Voter guide for the Wyoming 2026 primary. Lives at `guide.skovgard2026.org`,
served by the `skovgard-candidates` Worker. This file covers everything
specific to `Candidates/`. For campaign-wide rules see the root `AGENTS.md`.

---

## Quick reference

| Thing | Value |
|---|---|
| Worker name | `skovgard-candidates` |
| D1 binding | `WY_DB` → database `wy` (ID `4b4227f1-bf30-4fcf-8a08-6967b536a5ab`) |
| Secondary D1 | `LOOKUP_DB` → `ballot_sources` |
| ALLOW_ORIGIN | `https://guide.skovgard2026.org` |
| Deploy script | `./scripts/deploy_candidates.sh` from repo root |
| Data-only redeploy | `SKIP_BUILD=1 ./scripts/deploy_candidates.sh` |

---

## Key reference docs

- **`Candidates/candidate_data.md`** — full D1 schema for `offices` and `candidates`, field definitions, enrichment batch workflow, migration history. Read this before any database work.
- **`Candidates/docs/county_seed.md`** — step-by-step guide for adding a new county's candidates. Read this before writing any county seed SQL.
- **`Candidates/docs/rubrics/README.md`** — canonical rubric authoring, generated artifacts, D1 runtime loading, and versioning workflow.

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
