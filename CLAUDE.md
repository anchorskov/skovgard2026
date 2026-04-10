# Claude Instructions for `skovgard2026`

These notes are repo-local and apply inside `/home/anchor/projects/skovgard2026`.

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

## Worker Deploy & `wrangler.toml` var blocks

`worker/wrangler.toml` has **three var blocks**:

| Block | Used when |
|---|---|
| `[vars]` | `npx wrangler deploy --config worker/wrangler.toml` (no `--env`) — **this is what runs in production** |
| `[env.production.vars]` | `npx wrangler deploy --config worker/wrangler.toml --env production` — NOT used because it creates a route conflict |
| `[env.preview.vars]` | Pages preview builds only |

**Always deploy without `--env`** — the top-level `[[routes]]` and `[vars]` are what Cloudflare serves on `www.skovgard2026.org/api/*`.

### Feature flags that default OFF and must be ON in `[vars]`

Several flags are `"0"` in `[vars]` as a safe default but need to be `"1"` in production. Verify these are set correctly in the **`[vars]` block** (not just in `[env.production.vars]`) before telling a user a feature is live:

- `ADMIN_EMAIL_ENABLED` — must be `"1"` for the admin email portal Send button to be active. Was mistakenly `"0"` in `[vars]` while `"1"` only in the unused `[env.production.vars]`, causing "Sending is still disabled by configuration."
- `TEXTING_WELCOME_ENABLED` — `"0"` by default; set to `"1"` to activate welcome texts.
- `PULSE_EMAIL_ENABLED` — `"0"` by default; set to `"1"` in `[vars]` to enable Pulse opt-in emails.

When a feature appears broken despite looking correctly wired in code, **check `[vars]` in `wrangler.toml` first** before diving into JS or Worker logic.
