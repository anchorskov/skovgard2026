-- 0006_polling_locations.sql
-- City-based polling location lookup for the Wyoming voter guide.
-- `city` is the voter's home city (lookup key); `address` is the full physical
-- address of the polling place (may be in a different city for small precincts).
CREATE TABLE IF NOT EXISTS polling_locations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  county          TEXT    NOT NULL COLLATE NOCASE,
  precinct_code   TEXT,
  precinct_name   TEXT,
  location_name   TEXT    NOT NULL,
  address         TEXT    NOT NULL,
  city            TEXT    NOT NULL COLLATE NOCASE,
  zip             TEXT,
  election_year   INTEGER NOT NULL DEFAULT 2026,
  county_clerk_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_poll_county_precinct
  ON polling_locations(county, precinct_code);

CREATE INDEX IF NOT EXISTS idx_poll_county_city
  ON polling_locations(county, LOWER(city));
