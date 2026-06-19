<!-- Candidates/README.md -->

# Skovgard Candidates Voter Guide

Standalone Astro 6 SSR app for the Wyoming 2026 voter guide at
`candidates.skovgard2026.org`.

## Stack

- Astro 6
- Cloudflare Pages adapter
- Cloudflare D1 binding: `WY_DB`
- Tailwind CSS v4 tokens aligned to the repo `theme-frontier` brand palette

## Commands

```sh
npm run dev
npm run build
npm run preview
```

## Data

The candidate schema, seed files, and enrichment workflow are documented in
`candidate_data.md`.

- D1 binding: `WY_DB` → `wy` database (local SQLite via `wrangler dev`; production via `--remote`)
- Worker/Pages project name: `skovgard-candidates`

Do not mix this app's D1 bindings or Worker names with the main
`skovgard2026-api` Worker.
