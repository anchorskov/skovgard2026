# Skovgard 2026 Podcast Workflow

## Overview
This document describes the complete process for uploading podcast episodes to skovgard2026.org and making them available on the podcast page.

## Architecture

### Components
- **Audio Storage**: Cloudflare R2 bucket named `podcasts`
- **Media CDN**: `https://media.this-is-us.org` (shared across projects)
- **Database**: D1 SQLite database `ballot_sources` with `podcast_uploads` table
- **Frontend**: Hugo static site generator with audio shortcode

### URL Structure
Podcasts are accessed via:
```
https://media.this-is-us.org/{guest_slug}/{episode_date}/{filename}.mp3
```

Example:
```
https://media.this-is-us.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3
https://media.this-is-us.org/jr-riggins/2025-12-14/JR_RIGGINS_-01.mp3
```

## Step 1: Prepare MP3 Files

### Location Options
- Primary: `/home/anchor/projects/Media_Conversion/sound_files/`
- This-is-us: `/home/anchor/projects/this-is-us/worker/jr-riggins/2025-12-14/`

### Naming Convention
Use consistent naming:
- Format: `{GUEST_NAME}_-{PART_NUMBER}.mp3` (e.g., `JR_RIGGINS_-01.mp3`)
- Or alternative: `part-01.mp3`, `part-02.mp3`, etc.

### Extract Duration
Use `ffprobe` to get audio duration:
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:precision=6 "Jack_Daniels_Jimmy_Skovgard_R2.mp3"
```

Convert seconds to MM:SS format for Hugo shortcode.

## Step 2: Upload to R2

### From Worker Directory
```bash
cd /home/anchor/projects/skovgard2026/worker
```

### Upload Command
```bash
wrangler r2 object put "podcasts/{guest_slug}/{episode_date}/{filename}.mp3" \
  --file /path/to/local/file.mp3 \
  --remote
```

### Example
```bash
wrangler r2 object put "podcasts/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3" \
  --file /home/anchor/projects/skovgard2026/data/Jack_Daniels_Jimmy_Skovgard_R2.mp3 \
  --remote
```

### Verify Upload
```bash
curl -I "https://media.this-is-us.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3"
```

Expected response: `HTTP/2 200` with `Content-Type: audio/mpeg`

## Step 3: Create Database Entry

### Query Existing Entries
```bash
cd /home/anchor/projects/skovgard2026/worker
wrangler d1 execute ballot_sources --remote \
  --command "SELECT guest_slug, episode_date, part_number, r2_key, bytes FROM podcast_uploads;"
```

### Insert New Entry
```bash
wrangler d1 execute ballot_sources --remote \
  --command "INSERT INTO podcast_uploads (guest_slug, episode_date, part_number, r2_key, sha256, bytes, summary) 
    VALUES ('jack-daniels', '2026-01-25', 1, 'podcasts/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3', 
    '1f4beed697460a6e0a3aa3dcff44763cdf6af6e9eeb3e3d613b06be521fdf2cb', 35369393, 
    'Jack Daniels and Jimmy discuss Wyoming Politics');"
```

### Get SHA256 Hash
```bash
sha256sum /path/to/file.mp3
```

## Step 4: Update podcast.md

### Location
`/home/anchor/projects/skovgard2026/content/podcast.md`

### Format
Use Hugo audio shortcode with **absolute HTTPS URLs**:

```markdown
## {Guest Name}, {Date}

### {Part/Title}
{{< audio title="{Full Title}" duration="{MM:SS}" src="https://media.this-is-us.org/{guest_slug}/{date}/{filename}.mp3" >}}
```

### Example
```markdown
## Jack Daniels, January 25, 2026

{{< audio title="Jack Daniels and Jimmy discuss Wyoming Politics and Concerns as we see it 1-25-26." duration="38:04" src="https://media.this-is-us.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3" >}}

## JR Riggins, December 14, 2025

### Stories of Redemption, Part 1
{{< audio title="JR Riggins Part 1" duration="18:42" src="https://media.this-is-us.org/jr-riggins/2025-12-14/JR_RIGGINS_-01.mp3" >}}
```

### Important Notes
- **Always use absolute HTTPS URLs** starting with `https://media.this-is-us.org/`
- Do NOT use relative paths - Hugo shortcode parameter parsing has issues with relative paths
- Include full path without `podcasts/` prefix (already part of bucket structure)
- Audio shortcode location: `layouts/shortcodes/audio.html`

## Step 5: Build and Commit

### Build Hugo
```bash
cd /home/anchor/projects/skovgard2026
hugo --destination public
```

### Verify Audio Output
```bash
grep "audio controls" public/podcast/index.html
```

Check that `src="https://media.this-is-us.org/..."` is populated (not empty).

### Git Workflow
```bash
# Stage changes
git add content/podcast.md

# Commit with descriptive message
git commit -m "Add {Guest Name} podcast episode

- Title: {Episode Title}
- Date: {Episode Date}
- Parts: {Number of parts}
- Duration: {Total duration}
- R2 Key: podcasts/{guest_slug}/{episode_date}/{filename}.mp3
- File Size: {Size} MB
- Verified: HTTP 200 from media.this-is-us.org"

# Push to GitHub
git push origin main
```

## Step 6: Verify on Live Site

### Test from Browser
Visit: `https://skovgard2026.org/podcast/`

Check:
- Audio player loads
- Play button works
- Audio streams without errors
- Download link works

### Test with curl
```bash
curl -I "https://media.this-is-us.org/{guest_slug}/{date}/{filename}.mp3"
```

Expected: `HTTP/2 200`

## Troubleshooting

### Audio Player Shows "0:00 / 0:00"
**Problem**: Audio source not loading
- Verify URL is absolute HTTPS URL (starts with `https://`)
- Check `curl -I` returns HTTP 200
- Verify R2 file exists in correct path

### File Not Found (HTTP 404)
- Check R2 key matches exactly (case-sensitive)
- Verify path format: `podcasts/{guest_slug}/{episode_date}/{filename}.mp3`
- Confirm upload completed without errors

### Duration Not Showing
- Extract duration with ffprobe
- Format must be MM:SS (e.g., "38:04", not "38:04.382")
- Manually enter - Hugo shortcode uses this value

## Database Schema

### Table: podcast_uploads
```sql
CREATE TABLE podcast_uploads (
  id INTEGER PRIMARY KEY,
  guest_slug TEXT NOT NULL,
  episode_date TEXT NOT NULL,
  part_number INTEGER,
  r2_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL UNIQUE,
  bytes INTEGER,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  summary TEXT
);
```

## Hugo Audio Shortcode

### Location
`layouts/shortcodes/audio.html`

### Parameters
- `title`: Episode title with description
- `duration`: Episode duration in MM:SS format
- `src`: **Absolute HTTPS URL** to MP3 file

### Output
Generates HTML5 `<audio>` element with controls and download link.

## Checklist for New Episodes

- [ ] MP3 file(s) prepared with proper naming
- [ ] Duration extracted and formatted (MM:SS)
- [ ] SHA256 hash computed
- [ ] File uploaded to R2 via wrangler
- [ ] R2 URL verified with curl (HTTP 200)
- [ ] Database entry created in podcast_uploads
- [ ] podcast.md updated with shortcode (absolute HTTPS URL)
- [ ] Hugo built locally
- [ ] HTML output verified (audio src populated)
- [ ] Changes committed with descriptive message
- [ ] Changes pushed to GitHub
- [ ] Live site tested (player loads, audio plays)

## Example: Complete Workflow

```bash
# 1. Extract duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:precision=6 \
  "Jack_Daniels_Jimmy_Skovgard_R2.mp3"
# Output: 2284.382041 seconds = 38:04

# 2. Get SHA256
sha256sum Jack_Daniels_Jimmy_Skovgard_R2.mp3
# Output: 1f4beed697460a6e0a3aa3dcff44763cdf6af6e9eeb3e3d613b06be521fdf2cb

# 3. Upload to R2
cd /home/anchor/projects/skovgard2026/worker
wrangler r2 object put "podcasts/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3" \
  --file /home/anchor/projects/skovgard2026/data/Jack_Daniels_Jimmy_Skovgard_R2.mp3 \
  --remote

# 4. Verify
curl -I "https://media.this-is-us.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3"

# 5. Add database entry
wrangler d1 execute ballot_sources --remote \
  --command "INSERT INTO podcast_uploads (guest_slug, episode_date, part_number, r2_key, sha256, bytes, summary) 
    VALUES ('jack-daniels', '2026-01-25', 1, 'podcasts/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3', 
    '1f4beed697460a6e0a3aa3dcff44763cdf6af6e9eeb3e3d613b06be521fdf2cb', 35369393, 'Jack Daniels discussion');"

# 6. Edit podcast.md
cd /home/anchor/projects/skovgard2026
# Add to content/podcast.md:
# {{< audio title="Jack Daniels and Jimmy..." duration="38:04" src="https://media.this-is-us.org/jack-daniels/2026-01-25/Jack_Daniels_Jimmy_Skovgard_R2.mp3" >}}

# 7. Build
hugo --destination public

# 8. Verify
grep "audio controls" public/podcast/index.html

# 9. Commit and push
git add content/podcast.md
git commit -m "Add Jack Daniels podcast episode - January 25, 2026"
git push origin main
```

## Related Documentation
- Hugo Audio Shortcode: `layouts/shortcodes/audio.html`
- Podcast Page: `content/podcast.md`
- Database Migrations: `worker/migrations/006_create_podcast_uploads.sql`
- Wrangler Config: `worker/wrangler.toml`

## Last Updated
January 27, 2026

## Notes
- All podcasts are stored in the shared `https://media.this-is-us.org` CDN
- D1 database is shared across `this-is-us.org` and `skovgard2026.org` projects
- Use absolute HTTPS URLs in Hugo shortcodes to avoid cross-domain loading issues
- File sizes are typically 8-35 MB per episode/part
