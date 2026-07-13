// worker/src/precinct-lookup.js
// Precinct/polling-place resolution by coordinates -- mirrors
// Candidates/src/pages/api/ballot-lookup.js's pointInRing/pointInGeoJSON/
// lookupPollingByGIS/lookupPollingByPolygon exactly (same tables, same priority
// cascade: live ArcGIS county_gis first, then local precinct_polygons GeoJSON).
// Candidates and this worker are separate deployed projects with no shared
// package, so this is a deliberate mirror, not an import -- keep it in sync with
// that file if the cascade ever changes there.

// Ray-casting point-in-polygon for a single GeoJSON ring (outer boundary).
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeoJSON(lon, lat, geojson) {
  const { type, coordinates } = geojson;
  if (type === "Polygon") return pointInRing(lon, lat, coordinates[0]);
  if (type === "MultiPolygon") return coordinates.some((poly) => pointInRing(lon, lat, poly[0]));
  return false;
}

// Local D1 precinct-polygon lookup -- used for counties with pre-loaded boundary
// data (e.g. from TerraGIS TopoJSON). Returns exact precinct code + polling place.
async function lookupPollingByPolygon(db, county, lat, lon) {
  if (!db || !county || lat == null || lon == null) return null;
  try {
    const rows = await db.prepare(
      `SELECT precinct_code, polling_place, geometry_geojson
         FROM precinct_polygons
        WHERE LOWER(county) = LOWER(?1)`
    ).bind(county.trim()).all();
    const results = rows?.results || [];
    if (!results.length) return null;

    for (const row of results) {
      let geo;
      try { geo = JSON.parse(row.geometry_geojson); } catch { continue; }
      if (pointInGeoJSON(lon, lat, geo)) {
        return { source: "polygon_d1", precinctCode: row.precinct_code, pollingPlace: row.polling_place };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Live ArcGIS point-in-polygon lookup -- returns exact precinct + polling place when
// the county has a registered endpoint in county_gis.
async function lookupPollingByGIS(db, county, lat, lon) {
  if (!db || !county || lat == null || lon == null) return null;
  try {
    const gisRow = await db.prepare(
      `SELECT mapserver_url, precinct_layer, precinct_field, location_field, address_field
         FROM county_gis
        WHERE LOWER(county) = LOWER(?1)
          AND status = 'active'
        LIMIT 1`
    ).bind(county.trim()).first();
    if (!gisRow) return null;

    const queryUrl = `${gisRow.mapserver_url}/${gisRow.precinct_layer}/query?${new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: [gisRow.precinct_field, gisRow.location_field, gisRow.address_field].join(","),
      f: "json",
    })}`;

    const res = await fetch(queryUrl, { headers: { accept: "application/json" } });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const attrs = feature.attributes || {};
    return {
      source: "gis_spatial",
      precinctCode: attrs[gisRow.precinct_field] ?? null,
      pollingPlace: attrs[gisRow.location_field] ?? null,
    };
  } catch {
    return null;
  }
}

// Priority: live ArcGIS -> local precinct-polygon D1 mirror. Returns null if neither
// resolves (e.g. a county with no registered GIS source, or a point outside all
// loaded polygons).
export async function resolvePrecinct(db, county, lat, lon) {
  if (!county || lat == null || lon == null) return null;
  const gisResult = await lookupPollingByGIS(db, county, lat, lon);
  if (gisResult?.precinctCode) return gisResult;
  const polygonResult = await lookupPollingByPolygon(db, county, lat, lon);
  if (polygonResult?.precinctCode) return polygonResult;
  return null;
}
