-- 0008_precinct_polygons.sql
-- Precinct boundary polygons (WGS84 GeoJSON) for Wyoming counties where
-- polygon data is available from public sources (TerraGIS, ArcGIS exports, etc.).
-- ballot-lookup.js queries this table when lat/lon is known and performs
-- JS point-in-polygon to return the exact precinct polling place.
CREATE TABLE IF NOT EXISTS precinct_polygons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  county            TEXT    NOT NULL COLLATE NOCASE,
  precinct_code     TEXT    NOT NULL,
  polling_place     TEXT    NOT NULL,
  geometry_geojson  TEXT    NOT NULL  -- GeoJSON Polygon or MultiPolygon, WGS84
);

CREATE INDEX IF NOT EXISTS idx_precinct_poly_county
  ON precinct_polygons(LOWER(county));
