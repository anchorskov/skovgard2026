// Results/tests/repository.test.mjs
//
// Exercises repository.js against a real in-memory SQLite database built
// from the actual migration files (0028, 0032), through a thin shim that
// implements the slice of the D1 prepared-statement API this module uses
// (prepare().bind().run()/.all()/.first(), db.batch()). No live county
// requests are made; nothing here touches the real local wy database.

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { insertDiscoveries, insertSourceCheck } from '../src/repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'Candidates', 'db', 'migrations');

function wrapD1(sqliteDb) {
  function bound(sql, args) {
    return {
      async run() {
        const info = sqliteDb.prepare(sql).run(...args);
        return { meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
      },
      async all() {
        return { results: sqliteDb.prepare(sql).all(...args) };
      },
      async first() {
        return sqliteDb.prepare(sql).get(...args) ?? null;
      },
    };
  }
  return {
    prepare(sql) {
      return { bind: (...args) => bound(sql, args) };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

function freshDb() {
  const sqliteDb = new DatabaseSync(':memory:');
  for (const file of ['0028_election_results.sql', '0032_election_source_discoveries.sql']) {
    sqliteDb.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return wrapD1(sqliteDb);
}

async function seedSource(db, key) {
  await db.prepare(`
    INSERT OR IGNORE INTO election_events (election_key, election_name, election_phase, election_date, polls_close_at)
    VALUES ('wy-2026-primary', 'Test Election', 'primary', '2026-08-18', '2026-08-18T19:00:00-06:00')
  `).bind().run();
  const event = await db.prepare(`SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'`).bind().first();
  await db.prepare(`
    INSERT INTO election_sources (source_key, election_id, source_role, status)
    VALUES (?1, ?2, 'landing_page', 'pending')
  `).bind(key, event.id).run();
  const source = await db.prepare(`SELECT id FROM election_sources WHERE source_key = ?1`).bind(key).first();
  return source.id;
}

async function seedCheck(db, sourceId) {
  return insertSourceCheck(db, sourceId, {
    checkedAt: new Date().toISOString(),
    httpStatus: 200,
    redirectTo: null,
    contentType: 'text/html',
    contentLength: 100,
    etag: null,
    lastModified: null,
    sha256: 'abc',
    screenResult: 'clean',
    errorMessage: null,
  });
}

test('the same link discovered on a repeat poll of the same source is not re-inserted', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const discovery = { url: 'https://county.gov/results.pdf', linkText: 'Results', classification: 'candidate_result', reason: 'test' };

  const firstCheck = await seedCheck(db, sourceId);
  const firstInsertCount = await insertDiscoveries(db, sourceId, firstCheck, [discovery]);
  assert.equal(firstInsertCount, 1);

  const secondCheck = await seedCheck(db, sourceId);
  const secondInsertCount = await insertDiscoveries(db, sourceId, secondCheck, [discovery]);
  assert.equal(secondInsertCount, 0);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 1);
});

test('a genuinely new link on a later poll is still inserted', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const first = { url: 'https://county.gov/results.pdf', linkText: 'Results', classification: 'candidate_result', reason: 'test' };
  const second = { url: 'https://county.gov/results-updated.pdf', linkText: 'Updated Results', classification: 'candidate_result', reason: 'test' };

  const firstCheck = await seedCheck(db, sourceId);
  await insertDiscoveries(db, sourceId, firstCheck, [first]);

  const secondCheck = await seedCheck(db, sourceId);
  const secondInsertCount = await insertDiscoveries(db, sourceId, secondCheck, [first, second]);
  assert.equal(secondInsertCount, 1);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 2);
});

test('the same URL discovered from two different sources is recorded for each', async () => {
  const db = freshDb();
  const sourceA = await seedSource(db, 'wy|county-a|wy-2026-primary|landing_page');
  const sourceB = await seedSource(db, 'wy|county-b|wy-2026-primary|landing_page');
  const discovery = { url: 'https://sos.wyo.gov/results.pdf', linkText: 'Results', classification: 'candidate_result', reason: 'test' };

  const checkA = await seedCheck(db, sourceA);
  await insertDiscoveries(db, sourceA, checkA, [discovery]);
  const checkB = await seedCheck(db, sourceB);
  const insertedForB = await insertDiscoveries(db, sourceB, checkB, [discovery]);
  assert.equal(insertedForB, 1);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 2);
});
