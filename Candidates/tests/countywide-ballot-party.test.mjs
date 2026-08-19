import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  path.join(__dirname, '..', 'db', 'migrations', '0034_normalize_countywide_ballot_party.sql'),
  'utf8'
);

// Deliberately uses ids that mean DIFFERENT things in local and production
// (571-577 are Natrona countywide offices locally, Laramie precinct committee
// rows in production). A correct migration must not care about them.
const AFFECTED = [
  [571, 'Natrona', 'countywide'], [572, 'Natrona', 'countywide'],
  [573, 'Natrona', 'countywide'], [574, 'Natrona', 'countywide'],
  [575, 'Natrona', 'countywide'], [576, 'Natrona', 'countywide'],
  [577, 'Natrona', 'countywide'],
  [836, 'Sweetwater', 'countywide'], [837, 'Sweetwater', 'countywide'],
  [838, 'Sweetwater', 'countywide'], [839, 'Sweetwater', 'countywide'],
  [840, 'Sweetwater', 'countywide'], [841, 'Sweetwater', 'countywide'],
  [842, 'Sweetwater', 'countywide'], [843, 'Sweetwater', 'countywide'],
  [861, 'Teton', 'countywide'], [862, 'Teton', 'countywide'],
  [863, 'Teton', 'countywide'], [864, 'Teton', 'countywide'],
  [865, 'Teton', 'countywide'], [866, 'Teton', 'countywide'],
  [867, 'Teton', 'countywide'], [868, 'Teton', 'countywide'],
  [578, 'Natrona', 'judicial_district'],
];

function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE offices (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      county TEXT,
      scope_kind TEXT,
      ballot_party TEXT
    );
  `);
  const insert = db.prepare(
    'INSERT INTO offices (id, title, county, scope_kind, ballot_party) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [id, county, scope] of AFFECTED) {
    insert.run(id, `${county} test office ${id}`, county, scope, 'NP');
  }
  // Must survive untouched: correct party-split rows, genuinely nonpartisan
  // municipal rows, and countywide NP rows in counties outside the fix.
  insert.run(9001, 'Albany County Commissioner Republican', 'Albany', 'countywide', 'REP');
  insert.run(9002, 'Sublette County Commissioner Democratic', 'Sublette', 'countywide', 'DEM');
  insert.run(9003, 'Casper City Council', 'Natrona', 'municipal', 'NP');
  insert.run(9004, 'Jackson Town Council Ward 1', 'Teton', 'municipal_ward', 'NP');
  insert.run(9005, 'Laramie Precinct 5-4 Republican Committeeman', 'Laramie', 'precinct_party_gender', 'REP');
  insert.run(9006, 'Laramie Precinct 1-5 Democratic Committeewoman', 'Laramie', 'precinct_party_gender', 'DEM');
  return db;
}

const bp = (db, id) => db.prepare('SELECT ballot_party FROM offices WHERE id = ?').get(id).ballot_party;

test('partisan county offices lose the nonpartisan ballot marker', () => {
  const db = seed();
  db.exec(migration);
  db.exec(migration); // idempotent

  assert.deepEqual(
    db.prepare("SELECT id FROM offices WHERE scope_kind = 'countywide' AND ballot_party = 'NP'").all(),
    []
  );
  const normalized = db.prepare(
    `SELECT COUNT(*) AS n FROM offices
      WHERE id IN (${AFFECTED.map(() => '?').join(', ')}) AND ballot_party = ''`
  ).get(...AFFECTED.map(([id]) => id)).n;
  assert.equal(normalized, AFFECTED.length, 'all 24 affected rows normalized, incl. the judicial-district DA');

  db.close();
});

test('correct party data is never touched', () => {
  const db = seed();
  db.exec(migration);

  assert.equal(bp(db, 9001), 'REP', 'Albany party-split row preserved');
  assert.equal(bp(db, 9002), 'DEM', 'Sublette party-split row preserved');
  assert.equal(bp(db, 9003), 'NP', 'municipal races are genuinely nonpartisan');
  assert.equal(bp(db, 9004), 'NP', 'municipal_ward races are genuinely nonpartisan');
  assert.equal(bp(db, 9005), 'REP', 'precinct committee party is intrinsic to the office');
  assert.equal(bp(db, 9006), 'DEM', 'precinct committee party is intrinsic to the office');

  db.close();
});

// Regression guard for the defect this migration originally shipped with:
// office ids are NOT portable between the local miniflare database and the
// production `wy` database. Local 571-577 are Natrona countywide offices;
// the same ids in production are Laramie precinct committee rows.
test('migration matches by predicate, never by office id', () => {
  const sql = migration.replace(/--[^\n]*/g, ''); // strip comments
  assert.ok(!/\bid\s+IN\s*\(/i.test(sql), 'must not target rows with an id IN (...) list');
  assert.ok(!/\bid\s*=\s*\d+/i.test(sql), 'must not target rows by a literal id');
  assert.ok(/scope_kind/i.test(sql) && /county/i.test(sql), 'must qualify on scope_kind and county');
});
