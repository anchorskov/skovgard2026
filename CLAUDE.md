# Claude Instructions for `skovgard2026`

These notes are repo-local and apply inside `/home/anchor/projects/skovgard2026`.

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

## Worker Deploy

- Use `./scripts/deploy_worker.sh` for production Worker deploys.
- That script is the canonical path for this repo. It runs `npx wrangler deploy --env production --name skovgard2026-api` from `worker/` so Wrangler does not create or target `skovgard2026-api-production`.
- Do not use plain `npx wrangler deploy --env production` for this repo unless the target Worker name has been reverified in Cloudflare.
- `scripts/deploy_cf.sh` is for the Astro Pages site only. It does not publish the API Worker.

## Worker `wrangler.toml` vars

- `worker/wrangler.toml` contains shared `[vars]`, production `[env.production.vars]`, and preview `[env.preview.vars]`.
- The canonical production deploy path in this repo uses `--env production`, so production behavior should be checked against `[env.production.vars]` first, then against shared `[vars]` defaults.
- When a feature looks wired correctly in code but behaves differently in production, check the relevant flags in both blocks before changing app logic.
