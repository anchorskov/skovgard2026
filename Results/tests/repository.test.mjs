// Results/tests/repository.test.mjs
//
// Exercises repository.js against a real in-memory SQLite database built
// from the actual migration files (0028, 0032, 0033), through the shared
// D1 shim. No live county requests are made; nothing here touches the real
// local wy database.

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wrapD1 } from './helpers/d1-shim.mjs';
import { insertDiscoveries, insertSourceCheck, loadPollingSources } from '../src/repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'Candidates', 'db', 'migrations');

function freshDb({ onQuery } = {}) {
  const sqliteDb = new DatabaseSync(':memory:');
  for (const file of [
    '0028_election_results.sql',
    '0032_election_source_discoveries.sql',
    '0033_election_source_discoveries_unique_index.sql',
  ]) {
    sqliteDb.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return wrapD1(sqliteDb, { onQuery });
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

test('a versioned landing page replaces its stale source without increasing the poll set', async () => {
  const db = freshDb();
  const oldSourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const event = await db.prepare(`SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'`).bind().first();
  await db.prepare(`
    INSERT INTO election_sources (
      source_key, election_id, county, source_role, endpoint_url, status, supersedes_source_id
    ) VALUES (?1, ?2, 'Test', 'landing_page_v2', 'https://county.gov/2026-results', 'pending', ?3)
  `).bind('wy|test|wy-2026-primary|landing_page_v2', event.id, oldSourceId).run();

  const sources = await loadPollingSources(db, 'wy-2026-primary');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source_key, 'wy|test|wy-2026-primary|landing_page_v2');
});

function link(n) {
  return { url: `https://county.gov/results-${n}.pdf`, linkText: `Results ${n}`, classification: 'candidate_result', reason: 'test' };
}

test('the same link discovered on a repeat poll of the same source is not re-inserted', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const discovery = link(1);

  const firstCheck = await seedCheck(db, sourceId);
  const first = await insertDiscoveries(db, sourceId, firstCheck, [discovery], 20);
  assert.equal(first.inserted, 1);
  assert.equal(first.deferred, 0);

  const secondCheck = await seedCheck(db, sourceId);
  const second = await insertDiscoveries(db, sourceId, secondCheck, [discovery], 20);
  assert.equal(second.inserted, 0);
  assert.equal(second.deferred, 0);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 1);
});

test('a genuinely new link on a later poll is still inserted', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const first = link(1);
  const second = link(2);

  const firstCheck = await seedCheck(db, sourceId);
  await insertDiscoveries(db, sourceId, firstCheck, [first], 20);

  const secondCheck = await seedCheck(db, sourceId);
  const result = await insertDiscoveries(db, sourceId, secondCheck, [first, second], 20);
  assert.equal(result.inserted, 1);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 2);
});

test('the same URL discovered from two different sources is recorded for each', async () => {
  const db = freshDb();
  const sourceA = await seedSource(db, 'wy|county-a|wy-2026-primary|landing_page');
  const sourceB = await seedSource(db, 'wy|county-b|wy-2026-primary|landing_page');
  const discovery = { url: 'https://sos.wyo.gov/results.pdf', linkText: 'Results', classification: 'candidate_result', reason: 'test' };

  const checkA = await seedCheck(db, sourceA);
  await insertDiscoveries(db, sourceA, checkA, [discovery], 20);
  const checkB = await seedCheck(db, sourceB);
  const forB = await insertDiscoveries(db, sourceB, checkB, [discovery], 20);
  assert.equal(forB.inserted, 1);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 2);
});

test('duplicate URLs inside one incoming discovery array produce one row', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const discovery = link(1);
  const checkId = await seedCheck(db, sourceId);

  const result = await insertDiscoveries(db, sourceId, checkId, [discovery, { ...discovery }, { ...discovery }], 20);
  assert.equal(result.inserted, 1);
  assert.equal(result.deferred, 0);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 1);
});

test('a source with 100 new links inserts only the configured per-run limit', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const checkId = await seedCheck(db, sourceId);
  const links = Array.from({ length: 100 }, (_, i) => link(i));

  const result = await insertDiscoveries(db, sourceId, checkId, links, 20);
  assert.equal(result.inserted, 20);
  assert.equal(result.deferred, 80);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 20);
});

test('later calls drain the links deferred by an earlier run', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const links = Array.from({ length: 45 }, (_, i) => link(i));

  const check1 = await seedCheck(db, sourceId);
  const run1 = await insertDiscoveries(db, sourceId, check1, links, 20);
  assert.equal(run1.inserted, 20);
  assert.equal(run1.deferred, 25);

  const check2 = await seedCheck(db, sourceId);
  const run2 = await insertDiscoveries(db, sourceId, check2, links, 20);
  assert.equal(run2.inserted, 20);
  assert.equal(run2.deferred, 5);

  const check3 = await seedCheck(db, sourceId);
  const run3 = await insertDiscoveries(db, sourceId, check3, links, 20);
  assert.equal(run3.inserted, 5);
  assert.equal(run3.deferred, 0);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 45);
});

test('one existing-URL lookup is performed rather than one query per known link', async () => {
  const queries = [];
  const db = freshDb({ onQuery: (sql) => queries.push(sql) });
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const checkId = await seedCheck(db, sourceId);
  const links = Array.from({ length: 30 }, (_, i) => link(i));

  queries.length = 0;
  await insertDiscoveries(db, sourceId, checkId, links, 20);

  const lookups = queries.filter((sql) => sql.includes('SELECT discovered_url FROM election_source_discoveries'));
  assert.equal(lookups.length, 1);
});

test('the unique index rejects a duplicate insert attempted outside the app-level check', async () => {
  const db = freshDb();
  const sourceId = await seedSource(db, 'wy|test|wy-2026-primary|landing_page');
  const checkId = await seedCheck(db, sourceId);
  await insertDiscoveries(db, sourceId, checkId, [link(1)], 20);

  const result = await db.prepare(`
    INSERT OR IGNORE INTO election_source_discoveries (check_id, source_id, discovered_url, link_text, classification)
    VALUES (?1, ?2, ?3, 'dup', 'candidate_result')
  `).bind(checkId, sourceId, link(1).url).run();
  assert.equal(result.meta.changes, 0);

  const total = await db.prepare('SELECT COUNT(*) AS n FROM election_source_discoveries').bind().first();
  assert.equal(total.n, 1);
});
