# Deployment

## Cloudflare Pages Git Integration

This site is deployed via **Cloudflare Pages Git integration** (not GitHub Actions).

### How it works

1. **Push to `main`** → Cloudflare automatically detects the push and builds the site
2. **Pull requests** → Cloudflare creates preview deployments automatically
3. **No API tokens needed** in GitHub — Cloudflare handles authentication via its Git connection

### Why not GitHub Actions?

We previously used `cloudflare/pages-action@v1` in GitHub Actions, but this requires storing a `CLOUDFLARE_API_TOKEN` secret in GitHub. The Cloudflare Pages Git integration is simpler and more secure:

- No secrets to manage or rotate
- Build logs visible in Cloudflare dashboard
- Automatic preview deployments for PRs

### Build Configuration (in Cloudflare Dashboard)

| Setting | Value |
|---------|-------|
| Build command | `npm ci && npm run unocss && hugo --minify` |
| Build output directory | `public` |
| Root directory | `/` |
| Environment variable | `HUGO_VERSION=0.146.6` |

### Triggering a Deploy

Simply push to `main`:

```bash
git add .
git commit -m "your commit message"
git push origin main
```

Cloudflare will automatically build and deploy within a few minutes.

---

*Last updated: February 2, 2026*
