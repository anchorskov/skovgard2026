# Deployment

## Cloudflare Pages Git Integration

This site is deployed via **Cloudflare Pages Git integration**. The frontend is now an **Astro static build**, not Hugo.

### Current build expectations

Cloudflare Pages must be configured for Astro's output:

| Setting | Value |
|---------|-------|
| Framework preset | `Astro` or `None` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Environment variable | `NODE_VERSION=22.12.0` |

### Common failure modes after the Hugo → Astro migration

- If Pages is still using `hugo --minify`, the build will fail because the repo no longer deploys with Hugo.
- If Pages is still expecting `public`, deploys can fail or publish the wrong artifact because Astro builds to `dist`.
- If Pages is still using Node 18 or Node 20, Astro 6 will fail with an unsupported Node version error. The current project requires Node `>=22.12.0`.
- `HUGO_VERSION` is no longer needed for the site deploy and should be removed from the Pages project if it is still set.

### Triggering a deploy

Push to `main` and Cloudflare Pages will rebuild automatically:

```bash
git add .
git commit -m "your commit message"
git push origin main
```

### Direct CLI deploy

`scripts/deploy_cf.sh` now expects Astro output in `dist/` for direct `wrangler pages deploy` usage.

### Worker deploy

The API Worker in `worker/` is still a separate deploy target from the Astro Pages site.

---

*Last updated: April 9, 2026*
