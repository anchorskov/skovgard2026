# Claude Instructions for `skovgard2026`

These notes are repo-local and apply inside `/home/anchor/projects/skovgard2026`.

## Brand System (theme-frontier)

The locked brand specification lives in `brand/BRAND.md`. Read it before
generating any front-end code, copy, or visual assets.

### Hard rules — do not deviate

- NEVER introduce a color not defined in `brand/palette.json`.
- Treat `wy-*` token names as legacy aliases wired to the frontier palette.
  Do not "correct" `wy-navy`, `wy-gold`, `wy-stone`, or `wy-sky` by name alone.
- NEVER swap the primary fonts on this branch. Headlines: Bitter. Body: Source Sans 3.
  Preserve Merriweather and Inter as fallbacks in that order.
- Bone (`#f1ece1`) is the dominant page background. Charcoal (`#2b2b2b`) is the
  primary structural dark.
- Ember (`#b22234`) is the primary accent for this branch. Use `#8b1a26` for hover
  and pressed states, not as a new accent family.
- Sandstone (`#c68a4a`) is secondary warmth. Sage (`#7a8a6b`) is quiet chrome only.
- Do NOT use the Wyoming Bucking Horse trademark in campaign materials.
- If another branch, prompt, or doc mentions `theme-civic`, treat it as historical
  exploration, not the source of truth for this branch.
- When uncertain about a brand decision, say so and ask. Do not guess.

### Where to find brand details

- Palette: `brand/palette.json`
- Typography: `brand/typography.json`
- Voice and copy rules: `brand/voice.md`
- Photography guidance: `brand/photography.md`
- Channel-specific rules: `brand/channel-rules.md`
- Locked spec overview: `brand/BRAND.md`

### Current theme status

The frontier theme is already implemented on this branch in `src/styles/global.css`,
`src/layouts/Base.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`,
and `src/pages/index.astro`. Use those files as the live reference implementation.

## Framework: Astro (not Hugo)

This project migrated from Hugo to Astro in early April 2026. **All code changes must target the Astro environment.** Hugo is no longer used — there is no `hugo` binary, no `config/`, no `layouts/` directory.

- Frontend: **Astro 6 static site** (`output: 'static'` in `astro.config.mjs`), builds to `dist/`.
- Pages: `src/pages/*.astro`. Layouts: `src/layouts/`. Components: `src/components/`.
- Static assets: `static/` (configured as `publicDir` in `astro.config.mjs`).
- Admin pages: standalone HTML in `static/admin/` (not Astro pages).
- Dev server: `npm run dev` (port 4321). Use `http://localhost:4321/admin/texting/index.html` for admin pages (Astro dev does not auto-resolve directory `index.html`).
- Do not suggest Hugo commands, Hugo template syntax, or Hugo config files — none exist.
- The `content/` directory holds legacy Hugo content that is **not routed by Astro**. Do not create new pages there.

## Media Asset Paths

- The canonical public media host is `https://media.skovgard2026.org`.
- Do not change frontend media links to `https://media.this-is-us.org` unless the user explicitly asks to use the legacy shared domain.
- For Astro frontend code, use `/home/anchor/projects/skovgard2026/src/constants.ts` as the shared source of truth for `MEDIA_BASE_URL`.
- For Worker/runtime configuration, use `/home/anchor/projects/skovgard2026/worker/wrangler.toml` as the authoritative source of the deployed `MEDIA_BASE_URL`.
- Public CDN URLs should use the host plus the exposed path, for example:
  - `https://media.skovgard2026.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3`
  - `https://media.skovgard2026.org/townhall/intro_townhall.mp4`
- The underlying R2 object key may include a bucket-prefix path such as `podcasts/{guest_slug}/{episode_date}/{filename}.mp3`, but the public CDN URL should not add `podcasts/` unless the deployed route explicitly includes it.
- If a media file appears broken, check:
  - the URL rendered by the Astro page
  - `src/constants.ts`
  - `worker/wrangler.toml`
  - the actual public `curl -I` response for the final URL

## Astro Pages Deploy

- **`DIRECT=1 ./scripts/deploy_cf.sh` is the deploy path — always use it.** Policy as of 2026-07-24: this machine is the source of truth for what's live, not `origin/main`. Cloudflare Pages Git integration was confirmed disconnected 2026-07-24 (see `docs/deploy.md`) — a push to `main` no longer triggers anything on Cloudflare's side.
- Plain `./scripts/deploy_cf.sh` (no flags) only builds and pushes as a verification/version-control step — it does not deploy and should not be treated as one.

## Worker Deploy

- Use `./scripts/deploy_worker.sh` for production Worker deploys.
- That script is the canonical path for this repo. It requires the project-local pinned CLI and runs `npx --no-install wrangler deploy --env production --name skovgard2026-api` from `worker/` so Wrangler cannot download a moving version or create/target `skovgard2026-api-production`.
- Do not use plain `npx wrangler deploy --env production` for this repo unless the target Worker name has been reverified in Cloudflare.
- `scripts/deploy_cf.sh` is for the Astro Pages site only. It does not publish the API Worker.

## Worker `wrangler.toml` vars

- `worker/wrangler.toml` contains shared `[vars]`, production `[env.production.vars]`, and preview `[env.preview.vars]`.
- The canonical production deploy path in this repo uses `--env production`, so production behavior should be checked against `[env.production.vars]` first, then against shared `[vars]` defaults.
- When a feature looks wired correctly in code but behaves differently in production, check the relevant flags in both blocks before changing app logic.

## Candidates Sub-project (Wyoming 2026 Voter Guide)

The voter guide lives in `Candidates/` — a standalone Astro 6 SSR project deployed to `candidates.skovgard2026.org`. It has its own Wrangler config, D1 databases, and package separate from the main campaign site.

**Data reference:** `Candidates/candidate_data.md` — full D1 schema, field definitions, migration history, enrichment batch workflow, and database bindings.

- D1 tables: `offices` and `candidates`; binding name `WY_DB` in both environments.
- Enrichment CSVs live in `Candidates/db/seed/`. Regenerate UPDATE SQL with `node Candidates/scripts/generate_enrichment_sql.mjs`.
- Worker name: `skovgard-candidates` (see `Candidates/wrangler.toml`). Never mix with `skovgard2026-api`.
- All 10 enrichment batches (rows 1–200) are complete in `Candidates/db/seed/`.
- **Deploy:** use `./scripts/deploy_candidates.sh` from the repo root. Do NOT run `npx wrangler deploy --env production` directly — there is no `[env.production]` block and Wrangler may deploy as `skovgard-candidates-production`.

## Messages Workflow ("Latest From Jimmy")

**New messages (video, essay, survey, tool) go to `/messages`, not
`/share`.** Canonical process, including the required-inputs checklist:
`docs/media/AddMessage.md`. Every new video needs **both** an R2 upload +
D1 `podcast_uploads` row (`docs/media/AddCampaignVideo.md` — feeds the
homepage's "More to hear" row and `/podcast`) **and** a
`src/content/messages/<slug>.md` entry (feeds `/messages` itself); the two
are independent systems.

**Hard rule: do not invent campaign message content.** If given a video or
topic with only a short summary and no body/explanation text, ask for it —
or explicit permission to draft it for the user's review — before
publishing. Don't write Jimmy's substantive message copy from a one-line
prompt.

## Share Message Workflow (legacy `/share/<slug>` pages only)

The ~27 pre-existing `/share/<slug>` pages are unaffected by the above and
still use the old flow until each is gradually converted — see
`docs/share/AddShareMessage.md`'s transition notice. To add a new page in
this legacy system, follow the checklist in `docs/share/AddShareMessage.md`.
Key files: `worker/src/email-template.js` (SHARE_MESSAGES registry +
plain-text builder), `src/components/ShareListing.astro` (card grid), and a
new `src/pages/share/<slug>.astro` detail page. No D1 migration is needed
for a new message.

- If the share email makes verifiable public claims, create `src/pages/share/<slug>/sources.astro` and point the email CTA in `body_html` to `https://skovgard2026.org/share/<slug>/sources/` — never back to the share page itself.

## Contact Import Workflow (Signup Sheets → Admin Portals)

When a user provides a signup-sheet CSV to be imported into the SMS/email systems:

1. Read `docs/update_new_contact_emails_texts.md` for the step-by-step operations guide.
2. Read `docs/UpsertOptinData.md` for the technical field mapping and script reference.
3. Required sequence: normalize CSV columns → transform → review `source-audit.csv` → SQLite test → surface issues → confirm → production push.
4. The admin portals (`static/admin/texting/index.html`, `static/admin/emails/index.html`) are web UIs backed by the D1 database — **they do not need to be edited** to add contacts. Contacts flow in via the upsert scripts.
5. Never commit raw signup CSVs or any file from `docs/db/data/optin-import/`.

See also: `AGENTS.md` → "CSV Import Workflow" for the full required sequence and data quality gates.

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

Do not reference `config/_default/config.toml`, `layouts/`, or Hugo-era paths — those directories no longer exist. If local files conflict with a generic instruction or prior memory, the repo content wins unless the user directs otherwise.

## Project Scope Guard

- Do not import policy from other repos or organizations into this repo just because names or files look similar.
- If a rule mentions another project by name, stop treating it as authoritative for this repo unless the user explicitly says to reuse it here.
- Prefer values already established in this repo over values remembered from other work.
- Before changing public-facing campaign identity fields such as emails, domains, org names, donation links, form destinations, or legal/contact copy, verify them against this repo first.

## WORM Data Protocol

WORM protocol is in effect for this project. Treat operational records as write-once/read-many data unless the user explicitly authorizes a corrective migration or administrative update.

- Do not hard-code dropdown options, form action choices, campaign workflow statuses, or admin-select lists in frontend JavaScript, Astro pages, or standalone HTML when those values represent operational data.
- Link dropdowns and other form actions to the appropriate database-backed tables or API endpoints. If the table or endpoint does not exist yet, propose or add the table/API path rather than embedding a static list.
- Keep display labels, ordering, active/inactive flags, and form action metadata in tables or the Worker registry where admins or migrations can maintain them.
- Static hard-coded lists are acceptable only for true UI constants that are not operational records — view modes, layout preferences, or client-only sorting controls.
- When converting a hard-coded form list to table-backed or API-backed data, preserve existing submitted values and avoid rewriting historical records unless a user-approved migration requires it.

## Cloudflare Worker Naming

- Never guess at Worker names for preview or production.
- Before suggesting `wrangler secret`, `wrangler deploy`, `wrangler tail`, `wrangler d1`, or route-related commands against a named environment, check `worker/wrangler.toml` first and state the exact Worker name implied by the config.
- Treat Wrangler environment naming as authoritative: if `name = "X"` and the command uses `--env production`, assume Wrangler will target `X-production` unless the repo config explicitly overrides that with `--name`.
- If the user is about to run a production command and the real remote Worker name has not been verified, tell them to verify it first rather than guessing.
- Do not recommend creating a new production Worker just because Wrangler prompts for one unless the user explicitly wants a new Worker created.

## Contact and Email Guardrails

- Do not replace an existing project email address with one from another project without explicit user approval.
- Do not invent, suggest, or publish new contact addresses unless the user asks for that change.
- If updating CTAs, forms, support text, or contact blocks, reuse addresses already present in this repo.
- If the correct contact address is ambiguous, ask the user or present the conflicting in-repo references before changing them.

## Repository Hygiene

- Suggest cleanup of odd or stray files created in the project root when you notice them.
- Keep edits scoped to the user request. Do not fold in unrelated cleanup or cross-project standardization unless asked.

## Local Testing Servers

- When starting local servers for testing, treat them as temporary and close them when the test is complete.
- Before finishing a task that used `wrangler dev` or another local server, verify that the listener has been shut down.
- Do not leave background test servers running after validation unless the user explicitly asks to keep one open.

## Admin Pages (standalone HTML in `static/`)

Admin pages like `static/admin/texting/index.html` and `static/admin/emails/index.html` are **standalone HTML files**, not Astro pages. They are served directly from the `static/` publicDir.

- Each admin page loads its own CSS and JS via `<link>` and `<script>` tags — no build pipeline or Astro component needed.
- Cache-busting: append a version query string (`?v=N`) when updating CSS/JS to avoid stale caches after deploy.
- When a control navigates to another admin page, use a styled `<a href="...">` tag rather than a `<button>` with JS `location.assign`.
- Local dev: access admin pages with the explicit filename — `http://localhost:4321/admin/texting/index.html`. Astro's dev server does not auto-resolve `index.html` for static directory URLs.

## Button CSS Rules (admin pages)

The global CSS reset in `global.css` and `forms.css` zeroes out all button appearance. Every `<button>` on admin pages must be covered by an explicit CSS rule that restores its visual treatment.

`forms.css` contains `main .optin-form button[type="submit"]` with specificity **(0, 2, 2)**. Any admin-page button rule using only class selectors will lose for `type="submit"` buttons inside `.optin-form`. Use an **ID selector** on the closest ancestor to raise specificity:

```css
/* CORRECT — specificity (1, 1, 1) */
#admin-texting-shell .button-row button { ... }

/* WRONG — specificity (0, 2, 1), loses to forms.css for submit buttons */
.admin-texting-shell .button-row button { ... }
```
