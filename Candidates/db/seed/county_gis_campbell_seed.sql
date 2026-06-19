-- county_gis_campbell_seed.sql
-- Campbell County ArcGIS endpoint confirmed working 2026-06-18.
-- Source: https://gis.campbellcountywy.gov/arcgis/rest/services/Campbell_Public/VotingInformation/MapServer
-- Layer 1 (VotingPrecincts) returns PRECINCTNUM, VOTINGLOC, VOTINGLOCADDR on spatial query.
INSERT OR IGNORE INTO county_gis
  (county, mapserver_url, precinct_layer, precinct_field, location_field, address_field, status, last_verified)
VALUES
  ('Campbell',
   'https://gis.campbellcountywy.gov/arcgis/rest/services/Campbell_Public/VotingInformation/MapServer',
   1,
   'PRECINCTNUM',
   'VOTINGLOC',
   'VOTINGLOCADDR',
   'active',
   '2026-06-18');
