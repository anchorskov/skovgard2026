#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const remote = Boolean(args.remote);
const countyFilter = args.county ? String(args.county).toLowerCase() : '';

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--remote') parsed.remote = true;
    else if (arg.startsWith('--')) parsed[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return parsed;
}

function sqlQuote(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function wranglerQuery(command) {
  const wranglerArgs = ['wrangler', 'd1', 'execute', 'wy', '--json'];
  if (remote) wranglerArgs.push('--remote');
  wranglerArgs.push('--command', command);
  const result = spawnSync('npx', wranglerArgs, {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  const data = JSON.parse(result.stdout);
  return data.flatMap((item) => item.results || []);
}

function normalizePrecinctCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^PRECINCT\s+/i, '')
    .replace(/[^\dA-Z]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePrecinctCode(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\bPrecinct Committee Precinct\s+([0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)\b/i,
    /\bPrecinct\s+([0-9][0-9A-Za-z]*(?:-[0-9A-Za-z]+)*)\b/i,
    /^.+-([0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)\s+Precinct\b/i,
    /\s-\s([0-9][0-9A-Za-z]*(?:-[0-9A-Za-z]+)*)\s+[A-Za-z]/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizePrecinctCode(match[1]);
  }
  return '';
}

function partyCode(value) {
  const text = String(value || '').toLowerCase();
  if (/\brep|republican/.test(text)) return 'REP';
  if (/\bdem|democratic|democrat/.test(text)) return 'DEM';
  if (/libertarian/.test(text)) return 'LIB';
  return '';
}

function positionKind(value) {
  const text = String(value || '').toLowerCase();
  if (/committeewoman/.test(text)) return 'Committeewoman';
  if (/committeeman/.test(text)) return 'Committeeman';
  if (/precinct committee/.test(text)) return 'Precinct Committee';
  return '';
}

function buildOfficeTitle(precinct, party, position) {
  return `Precinct ${precinct} ${party} ${position}`.replace(/\s+/g, ' ').trim();
}

async function geocodeCandidate(row) {
  if (!args.geocode || !row.mailing_address || !row.city) return {};
  const params = new URLSearchParams({
    street: row.mailing_address,
    city: row.city,
    state: 'WY',
    zip: row.zip || '',
    benchmark: 'Public_AR_Current',
    format: 'json',
  });
  try {
    const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${params}`);
    if (!response.ok) return { geocode_status: `census_http_${response.status}` };
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return { geocode_status: 'no_match' };
    return {
      geocode_status: 'matched',
      lat: match.coordinates?.y ?? '',
      lon: match.coordinates?.x ?? '',
      geocoded_address: match.matchedAddress || '',
    };
  } catch (error) {
    return { geocode_status: `error:${error.message}` };
  }
}

async function resolveByGIS(row, point, gisByCounty) {
  const county = String(row.county || '').toLowerCase();
  const gis = gisByCounty.get(county);
  if (!args.geocode || !gis || point.lat === '' || point.lon === '') return {};
  const query = new URLSearchParams({
    geometry: `${point.lon},${point.lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: [gis.precinct_field, gis.location_field, gis.address_field].join(','),
    f: 'json',
  });
  try {
    const response = await fetch(`${gis.mapserver_url}/${gis.precinct_layer}/query?${query}`);
    if (!response.ok) return { resolve_status: `arcgis_http_${response.status}` };
    const data = await response.json();
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs) return { resolve_status: 'no_gis_feature' };
    return {
      resolve_status: 'gis_match',
      resolved_precinct: normalizePrecinctCode(attrs[gis.precinct_field]),
      resolved_polling_place: attrs[gis.location_field] || '',
      resolved_polling_address: attrs[gis.address_field] || '',
    };
  } catch (error) {
    return { resolve_status: `error:${error.message}` };
  }
}

const offices = wranglerQuery(`
  SELECT id, title, county, scope_kind, precinct_code
    FROM offices
   WHERE scope_kind IN ('precinct_party', 'precinct_party_gender')
   ORDER BY county, title
`);

const backfillRows = offices
  .map((office) => ({ ...office, parsed_precinct_code: parsePrecinctCode(office.title) }))
  .filter((office) => !office.precinct_code && office.parsed_precinct_code)
  .filter((office) => !countyFilter || String(office.county || '').toLowerCase() === countyFilter);

const correctionRows = offices
  .map((office) => ({ ...office, parsed_precinct_code: parsePrecinctCode(office.title) }))
  .filter((office) => office.precinct_code && office.parsed_precinct_code)
  .filter((office) => normalizePrecinctCode(office.precinct_code) !== normalizePrecinctCode(office.parsed_precinct_code))
  .filter((office) => !countyFilter || String(office.county || '').toLowerCase() === countyFilter);

if (args['backfill-sql']) {
  const lines = [
    '-- Generated by Candidates/scripts/infer_precinct_committee_offices.mjs',
    '-- Review before applying. Updates only offices with NULL precinct_code.',
    '',
    ...backfillRows.map((row) =>
      `UPDATE offices SET precinct_code = '${sqlQuote(row.parsed_precinct_code)}' WHERE id = ${Number(row.id)} AND precinct_code IS NULL;`
    ),
    '',
  ];
  fs.writeFileSync(args['backfill-sql'], lines.join('\n'));
  console.log(`Wrote ${backfillRows.length} backfill updates to ${args['backfill-sql']}`);
}

if (args['correction-sql']) {
  const lines = [
    '-- Generated by Candidates/scripts/infer_precinct_committee_offices.mjs',
    '-- Review before applying. Corrects existing non-null precinct_code values that disagree with parsed office titles.',
    '',
    ...correctionRows.map((row) =>
      `UPDATE offices SET precinct_code = '${sqlQuote(row.parsed_precinct_code)}' WHERE id = ${Number(row.id)} AND precinct_code = '${sqlQuote(row.precinct_code)}';`
    ),
    '',
  ];
  fs.writeFileSync(args['correction-sql'], lines.join('\n'));
  console.log(`Wrote ${correctionRows.length} correction updates to ${args['correction-sql']}`);
}

if (args.audit) {
  const whereCounty = countyFilter ? `AND LOWER(o.county) = '${sqlQuote(countyFilter)}'` : '';
  const candidates = wranglerQuery(`
    SELECT
      c.id AS candidate_id,
      c.full_name,
      c.party,
      c.mailing_address,
      c.city,
      c.zip,
      c.position_title,
      c.race_display,
      o.id AS current_office_id,
      o.title AS current_office_title,
      o.county,
      o.scope_kind,
      o.precinct_code AS current_precinct_code
    FROM candidates c
    JOIN offices o ON o.id = c.office_id
    WHERE c.withdrawn_at IS NULL
      ${whereCounty}
      AND (
        o.scope_kind IN ('precinct_party', 'precinct_party_gender')
        OR o.title LIKE '%Committee%'
        OR o.title LIKE '%Committeeman%'
        OR o.title LIKE '%Committeewoman%'
        OR c.position_title LIKE '%Committee%'
        OR c.position_title LIKE '%Committeeman%'
        OR c.position_title LIKE '%Committeewoman%'
        OR c.race_display LIKE '%Committee%'
      )
    ORDER BY o.county, c.full_name
  `);
  const gisRows = wranglerQuery(`
    SELECT county, mapserver_url, precinct_layer, precinct_field, location_field, address_field
      FROM county_gis
     WHERE status = 'active'
  `);
  const gisByCounty = new Map(gisRows.map((row) => [String(row.county || '').toLowerCase(), row]));

  const auditRows = [];
  for (const row of candidates) {
    const parsedOfficePrecinct = row.current_precinct_code || parsePrecinctCode(row.current_office_title);
    const point = await geocodeCandidate(row);
    const resolved = await resolveByGIS(row, point, gisByCounty);
    const resolvedPrecinct = resolved.resolved_precinct || '';
    const precinct = resolvedPrecinct || parsedOfficePrecinct || '';
    const party = partyCode(`${row.party} ${row.current_office_title} ${row.race_display}`);
    const position = positionKind(`${row.position_title} ${row.current_office_title} ${row.race_display}`);
    const proposedOfficeTitle = precinct && party && position ? buildOfficeTitle(precinct, party, position) : '';
    const confidence = resolvedPrecinct ? 'gis_resolved' : parsedOfficePrecinct ? 'office_title_parsed' : 'needs_review';

    auditRows.push({
      candidate_id: row.candidate_id,
      full_name: row.full_name,
      county: row.county,
      party: row.party,
      current_office_id: row.current_office_id,
      current_office_title: row.current_office_title,
      current_precinct_code: row.current_precinct_code || '',
      parsed_office_precinct: parsedOfficePrecinct || '',
      mailing_address: row.mailing_address || '',
      city: row.city || '',
      zip: row.zip || '',
      geocode_status: point.geocode_status || 'not_requested',
      lat: point.lat || '',
      lon: point.lon || '',
      geocoded_address: point.geocoded_address || '',
      resolve_status: resolved.resolve_status || '',
      resolved_precinct: resolvedPrecinct,
      resolved_polling_place: resolved.resolved_polling_place || '',
      proposed_office_title: proposedOfficeTitle,
      confidence,
      notes: proposedOfficeTitle ? '' : 'missing precinct, party, or position',
    });
  }

  const headers = Object.keys(auditRows[0] || {
    candidate_id: '',
    full_name: '',
    county: '',
    party: '',
    current_office_id: '',
    current_office_title: '',
    current_precinct_code: '',
    parsed_office_precinct: '',
    mailing_address: '',
    city: '',
    zip: '',
    geocode_status: '',
    lat: '',
    lon: '',
    geocoded_address: '',
    resolve_status: '',
    resolved_precinct: '',
    resolved_polling_place: '',
    proposed_office_title: '',
    confidence: '',
    notes: '',
  });
  const csv = [
    headers.join(','),
    ...auditRows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
  fs.writeFileSync(args.audit, `${csv}\n`);
  console.log(`Wrote ${auditRows.length} audit rows to ${args.audit}`);
}

if (!args.audit && !args['backfill-sql'] && !args['correction-sql']) {
  console.log(`Parsed ${backfillRows.length} missing precinct_code values from office titles.`);
  console.log('Use --backfill-sql <file> and/or --audit <file>. Add --geocode to resolve candidate addresses through Census + active county GIS.');
}
