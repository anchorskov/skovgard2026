// Candidates/tests/withdrawn-candidates.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const withdrawn = [
  ['Jason Fearneyhough', 'jason-fearneyhough', '2026-06-08T00:00:00'],
  ['Kelly Bates', 'kelly-bates-hd-10', '2026-06-09T00:00:00'],
  ['Britten Young', 'britten-young-hd-13', '2026-06-02T00:00:00'],
  ['Michael Bechtel', 'michael-bechtel-hd-43', '2026-06-01T00:00:00'],
  ['Richard "RJ" Lennox', 'richard-rj-lennox-hd-46', '2026-06-11T00:00:00'],
  ['Vince Vanata', 'vince-vanata-hd-50', '2026-06-01T00:00:00'],
];

test('withdrawn correction seed preserves every filing with the official date', async () => {
  const sql = await read('db/seed/statewide_withdrawn_candidates_2026-06-15.sql');
  for (const [name, slug, date] of withdrawn) {
    assert.match(sql, new RegExp(name.replace(/["']/g, '.')));
    assert.match(sql, new RegExp(`WHERE slug = '${slug}' AND withdrawn_at IS NULL`));
    assert.match(sql, new RegExp(`withdrawn_at = '${date}'`));
  }
});

test('the current SOS active-roster fixture excludes every withdrawn filing', async () => {
  const csv = (await read('db/seed/wy_2026_primary_candidates.csv')).toLowerCase();
  for (const [name] of withdrawn) {
    assert.equal(csv.includes(name.toLowerCase()), false, `${name} must not be in the active-roster fixture`);
  }
});

test('the complete active-roster fixture matches the canonical base seed', async () => {
  const rows = parseCsv(await read('db/seed/wy_2026_primary_candidates.csv'));
  const headers = rows.shift();
  const nameIndex = headers.indexOf('candidate_name');
  assert.notEqual(nameIndex, -1, 'active roster fixture must contain candidate_name');
  const rosterNames = new Set(rows.map((row) => row[nameIndex]).filter(Boolean));

  const seed = await read('db/seed/001_seed.sql');
  const seedNames = new Set(
    [...seed.matchAll(/SELECT id,'[^']*','((?:''|[^'])*)','[^']+'/g)].map((match) => match[1].replaceAll("''", "'")),
  );
  assert.equal(seedNames.size, rosterNames.size, 'base seed and active roster must have the same candidate count');
  assert.deepEqual([...seedNames].sort(), [...rosterNames].sort());
});

test('all active candidate surfaces filter withdrawn records', async () => {
  const requiredFilters = [
    ['src/pages/race/[id].astro', /withdrawn_at IS NULL/],
    ['src/pages/races/index.astro', /withdrawn_at IS NULL/],
    ['src/pages/candidate/[slug].astro', /withdrawn_at IS NULL/],
    ['src/pages/endorsements/index.astro', /withdrawn_at IS NULL/],
    ['src/pages/guide/index.astro', /withdrawn_at IS NULL/],
    ['src/pages/api/admin/candidate-emails.js', /withdrawn_at IS NULL/],
  ];
  for (const [path, pattern] of requiredFilters) {
    assert.match(await read(path), pattern, `${path} must exclude withdrawn candidates`);
  }

  const ballotLookup = await read('src/pages/api/ballot-lookup.js');
  assert.ok(
    ballotLookup.match(/withdrawn_at IS NULL/g)?.length >= 2,
    'both ballot/address lookup candidate queries must exclude withdrawn candidates',
  );
});

test('affected active race totals match the current SOS active roster fixture', async () => {
  const csv = await read('db/seed/wy_2026_primary_candidates.csv');
  const expected = new Map([
    ['SECRETARY OF STATE', 5],
    ['STATE REPRESENTATIVE 10', 1],
    ['STATE REPRESENTATIVE 13', 2],
    ['STATE REPRESENTATIVE 43', 2],
    ['STATE REPRESENTATIVE 46', 3],
    ['STATE REPRESENTATIVE 50', 2],
  ]);
  for (const [office, count] of expected) {
    const rows = csv.split(/\r?\n/).filter((line) => line.startsWith(`${office} - `));
    assert.equal(rows.length, count, `${office} active candidate count`);
  }
});
