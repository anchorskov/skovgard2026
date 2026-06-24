-- GPS lookup log: captures lat/lon and resolved address for GPS-triggered ballot lookups.
-- Used for analytics and improving district-matching coverage for Wyoming addresses.
CREATE TABLE IF NOT EXISTS gps_lookup_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lat            REAL    NOT NULL,
  lon            REAL    NOT NULL,
  resolved_address TEXT,
  city           TEXT,
  zip            TEXT,
  county         TEXT,
  wy_house       TEXT,
  wy_senate      TEXT,
  match_source   TEXT,
  coord_source   TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gps_lookup_log_created_at ON gps_lookup_log(created_at);
CREATE INDEX IF NOT EXISTS idx_gps_lookup_log_county ON gps_lookup_log(county);
