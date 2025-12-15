CREATE TABLE IF NOT EXISTS podcast_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug TEXT NOT NULL,        -- e.g. 'jr-riggins'
  episode_date TEXT NOT NULL,      -- ISO date (YYYY-MM-DD)
  part_number INTEGER NOT NULL,    -- 1..n for multipart episodes
  r2_key TEXT NOT NULL,            -- podcasts/<guest>/<date>/<file>.mp3
  sha256 TEXT NOT NULL,            -- dedupe payloads
  bytes INTEGER NOT NULL,          -- size in bytes
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_podcast_uploads_r2_key
  ON podcast_uploads(r2_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_podcast_uploads_sha256
  ON podcast_uploads(sha256);
CREATE UNIQUE INDEX IF NOT EXISTS ux_podcast_uploads_episode_part
  ON podcast_uploads(guest_slug, episode_date, part_number);
