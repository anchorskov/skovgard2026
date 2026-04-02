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

- `scripts/deploy_cf.sh` is a site deploy helper for Cloudflare Pages. Its `wrangler pages deploy public --project-name skovgard2026 --branch main` command is correct for direct Pages deploys.
- That script does not publish the Worker in `worker/`.
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

## Repository Hygiene

- Suggest cleanup of odd or stray files created in the project root when you notice them.
- Keep edits scoped to the user request. Do not fold in unrelated cleanup or cross-project standardization unless asked.

## Local Testing Servers

- When starting local servers for testing, treat them as temporary and close them when the test is complete.
- Before finishing a task that used `wrangler dev` or another local server, verify that the listener has been shut down.
- Do not leave background test servers running after validation unless the user explicitly asks to keep one open.
