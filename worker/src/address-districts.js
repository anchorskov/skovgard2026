const DIRECTIONAL_MAP = new Map([
  ["NORTH", "N"],
  ["SOUTH", "S"],
  ["EAST", "E"],
  ["WEST", "W"],
  ["NORTHEAST", "NE"],
  ["NORTHWEST", "NW"],
  ["SOUTHEAST", "SE"],
  ["SOUTHWEST", "SW"],
]);

const STREET_TYPE_MAP = new Map([
  ["ALLEY", "ALY"],
  ["ALY", "ALY"],
  ["AV", "AVE"],
  ["AVE", "AVE"],
  ["AVENUE", "AVE"],
  ["BLVD", "BLVD"],
  ["BOULEVARD", "BLVD"],
  ["CIR", "CIR"],
  ["CIRCLE", "CIR"],
  ["COURT", "CT"],
  ["CT", "CT"],
  ["DR", "DR"],
  ["DRIVE", "DR"],
  ["HIGHWAY", "HWY"],
  ["HWY", "HWY"],
  ["LANE", "LN"],
  ["LN", "LN"],
  ["LOOP", "LOOP"],
  ["PARKWAY", "PKWY"],
  ["PKWY", "PKWY"],
  ["PLACE", "PL"],
  ["PL", "PL"],
  ["RD", "RD"],
  ["ROAD", "RD"],
  ["ST", "ST"],
  ["STREET", "ST"],
  ["TER", "TER"],
  ["TERRACE", "TER"],
  ["TRL", "TRL"],
  ["TRAIL", "TRL"],
  ["WAY", "WAY"],
]);

const UNIT_MAP = new Map([
  ["APARTMENT", "APT"],
  ["APT", "APT"],
  ["BLDG", "BLDG"],
  ["BUILDING", "BLDG"],
  ["FL", "FL"],
  ["FLOOR", "FL"],
  ["LOT", "LOT"],
  ["NO", "UNIT"],
  ["NUMBER", "UNIT"],
  ["PMB", "PMB"],
  ["RM", "RM"],
  ["ROOM", "RM"],
  ["STE", "STE"],
  ["SUITE", "STE"],
  ["TRAILER", "TRLR"],
  ["TRLR", "TRLR"],
  ["UNIT", "UNIT"],
]);

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCountyName(value) {
  const text = normalizeWhitespace(value)
    .replace(/\s+COUNTY$/i, "")
    .toUpperCase();
  return text || null;
}

function normalizeDistrictCode(value) {
  const text = normalizeWhitespace(value);
  return text ? text.toUpperCase() : null;
}

function normalizeLegislativeDistrictCode(value) {
  const text = normalizeWhitespace(value);
  if (!text) return null;
  const digits = text.match(/\d+/)?.[0];
  if (!digits) return normalizeDistrictCode(text);
  return String(Number(digits));
}

function isMissingTableError(error) {
  return /no such table/i.test(String(error?.message || error));
}

function canonicalizeToken(token) {
  const cleaned = String(token || "")
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9/]+$/g, "");
  if (!cleaned) return "";
  if (DIRECTIONAL_MAP.has(cleaned)) return DIRECTIONAL_MAP.get(cleaned);
  if (UNIT_MAP.has(cleaned)) return UNIT_MAP.get(cleaned);
  if (STREET_TYPE_MAP.has(cleaned)) return STREET_TYPE_MAP.get(cleaned);
  return cleaned;
}

function districtKey(row) {
  return `${row?.stateHouseDistrict || ""}|${row?.stateSenateDistrict || ""}|${row?.county || ""}`;
}

export function normalizeZip5(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

export function canonicalizeCityForLookup(value) {
  return normalizeWhitespace(value).toUpperCase();
}

export function canonicalizeAddressForLookup(value) {
  const text = normalizeWhitespace(value)
    .toUpperCase()
    .replace(/#/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/[^A-Z0-9/& -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text
    .split(" ")
    .map(canonicalizeToken)
    .filter(Boolean)
    .join(" ");
}

export function buildAddressLookupCandidates(input = {}) {
  const primary = normalizeWhitespace(input.address1);
  const secondary = normalizeWhitespace(input.address2);
  const combined = canonicalizeAddressForLookup([primary, secondary].filter(Boolean).join(" "));
  const base = canonicalizeAddressForLookup(primary);
  return Array.from(new Set([combined, base].filter(Boolean)));
}

function normalizeLookupRow(row) {
  if (!row || typeof row !== "object") return null;
  const stateHouseDistrict = normalizeLegislativeDistrictCode(
    row.state_house_district ?? row.stateHouseDistrict
  );
  const stateSenateDistrict = normalizeLegislativeDistrictCode(
    row.state_senate_district ?? row.stateSenateDistrict
  );
  const county = normalizeCountyName(row.county);
  if (!stateHouseDistrict && !stateSenateDistrict && !county) return null;
  return {
    stateHouseDistrict,
    stateSenateDistrict,
    county,
    canonicalAddress1: normalizeWhitespace(row.canonical_address1 ?? row.canonicalAddress1).toUpperCase() || null,
    canonicalCity: canonicalizeCityForLookup(row.canonical_city ?? row.canonicalCity) || null,
  };
}

function selectUniqueDistrict(rows) {
  const candidates = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizeLookupRow(row);
    if (!normalized) continue;
    candidates.set(districtKey(normalized), normalized);
  }
  if (candidates.size !== 1) return null;
  return Array.from(candidates.values())[0];
}

async function queryAll(db, sql, ...binds) {
  try {
    return ((await db.prepare(sql).bind(...binds).all())?.results || []);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function lookupCoverageFallback(db, cityKey) {
  if (!cityKey) return null;
  const rows = await queryAll(
    db,
    `SELECT district_type,
            COUNT(DISTINCT district_code) AS district_count,
            MIN(district_code) AS district_code
       FROM wy_district_coverage
      WHERE city = ?1
      GROUP BY district_type`,
    cityKey
  );
  if (!rows.length) return null;

  let stateHouseDistrict = null;
  let stateSenateDistrict = null;
  for (const row of rows) {
    const districtType = String(row.district_type || "").trim().toLowerCase();
    const districtCount = Number(row.district_count || 0);
    if (districtCount !== 1) continue;
    const districtCode = normalizeDistrictCode(row.district_code);
    if (!districtCode) continue;
    if (districtType === "house") stateHouseDistrict = districtCode;
    if (districtType === "senate") stateSenateDistrict = districtCode;
  }

  if (!stateHouseDistrict && !stateSenateDistrict) return null;
  return {
    stateHouseDistrict,
    stateSenateDistrict,
    county: null,
    canonicalAddress1: null,
    canonicalCity: cityKey,
    matchType: "city_coverage",
  };
}

function hasAnyDistrict(match) {
  return Boolean(match?.stateHouseDistrict || match?.stateSenateDistrict);
}

function hasCompleteDistrictMatch(match) {
  return Boolean(match?.stateHouseDistrict && match?.stateSenateDistrict);
}

function mergeLookupMatches(primary, secondary, matchType = null) {
  if (!primary && !secondary) return null;
  return {
    stateHouseDistrict: primary?.stateHouseDistrict || secondary?.stateHouseDistrict || null,
    stateSenateDistrict: primary?.stateSenateDistrict || secondary?.stateSenateDistrict || null,
    county: primary?.county || secondary?.county || null,
    canonicalAddress1: primary?.canonicalAddress1 || secondary?.canonicalAddress1 || null,
    canonicalCity: primary?.canonicalCity || secondary?.canonicalCity || null,
    matchType: matchType || primary?.matchType || secondary?.matchType || null,
  };
}

function findGeographyRows(geographies, pattern) {
  if (!geographies || typeof geographies !== "object") return [];
  const key = Object.keys(geographies)
    .filter((name) => pattern.test(name))
    .sort((left, right) => {
      const leftYear = Number(left.match(/\b(20\d{2})\b/)?.[1] || 0);
      const rightYear = Number(right.match(/\b(20\d{2})\b/)?.[1] || 0);
      return rightYear - leftYear;
    })[0];
  return key ? geographies[key] || [] : [];
}

function parseCensusDistrictCode(row, fieldNames = []) {
  for (const fieldName of fieldNames) {
    const normalized = normalizeLegislativeDistrictCode(row?.[fieldName]);
    if (normalized) return normalized;
  }
  const basename = normalizeLegislativeDistrictCode(row?.BASENAME);
  if (basename) return basename;
  const namedDistrict = normalizeLegislativeDistrictCode(
    String(row?.NAME || "").match(/(\d+)\s*$/)?.[1]
  );
  if (namedDistrict) return namedDistrict;
  const geoidDigits = String(row?.GEOID || "").match(/(\d+)$/)?.[1] || "";
  return geoidDigits ? String(Number(geoidDigits.slice(-3))) : null;
}

function parseCensusDistrictGeographies(geographies, matchType) {
  if (!geographies || typeof geographies !== "object") return null;

  const countyRow = findGeographyRows(geographies, /Counties$/i)[0] || null;
  const upperRow = findGeographyRows(geographies, /State Legislative Districts - Upper$/i)[0] || null;
  const lowerRow = findGeographyRows(geographies, /State Legislative Districts - Lower$/i)[0] || null;

  const stateHouseDistrict = parseCensusDistrictCode(lowerRow, ["SLDL"]);
  const stateSenateDistrict = parseCensusDistrictCode(upperRow, ["SLDU"]);
  const county = normalizeCountyName(countyRow?.BASENAME || countyRow?.NAME);

  if (!stateHouseDistrict && !stateSenateDistrict && !county) return null;

  return {
    stateHouseDistrict,
    stateSenateDistrict,
    county,
    canonicalAddress1: null,
    canonicalCity: null,
    matchType,
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupViaCensusCoordinates(input = {}) {
  const latitude = Number(input.latitude ?? input.lat);
  const longitude = Number(input.longitude ?? input.lon ?? input.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const params = new URLSearchParams({
    x: String(longitude),
    y: String(latitude),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  const data = await fetchJsonWithTimeout(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${params.toString()}`
  );

  return parseCensusDistrictGeographies(data?.result?.geographies, "census_coordinates");
}

async function lookupViaCensusAddress(input = {}) {
  const street = normalizeWhitespace([input.address1, input.address2].filter(Boolean).join(" "));
  const city = normalizeWhitespace(input.city);
  const state = normalizeWhitespace(input.state || "WY").toUpperCase();
  const zip = normalizeZip5(input.zip);
  if (!street || !state || (!city && !zip)) return null;

  const params = new URLSearchParams({
    street,
    state,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });
  if (city) params.set("city", city);
  if (zip) params.set("zip", zip);

  const data = await fetchJsonWithTimeout(
    `https://geocoding.geo.census.gov/geocoder/geographies/address?${params.toString()}`
  );
  const match = data?.result?.addressMatches?.[0];
  return parseCensusDistrictGeographies(match?.geographies, "census_address");
}

async function lookupViaCensusFallback(input = {}) {
  try {
    const coordinateMatch = await lookupViaCensusCoordinates(input);
    if (coordinateMatch && hasAnyDistrict(coordinateMatch)) {
      return coordinateMatch;
    }

    const addressMatch = await lookupViaCensusAddress(input);
    if (addressMatch && hasAnyDistrict(addressMatch)) {
      return addressMatch;
    }
  } catch (error) {
    const city = canonicalizeCityForLookup(input.city);
    const zip = normalizeZip5(input.zip);
    console.warn("Wyoming district Census fallback failed", {
      city: city || null,
      zip: zip || null,
      message: String(error?.message || error),
    });
  }
  return null;
}

export async function lookupWyLegislativeDistricts(db, input = {}) {
  const state = normalizeWhitespace(input.state || "WY").toUpperCase();
  if (state && state !== "WY") return null;

  const cityKey = canonicalizeCityForLookup(input.city);
  const zip5 = normalizeZip5(input.zip);
  const addressCandidates = buildAddressLookupCandidates(input);
  let bestLocalMatch = null;

  if (db) {
    for (const addressKey of addressCandidates) {
      if (zip5) {
        const exactZipRows = await queryAll(
          db,
          `SELECT canonical_address1, canonical_city, county,
                  state_house_district, state_senate_district
             FROM wy_address_district_lookup
            WHERE address_key = ?1
              AND city_key = ?2
              AND zip5 = ?3`,
          addressKey,
          cityKey,
          zip5
        );
        const exactZipMatch = selectUniqueDistrict(exactZipRows);
        if (exactZipMatch) {
          const match = {
            ...exactZipMatch,
            matchType: "address_zip",
          };
          if (hasCompleteDistrictMatch(match)) {
            return match;
          }
          bestLocalMatch = mergeLookupMatches(bestLocalMatch, match, bestLocalMatch?.matchType || match.matchType);
        }
      }

      const addressRows = await queryAll(
        db,
        `SELECT canonical_address1, canonical_city, county,
                state_house_district, state_senate_district
           FROM wy_address_district_lookup
          WHERE address_key = ?1
            AND city_key = ?2`,
        addressKey,
        cityKey
      );
      const addressMatch = selectUniqueDistrict(addressRows);
      if (addressMatch) {
        const match = {
          ...addressMatch,
          matchType: "address_city",
        };
        if (hasCompleteDistrictMatch(match)) {
          return match;
        }
        bestLocalMatch = mergeLookupMatches(bestLocalMatch, match, bestLocalMatch?.matchType || match.matchType);
      }
    }
  }

  const censusMatch = await lookupViaCensusFallback(input);
  const mergedWithCensus = mergeLookupMatches(
    bestLocalMatch,
    censusMatch,
    bestLocalMatch && censusMatch ? "mirror_plus_census" : bestLocalMatch?.matchType || censusMatch?.matchType
  );
  if (hasAnyDistrict(mergedWithCensus)) {
    return mergedWithCensus;
  }

  const coverageFallback = db ? await lookupCoverageFallback(db, cityKey) : null;
  const mergedFallback = mergeLookupMatches(
    mergedWithCensus,
    coverageFallback,
    mergedWithCensus && coverageFallback
      ? `${mergedWithCensus.matchType || "census"}_plus_city_coverage`
      : mergedWithCensus?.matchType || coverageFallback?.matchType
  );
  return hasAnyDistrict(mergedFallback) ? mergedFallback : null;
}
