-- 0001_candidates_schema.sql
-- Wyoming 2026 Primary voter guide

CREATE TABLE IF NOT EXISTS offices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  level       TEXT    NOT NULL CHECK (level IN ('federal','statewide','wy_senate','wy_house','county','city')),
  district    INTEGER,   -- NULL for federal / statewide
  sort_order  INTEGER    NOT NULL DEFAULT 0
);

-- Separate partial indexes so NULL-district uniqueness works correctly in SQLite
CREATE UNIQUE INDEX IF NOT EXISTS uq_offices_statewide
  ON offices(title) WHERE district IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_offices_district
  ON offices(title, district) WHERE district IS NOT NULL;

CREATE TABLE IF NOT EXISTS candidates (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id            INTEGER NOT NULL REFERENCES offices(id),
  party                TEXT    NOT NULL,       -- Republican | Democratic | Libertarian
  full_name            TEXT    NOT NULL,
  slug                 TEXT    NOT NULL UNIQUE, -- URL key: "harriet-hageman"
  city                 TEXT,
  state                TEXT    NOT NULL DEFAULT 'WY',
  zip                  TEXT,
  mailing_address      TEXT,
  phone                TEXT,
  email                TEXT,
  filed_at             TEXT,                   -- ISO-8601: 2026-05-15
  withdrawn_at         TEXT,                   -- NULL = still active
  source_page          INTEGER,                -- PDF page ref for audit

  -- Enrichment fields — all NULL until filled in manually
  photo_url            TEXT,
  summary              TEXT,                   -- 1–2 sentence teaser
  bio_full             TEXT,                   -- long-form markdown
  occupation           TEXT,
  education            TEXT,
  hometown             TEXT,
  years_in_wyoming     INTEGER,
  website_url          TEXT,
  facebook_url         TEXT,
  twitter_url          TEXT,
  instagram_url        TEXT,
  youtube_url          TEXT,
  endorsements_json    TEXT,                   -- JSON array of strings
  campaign_finance_url TEXT,
  intro_video_url      TEXT,

  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_candidates_office ON candidates(office_id);
CREATE INDEX IF NOT EXISTS idx_candidates_party  ON candidates(party);
CREATE INDEX IF NOT EXISTS idx_candidates_slug   ON candidates(slug);
