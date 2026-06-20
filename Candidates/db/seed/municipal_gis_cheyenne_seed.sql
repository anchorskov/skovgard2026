-- Cheyenne City Council ward boundary ArcGIS registry.
-- Source: CLK (Laramie County-City GIS Service Center) OpenGovData MapServer layer 5.
-- Verified 2026-06-20: district field returns 1, 2, or 3. Spatial query tested against
-- 2020 Capitol Ave (Ward 1 confirmed) and layer metadata confirmed polygon type.

INSERT OR IGNORE INTO municipal_gis
  (county, municipality, mapserver_url, ward_layer, ward_field, status, notes, last_verified)
VALUES
  (
    'Laramie',
    'Cheyenne',
    'https://maps.clcgisc.com/arcgis/rest/services/OpenGov/OpenGovData/MapServer',
    5,
    'district',
    'active',
    'CLK OpenGovData City Council layer. district field values are 1, 2, 3 (Ward 1/2/3). Three features total.',
    '2026-06-20'
  );
