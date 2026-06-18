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
  const street = normalizeText(payload.street);
  const city = normalizeText(payload.city);
  const zip = normalizeZip(payload.zip);
  const combined = `${houseNumber} ${street}, ${city}, WY ${zip}`;

  return {
    houseNumber,
    street,
    city,
    state: 'WY',
    zip,
    combined,
  };
}

function validateAddress(address) {
  return REQUIRED_FIELDS
    .filter(([key]) => !address[key])
    .map(([, label]) => label);
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

  // Fire precinct fetch in parallel with voter-file queries so tiers 1-3 and 5
  // can return a precinct even when the district came from the voter file.
  const precinctPromise = fetchCensusPrecinct(address);

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
      return {
        matchSource: 'address_city',
        county: normalizeText(row.county),
        wyHouse: districtLabel('HD', row.state_house_district),
        wySenate: districtLabel('SD', row.state_senate_district),
        matchedCity: normalizeText(row.canonical_city),
        matchedZip: normalizeZip(row.zip5),
        precinct: await precinctPromise,
      };
    }

    // Tier 2: exact address_key, any city (handles city spelling variations)
    const uniqueRow = await lookupUniqueAddressDistrict(db, addressCandidates);
    if (uniqueRow) {
      return {
        matchSource: 'address_unique',
        county: normalizeText(uniqueRow.county),
        wyHouse: districtLabel('HD', uniqueRow.state_house_district),
        wySenate: districtLabel('SD', uniqueRow.state_senate_district),
        matchedCity: normalizeText(uniqueRow.canonical_city),
        matchedZip: normalizeZip(uniqueRow.zip5),
        precinct: await precinctPromise,
      };
    }

    // Tier 3: LIKE prefix match — catches unit/apt suffixes (e.g. "250 E MAIN ST A")
    // Only accepted when all matching rows share the same district pair.
    const prefixRow = await lookupByAddressPrefix(db, addressCandidates, cityKey, address.zip);
    if (prefixRow) {
      return {
        matchSource: 'address_prefix',
        county: normalizeText(prefixRow.county),
        wyHouse: districtLabel('HD', prefixRow.state_house_district),
        wySenate: districtLabel('SD', prefixRow.state_senate_district),
        matchedCity: normalizeText(prefixRow.canonical_city),
        matchedZip: normalizeZip(prefixRow.zip5),
        precinct: await precinctPromise,
      };
    }

    // Tier 4: US Census geocoder — covers addresses not in the voter file.
    // Passes the already-inflight precinctPromise to avoid a duplicate Census request.
    const censusRow = await lookupByCensusGeocoder(address, precinctPromise);
    if (censusRow) {
      return {
        matchSource: 'census_geocoder',
        county: censusRow.county,
        wyHouse: districtLabel('HD', censusRow.state_house_district),
        wySenate: districtLabel('SD', censusRow.state_senate_district),
        matchedCity: normalizeText(censusRow.canonical_city),
        matchedZip: normalizeZip(censusRow.zip5),
        precinct: censusRow.precinct,
      };
    }

    // Tier 5: city coverage table — only when city maps to exactly one district pair
    const coverageRow = await lookupByCityCoverage(db, address);
    if (coverageRow) {
      return {
        matchSource: 'city_coverage',
        county: normalizeText(coverageRow.county),
        wyHouse: districtLabel('HD', coverageRow.state_house_district),
        wySenate: districtLabel('SD', coverageRow.state_senate_district),
        matchedCity: normalizeText(coverageRow.canonical_city),
        matchedZip: normalizeZip(coverageRow.zip5),
        precinct: await precinctPromise,
      };
    }

    return null;
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

// Fetch precinct (VTD) from Census2020_Current vintage.
// Used both standalone (for voter-file tier 1-3 matches) and inside lookupByCensusGeocoder.
async function fetchCensusPrecinct(address) {
  try {
    const res = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/address?${new URLSearchParams({
        street: `${address.houseNumber} ${address.street}`,
        city: address.city,
        state: 'WY',
        zip: address.zip,
        benchmark: 'Public_AR_Current',
        vintage: 'Census2020_Current',
        layers: 'Voting Districts',
        format: 'json',
      })}`,
      { headers: { accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    const vtdGeos = match?.geographies || {};
    const vtdKey = Object.keys(vtdGeos).find((k) => /voting/i.test(k));
    return vtdGeos[vtdKey]?.[0]?.BASENAME || null;
  } catch {
    return null;
  }
}

// Tier 4: US Census geocoder — no API key required, covers addresses not in voter file.
// Fetches 2024 legislative districts (Current_Current) and precinct (Census2020_Current) in parallel.
async function lookupByCensusGeocoder(address, precinctPromise) {
  try {
    const base = {
      street: `${address.houseNumber} ${address.street}`,
      city: address.city,
      state: 'WY',
      zip: address.zip,
      benchmark: 'Public_AR_Current',
      format: 'json',
    };

    // Reuse the already-inflight precinct promise if provided, otherwise fetch fresh.
    const [districtRes, precinct] = await Promise.all([
      fetch(
        `https://geocoding.geo.census.gov/geocoder/geographies/address?${new URLSearchParams({
          ...base,
          vintage: 'Current_Current',
          layers: '2024 State Legislative Districts - Upper,2024 State Legislative Districts - Lower,Counties',
        })}`,
        { headers: { accept: 'application/json' } }
      ),
      precinctPromise ?? fetchCensusPrecinct(address),
    ]);

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
      precinct,
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

// Scope kinds that require precinct or ward data we don't have per-address.
// These are counted and surfaced as a browse prompt rather than shown inline.
const PRECINCT_SCOPES = new Set(['precinct_party_gender']);
const WARD_SCOPES = new Set(['municipal_ward']);

async function getLocalRaces(db, districts, address) {
  if (!db || !districts?.county) return { races: [], hasPrecinctRaces: false, hasWardRaces: false, county: null };
  try {
    const countyNorm = districts.county.toLowerCase().trim();
    const cityNorm = normalizeLookupKey(address.city);

    const rows = await allD1(
      db,
      `SELECT
         o.id AS office_id,
         o.title,
         o.level,
         o.county,
         o.municipality,
         o.scope_kind,
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
        hasPrecinctRaces = true;
      } else if (WARD_SCOPES.has(scope)) {
        hasWardRaces = true;
      } else {
        races.push({
          id: String(row.office_id),
          name: row.title,
          level: row.level,
          municipality: row.municipality || null,
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
  const missingFields = validateAddress(address);
  if (missingFields.length > 0) {
    return json(
      {
        success: false,
        message: `Please complete: ${missingFields.join(', ')}.`,
        missingFields,
      },
      400
    );
  }

  const civicApiConfigured = Boolean(env.GOOGLE_CIVIC_API_KEY);
  const districts = await lookupDistricts(env.LOOKUP_DB, address);
  const [races, localRaces, pollingDetails] = await Promise.all([
    getRaceGroups(env.WY_DB, districts),
    getLocalRaces(env.WY_DB, districts, address),
    lookupPollingDetails(address),
  ]);
  const isDistrictMatched = Boolean(districts?.wyHouse || districts?.wySenate || districts?.county);

  return json({
    success: true,
    address,
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
