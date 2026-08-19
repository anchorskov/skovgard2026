// Candidates/tests/election-event-data-status.test.mjs
//
// Guards the election-level production-readiness flag and prevents runtime
// code from selecting the retained, local-only 2024 review corpus.

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const candidatesDir = path.join(testsDir, '..');
const migrationsDir = path.join(candidatesDir, 'db', 'migrations');

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function createPreMigrationDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE offices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      level TEXT,
      district INTEGER,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      office_id INTEGER,
      party TEXT,
      full_name TEXT,
      slug TEXT UNIQUE
    );
  `);
  db.exec(readFileSync(path.join(migrationsDir, '0028_election_results.sql'), 'utf8'));
  db.exec(`
    INSERT INTO election_events
      (election_key, election_name, election_phase, election_date, polls_close_at)
    VALUES
      ('wy-2024-primary', 'Wyoming 2024 Primary', 'primary', '2024-08-20', '2024-08-20T19:00:00-06:00'),
      ('wy-2026-primary', 'Wyoming 2026 Primary', 'primary', '2026-08-18', '2026-08-18T19:00:00-06:00');
  `);
  return db;
}

test('0036 adds a constrained election data status and classifies known events', () => {
  const db = createPreMigrationDatabase();
  db.exec(readFileSync(path.join(migrationsDir, '0036_election_event_data_status.sql'), 'utf8'));

  const column = db.prepare("PRAGMA table_info('election_events')").all()
    .find((item) => item.name === 'data_status');
  assert.ok(column, 'data_status column must exist');
  assert.equal(column.notnull, 1);
  assert.equal(column.dflt_value, "'needs_review'");

  const tableSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'election_events'"
  ).get().sql;
  assert.match(tableSql, /CHECK\s*\(data_status IN \('needs_review', 'active'\)\)/);

  const statuses = db.prepare(
    'SELECT election_key, data_status FROM election_events ORDER BY election_key'
  ).all().map(({ election_key, data_status }) => ({ election_key, data_status }));
  assert.deepEqual(statuses, [
    { election_key: 'wy-2024-primary', data_status: 'needs_review' },
    { election_key: 'wy-2026-primary', data_status: 'active' },
  ]);
  assert.throws(
    () => db.prepare("UPDATE election_events SET data_status = 'published'").run(),
    /CHECK constraint failed/
  );

  db.close();
});

test('Astro and Worker runtime source does not reference the local-only 2024 event', () => {
  const runtimeRoots = [
    path.join(candidatesDir, 'src'),
    path.join(candidatesDir, 'cron', 'src'),
    path.join(candidatesDir, '..', 'Results', 'src'),
  ];
  const runtimeExtensions = new Set(['.astro', '.js', '.mjs', '.ts']);
  const references = runtimeRoots.flatMap(walkFiles)
    .filter((file) => runtimeExtensions.has(path.extname(file)))
    .filter((file) => readFileSync(file, 'utf8').includes('wy-2024-primary'))
    .map((file) => path.relative(candidatesDir, file));

  assert.deepEqual(references, []);
});
