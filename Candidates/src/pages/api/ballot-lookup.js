// Candidates/src/pages/api/ballot-lookup.js
import { env } from 'cloudflare:workers';

const REQUIRED_FIELDS = [
  ['houseNumber', 'House / Unit Number'],
  ['street', 'Street Name'],
  ['city', 'City'],
  ['zip', 'ZIP Code'],
];

const PLACEHOLDER_RACES = [
  {
    id: 'federal',
    name: 'Federal races',
    status: 'Candidate data is seeded; address-specific matching is still being finalized.',
  },
  {
    id: 'statewide',
    name: 'Statewide races',
    status: 'Candidate data is seeded; these races apply statewide.',
  },
  {
    id: 'legislative',
    name: 'Wyoming legislative races',
    status: 'District matching is still being finalized.',
  },
  {
    id: 'local',
    name: 'County and local races',
    status: 'Local race matching will be added after address-to-district routing is complete.',
  },
];

const STATEWIDE_LEVELS = new Set(['federal', 'statewide']);

const STREET_SUFFIX_MAP = new Map([
  ['STREET', 'St'],
  ['ST', 'St'],
  ['AVENUE', 'Ave'],
  ['AVE', 'Ave'],
  ['BOULEVARD', 'Blvd'],
  ['BLVD', 'Blvd'],
  ['HIGHWAY', 'Hwy'],
  ['HWY', 'Hwy'],
  ['PARKWAY', 'Pkwy'],
  ['PKWY', 'Pkwy'],
  ['TRAIL', 'Trl'],
  ['TRL', 'Trl'],
  ['CIRCLE', 'Cir'],
  ['CIR', 'Cir'],
  ['PLACE', 'Pl'],
  ['PL', 'Pl'],
  ['COURT', 'Ct'],
  ['CT', 'Ct'],
  ['DRIVE', 'Dr'],
  ['DR', 'Dr'],
  ['LANE', 'Ln'],
  ['LN', 'Ln'],
  ['ROAD', 'Rd'],
  ['RD', 'Rd'],
]);

const DIRECTION_MAP = new Map([
  ['NORTH', 'N'],
  ['SOUTH', 'S'],
  ['EAST', 'E'],
  ['WEST', 'W'],
  ['NORTHEAST', 'NE'],
  ['NORTHWEST', 'NW'],
  ['SOUTHEAST', 'SE'],
  ['SOUTHWEST', 'SW'],
]);

const EMPTY_POLLING_DETAILS = {
  status: 'not_available',
  pollingLocations: [],
  earlyVoteSites: [],
  dropOffLocations: [],
  electionAdministrationBody: null,
  message: 'Polling-place details are not available yet for this address/election.',
};

function normalizeLookupKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeZip(value) {
  const zip = normalizeText(value);
  const match = zip.match(/\d{5}/);
  return match ? match[0] : zip;
}

function normalizeHouseNumber(value) {
  return normalizeText(value).replace(/[^\dA-Za-z-]/g, '').toUpperCase();
}

function titleStreetToken(token) {
  if (/^\d+(ST|ND|RD|TH)$/i.test(token)) {
    return token.toLowerCase().replace(/^\d+/, (digits) => digits);
  }
  if (/^[A-Z]{1,2}$/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function standardizeStreetName(street, houseNumber = '') {
  const original = normalizeText(street);
  const houseKey = normalizeHouseNumber(houseNumber);
  let cleaned = original
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const warnings = [];

  if (houseKey) {
    const leadingHousePattern = new RegExp(`^${houseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s+`, 'i');
    if (leadingHousePattern.test(cleaned)) {
      cleaned = cleaned.replace(leadingHousePattern, '').trim();
      warnings.push({
        field: 'street',
        message: 'Removed the duplicated house number from the street name.',
      });
    }
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const standardized = tokens.map((token) => {
    const key = token.toUpperCase();
    if (DIRECTION_MAP.has(key)) return DIRECTION_MAP.get(key);
    if (STREET_SUFFIX_MAP.has(key)) return STREET_SUFFIX_MAP.get(key);
    return titleStreetToken(key);
  }).join(' ');

  return {
    value: standardized,
    changed: Boolean(original && standardized && original !== standardized),
    warnings,
  };
}

async function parsePayload(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await request.json();
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

function buildAddress(payload) {
  const houseNumber = normalizeText(payload.houseNumber);
  const streetNormalization = standardizeStreetName(payload.street, houseNumber);
  const street = streetNormalization.value;
  const city = normalizeText(payload.city);
  const zip = normalizeZip(payload.zip);
  const combined = `${houseNumber} ${street}, ${city}, WY ${zip}`;

  return {
    houseNumber,
    street,
    rawStreet: normalizeText(payload.street),
    city,
    state: 'WY',
    zip,
    combined,
    inputWarnings: streetNormalization.warnings,
    standardizedFields: {
      street: streetNormalization.changed ? street : null,
    },
  };
}

function validateAddress(address) {
  const missingFields = REQUIRED_FIELDS
    .filter(([key]) => !address[key])
    .map(([, label]) => label);
  const fieldErrors = {};

  if (address.zip && !/^\d{5}$/.test(address.zip)) {
    fieldErrors.zip = 'ZIP Code must be five digits.';
  }

  if (address.rawStreet && !/[A-Za-z]/.test(address.rawStreet)) {
    fieldErrors.street = 'Street name must include a street name, not only a number.';
  }

  return {
    missingFields,
    fieldErrors,
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

const STREET_SUFFIXES = /\b(STREET|AVENUE|BOULEVARD|HIGHWAY|PARKWAY|TRAIL|CIRCLE|PLACE|COURT|DRIVE|LANE|ROAD|WAY|ST|AVE|BLVD|HWY|PKWY|TRL|CIR|PL|CT|DR|LN|RD)\.?$/;

function buildAddressCandidates(address) {
  const rawStreet = normalizeLookupKey(address.street);
  const strippedStreet = rawStreet.replace(STREET_SUFFIXES, '').trim();
  const house = normalizeLookupKey(address.houseNumber);
  const base = `${house} ${strippedStreet}`.trim();
  const suffixes = ['', ' ST', ' STREET', ' AVE', ' AVENUE', ' RD', ' ROAD', ' DR', ' DRIVE', ' LN', ' LANE', ' CT', ' COURT', ' BLVD', ' WAY'];

  return uniqueValues([
    // Exact normalized form first (preserves original suffix)
    `${house} ${rawStreet}`.trim(),
    // Then all suffix variants on the stripped base
    ...suffixes.map((suffix) => `${base}${suffix}`.replace(/\s+/g, ' ').trim()),
  ]);
}

async function firstD1(db, sql, ...params) {
  return await db.prepare(sql).bind(...params).first();
}

async function allD1(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

function districtLabel(prefix, value) {
  return value ? `${prefix}-${String(value).replace(/^(HD|SD)-?/i, '')}` : null;
}

function civicAddress(address) {
  if (!address || typeof address !== 'object') return null;
  const line1 = normalizeText(address.line1);
  const city = normalizeText(address.city);
  const state = normalizeText(address.state);
  const zip = normalizeText(address.zip);
  if (!line1 && !city && !state && !zip) return null;

  return {
    locationName: normalizeText(address.locationName),
    line1,
    line2: normalizeText(address.line2),
    line3: normalizeText(address.line3),
    city,
    state,
    zip,
  };
}

function civicLocation(location) {
  return {
    name: normalizeText(location?.name),
    address: civicAddress(location?.address),
    pollingHours: normalizeText(location?.pollingHours),
    startDate: normalizeText(location?.startDate),
    endDate: normalizeText(location?.endDate),
    notes: normalizeText(location?.notes),
  };
}

function civicAdministrationBody(body) {
  if (!body || typeof body !== 'object') return null;
  return {
    name: normalizeText(body.name),
    electionInfoUrl: normalizeText(body.electionInfoUrl),
    electionRegistrationUrl: normalizeText(body.electionRegistrationUrl),
    absenteeVotingInfoUrl: normalizeText(body.absenteeVotingInfoUrl),
    votingLocationFinderUrl: normalizeText(body.votingLocationFinderUrl),
    ballotInfoUrl: normalizeText(body.ballotInfoUrl),
    correspondenceAddress: civicAddress(body.correspondenceAddress),
    electionOfficials: Array.isArray(body.electionOfficials)
      ? body.electionOfficials.map((official) => ({
        name: normalizeText(official?.name),
        title: normalizeText(official?.title),
        officePhoneNumber: normalizeText(official?.officePhoneNumber),
        emailAddress: normalizeText(official?.emailAddress),
      }))
      : [],
  };
}

function hasPollingDetail(details) {
  return (
    details.pollingLocations.length > 0
    || details.earlyVoteSites.length > 0
    || details.dropOffLocations.length > 0
    || Boolean(details.electionAdministrationBody)
  );
}

async function lookupPollingDetails(address) {
  const apiKey = env.GOOGLE_CIVIC_API_KEY;
  if (!apiKey) {
    return {
      ...EMPTY_POLLING_DETAILS,
      status: 'api_not_configured',
      message: 'Polling-place lookup is not configured yet.',
    };
  }

  const params = new URLSearchParams({
    key: apiKey,
    address: address.combined,
  });
  const electionId = normalizeText(env.GOOGLE_CIVIC_ELECTION_ID);
  if (electionId) params.set('electionId', electionId);

  try {
    const response = await fetch(`https://www.googleapis.com/civicinfo/v2/voterinfo?${params.toString()}`, {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        ...EMPTY_POLLING_DETAILS,
        status: response.status === 404 ? 'not_available' : 'error',
        message: response.status === 404
          ? 'Polling-place details are not available yet for this address/election.'
          : `Google Civic voterinfo request failed with HTTP ${response.status}.`,
      };
    }

    const data = await response.json();
    const details = {
      status: 'not_available',
      pollingLocations: Array.isArray(data.pollingLocations)
        ? data.pollingLocations.map(civicLocation)
        : [],
      earlyVoteSites: Array.isArray(data.earlyVoteSites)
        ? data.earlyVoteSites.map(civicLocation)
        : [],
      dropOffLocations: Array.isArray(data.dropOffLocations)
        ? data.dropOffLocations.map(civicLocation)
        : [],
      electionAdministrationBody: civicAdministrationBody(data.electionAdministrationBody),
      message: 'Polling-place details are not available yet for this address/election.',
    };

    if (!hasPollingDetail(details)) return details;
    return {
      ...details,
      status: 'found',
      message: 'Polling-place details returned by Google Civic voterinfo.',
    };
  } catch {
    return {
      ...EMPTY_POLLING_DETAILS,
      status: 'error',
      message: 'Google Civic voterinfo request could not be completed.',
    };
  }
}

async function lookupDistricts(db, address) {
  if (!db) return null;

  const cityKey = normalizeLookupKey(address.city);
  const addressCandidates = buildAddressCandidates(address);
  if (!cityKey || addressCandidates.length === 0) return null;

  const coordinatesPromise = fetchCensusCoordinates(address);

  async function withCensusPoint(result) {
    const coordinates = await coordinatesPromise;
    return {
      ...result,
      lat: coordinates?.lat ?? null,
      lon: coordinates?.lon ?? null,
    };
  }

  try {
    const placeholders = addressCandidates.map((_, index) => `?${index + 1}`).join(', ');
    const cityParam = addressCandidates.length + 1;
    const zipParam = addressCandidates.length + 2;

    // Tier 1: exact address_key + city + zip
    const row = await firstD1(
      db,
      `SELECT county, state_house_district, state_senate_district,
              canonical_city, zip5
         FROM wy_address_district_lookup
        WHERE address_key IN (${placeholders})
          AND city_key = ?${cityParam}
          AND (zip5 = ?${zipParam} OR zip5 = '')
        LIMIT 1`,
      ...addressCandidates,
      cityKey,
      address.zip
    );
    if (row) {
      return withCensusPoint({
        matchSource: 'address_city',
        county: normalizeText(row.county),
        wyHouse: districtLabel('HD', row.state_house_district),
        wySenate: districtLabel('SD', row.state_senate_district),
        matchedCity: normalizeText(row.canonical_city),
        matchedZip: normalizeZip(row.zip5),
      });
    }

    // Tier 2: exact address_key, any city (handles city spelling variations)
    const uniqueRow = await lookupUniqueAddressDistrict(db, addressCandidates);
    if (uniqueRow) {
      return withCensusPoint({
        matchSource: 'address_unique',
        county: normalizeText(uniqueRow.county),
        wyHouse: districtLabel('HD', uniqueRow.state_house_district),
        wySenate: districtLabel('SD', uniqueRow.state_senate_district),
        matchedCity: normalizeText(uniqueRow.canonical_city),
        matchedZip: normalizeZip(uniqueRow.zip5),
      });
    }

    // Tier 3: LIKE prefix match — catches unit/apt suffixes (e.g. "250 E MAIN ST A")
    // Only accepted when all matching rows share the same district pair.
    const prefixRow = await lookupByAddressPrefix(db, addressCandidates, cityKey, address.zip);
    if (prefixRow) {
      return withCensusPoint({
        matchSource: 'address_prefix',
        county: normalizeText(prefixRow.county),
        wyHouse: districtLabel('HD', prefixRow.state_house_district),
        wySenate: districtLabel('SD', prefixRow.state_senate_district),
        matchedCity: normalizeText(prefixRow.canonical_city),
        matchedZip: normalizeZip(prefixRow.zip5),
      });
    }

    // Tier 4: US Census geocoder — covers addresses not in the voter file.
    const censusRow = await lookupByCensusGeocoder(address);
    if (censusRow) {
      return {
        matchSource: 'census_geocoder',
        county: censusRow.county,
        wyHouse: districtLabel('HD', censusRow.state_house_district),
        wySenate: districtLabel('SD', censusRow.state_senate_district),
        matchedCity: normalizeText(censusRow.canonical_city),
        matchedZip: normalizeZip(censusRow.zip5),
        lat: censusRow.lat ?? null,
        lon: censusRow.lon ?? null,
      };
    }

    // Tier 5: city coverage table — only when city maps to exactly one district pair
    const coverageRow = await lookupByCityCoverage(db, address);
    if (coverageRow) {
      return withCensusPoint({
        matchSource: 'city_coverage',
        county: normalizeText(coverageRow.county),
        wyHouse: districtLabel('HD', coverageRow.state_house_district),
        wySenate: districtLabel('SD', coverageRow.state_senate_district),
        matchedCity: normalizeText(coverageRow.canonical_city),
        matchedZip: normalizeZip(coverageRow.zip5),
      });
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchCensusCoordinates(address) {
  try {
    const res = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/address?${new URLSearchParams({
        street: `${address.houseNumber} ${address.street}`,
        city: address.city,
        state: 'WY',
        zip: address.zip,
        benchmark: 'Public_AR_Current',
        format: 'json',
      })}`,
      { headers: { accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    return {
      lat: typeof match?.coordinates?.y === 'number' ? match.coordinates.y : null,
      lon: typeof match?.coordinates?.x === 'number' ? match.coordinates.x : null,
    };
  } catch {
    return null;
  }
}

async function lookupUniqueAddressDistrict(db, addressCandidates) {
  const placeholders = addressCandidates.map((_, index) => `?${index + 1}`).join(', ');
  const rows = await allD1(
    db,
    `SELECT county, state_house_district, state_senate_district,
            canonical_city, zip5
       FROM wy_address_district_lookup
      WHERE address_key IN (${placeholders})`,
    ...addressCandidates
  );
  const districtKeys = uniqueValues(
    rows.map((row) => `${row.county}|${row.state_house_district}|${row.state_senate_district}`)
  );

  return districtKeys.length === 1 ? rows[0] : null;
}

// Tier 3: prefix LIKE match for addresses that exist in voter file with unit suffixes
// (e.g. voter file has "10 E SIMPSON AVE A" but user enters "10 E Simpson Ave")
// Accepted only when every matching row shares the same district pair.
async function lookupByAddressPrefix(db, addressCandidates, cityKey, zip) {
  for (const candidate of addressCandidates) {
    if (!candidate) continue;
    const rows = await allD1(
      db,
      `SELECT county, state_house_district, state_senate_district,
              canonical_city, zip5
         FROM wy_address_district_lookup
        WHERE address_key LIKE ?1
          AND city_key = ?2
          AND (zip5 = ?3 OR zip5 = '')
        LIMIT 20`,
      `${candidate} %`,
      cityKey,
      zip
    );
    if (rows.length === 0) continue;
    const districtKeys = uniqueValues(
      rows.map((row) => `${row.state_house_district}|${row.state_senate_district}`)
    );
    if (districtKeys.length === 1) return rows[0];
  }
  return null;
}

// Tier 4: US Census geocoder — no API key required, covers addresses not in voter file.
// Fetches 2024 legislative districts (Current_Current). Census VTD precincts are not used;
// precinct display comes from county GIS or local precinct polygons.
async function lookupByCensusGeocoder(address) {
  try {
    const base = {
      street: `${address.houseNumber} ${address.street}`,
      city: address.city,
      state: 'WY',
      zip: address.zip,
      benchmark: 'Public_AR_Current',
      format: 'json',
    };

    const districtRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/address?${new URLSearchParams({
        ...base,
        vintage: 'Current_Current',
        layers: '2024 State Legislative Districts - Upper,2024 State Legislative Districts - Lower,Counties',
      })}`,
      { headers: { accept: 'application/json' } }
    );

    if (!districtRes.ok) return null;
    const districtData = await districtRes.json();
    const match = districtData?.result?.addressMatches?.[0];
    if (!match) return null;

    const geos = match.geographies || {};
    const upperKey = Object.keys(geos).find((k) => /upper/i.test(k));
    const lowerKey = Object.keys(geos).find((k) => /lower/i.test(k));
    const countyKey = Object.keys(geos).find((k) => /count/i.test(k));

    const senateNum = geos[upperKey]?.[0]?.BASENAME;
    const houseNum = geos[lowerKey]?.[0]?.BASENAME;
    if (!senateNum && !houseNum) return null;

    const countyName = normalizeText(geos[countyKey]?.[0]?.NAME || '').replace(/\s+county$/i, '').toUpperCase();

    return {
      county: countyName,
      state_house_district: houseNum || null,
      state_senate_district: senateNum || null,
      canonical_city: normalizeText(match.addressComponents?.city || address.city),
      zip5: normalizeZip(match.addressComponents?.zip || address.zip),
      lat: typeof match.coordinates?.y === 'number' ? match.coordinates.y : null,
      lon: typeof match.coordinates?.x === 'number' ? match.coordinates.x : null,
    };
  } catch {
    return null;
  }
}

// Tier 5: city/county coverage table — only used when a city maps unambiguously
// to exactly one House or Senate district.
async function lookupByCityCoverage(db, address) {
  if (!db) return null;
  try {
    const cityKey = normalizeLookupKey(address.city);
    const rows = await allD1(
      db,
      `SELECT county, state_house_district, state_senate_district, canonical_city, zip5
         FROM wy_district_coverage
        WHERE city_key = ?1
          AND (zip5 = ?2 OR zip5 = '')
        LIMIT 5`,
      cityKey,
      address.zip
    );
    if (rows.length === 0) return null;
    const districtKeys = uniqueValues(
      rows.map((row) => `${row.state_house_district}|${row.state_senate_district}`)
    );
    return districtKeys.length === 1 ? rows[0] : null;
  } catch {
    return null;
  }
}

function officeAppliesToDistrict(office, districts) {
  if (STATEWIDE_LEVELS.has(office.level)) return true;
  if (office.level === 'wy_house') {
    return Number(office.district) === Number(String(districts?.wyHouse || '').replace(/\D/g, ''));
  }
  if (office.level === 'wy_senate') {
    return Number(office.district) === Number(String(districts?.wySenate || '').replace(/\D/g, ''));
  }
  return false;
}

// Scope kinds that need sub-county targeting. Precinct races can be matched
// when county GIS/polygon lookup returns a precinct code.
const PRECINCT_SCOPES = new Set(['precinct_party', 'precinct_party_gender']);
const WARD_SCOPES = new Set(['municipal_ward']);

function normalizeWard(value) {
  const text = value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  if (!text) return '';
  const match = text.match(/\bWARD\s*(\d+|[A-Z])\b/) || text.match(/\b(\d+|[A-Z])\b/);
  return match ? `WARD ${match[1]}` : text;
}

function normalizePrecinctCode(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/^PRECINCT\s+/i, '')
    .replace(/[^\dA-Z]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function officeMatchesPrecinct(row, precinct) {
  const precinctKey = normalizePrecinctCode(precinct);
  if (!precinctKey) return false;
  if (row.precinct_code && normalizePrecinctCode(row.precinct_code) === precinctKey) return true;
  const titleKey = normalizeLookupKey(row.title).replace(/\s+/g, ' ');
  return titleKey.startsWith(`PRECINCT ${precinctKey.replace(/-/g, ' ')} `);
}

async function getLocalRaces(db, districts, address, precinct = null, ward = null) {
  if (!db || !districts?.county) return { races: [], hasPrecinctRaces: false, hasWardRaces: false, county: null };
  try {
    const countyNorm = districts.county.toLowerCase().trim();
    const cityNorm = normalizeLookupKey(address.city);
    const wardKey = normalizeWard(ward?.ward || ward);

    const rows = await allD1(
      db,
      `SELECT
         o.id AS office_id,
         o.title,
         o.level,
         o.county,
         o.municipality,
         o.scope_kind,
         o.ward,
         o.precinct_code,
         COUNT(c.id) AS candidate_count
       FROM offices o
       LEFT JOIN candidates c ON c.office_id = o.id AND c.withdrawn_at IS NULL
       WHERE o.county IS NOT NULL
       GROUP BY o.id
       ORDER BY o.level, o.sort_order, o.title`
    );

    // Rows belonging to this voter's county/city
    const countyRows = rows.filter((row) => {
      if (!row.county) return false;
      if (row.county.toLowerCase().trim() !== countyNorm) return false;
      if (row.level === 'county') return true;
      if (row.level === 'city') {
        return normalizeLookupKey(String(row.municipality || '')) === cityNorm;
      }
      return false;
    });

    // Split: matchable now vs. needs precinct/ward data
    const races = [];
    let hasPrecinctRaces = false;
    let hasWardRaces = false;

    for (const row of countyRows) {
      const scope = row.scope_kind || '';
      if (PRECINCT_SCOPES.has(scope)) {
        if (precinct && officeMatchesPrecinct(row, precinct)) {
          races.push({
            id: String(row.office_id),
            name: row.title,
            level: row.level,
            municipality: row.municipality || null,
            scopeKind: row.scope_kind || null,
            candidateCount: Number(row.candidate_count || 0),
          });
        } else if (!precinct) {
          hasPrecinctRaces = true;
        }
      } else if (WARD_SCOPES.has(scope)) {
        if (wardKey && normalizeWard(row.ward) === wardKey) {
          races.push({
            id: String(row.office_id),
            name: row.title,
            level: row.level,
            municipality: row.municipality || null,
            scopeKind: row.scope_kind || null,
            candidateCount: Number(row.candidate_count || 0),
          });
        } else if (!wardKey) {
          hasWardRaces = true;
        }
      } else {
        races.push({
          id: String(row.office_id),
          name: row.title,
          level: row.level,
          municipality: row.municipality || null,
          scopeKind: row.scope_kind || null,
          candidateCount: Number(row.candidate_count || 0),
        });
      }
    }

    // Canonical county name for the browse link (title-case from DB)
    const countyLabel = countyRows[0]?.county || districts.county;

    return { races, hasPrecinctRaces, hasWardRaces, county: countyLabel };
  } catch {
    return { races: [], hasPrecinctRaces: false, hasWardRaces: false, county: null };
  }
}

async function getRaceGroups(db, districts) {
  if (!db) return PLACEHOLDER_RACES;

  try {
    const rows = await allD1(
      db,
      `SELECT
         o.id AS office_id,
         o.title,
         o.level,
         o.district,
         COUNT(c.id) AS candidate_count
       FROM offices o
       LEFT JOIN candidates c ON c.office_id = o.id AND c.withdrawn_at IS NULL
       GROUP BY o.id, o.title, o.level, o.district, o.sort_order
       ORDER BY o.sort_order, o.title, o.district`
    );

    const applicable = rows.filter((row) => officeAppliesToDistrict(row, districts));
    const raceRows = applicable.length > 0 ? applicable : rows.filter((row) => STATEWIDE_LEVELS.has(row.level));
    if (raceRows.length === 0) return PLACEHOLDER_RACES;

    return raceRows.map((row) => ({
      id: String(row.office_id),
      name: row.district ? `${row.title} District ${row.district}` : row.title,
      level: row.level,
      candidateCount: Number(row.candidate_count || 0),
      status: `${Number(row.candidate_count || 0)} filed candidate${Number(row.candidate_count || 0) === 1 ? '' : 's'} in the seeded roster.`,
    }));
  } catch {
    return PLACEHOLDER_RACES;
  }
}

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
  if (type === 'Polygon') return pointInRing(lon, lat, coordinates[0]);
  if (type === 'MultiPolygon') return coordinates.some((poly) => pointInRing(lon, lat, poly[0]));
  return false;
}

// Precinct-polygon D1 lookup — used for counties where boundary data is pre-loaded
// (e.g. Park County from TerraGIS TopoJSON). Returns exact precinct + polling place.
async function lookupPollingByPolygon(db, county, lat, lon) {
  if (!db || !county || lat == null || lon == null) return null;
  try {
    const rows = await allD1(
      db,
      `SELECT precinct_code, polling_place, geometry_geojson
         FROM precinct_polygons
        WHERE LOWER(county) = LOWER(?1)`,
      county.trim()
    );
    if (rows.length === 0) return null;

    for (const row of rows) {
      let geo;
      try { geo = JSON.parse(row.geometry_geojson); } catch { continue; }
      if (pointInGeoJSON(lon, lat, geo)) {
        return {
          source: 'polygon_d1',
          precinct: row.precinct_code,
          location_name: row.polling_place,
          address: null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ArcGIS point-in-polygon lookup — returns exact precinct + polling place when
// the county has a registered endpoint in county_gis and lat/lon are available.
async function lookupPollingByGIS(db, county, lat, lon) {
  if (!db || !county || lat == null || lon == null) return null;
  try {
    const gisRow = await firstD1(
      db,
      `SELECT mapserver_url, precinct_layer, precinct_field, location_field, address_field
         FROM county_gis
        WHERE LOWER(county) = LOWER(?1)
          AND status = 'active'
        LIMIT 1`,
      county.trim()
    );
    if (!gisRow) return null;

    const queryUrl = `${gisRow.mapserver_url}/${gisRow.precinct_layer}/query?${new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outFields: [gisRow.precinct_field, gisRow.location_field, gisRow.address_field].join(','),
      f: 'json',
    })}`;

    const res = await fetch(queryUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const attrs = feature.attributes || {};
    return {
      source: 'gis_spatial',
      precinct: attrs[gisRow.precinct_field] ?? null,
      location_name: attrs[gisRow.location_field] ?? null,
      address: attrs[gisRow.address_field] ?? null,
    };
  } catch {
    return null;
  }
}

// ArcGIS point-in-polygon lookup for municipal ward races. Uses a D1 registry so
// city-specific endpoints/fields are data, not hard-coded in the lookup logic.
async function lookupWardByGIS(db, county, municipality, lat, lon) {
  if (!db || !county || !municipality || lat == null || lon == null) return null;
  try {
    const gisRow = await firstD1(
      db,
      `SELECT mapserver_url, ward_layer, ward_field
         FROM municipal_gis
        WHERE LOWER(county) = LOWER(?1)
          AND LOWER(municipality) = LOWER(?2)
          AND status = 'active'
        LIMIT 1`,
      county.trim(),
      municipality.trim()
    );
    if (!gisRow) return null;

    const queryUrl = `${gisRow.mapserver_url}/${gisRow.ward_layer}/query?${new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outFields: gisRow.ward_field,
      returnGeometry: 'false',
      f: 'json',
    })}`;

    const res = await fetch(queryUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const attrs = feature.attributes || {};
    const wardValue = attrs[gisRow.ward_field] ?? null;
    const ward = normalizeWard(wardValue);
    if (!ward) return null;

    return {
      source: 'gis_spatial',
      county: normalizeText(county),
      municipality: normalizeText(municipality),
      ward,
      rawWard: wardValue,
    };
  } catch {
    return null;
  }
}

async function getPollingLocations(db, county, city) {
  if (!db || !county || !city) return null;
  try {
    const rows = await allD1(
      db,
      `SELECT DISTINCT precinct_code, location_name, address, county_clerk_url
         FROM polling_locations
        WHERE LOWER(county) = LOWER(?1)
          AND (LOWER(city) = LOWER(?2) OR city = '__countywide__')
          AND election_year = 2026
        ORDER BY location_name
        LIMIT 12`,
      county.trim(),
      city.trim()
    );
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function getPollingCountyForCity(db, city) {
  if (!db || !city) return null;
  try {
    const rows = await allD1(
      db,
      `SELECT DISTINCT county
         FROM wy_city_county
        WHERE LOWER(city) = LOWER(?1)
          AND UPPER(COALESCE(state, 'WY')) = 'WY'
        LIMIT 3`,
      city.trim()
    );
    const counties = uniqueValues(rows.map((row) => normalizeText(row.county)));
    return counties.length === 1 ? counties[0] : null;
  } catch {
    return null;
  }
}

// Priority: live ArcGIS → precinct polygon D1 → city-level D1 (only when unambiguous).
function resolvePollingPlace(gis, polygon, d1Rows) {
  if (gis?.location_name) return gis;
  if (polygon?.location_name) return polygon;
  if (Array.isArray(d1Rows) && d1Rows.length === 1) {
    return {
      source: 'city_d1',
      precinct: d1Rows[0].precinct_code ?? null,
      location_name: d1Rows[0].location_name ?? null,
      address: d1Rows[0].address ?? null,
    };
  }
  return null;
}

export async function POST({ request }) {
  let payload;
  try {
    payload = await parsePayload(request);
  } catch {
    return json(
      {
        success: false,
        message: 'Could not read lookup request. Please try again.',
      },
      400
    );
  }

  const address = buildAddress(payload || {});
  const { missingFields, fieldErrors } = validateAddress(address);
  if (missingFields.length > 0) {
    return json(
      {
        success: false,
        message: `Please complete: ${missingFields.join(', ')}.`,
        missingFields,
        fieldErrors,
      },
      400
    );
  }
  if (Object.keys(fieldErrors).length > 0) {
    return json(
      {
        success: false,
        message: 'Please correct the highlighted address fields.',
        fieldErrors,
        suggestedFix: {
          street: address.standardizedFields.street,
        },
      },
      400
    );
  }

  const civicApiConfigured = Boolean(env.GOOGLE_CIVIC_API_KEY);
  const districts = await lookupDistricts(env.LOOKUP_DB, address);
  const pollingCounty = districts?.county || await getPollingCountyForCity(env.WY_DB, address.city);
  const [pollingDetails, d1PollingLocations, gisPollingLocation, polygonPollingLocation, resolvedWard] = await Promise.all([
    lookupPollingDetails(address),
    getPollingLocations(env.WY_DB, pollingCounty, address.city),
    lookupPollingByGIS(env.WY_DB, districts?.county, districts?.lat, districts?.lon),
    lookupPollingByPolygon(env.WY_DB, districts?.county, districts?.lat, districts?.lon),
    lookupWardByGIS(env.WY_DB, districts?.county, address.city, districts?.lat, districts?.lon),
  ]);
  const isDistrictMatched = Boolean(districts?.wyHouse || districts?.wySenate || districts?.county);
  const resolvedPollingPlace = resolvePollingPlace(gisPollingLocation, polygonPollingLocation, d1PollingLocations);
  const [races, localRaces] = await Promise.all([
    getRaceGroups(env.WY_DB, districts),
    getLocalRaces(env.WY_DB, districts, address, resolvedPollingPlace?.precinct, resolvedWard),
  ]);

  return json({
    success: true,
    address,
    inputWarnings: address.inputWarnings,
    message: isDistrictMatched
      ? 'Lookup route connected. Districts matched from the voter address table.'
      : 'Lookup route connected. District matching is still being finalized.',
    lookup: {
      status: isDistrictMatched ? 'matched' : 'placeholder',
      districtMatching: isDistrictMatched ? 'voter_address_exact' : 'pending',
      civicApiConfigured,
    },
    districts,
    races,
    localRaces: localRaces.races,
    localMeta: {
      hasPrecinctRaces: localRaces.hasPrecinctRaces,
      hasWardRaces: localRaces.hasWardRaces,
      county: localRaces.county,
    },
    pollingDetails,
    d1PollingLocations,
    gisPollingLocation,
    polygonPollingLocation,
    resolvedPollingPlace,
    resolvedWard,
  });
}

export function ALL() {
  return json(
    {
      success: false,
      message: 'Use POST for ballot lookup requests.',
    },
    405
  );
}
