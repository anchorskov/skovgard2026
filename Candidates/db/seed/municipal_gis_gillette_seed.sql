-- municipal_gis_gillette_seed.sql
-- Gillette City Council ward boundary ArcGIS registry — previously missing
-- entirely (only Casper and Cheyenne were registered). Verified 2026-08-02:
-- CityWard field returns 1, 2, or 3 on spatial query against sampled addresses.

INSERT OR IGNORE INTO municipal_gis
  (county, municipality, mapserver_url, ward_layer, ward_field, status, notes, last_verified)
VALUES
  (
    'Campbell',
    'Gillette',
    'https://gis.campbellcountywy.gov/arcgis/rest/services/Campbell_Public/CityWards/MapServer',
    0,
    'CityWard',
    'active',
    'Public ArcGIS layer includes Gillette ward polygons. CityWard values are 1, 2, 3.',
    '2026-08-02'
  );
