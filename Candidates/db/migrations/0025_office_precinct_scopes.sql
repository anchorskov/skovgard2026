-- 0025_office_precinct_scopes.sql
-- Data-backed many-to-many precinct targeting for offices such as municipal wards.

CREATE TABLE IF NOT EXISTS office_precinct_scopes (
  office_id INTEGER NOT NULL REFERENCES offices(id),
  precinct_code TEXT NOT NULL,
  source_label TEXT,
  source_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (office_id, precinct_code)
);

CREATE INDEX IF NOT EXISTS idx_office_precinct_scopes_precinct
  ON office_precinct_scopes(precinct_code, office_id);
