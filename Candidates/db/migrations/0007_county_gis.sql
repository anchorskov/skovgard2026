-- 0007_county_gis.sql
-- Registry of Wyoming county ArcGIS REST endpoints for precise point-in-polygon
-- polling place lookup. When a county row is present and status = 'active',
-- ballot-lookup.js fires an ArcGIS spatial query using the voter's geocoded
-- lat/lon instead of the city-based D1 fallback.
CREATE TABLE IF NOT EXISTS county_gis (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  county          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mapserver_url   TEXT NOT NULL,    -- MapServer base URL, e.g. https://gis.campbellcountywy.gov/.../MapServer
  precinct_layer  INTEGER NOT NULL DEFAULT 0,
  precinct_field  TEXT NOT NULL,    -- ArcGIS attribute field for precinct code/name
  location_field  TEXT NOT NULL,    -- ArcGIS attribute field for polling place name
  address_field   TEXT NOT NULL,    -- ArcGIS attribute field for polling place address
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  notes           TEXT,
  last_verified   TEXT              -- ISO-8601 date of last successful probe
);
