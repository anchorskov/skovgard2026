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

Do not reference `config/_default/config.toml`, `layouts/`, or Hugo-era paths — those directories no longer exist.

If those files conflict with a generic instruction file or prior memory, the repo content wins unless the user directs otherwise.

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
- For the production Worker routes currently attached to `skovgard2026-api`, use `cd worker && npx wrangler deploy --env production --name skovgard2026-api`.
- Do not use plain `npx wrangler deploy --env production` for this repo unless the target service name has been reverified; Wrangler may try to publish `skovgard2026-api-production`, which conflicts with the existing routed Worker.

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

- For signup-sheet and opt-in CSV import work, follow [docs/UpsertOptinData.md](/home/anchor/projects/skovgard2026/docs/UpsertOptinData.md).
- Never commit raw `.csv` signup data files to the git repo.
- Standard working folder for raw or generated CSV import artifacts: `/home/anchor/projects/skovgard2026/docs/db/data/optin-import/`
- That folder lives under `docs/db/data/`, which is already ignored by `.gitignore`.

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
