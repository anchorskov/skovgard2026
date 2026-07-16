<!-- docs/podcast_notes.md -->
# Podcast Flow — Architecture Notes & Known Issues

For step-by-step "how do I add an episode" instructions, use
[docs/PODCAST_WORKFLOW.md](/home/anchor/projects/skovgard2026/docs/PODCAST_WORKFLOW.md) —
that doc is current and correct, don't duplicate it here. This file is the
companion "why does it work this way, and what's bitten agents before"
reference — read it before changing anything in this flow, the same way
`docs/blast_tracking.md` works for the email Blast flow.

Last updated: 2026-07-16.

## Two independent content streams

| Stream | Source | Worker endpoint | Caching |
|---|---|---|---|
| Daily Substack episodes | `https://jimskovgard.substack.com/feed` (RSS) | `GET /api/podcast-feed` | Edge-cached at Cloudflare, see §2 |
| Hosted episodes (audio/video) | R2 bucket `podcasts` + D1 `podcast_uploads` (`ballot_sources`) | `GET /api/podcasts` | None — D1 read is cheap, no external dependency, always live |

Both are populated **client-side**, on every page load, by `src/pages/index.astro`
(landing page "On the Record" section) and `src/pages/podcast/index.astro`
(full podcast page). No SSR, no build-time fetch — this is a static Astro
site (`output: 'static'`), so there is no other way to surface dynamic
content.

## 1. Where the live code actually lives — a real trap

`/api/podcast-feed` and a version of `/api/optin` exist in **two files**:

- `worker/src/index.js` — the live implementation. `main = "src/index.js"`
  in `worker/wrangler.toml` is what's actually deployed.
- `worker/src/router.js` — a **dead, disconnected** earlier version. It has
  its own `export default { fetch }`, is never imported by `index.js`, and
  is not wired into the deployed Worker at all. Its `/api/optin` is a
  stripped-down version writing only to `sms_optins` — nothing like the
  current `consent_status`/voter-matching flow (see
  [docs/pulse_flow.md](/home/anchor/projects/skovgard2026/docs/pulse_flow.md)).

**Editing `router.js` does nothing in production.** This is an easy trap —
searching the repo for `podcast-feed` or `jimskovgard.substack` surfaces
both files with near-identical code, and only one of them is real. Confirm
`worker/wrangler.toml`'s `main` field before touching either.

## 2. `cacheEverything: true` is a real, documented trap — do not use it here

`docs/PODCAST_WORKFLOW.md` already warns about this (added 2026-07-01,
presumably from a real incident): **do not add `cf: { cacheEverything: true }`**
to the Substack upstream fetch in `/api/podcast-feed`. `cacheEverything`
caches whatever came back from the upstream **regardless of HTTP status or
body** — so a transient error, rate limit, or empty response gets cached
at Cloudflare's edge and served to every visitor for the full TTL, instead
of just failing once and recovering on the next request.

**This almost happened again on 2026-07-16.** The endpoint started
returning intermittent `502 {"error":"Feed unavailable","status":429}` —
Substack rate-limiting this Worker's shared Cloudflare egress IPs, not a
real Substack outage (confirmed: the feed loaded fine from outside
Cloudflare's IP range at the same moment). Root cause: `/api/podcast-feed`
has zero request-level caching on the Worker's fetch to Substack — every
unique visitor to either page that surfaces it triggers a **fresh live
fetch**, with only a browser-facing `cache-control` header (which does
nothing to reduce Worker→Substack request volume across different
visitors). Under real traffic that's exactly the pattern that trips a
rate limit.

The fix (without repeating the `cacheEverything` mistake) is
`cacheTtlByStatus`, which caches **only real success responses**:

```js
const upstream = await fetch("https://jimskovgard.substack.com/feed", {
  headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "..." },
  cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
});
```

`200-299` → cache for an hour, so most visitors within that window are
served from Cloudflare's edge instead of hitting Substack directly.
`300-599` → TTL 0, never cached — a transient error is retried fresh on
the very next request rather than getting stuck for an hour. This is the
pattern to reuse for any future "proxy a flaky third-party feed and cache
it" endpoint in this repo — cache success, never cache failure.

## 3. Known gaps / things to watch

- No server-side dedup beyond the edge cache in §2 — a burst of unique
  visitors within the same second, before the first response populates
  the cache, could still produce a short burst of concurrent Substack
  requests. Not currently a problem at this traffic volume; revisit if
  Substack rate-limiting recurs even with `cacheTtlByStatus` in place.
- `parseSubstackRSS` is a hand-rolled regex-based RSS parser (`worker/src/index.js`),
  not a real XML parser — fragile to any structural change in Substack's
  feed format (attribute ordering, namespace prefixes, CDATA edge cases).
  If episodes silently stop appearing (not an HTTP error, just an empty or
  malformed `episodes` array), suspect a feed-format change here first.
- Hosted-episode registration (`podcast_uploads`) has no automated
  validation that the referenced R2 object actually exists before the row
  goes live — `docs/PODCAST_WORKFLOW.md`'s Step 4 verification curl is
  manual, not enforced. A bad `r2_key` silently produces a 404 audio/video
  link on the live site.
