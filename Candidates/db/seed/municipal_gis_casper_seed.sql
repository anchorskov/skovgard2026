-- Casper ward boundary ArcGIS registry.
-- Source: public City of Casper Administrative/Casper_Ward_Boundaries MapServer metadata, verified 2026-06-20.

INSERT OR IGNORE INTO municipal_gis
  (county, municipality, mapserver_url, ward_layer, ward_field, status, notes, last_verified)
VALUES
  (
    'Natrona',
    'Casper',
    'https://maps.casperwy.gov/nrgisc/rest/services/Administrative/Casper_Ward_Boundaries/MapServer',
    0,
    'WARD_ZONE',
    'active',
    'Public ArcGIS layer includes Casper ward polygons. WARD_ZONE values are 1, 2, and 3.',
    '2026-06-20'
  );
