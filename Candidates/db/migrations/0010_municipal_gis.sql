-- Registry for city ward GIS layers used by address-specific municipal races.

CREATE TABLE IF NOT EXISTS municipal_gis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  county TEXT NOT NULL,
  municipality TEXT NOT NULL,
  mapserver_url TEXT NOT NULL,
  ward_layer INTEGER NOT NULL DEFAULT 0,
  ward_field TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  last_verified TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_municipal_gis_lookup
  ON municipal_gis(LOWER(county), LOWER(municipality), status);
