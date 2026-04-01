CREATE TABLE IF NOT EXISTS wy_address_district_lookup (
  address_key TEXT NOT NULL,
  city_key TEXT NOT NULL,
  zip5 TEXT NOT NULL DEFAULT '',
  canonical_address1 TEXT NOT NULL,
  canonical_city TEXT NOT NULL,
  county TEXT,
  state_house_district TEXT,
  state_senate_district TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  district_variant_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (address_key, city_key, zip5)
);

CREATE INDEX IF NOT EXISTS idx_wy_address_district_lookup_city
  ON wy_address_district_lookup (city_key);

CREATE INDEX IF NOT EXISTS idx_wy_address_district_lookup_house
  ON wy_address_district_lookup (state_house_district);

CREATE INDEX IF NOT EXISTS idx_wy_address_district_lookup_senate
  ON wy_address_district_lookup (state_senate_district);

CREATE TABLE IF NOT EXISTS wy_district_coverage (
  district_type TEXT NOT NULL CHECK(district_type IN ('house', 'senate')),
  district_code TEXT NOT NULL,
  county TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (district_type, district_code, county, city)
);

CREATE INDEX IF NOT EXISTS idx_wy_district_coverage_type_code
  ON wy_district_coverage (district_type, district_code);

CREATE INDEX IF NOT EXISTS idx_wy_district_coverage_city
  ON wy_district_coverage (city);

CREATE INDEX IF NOT EXISTS idx_wy_district_coverage_county_city
  ON wy_district_coverage (county, city);
