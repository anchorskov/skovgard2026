# Podcast Workflow — skovgard2026

> **Last updated:** July 2026  
> **Architecture:** Astro 6 static site + Cloudflare Worker + D1 + R2  
> **Note:** The previous version of this file described a Hugo + Hugo shortcode workflow. Hugo is no longer used. Do not follow any Hugo instructions.

---

## Overview: Two Content Streams

The podcast page (`/podcast`) and the landing page "On the Record" section pull from two independent sources. Neither requires code changes when new content is added.

| Stream | Source | How surfaced | Maintenance |
|---|---|---|---|
| **Daily Substack episodes** | `https://jimskovgard.substack.com/feed` | Worker proxies RSS → `/api/podcast-feed` | Zero — post to Substack, done |
| **Hosted episodes** (audio/video) | Cloudflare R2 + D1 `podcast_uploads` | Worker queries D1 → `/api/podcasts` | One D1 row per file |

---

## Stream 1: Substack Daily Episodes

Jimmy posts every morning at `https://jimskovgard.substack.com/`. No action is needed in this repo. The Worker endpoint `/api/podcast-feed` proxies the RSS feed and returns up to 20 episodes as JSON. The podcast page and landing page fetch this endpoint on page load.

**Cache:** 1-hour CDN cache, 24-hour stale-while-revalidate. Changes appear within the hour.

**If the feed appears broken:** check `worker/src/index.js` → the `parseSubstackRSS()` function and the `/api/podcast-feed` route. Confirm the upstream fetch includes a `User-Agent` header — without it Substack may reject the request. Do **not** add `cf: { cacheEverything: true }` to the upstream fetch; it causes Cloudflare to cache an empty response.

---

## Stream 2: Hosted Episodes (R2 + D1)

Use this stream for long-form interviews, multi-part series, and campaign videos stored in R2.

### Architecture

- **R2 bucket:** `podcasts`
- **CDN host:** `https://media.skovgard2026.org`
- **Public URL:** `https://media.skovgard2026.org/{r2_key}`
- **D1 table:** `podcast_uploads` in `ballot_sources` database (binding `DB`)
- **API endpoint:** `/api/podcasts` — returns all rows ordered by `episode_date DESC`

### Table schema

```sql
CREATE TABLE podcast_uploads (
  id           INTEGER PRIMARY KEY,
  guest_slug   TEXT NOT NULL,
  episode_date TEXT NOT NULL,       -- YYYY-MM-DD
  part_number  INTEGER,
  r2_key       TEXT NOT NULL UNIQUE, -- path within R2 bucket, no leading slash
  sha256       TEXT NOT NULL UNIQUE,
  bytes        INTEGER,
  uploaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  summary      TEXT                 -- JSON: {"title":"...","slug":"...","duration":"..."}
);
```

### `summary` JSON format

The `summary` column is a JSON string used by the podcast page and landing page to display metadata:

```json
{"title": "Episode Title", "slug": "share-page-slug", "duration": "38:04"}
```

- `title` — display title shown on the site
- `slug` — share page slug if a `/share/<slug>` page exists (set to `null` if none)
- `duration` — formatted `MM:SS` (set to `null` if unknown)

### URL construction

The Worker builds the public URL as `${MEDIA_BASE_URL}/${r2_key}`. The `r2_key` in the table should **not** include a leading slash. Examples:

| r2_key | Public URL |
|---|---|
| `jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3` | `https://media.skovgard2026.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3` |
| `videos/wyoming-not-for-sale.mp4` | `https://media.skovgard2026.org/videos/wyoming-not-for-sale.mp4` |

### `guest_slug` conventions

| Value | Used for |
|---|---|
| `jack-daniels`, `jr-riggins` | Named guest interviews |
| `campaign` | Campaign videos (shorts, town halls, issue messages) |

Multi-part episodes use the same `guest_slug` and `episode_date` with `part_number` 1, 2, 3 … The podcast page groups them automatically by `guest_slug|episode_date`.

---

## Adding a New Hosted Episode (Audio or Video)

### Step 1: Upload to R2

From the repo root:

```bash
npx wrangler r2 object put "podcasts/{r2_key}" \
  --file /path/to/local/file.mp3 \
  --remote
```

For audio interviews, the conventional key pattern is:
```
{guest-slug}/{YYYY-MM-DD}/{FILENAME}.mp3
```

For campaign videos:
```
videos/{descriptive-name}.mp4
```

Verify the upload:
```bash
curl -I "https://media.skovgard2026.org/{r2_key}"
# Expect: HTTP/2 200
```

### Step 2: Get file metadata

```bash
# File size in bytes
wc -c < /path/to/file.mp3

# Real SHA256 (use this when the file is available locally)
sha256sum /path/to/file.mp3

# Duration (audio or video)
ffprobe -v error -show_entries format=duration -of csv=p=0 /path/to/file.mp3
# Convert seconds → MM:SS manually or: python3 -c "s=2284; print(f'{s//60}:{s%60:02d}')"
```

If the file is not available locally (already in R2 only), use a placeholder `sha256`:
```bash
python3 -c "import hashlib; print(hashlib.sha256(b'legacy:{r2_key}').hexdigest())"
```

### Step 3: Register in D1

```bash
npx wrangler d1 execute ballot_sources --env production --remote --command "
INSERT OR IGNORE INTO podcast_uploads (guest_slug, episode_date, part_number, r2_key, sha256, bytes, summary)
VALUES (
  'guest-slug',
  '2026-01-25',
  1,
  'guest-slug/2026-01-25/filename.mp3',
  'sha256hexhere',
  35369393,
  '{\"title\": \"Episode Title\", \"slug\": \"share-page-slug\", \"duration\": \"38:04\"}'
);"
```

Use `INSERT OR IGNORE` — the unique constraints on `r2_key` and `sha256` prevent duplicates silently.

### Step 4: Verify

```bash
npx wrangler d1 execute ballot_sources --env production --remote --command \
  "SELECT guest_slug, episode_date, r2_key, summary FROM podcast_uploads ORDER BY episode_date DESC LIMIT 10;"
```

Then hit the live API to confirm the new row appears:
```bash
curl -s "https://www.skovgard2026.org/api/podcasts" | python3 -m json.tool | grep -A5 "guest-slug"
```

### Step 5: No deploy needed

The Worker reads D1 at request time. New rows appear on the site immediately — no code change, no deploy.

---

## Multi-Part Episodes

Register each part as a separate row with the same `guest_slug` and `episode_date` but different `part_number`:

```bash
# Part 1
INSERT OR IGNORE INTO podcast_uploads (...) VALUES ('jr-riggins', '2025-12-14', 1, 'jr-riggins/2025-12-14/JR_RIGGINS_-01.mp3', ...);
# Part 2
INSERT OR IGNORE INTO podcast_uploads (...) VALUES ('jr-riggins', '2025-12-14', 2, 'jr-riggins/2025-12-14/JR_RIGGINS_-02.mp3', ...);
```

The podcast page groups all parts with the same `guest_slug|episode_date` key into a single episode block.

---

## Campaign Videos

Campaign videos use `guest_slug = 'campaign'`. For the specific D1 registration and landing page behavior, see `docs/media/AddCampaignVideo.md`.

---

## Podcast Page Architecture

`src/pages/podcast/index.astro` — three sections, all populated client-side:

1. **Latest from Substack** — fetches `/api/podcast-feed`, renders top 20 episodes with audio player if enclosure present
2. **Hosted Episodes** — fetches `/api/podcasts`, filters out `guest_slug = 'campaign'` rows, groups multi-part episodes
3. **More Conversations** — static array in frontmatter for YouTube/Facebook one-offs

External links (YouTube, Facebook) are a static array in the frontmatter — update them manually in `src/pages/podcast/index.astro` when needed.

---

## Troubleshooting

**Episode not showing on site:**
1. Check `npx wrangler d1 execute ballot_sources --env production --remote --command "SELECT * FROM podcast_uploads ORDER BY episode_date DESC LIMIT 5;"`
2. Check `curl -s https://www.skovgard2026.org/api/podcasts | python3 -m json.tool`
3. Check `curl -I https://media.skovgard2026.org/{r2_key}` for HTTP 200

**Audio/video URL broken (404):**
- Confirm the `r2_key` in D1 has no leading slash
- Confirm `MEDIA_BASE_URL` in `worker/wrangler.toml` `[env.production.vars]` equals `https://media.skovgard2026.org`
- Confirm the R2 object exists: `npx wrangler r2 object get "podcasts/{r2_key}" --remote --pipe > /dev/null && echo OK`

**Feed shows stale content:**
- The `/api/podcast-feed` response is CDN-cached for 1 hour. Wait or purge Cloudflare cache for that URL.
- Do NOT add `cf: { cacheEverything: true }` to the upstream Substack fetch — it causes empty cached responses.
