# Production Error Fixes - January 15, 2026

## Issues Resolved

| # | Issue | Root Cause | Fix | Files Changed |
|---|-------|-----------|-----|----------------|
| 1 | `/js/site-ui.js` returns **404 with HTML** Content-Type instead of JS | Cloudflare Pages not building/publishing `public/` directory, OR incorrect build output directory setting | **Verify/Fix Pages build settings** (see Step 1 below) | N/A (Configuration, not code) |
| 2 | `/api/config` returns **404** when called as same-origin | Worker routes not configured; API calls were hardcoded to `workers.dev` subdomain which doesn't have the routes | Update `wrangler.toml` to attach Worker to `/api/*` on production domains | `worker/wrangler.toml` |
| 3 | Browser sends API calls to **workers.dev** instead of same-origin | Production API URL hardcoded to `https://skovgard2026-api.anchorskov.workers.dev` | Change to same-origin (`""`) for production | `static/js/env.js` |

---

## Code Changes (Already Committed)

### 1. static/js/env.js - Use same-origin for production API

**Commit:** `12424c2` - "fix: use same-origin for API calls in production, attach Worker routes to Pages domains"

```diff
- const PROD_API  = 'https://skovgard2026-api.anchorskov.workers.dev';
+ const PROD_API  = ''; // Same-origin: calls will use /api/config, /api/donate/*, etc.
```

**Behavior:**
- **Local (localhost):** Uses `http://localhost:8787` (dev Worker)
- **Production:** Uses same-origin `https://www.skovgard2026.org/api/*` (requires Worker route below)
- **Preview:** Uses same-origin `https://skovgard2026.pages.dev/api/*` (requires Worker route below)

---

### 2. worker/wrangler.toml - Attach Worker to Pages domains

**Commit:** `12424c2` (same as above)

```toml
# Routes: attach Worker to /api/* paths on production domains
[[routes]]
pattern = "www.skovgard2026.org/api/*"
zone_name = "skovgard2026.org"

[[routes]]
pattern = "skovgard2026.org/api/*"
zone_name = "skovgard2026.org"
```

**What this does:**
- Tells Cloudflare to route **all requests** to `/api/*` on `www.skovgard2026.org` and `skovgard2026.org` to the Worker
- Requests like `GET /api/config` from the form will now be handled by Worker instead of returning Pages 404

---

## Deployment Checklist

### ✅ Step 1: Verify/Fix Cloudflare Pages Build Settings

**Issue:** `static/js/site-ui.js` is locally built but missing in production.

**In Cloudflare Dashboard:**
1. Go to **Pages** → **skovgard2026**
2. Click **Settings** → **Builds & Deployments**
3. Verify these settings:
   - **Build command:** `hugo` (or `hugo build`)
   - **Build output directory:** `public` (case-sensitive)
   - **Root directory:** `/` (or leave blank if repo root)
   - **Node.js version:** 18 or higher (if needed)

**If these are wrong, update them and trigger a new deployment:**
```
Pages > skovgard2026 > All Deployments > [latest] > Redeploy
```

**After Pages rebuild completes:**
```bash
curl -I https://www.skovgard2026.org/js/site-ui.js
# Should return: HTTP/2 200 with Content-Type: application/javascript
```

---

### ✅ Step 2: Deploy Worker with New Routes

**In your terminal:**
```bash
cd /home/anchor/projects/skovgard2026/worker
wrangler deploy --env production
```

**Verify deployment succeeded:**
```bash
curl -I https://www.skovgard2026.org/api/config
# Should return: HTTP/2 200 with Content-Type: application/json; charset=utf-8
```

---

### ✅ Step 3: Push Code Changes (Already Done)

```bash
cd /home/anchor/projects/skovgard2026
git push origin main
# Commit 12424c2 is already pushed
```

This triggers Cloudflare Pages to rebuild with the updated `static/js/env.js`.

---

## Expected Production Behavior After Fixes

### Before:
```bash
$ curl -I https://www.skovgard2026.org/js/site-ui.js
HTTP/2 404
Content-Type: text/html; charset=utf-8

$ curl -I https://www.skovgard2026.org/api/config
HTTP/2 404
Content-Type: text/html; charset=utf-8
```

### After:
```bash
$ curl -I https://www.skovgard2026.org/js/site-ui.js
HTTP/2 200
Content-Type: application/javascript
content-length: 4806

$ curl -I https://www.skovgard2026.org/api/config
HTTP/2 200
Content-Type: application/json; charset=utf-8

$ curl -s https://www.skovgard2026.org/api/config | jq .
{
  "stripePublishableKey": "pk_live_..."
}
```

---

## Local Testing (Already Passing)

All changes work correctly in development:

```bash
# Terminal 1: Hugo server
scripts/devStart.sh

# Terminal 2: Worker dev
cd worker && wrangler dev

# Terminal 3: Test API endpoint (same-origin on port 1313)
curl -s http://localhost:1313/api/config
# Returns 404 because Hugo doesn't handle /api/*
# But that's correct—browser requests will route to http://localhost:8787 via env.js

curl -s http://localhost:8787/api/config
# Returns: {"stripePublishableKey":"pk_test_..."}

# Test the form loads without errors
open http://localhost:1313/donatev1/
```

---

## Notes

1. **Why use same-origin in production?**
   - Avoids CORS complexity when browser and API are on same hostname
   - Reduces attack surface (no cross-origin requests)
   - Worker routes handle the internal routing

2. **Why NOT use workers.dev in production?**
   - `workers.dev` subdomain doesn't have routes configured
   - Would require keeping hardcoded hostname (brittle for migrations)
   - Would violate same-origin policy for credentials/cookies

3. **Why does local still work?**
   - `env.js` detects `localhost` and uses `http://localhost:8787` directly
   - This bypasses the same-origin requirement (different ports = different origin, but we explicitly allow it)

4. **Caddyfile was dev-only:**
   - The Caddyfile changes we made earlier only apply to local development (`scripts/devStart.sh`)
   - Production uses Cloudflare Workers + Pages, not Caddy
   - Production doesn't need the Caddyfile MIME type fix

---

## Git Commit Reference

**Commit:** `12424c2`
**Message:** `fix: use same-origin for API calls in production, attach Worker routes to Pages domains`
**Files:**
- `static/js/env.js` (+2, -2 lines)
- `worker/wrangler.toml` (+5, -4 lines)
