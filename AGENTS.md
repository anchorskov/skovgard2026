<!-- AGENTS.md -->
# Agent Instructions for `skovgard2026`

This file is repo-local. It applies only inside:

- `/home/anchor/projects/skovgard2026`
- Git remote: `git@github.com:anchorskov/skovgard2026.git`
- Public site/domain references for this repo: `skovgard2026.org`, `www.skovgard2026.org`, and project assets already used in this codebase

If instructions, names, domains, emails, or policies from another project appear here or in generated work, treat that as drift and do not apply them without explicit user approval.

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
- `wy` D1 (`WY_DB` binding) — Wyoming voter data (voter matching, `voter_phones`, `v_best_phone`) plus the voter guide tables (`offices`, `candidates`). Production: `--remote`. Local dev: no flag (local SQLite in `.wrangler/state/`).
- Voter guide detail: `Candidates/candidate_data.md` — field-by-field reference for `offices` and `candidates`.

These D1 databases support multiple projects and workflows beyond the current task. Renaming, moving, rebinding, replacing, or bulk-rebuilding them can have far-reaching unintended effects outside this repo area. Before any database read, write, migration, import, export, or local mirror change, agents must verify the exact project, `wrangler.toml`, binding name, database name, database id, `--local` vs `--remote` target, and backing local SQLite file when applicable. Do not assume similarly named databases such as `wy`, `wy_preview`, or local mirror files are interchangeable.

## D1 Migration Workflow

Full workflow with naming convention, backup step, and tracking notes: `docs/db/README.md` → "Migration Workflow".

Required steps for any `ballot_sources` schema change:

1. **Back up**: `./scripts/db_backup.sh` — timestamped SQL dump to `backups/` (gitignored). Do not skip.
2. **Write**: create `worker/migrations/NNN_description.sql` (three-digit sequential number). Use `IF NOT EXISTS` forms.
3. **Preview first**: `npx wrangler d1 migrations apply ballot_sources_preview --remote --env preview` — verify before touching production.
4. **Production**: `npx wrangler d1 migrations apply ballot_sources --remote --env production`
5. **Redeploy Worker** if the migration affects a table the Worker reads or writes: `./scripts/deploy_worker.sh`

Migration numbering resumes at `022_` (as of 2026-06-22). Never ALTER or CREATE TABLE in production directly without going through this workflow.

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

## Deploy Notes

- `scripts/deploy_cf.sh` is a site deploy helper for Cloudflare Pages. For the Astro frontend it should deploy `dist/`, not `public/`.
- That script does not publish the Worker in `worker/`.
- Cloudflare Pages Git builds for the Astro site must use Node `22.12.0` or newer. If dashboard settings still reference Hugo or `public/`, correct them before debugging app code.
- `scripts/deploy_worker.sh` is the canonical production Worker deploy helper. It runs `npx wrangler deploy --env production --name skovgard2026-api` from `worker/` so Wrangler does not drift to `skovgard2026-api-production`.
- For the production Worker routes currently attached to `skovgard2026-api`, use `./scripts/deploy_worker.sh`.
- Do not use plain `npx wrangler deploy --env production` for this repo unless the target service name has been reverified; Wrangler may try to publish `skovgard2026-api-production`, which conflicts with the existing routed Worker.

## Environment Sync Check

When asked whether localhost, the repo, or production are in sync — or before recommending a deploy — always run this check sequence first:

1. **Determine the branch**: `git branch --show-current`
2. **Check local changes**: `git status` — any modified or untracked files are not yet committed
3. **Check unpushed commits**: `git log origin/<branch>..HEAD` — any output means commits exist locally that have not been pushed

**If the current branch is `main`:**
- Production mirrors `origin/main`. If `git log origin/main..HEAD` is empty and the deploy scripts were run after the last push, production is current.
- There is **no automated CD** — pushing to `origin/main` alone does not update production. Both `scripts/deploy_cf.sh` (Astro Pages) and `scripts/deploy_worker.sh` (API Worker) must be run explicitly after each push.
- If it is unclear whether the deploy scripts were run since the last push, ask the user rather than assuming production is current.

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

When creating audio/video files with `ffmpeg`, review `how_to_mp4.md` first. If the user asks to create an MP4 from an audio file and image, follow that process.

### Media Asset Paths

- The canonical public media host for this repo is `https://media.skovgard2026.org`.
- Do not introduce or switch frontend links back to `https://media.this-is-us.org` unless the user explicitly asks for that shared legacy domain.
- For Astro pages and components, prefer the shared constant in `/home/anchor/projects/skovgard2026/src/constants.ts` rather than hardcoding media hosts inline.
- `worker/wrangler.toml` is authoritative for the deployed `MEDIA_BASE_URL` value.
- Public-facing media URLs should look like `https://media.skovgard2026.org/{folder}/{date-or-subpath}/{filename}`.
- The backing R2 object key may still include the bucket prefix, for example `podcasts/{guest_slug}/{episode_date}/{filename}.mp3`, but the public CDN URL should omit that `podcasts/` prefix unless the deployed routing explicitly requires it.
- Example public URLs used by the site:
  - `https://media.skovgard2026.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3`
  - `https://media.skovgard2026.org/townhall/intro_townhall.mp4`
- If a media asset appears broken, verify all three separately before changing code:
  - the URL emitted by the Astro page
  - the canonical host in `src/constants.ts`
  - the corresponding `MEDIA_BASE_URL` and upload key pattern in `worker/wrangler.toml`

## Repository Hygiene

- Suggest cleanup of odd or stray files created in the project root when you notice them.
- Keep edits scoped to the user request. Do not fold in unrelated cleanup or cross-project standardization unless asked.

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
`npx wrangler deploy --name skovgard-candidates` (no `--env` flag).

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

To add a new shareable message at `/share/<slug>`, follow the step-by-step checklist in:

- [docs/share/AddShareMessage.md](/home/anchor/projects/skovgard2026/docs/share/AddShareMessage.md)

Key files involved: `worker/src/email-template.js` (SHARE_MESSAGES registry), `src/pages/share/index.astro` (card grid), and a new `src/pages/share/<slug>.astro` detail page. No D1 migration is needed for a new message.

- If a share email makes verifiable public claims, create `src/pages/share/<slug>/sources.astro` and point the email CTA (`body_html` link in `SHARE_MESSAGES`) to `https://skovgard2026.org/share/<slug>/sources/` — not back to the share page itself.

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
