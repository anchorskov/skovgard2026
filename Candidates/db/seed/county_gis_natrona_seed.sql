-- Candidates/db/seed/county_gis_natrona_seed.sql
-- Natrona County ArcGIS precinct lookup registry.
-- Source: public Natrona County Precinct Map ArcGIS web map and MapServer layer metadata, verified 2026-06-20.
INSERT OR IGNORE INTO county_gis
  (county, mapserver_url, precinct_layer, precinct_field, location_field, address_field, status, notes, last_verified)
VALUES
  (
    'Natrona',
    'https://maps.casperwy.gov/nrgisc/rest/services/County_Elections/Precincts_2018/MapServer',
    0,
    'PRECINCT',
    'POLLING_PL',
    'ADDRESS',
    'active',
    'Public ArcGIS layer includes precinct polygons with polling place and polling address fields.',
    '2026-06-20'
  );
