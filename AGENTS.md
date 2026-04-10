# Agent Instructions for `skovgard2026`

This file is repo-local. It applies only inside:

- `/home/anchor/projects/skovgard2026`
- Git remote: `git@github.com:anchorskov/skovgard2026.git`
- Public site/domain references for this repo: `skovgard2026.org`, `www.skovgard2026.org`, and project assets already used in this codebase

If instructions, names, domains, emails, or policies from another project appear here or in generated work, treat that as drift and do not apply them without explicit user approval.

## Project Scope Guard

- Do not import policy from other repos or organizations into this repo just because names or files look similar.
- If a rule mentions another project by name, stop treating it as authoritative for this repo unless the user explicitly says to reuse it here.
- Prefer values already established in this repo over values remembered from other work.
- Before changing public-facing campaign identity fields such as emails, domains, org names, donation links, form destinations, or legal/contact copy, verify them against this repo first.

## Local Source of Truth

When deciding what is valid for `skovgard2026`, check local files first:

- `config/_default/config.toml`
- `content/`
- `layouts/`
- `static/`
- `worker/wrangler.toml`
- `worker/src/`
- repo docs that explicitly describe this site

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

## Hugo Asset Loading Rules

### Never place `<link>` or `<script>` tags inside content files

Hugo content files (`.html`, `.md` in `content/`) render inside `<main>`, not `<head>`. A `<link rel="stylesheet">` written in a content file ends up in `<body>`, which browsers accept but which causes:

- CSS is applied out of cascade order — `forms.css` (loaded in `<head>`) wins over admin page styles even when the admin CSS has higher specificity.
- Stale-cache bugs: if the content file loads a plain `/css/admin-foo.css` path, browsers cache aggressively and may serve an old version after a deploy.

**Correct pattern for admin pages:** use a dedicated layout partial that conditionally emits the page-specific `<link>` and `<script>` inside `<head>`. Specifically:

- Per-page CSS → emit from `layouts/partials/extend_head.html` gated on `.Page.File.Path` or page type.
- Per-page JS → emit from `layouts/partials/extend_footer.html` (or a `foot.html` hook) for the same reason.
- Use Hugo's `resources.Get | fingerprint` on admin CSS/JS so that each deploy emits a hash-stamped URL. This eliminates stale-cache mismatches after pushes.

```html
{{/* layouts/partials/extend_head.html — correct approach */}}
{{- if eq .File.Path "admin/texting/index.html" }}
{{- $css := resources.Get "css/admin-texting.css" | fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}" integrity="{{ $css.Data.Integrity }}" crossorigin="anonymous">
{{- end }}
```

- Never add a bare `<link rel="stylesheet" href="/css/admin-*.css">` directly to a content file. If you need to attach CSS to a content page, move it to the appropriate layout partial.

### Local dev server requires config merge

Always start the local Hugo server with both configs merged, either via:

```
npm run dev        # uses package.json script
./startDev.sh
```

Running plain `hugo server` without the development config merge can cause the PaperMod stylesheet fingerprint to not resolve, breaking the page chrome while admin CSS still loads (visible as a broken layout on localhost only). This is a local-only symptom — production uses the built `public/` output.

### Cross-admin navigation: use `<a>`, not `<button>`

When a control navigates to another admin page (e.g. "Go to Emails"), use a styled `<a href="...">` tag rather than a `<button>` with a JS `location.assign`. Reasons:

- Avoids the button-reset+specificity fight described below.
- Correct semantic element for navigation.
- No JS event listener needed.

Style it to match the secondary button variant using the same ID-targeted rule pattern described in the Button CSS Rules section.

## Button CSS Rules (admin pages)

The PaperMod theme's global reset zeroes out all button appearance (`background: none; border: 0; padding: 0`). Every `<button>` on admin pages **must** be covered by an explicit CSS rule that restores its visual treatment.

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
