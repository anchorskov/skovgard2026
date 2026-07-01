# Add a Campaign Video to the Site

Campaign videos are short-form messages, issue shorts, and town hall clips filmed by Jimmy and uploaded to R2. Once registered in D1, they surface automatically on the landing page "On the Record" section — no code changes, no deploy.

**Canonical guide for agents:** Follow this file when the user says "add a campaign video to the site" or "register a new video in R2."

---

## How the System Works

- R2 bucket: `podcasts`
- Campaign video keys use the prefix `videos/` (e.g., `videos/wyoming-not-for-sale.mp4`)
- D1 table: `podcast_uploads` in `ballot_sources`, binding `DB`
- All campaign videos use `guest_slug = 'campaign'`
- The Worker endpoint `/api/podcasts` returns all rows; the landing page filters client-side for `guest_slug === 'campaign'`
- Landing page sorts by `episode_date DESC`: most recent fills slot 2 of the "On the Record" grid; remaining videos appear as clickable chips in an "Older Videos" row below the grid
- Clicking an "Older Videos" chip swaps the video player in slot 2 in-place
- If the video has a corresponding `/share/<slug>` page, the card shows a "Watch & Share →" link

---

## Step 1: Upload the video to R2

From the repo root:

```bash
npx wrangler r2 object put "podcasts/videos/{filename}.mp4" \
  --file "/path/to/local/video.mp4" \
  --remote
```

Verify it's live:

```bash
curl -I "https://media.skovgard2026.org/videos/{filename}.mp4"
# Expect: HTTP/2 200  Content-Type: video/mp4
```

### R2 key conventions for campaign videos

| Type | Key pattern |
|---|---|
| Issue message / short | `videos/{descriptive-slug}.mp4` |
| Town hall clip | `townhall/{descriptive-slug}.mp4` |

Use lowercase kebab-case matching the share page slug where one exists.

---

## Step 2: Gather metadata

```bash
# File size
wc -c < /path/to/video.mp4

# Duration — convert output seconds to MM:SS
ffprobe -v error -show_entries format=duration -of csv=p=0 /path/to/video.mp4
# e.g. 456 seconds → "7:36"

# Real SHA256 (preferred when file is available locally)
sha256sum /path/to/video.mp4
```

If the file is only in R2 (not on disk), use a deterministic placeholder hash so the UNIQUE constraint is satisfied:

```bash
python3 -c "
import hashlib
r2_key = 'videos/your-filename.mp4'
print(hashlib.sha256(f'legacy:{r2_key}'.encode()).hexdigest())
"
```

---

## Step 3: Check for a matching share page

Does `/share/{slug}` exist?

```bash
ls /home/anchor/projects/skovgard2026/src/pages/share/ | grep {slug}
```

If yes, put that slug in the `summary` JSON. If no share page exists, set `"slug": null`.

---

## Step 4: Register in D1

```bash
npx wrangler d1 execute ballot_sources --env production --remote --command "
INSERT OR IGNORE INTO podcast_uploads (guest_slug, episode_date, part_number, r2_key, sha256, bytes, summary)
VALUES (
  'campaign',
  'YYYY-MM-DD',
  1,
  'videos/your-filename.mp4',
  'sha256-hex-here',
  BYTES_HERE,
  '{\"title\": \"Video Title\", \"slug\": \"share-page-slug-or-null\", \"duration\": \"M:SS\"}'
);"
```

> **WORM rule:** Use `INSERT OR IGNORE`. Never UPDATE or DELETE existing rows except via an approved corrective migration.

### `summary` JSON fields

| Field | Value |
|---|---|
| `title` | Display title shown in the card and chip (e.g., "Wyoming Is Not for Sale") |
| `slug` | Share page slug (e.g., `"wyoming-not-for-sale"`) or `null` |
| `duration` | Formatted duration (e.g., `"7:36"`) or `null` |

---

## Step 5: Verify

```bash
# Confirm row in D1
npx wrangler d1 execute ballot_sources --env production --remote --command \
  "SELECT guest_slug, episode_date, r2_key, summary FROM podcast_uploads WHERE guest_slug='campaign' ORDER BY episode_date DESC;"

# Confirm API returns the new video
curl -s "https://www.skovgard2026.org/api/podcasts" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for e in data['episodes']:
    if e['guest_slug']=='campaign': print(e['episode_date'], e['url'])
"
```

The new video appears on the landing page immediately — no deploy needed.

---

## Step 6: Check landing page behavior

Open `https://www.skovgard2026.org` and scroll to "On the Record":

- If the new video's `episode_date` is the most recent, it fills slot 2
- If an older video was previously in slot 2, it moves to the "Older Videos" chip row
- Click each chip to confirm the video player swaps correctly

---

## Checklist

- [ ] Video uploaded to R2 (`videos/{filename}.mp4`)
- [ ] R2 URL verified with `curl -I` → HTTP 200
- [ ] File size in bytes obtained
- [ ] Duration formatted as `MM:SS`
- [ ] SHA256 obtained (real or legacy placeholder)
- [ ] Share page slug confirmed or set to `null`
- [ ] D1 row inserted with `INSERT OR IGNORE`
- [ ] D1 row verified with SELECT query
- [ ] API response verified (`/api/podcasts` includes new video)
- [ ] Landing page "On the Record" section checked in browser

---

## Current Campaign Videos (as of 2026-07-01)

| episode_date | title | r2_key |
|---|---|---|
| 2026-06-27 | Wyoming Is Not for Sale | `videos/wyoming-not-for-sale.mp4` |
| 2026-06-22 | Wyoming Family Economy | `videos/2026-06-22-07-37-11.mp4` |
| 2026-06-21 | Higher Prices, Endless Wars, Washington Debt | `videos/higher-prices-washington-debt.mp4` |
| 2026-06-14 | Citizens Defend the Constitution | `videos/Jimmy_6-14.mp4` |
| 2026-04-09 | Town Hall Introduction | `townhall/intro_townhall.mp4` |

Query D1 for the authoritative current list — the table above may be out of date.
