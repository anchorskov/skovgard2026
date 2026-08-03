-- county_gis_campbell_endpoint_fix_2026-08-02.sql
-- Campbell County republished their ArcGIS services; the previously registered
-- Campbell_Public/VotingInformation/MapServer layer 1 now returns
-- {"error":{"code":404,"message":"Layer not found"}} — the whole service has
-- an empty layers[] array as of 2026-08-02.
--
-- Successor service confirmed live 2026-08-02 with identical fields
-- (PRECINCTNUM, VOTINGLOC, VOTINGLOCADDR): Campbell_Public/CountyPrecincts/MapServer/0.
-- Verified against 6 sampled addresses (Gillette core, Rozet, Recluse, and a
-- rural precinct south of town) — all 6 resolved precincts matched the seeded
-- polling_locations_campbell_insert.sql rows exactly.

UPDATE county_gis
SET
  mapserver_url = 'https://gis.campbellcountywy.gov/arcgis/rest/services/Campbell_Public/CountyPrecincts/MapServer',
  precinct_layer = 0,
  last_verified = '2026-08-02'
WHERE county = 'Campbell';
