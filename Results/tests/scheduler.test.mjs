// Results/tests/scheduler.test.mjs
//
// Exercises runScheduledPoll end to end (fair source ordering across
// simulated runs, per-source failure isolation) against a real in-memory
// SQLite database built from the actual migration files, through the
// shared D1 shim. fetchImpl is stubbed to a fast synthetic response; no
// live county requests are made.

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wrapD1 } from './helpers/d1-shim.mjs';
import { runScheduledPoll } from '../src/scheduler.js';
import { BASELINE_CRON, FAST_CRON } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'Candidates', 'db', 'migrations');

function freshDb() {
  const sqliteDb = new DatabaseSync(':memory:');
  for (const file of [
    '0028_election_results.sql',
    '0032_election_source_discoveries.sql',
    '0033_election_source_discoveries_unique_index.sql',
  ]) {
    sqliteDb.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return { sqliteDb, db: wrapD1(sqliteDb) };
}

async function seedElection(db, pollsCloseAt = '2026-08-18T19:00:00-06:00') {
  await db.prepare(`
    INSERT OR IGNORE INTO election_events (election_key, election_name, election_phase, election_date, polls_close_at)
    VALUES ('wy-2026-primary', 'Test Election', 'primary', '2026-08-18', ?1)
  `).bind(pollsCloseAt).run();
  const event = await db.prepare(`SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'`).bind().first();
  return event.id;
}

async function seedSources(db, electionId, count, { role = 'landing_page', keyPrefix = 'source' } = {}) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const key = `wy|${keyPrefix}-${i}|wy-2026-primary|${role}`;
    await db.prepare(`
      INSERT INTO election_sources (source_key, election_id, source_role, endpoint_url, status)
      VALUES (?1, ?2, ?3, ?4, 'pending')
    `).bind(key, electionId, role, `https://county${i}.gov/elections`).run();
    const row = await db.prepare(`SELECT id FROM election_sources WHERE source_key = ?1`).bind(key).first();
    ids.push(row.id);
  }
  return ids;
}

function poisonDb(db, { failCheckForSourceId = null, failDiscoveryForSourceId = null } = {}) {
  return {
    ...db,
    prepare(sql) {
      const real = db.prepare(sql);
      const isCheckInsert = sql.includes('INSERT INTO election_source_checks');
      const isDiscoveryInsert = sql.includes('INSERT OR IGNORE INTO election_source_discoveries');
      return {
        bind(...args) {
          const boundReal = real.bind(...args);
          return {
            async run() {
              if (isCheckInsert && args[0] === failCheckForSourceId) {
                throw new Error('simulated check persistence failure');
              }
              if (isDiscoveryInsert && args[1] === failDiscoveryForSourceId) {
                throw new Error('simulated discovery persistence failure');
              }
              return boundReal.run();
            },
            all: () => boundReal.all(),
            first: () => boundReal.first(),
          };
        },
      };
    },
  };
}

const okFetch = async () => new Response('<html><body>no links here</body></html>', {
  status: 200,
  headers: { 'content-type': 'text/html' },
});

const baseEnv = {
  ENVIRONMENT: 'local',
  TARGET_ELECTION_KEY: 'wy-2026-primary',
  MAX_RESPONSE_BYTES: '10485760',
  FETCH_TIMEOUT_MS: '2000',
  MAX_CONCURRENCY: '4',
  FAST_WINDOW_BEFORE_MINUTES: '60',
  FAST_WINDOW_AFTER_MINUTES: '1080',
};

test('30 eligible sources with a limit of 24 are all selected within two simulated runs', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  await seedSources(db, electionId, 30);
  const env = { WY_DB: db, ...baseEnv, MAX_SOURCES_PER_RUN: '24' };

  const run1 = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: new Date('2026-08-18T10:00:00Z').getTime(), fetchImpl: okFetch });
  assert.equal(run1.eligibleSources, 24);

  const run2 = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: new Date('2026-08-18T10:10:00Z').getTime(), fetchImpl: okFetch });
  assert.equal(run2.eligibleSources, 6);

  const checkedSourceIds = new Set([...run1.results, ...run2.results].map((r) => r.sourceId));
  assert.equal(checkedSourceIds.size, 30);
});

test('a newly added, never-checked source is selected ahead of a recently checked one', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  const [landingPageId] = await seedSources(db, electionId, 1, { role: 'landing_page', keyPrefix: 'landing' });
  const env = { WY_DB: db, ...baseEnv, MAX_SOURCES_PER_RUN: '10' };

  await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: new Date('2026-08-18T10:00:00Z').getTime(), fetchImpl: okFetch });

  const [directResultId] = await seedSources(db, electionId, 1, { role: 'county_pbp_detail', keyPrefix: 'direct' });
  const limitedEnv = { ...env, MAX_SOURCES_PER_RUN: '1' };
  const run2 = await runScheduledPoll({
    env: limitedEnv,
    cron: FAST_CRON,
    scheduledTime: new Date('2026-08-19T00:30:00Z').getTime(),
    fetchImpl: okFetch,
  });

  assert.equal(run2.results.length, 1);
  assert.equal(run2.results[0].sourceId, directResultId);
  assert.notEqual(run2.results[0].sourceId, landingPageId);
});

test('ordering is deterministic when timestamps match', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  const ids = await seedSources(db, electionId, 5);
  const env = { WY_DB: db, ...baseEnv, MAX_SOURCES_PER_RUN: '5' };

  const run = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: new Date('2026-08-18T10:00:00Z').getTime(), fetchImpl: okFetch });
  assert.deepEqual(run.results.map((r) => r.sourceId), [...ids].sort((a, b) => a - b));
});

test('a check-insertion failure for one source does not prevent others from completing', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  const ids = await seedSources(db, electionId, 3);
  const poisoned = poisonDb(db, { failCheckForSourceId: ids[1] });
  const env = { WY_DB: poisoned, ...baseEnv, MAX_SOURCES_PER_RUN: '3', MAX_CONCURRENCY: '1' };

  const run = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: Date.now(), fetchImpl: okFetch });

  assert.equal(run.results.length, 3);
  const failed = run.results.find((r) => r.sourceId === ids[1]);
  assert.ok(failed.persistenceError);
  assert.equal(failed.checkPersisted, false);
  const succeeded = run.results.filter((r) => r.sourceId !== ids[1]);
  assert.equal(succeeded.length, 2);
  assert.ok(succeeded.every((r) => !r.persistenceError));
  assert.equal(run.persistenceErrors, 1);
  assert.equal(run.successfulChecks, 2);
});

test('a discovery-insertion failure for one source does not prevent later sources from completing', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  const ids = await seedSources(db, electionId, 3);
  const poisoned = poisonDb(db, { failDiscoveryForSourceId: ids[0] });
  const env = { WY_DB: poisoned, ...baseEnv, MAX_SOURCES_PER_RUN: '3', MAX_CONCURRENCY: '1' };

  const linkFetch = async () => new Response('<a href="/results-2026.pdf">2026 Results</a>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

  const run = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: Date.now(), fetchImpl: linkFetch });

  assert.equal(run.results.length, 3);
  const failed = run.results.find((r) => r.sourceId === ids[0]);
  assert.ok(failed.persistenceError);
  assert.equal(failed.checkPersisted, true);
  const succeeded = run.results.filter((r) => r.sourceId !== ids[0]);
  assert.equal(succeeded.length, 2);
  assert.ok(succeeded.every((r) => !r.persistenceError));
});

test('the completion summary is still produced for a partially successful run', async () => {
  const { db } = freshDb();
  const electionId = await seedElection(db);
  const ids = await seedSources(db, electionId, 2);
  const poisoned = poisonDb(db, { failCheckForSourceId: ids[0] });
  const env = { WY_DB: poisoned, ...baseEnv, MAX_SOURCES_PER_RUN: '2', MAX_CONCURRENCY: '1' };

  const run = await runScheduledPoll({ env, cron: BASELINE_CRON, scheduledTime: Date.now(), fetchImpl: okFetch });

  assert.equal(typeof run.checkedAt, 'string');
  assert.equal(run.eligibleSources, 2);
  assert.equal(run.persistenceErrors, 1);
  assert.equal(run.successfulChecks, 1);
});
