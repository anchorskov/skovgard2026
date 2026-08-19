import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const migration = readFileSync(
  path.join(projectDir, 'db', 'migrations', '0035_parties_and_aliases.sql'),
  'utf8'
);

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE offices (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT,
      scope_kind TEXT,
      ballot_party TEXT
    );
    CREATE TABLE candidates (
      id INTEGER PRIMARY KEY,
      office_id INTEGER REFERENCES offices(id),
      party TEXT
    );
  `);

  const insertOffice = db.prepare(
    'INSERT INTO offices (id, title, level, scope_kind, ballot_party) VALUES (?, ?, ?, ?, ?)'
  );
  insertOffice.run(578, 'Seventh Judicial District Attorney', 'county', 'judicial_district', 'NP');
  insertOffice.run(1589, 'Newcastle City Council', 'city', null, 'NP');
  insertOffice.run(2001, 'Republican office', 'county', 'countywide', 'REP');
  insertOffice.run(2002, 'Democratic office', 'county', 'countywide', 'DEM');
  insertOffice.run(2003, 'Unsplit office', 'federal', null, '');
  insertOffice.run(2004, 'Party not applicable', 'statewide', null, null);

  const insertCandidate = db.prepare(
    'INSERT INTO candidates (id, office_id, party) VALUES (?, ?, ?)'
  );
  for (const [index, party] of ['REP', 'Republican', 'DEM', 'Democratic', 'NP'].entries()) {
    insertCandidate.run(index + 1, index === 4 ? 1589 : 2001, party);
  }
  return db;
}

test('every verified raw candidate and office party resolves through the global aliases', () => {
  const db = freshDb();
  db.exec(migration);
  db.exec(migration);

  const unresolvedCandidateValues = db.prepare(`
    SELECT DISTINCT c.party AS raw_value
      FROM candidates c
      LEFT JOIN party_aliases pa ON pa.raw_value = c.party
     WHERE c.party IS NOT NULL AND TRIM(c.party) <> '' AND pa.party_code IS NULL
     ORDER BY raw_value
  `).all();
  assert.deepEqual(unresolvedCandidateValues, []);

  const unresolvedOfficeValues = db.prepare(`
    SELECT DISTINCT o.ballot_party AS raw_value
      FROM offices o
      LEFT JOIN party_aliases pa ON pa.raw_value = o.ballot_party
     WHERE o.ballot_party IS NOT NULL AND TRIM(o.ballot_party) <> '' AND pa.party_code IS NULL
     ORDER BY raw_value
  `).all();
  assert.deepEqual(unresolvedOfficeValues, []);

  const aliases = db.prepare(
    'SELECT raw_value, party_code FROM party_aliases ORDER BY raw_value'
  ).all().map((row) => ({ ...row }));
  assert.deepEqual(aliases, [
    { raw_value: 'DEM', party_code: 'DEM' },
    { raw_value: 'Democratic', party_code: 'DEM' },
    { raw_value: 'NP', party_code: 'NP' },
    { raw_value: 'REP', party_code: 'REP' },
    { raw_value: 'Republican', party_code: 'REP' },
  ]);

  assert.deepEqual(
    db.prepare('SELECT code, label, short_label, badge_token FROM parties ORDER BY sort_order').all().map((row) => ({ ...row })),
    [
      { code: 'REP', label: 'Republican', short_label: 'R', badge_token: 'r' },
      { code: 'DEM', label: 'Democratic', short_label: 'D', badge_token: 'd' },
      { code: 'NP', label: 'Nonpartisan', short_label: 'NP', badge_token: 'other' },
    ]
  );

  const np = db.prepare(`
    SELECT p.code, p.label
      FROM party_aliases pa
      JOIN parties p ON p.code = pa.party_code
     WHERE pa.raw_value = 'NP'
  `).get();
  const resolvedNp = { ...np };
  assert.deepEqual(resolvedNp, { code: 'NP', label: 'Nonpartisan' });
  assert.notEqual(resolvedNp.code, '');

  // 0035 introduces lookup tables only. It must not mutate office rows —
  // an earlier draft ended with `UPDATE offices ... WHERE id = 578`, which
  // resolves to the Seventh Judicial District Attorney locally but to
  // "Precinct 4-2 Democratic Precinct Committeeman" in production. Row
  // normalization belongs in 0034, matched by predicate rather than id.
  const officePartiesAfter = db.prepare(
    'SELECT id, ballot_party FROM offices ORDER BY id'
  ).all().map((row) => ({ ...row }));
  assert.deepEqual(officePartiesAfter, [
    { id: 578, ballot_party: 'NP' },
    { id: 1589, ballot_party: 'NP' },
    { id: 2001, ballot_party: 'REP' },
    { id: 2002, ballot_party: 'DEM' },
    { id: 2003, ballot_party: '' },
    { id: 2004, ballot_party: null },
  ]);
  db.close();
});

function astroPages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return astroPages(entryPath);
    return entry.name.endsWith('.astro') ? [entryPath] : [];
  });
}

test('Astro pages use table-backed party metadata instead of label maps or first-letter matching', () => {
  const pageFiles = astroPages(path.join(projectDir, 'src', 'pages'));
  const prohibited = [
    /\bPARTY_(?:LABELS|SHORT)\b/,
    /\bparty(?:Label|BadgeClass)\b/,
    /\bparty\b[^\n]*\.toLowerCase\(\)\.slice\(\s*0\s*,\s*1\s*\)/i,
    /\.startsWith\(\s*['"](?:R|D|L|I)['"]\s*\)/,
    /(?:REP|DEM)\s*:\s*['"](?:Republican|Democrat|Democratic)['"]/,
  ];

  for (const file of pageFiles) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of prohibited) {
      assert.doesNotMatch(source, pattern, `${path.relative(projectDir, file)} contains ${pattern}`);
    }
  }

  for (const relativePath of [
    'src/pages/race/[id].astro',
    'src/pages/candidate/[slug].astro',
    'src/pages/endorsements/index.astro',
    'src/pages/races/index.astro',
    'src/pages/results/contest/[id].astro',
  ]) {
    const source = readFileSync(path.join(projectDir, relativePath), 'utf8');
    assert.match(source, /JOIN party_aliases/);
    assert.match(source, /JOIN parties/);
  }
});
