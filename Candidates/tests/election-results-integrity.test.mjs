// Candidates/tests/election-results-integrity.test.mjs
//
// Schema-level tests for the election-results migrations (0028-0031).
// Each test builds a fresh in-memory SQLite database, applies the four
// migrations in order, seeds minimal fixture rows, and asserts on the
// resulting view behavior. No live county requests are made; no
// temporary file outside /tmp is used; nothing here touches the real
// local wy database.

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE offices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, level TEXT, district INTEGER, sort_order INTEGER DEFAULT 0);
    CREATE TABLE candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, office_id INTEGER, party TEXT, full_name TEXT, slug TEXT UNIQUE);
  `);
  for (const file of [
    '0028_election_results.sql',
    '0029_election_results_views.sql',
    '0030_election_source_precedence.sql',
    '0031_election_results_integrity.sql',
  ]) {
    db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}

function seedElection(db, key = 'wy-2024-primary', phase = 'primary') {
  db.prepare(
    `INSERT INTO election_events (election_key, election_name, election_phase, election_date, polls_close_at)
     VALUES (?, 'Test Election', ?, '2024-08-20', '2024-08-20T19:00:00-06:00')`
  ).run(key, phase);
  return db.prepare('SELECT id FROM election_events WHERE election_key = ?').get(key).id;
}

function seedSource(db, electionId, sourceKey, county = 'Natrona', role = 'county_pbp_summary') {
  db.prepare(
    `INSERT INTO election_sources (source_key, election_id, county, source_role, status)
     VALUES (?, ?, ?, ?, 'active')`
  ).run(sourceKey, electionId, county, role);
  return db.prepare('SELECT id FROM election_sources WHERE source_key = ?').get(sourceKey).id;
}

function seedSnapshot(db, sourceId, seq, sha256, verificationStatus = 'verified') {
  db.prepare(
    `INSERT INTO election_source_snapshots (source_id, snapshot_seq, sha256, parser_name, verification_status)
     VALUES (?, ?, ?, 'test', ?)`
  ).run(sourceId, seq, sha256, verificationStatus);
  return db.prepare('SELECT id FROM election_source_snapshots WHERE source_id = ? AND snapshot_seq = ?').get(sourceId, seq).id;
}

function seedContest(db, electionId, key, name = 'Test Contest', scope = 'statewide', county = null) {
  db.prepare(
    `INSERT INTO election_contests (contest_key, election_id, contest_name_raw, contest_name_normalized, level, reporting_scope, county)
     VALUES (?, ?, ?, ?, 'federal', ?, ?)`
  ).run(key, electionId, name, name, scope, county);
  return db.prepare('SELECT id FROM election_contests WHERE contest_key = ?').get(key).id;
}

function seedSnapshotContest(db, snapshotId, contestId, precinctsReporting = 10, precinctsTotal = 10) {
  db.prepare(
    `INSERT INTO election_snapshot_contests (snapshot_id, contest_id, precincts_reporting, precincts_total, reporting_status)
     VALUES (?, ?, ?, ?, 'certified')`
  ).run(snapshotId, contestId, precinctsReporting, precinctsTotal);
  return db.prepare('SELECT id FROM election_snapshot_contests WHERE snapshot_id = ? AND contest_id = ?').get(snapshotId, contestId).id;
}

function seedResultRow(db, snapshotContestId, candidateName, votes, rowKeySuffix, rowType = 'candidate') {
  db.prepare(
    `INSERT INTO election_results_rows (result_row_key, snapshot_contest_id, row_type, candidate_name_raw, votes)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`k-${rowKeySuffix}`, snapshotContestId, rowType, candidateName, votes);
}

test('clean schema creation succeeds (all four migrations, empty DB)', () => {
  const db = freshDb();
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name LIKE 'election_%' OR name LIKE 'v_election_%' ORDER BY name`
  ).all();
  assert.ok(tables.length >= 13, `expected at least 13 election objects, got ${tables.length}`);
  db.close();
});

test('latest verified snapshot wins: one verified snapshot is selected', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snapId = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid = seedSnapshotContest(db, snapId, cid);
  seedResultRow(db, scid, 'Alice', 100, 'r1');

  const rows = db.prepare('SELECT candidate_name_raw, votes FROM v_election_current_results WHERE contest_id = ?').all(cid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votes, 100);
  db.close();
});

test('identical repeated retrieval (same sha256) does not create a duplicate snapshot', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  assert.throws(() => seedSnapshot(db, sid, 2, 'sha-a', 'verified'), /UNIQUE constraint failed/);
  const count = db.prepare('SELECT COUNT(*) AS n FROM election_source_snapshots WHERE source_id = ?').get(sid).n;
  assert.equal(count, 1);
  db.close();
});

test('a newer parse_failed snapshot does not replace the last verified result', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snap1 = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid1 = seedSnapshotContest(db, snap1, cid);
  seedResultRow(db, scid1, 'Alice', 100, 'r1');

  // A newer snapshot exists but failed to parse -- must not become current.
  seedSnapshot(db, sid, 2, 'sha-b', 'parse_failed');

  const latest = db.prepare('SELECT snapshot_id FROM v_election_latest_snapshots WHERE source_id = ?').all(sid);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].snapshot_id, snap1);

  const rows = db.prepare('SELECT candidate_name_raw, votes FROM v_election_current_results WHERE contest_id = ?').all(cid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votes, 100, 'must still show the original verified result, not nothing and not the failed one');
  db.close();
});

test('a newer needs_review snapshot does not replace the last verified result', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snap1 = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid1 = seedSnapshotContest(db, snap1, cid);
  seedResultRow(db, scid1, 'Alice', 100, 'r1');
  seedSnapshot(db, sid, 2, 'sha-b', 'needs_review');

  const rows = db.prepare('SELECT votes FROM v_election_current_results WHERE contest_id = ?').all(cid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votes, 100);
  db.close();
});

test('a newer verified correction (including a lower total) becomes current', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snap1 = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid1 = seedSnapshotContest(db, snap1, cid);
  seedResultRow(db, scid1, 'Alice', 500, 'r1');

  // Official correction: lower total, still verified, later seq.
  const snap2 = seedSnapshot(db, sid, 2, 'sha-b', 'verified');
  const scid2 = seedSnapshotContest(db, snap2, cid);
  seedResultRow(db, scid2, 'Alice', 420, 'r2');

  const rows = db.prepare('SELECT votes FROM v_election_current_results WHERE contest_id = ?').all(cid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votes, 420, 'a verified correction, even with a lower total, must become current');
  db.close();
});

test('overlapping sources for the same contest+county do not double-count', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const cid = seedContest(db, eid, 'us-senate', 'US Senate', 'statewide');

  const sosSource = seedSource(db, eid, 's-sos', 'Natrona', 'county_pbp_summary');
  const sosSnap = seedSnapshot(db, sosSource, 1, 'sha-sos', 'verified');
  const sosSc = seedSnapshotContest(db, sosSnap, cid);
  seedResultRow(db, sosSc, 'Alice', 1000, 'sos-1');

  const countySource = seedSource(db, eid, 's-county', 'Natrona', 'county_local_summary');
  const countySnap = seedSnapshot(db, countySource, 1, 'sha-county', 'verified');
  const countySc = seedSnapshotContest(db, countySnap, cid);
  seedResultRow(db, countySc, 'Alice', 1000, 'county-1');

  const rows = db.prepare(
    `SELECT source_role, votes FROM v_election_current_results WHERE contest_id = ? AND county = 'Natrona'`
  ).all(cid);
  assert.equal(rows.length, 1, 'exactly one source should win for this (contest, county) pair, not both');
  assert.equal(rows[0].source_role, 'county_local_summary', 'county_local_summary must win over county_pbp_summary');
  db.close();
});

test('a contest where the winning source has no data falls back to the other source', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const cidA = seedContest(db, eid, 'contest-a', 'Contest A', 'statewide');
  const cidB = seedContest(db, eid, 'contest-b', 'Contest B', 'statewide');

  const sosSource = seedSource(db, eid, 's-sos', 'Natrona', 'county_pbp_summary');
  const sosSnap = seedSnapshot(db, sosSource, 1, 'sha-sos', 'verified');
  seedResultRow(db, seedSnapshotContest(db, sosSnap, cidA), 'Alice', 100, 'sos-a');
  seedResultRow(db, seedSnapshotContest(db, sosSnap, cidB), 'Bob', 200, 'sos-b');

  // county-hosted source only has contest A (its parse of contest B failed
  // and produced no rows for it -- mirrors the real Albany case).
  const countySource = seedSource(db, eid, 's-county', 'Natrona', 'county_local_summary');
  const countySnap = seedSnapshot(db, countySource, 1, 'sha-county', 'verified');
  seedResultRow(db, seedSnapshotContest(db, countySnap, cidA), 'Alice', 105, 'county-a');

  const a = db.prepare(`SELECT source_role, votes FROM v_election_current_results WHERE contest_id = ?`).all(cidA);
  const b = db.prepare(`SELECT source_role, votes FROM v_election_current_results WHERE contest_id = ?`).all(cidB);
  assert.equal(a.length, 1);
  assert.equal(a[0].source_role, 'county_local_summary');
  assert.equal(b.length, 1, 'contest B must still show the SOS data, not disappear');
  assert.equal(b[0].source_role, 'county_pbp_summary');
  assert.equal(b[0].votes, 200);
  db.close();
});

test('precinct reporting is aggregated once per (contest, county), not once per result row', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snapId = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid = seedSnapshotContest(db, snapId, cid, 46, 46);

  // Six result rows for one county+contest (3 candidates + writein +
  // overvote + undervote), mirroring the real Natrona US Senate shape.
  seedResultRow(db, scid, 'Alice', 100, 'r1', 'candidate');
  seedResultRow(db, scid, 'Bob', 80, 'r2', 'candidate');
  seedResultRow(db, scid, 'Carol', 40, 'r3', 'candidate');
  seedResultRow(db, scid, null, 5, 'r4', 'write_in_aggregate');
  seedResultRow(db, scid, null, 1, 'r5', 'overvote');
  seedResultRow(db, scid, null, 2, 'r6', 'undervote');

  const buggy = db.prepare(
    `SELECT SUM(precincts_reporting) AS pr FROM v_election_current_results WHERE contest_id = ?`
  ).get(cid);
  assert.equal(buggy.pr, 46 * 6, 'sanity check: summing the result-row grain IS multiplied 6x (the bug this fixes)');

  const correct = db.prepare(
    `SELECT SUM(precincts_reporting) AS pr, SUM(precincts_total) AS pt FROM v_election_selected_snapshot_contests WHERE contest_id = ?`
  ).get(cid);
  assert.equal(correct.pr, 46, 'the correct contest-grain view must give the true, unmultiplied count');
  assert.equal(correct.pt, 46);
  db.close();
});

test('primary and general election cycles remain fully separate', () => {
  const db = freshDb();
  const primaryId = seedElection(db, 'wy-2024-primary', 'primary');
  const generalId = seedElection(db, 'wy-2024-general', 'general');

  const primaryContest = seedContest(db, primaryId, 'p-c1', 'US Senate REP Primary', 'statewide');
  const generalContest = seedContest(db, generalId, 'g-c1', 'US Senate General', 'statewide');

  const s1 = seedSource(db, primaryId, 's-primary');
  const snap1 = seedSnapshot(db, s1, 1, 'sha-primary', 'verified');
  seedResultRow(db, seedSnapshotContest(db, snap1, primaryContest), 'Alice', 100, 'p1');

  const s2 = seedSource(db, generalId, 's-general');
  const snap2 = seedSnapshot(db, s2, 1, 'sha-general', 'verified');
  seedResultRow(db, seedSnapshotContest(db, snap2, generalContest), 'Alice', 999, 'g1');

  const primaryContests = db.prepare('SELECT id FROM election_contests WHERE election_id = ?').all(primaryId);
  const generalContests = db.prepare('SELECT id FROM election_contests WHERE election_id = ?').all(generalId);
  assert.equal(primaryContests.length, 1);
  assert.equal(generalContests.length, 1);
  assert.notEqual(primaryContests[0].id, generalContests[0].id, 'primary and general contests must never be the same row');

  const primaryVotes = db.prepare('SELECT votes FROM v_election_current_results WHERE contest_id = ?').get(primaryContest);
  const generalVotes = db.prepare('SELECT votes FROM v_election_current_results WHERE contest_id = ?').get(generalContest);
  assert.equal(primaryVotes.votes, 100);
  assert.equal(generalVotes.votes, 999);
  db.close();
});

test('snapshot integrity triggers reject invalid data', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');

  assert.throws(() => {
    db.prepare(
      `INSERT INTO election_source_snapshots (source_id, snapshot_seq, sha256, parser_name, verification_status)
       VALUES (?, 0, 'sha-x', 'test', 'verified')`
    ).run(sid);
  }, /snapshot_seq must be > 0/);

  assert.throws(() => {
    db.prepare(
      `INSERT INTO election_source_snapshots (source_id, snapshot_seq, sha256, parser_name, is_unofficial, verification_status)
       VALUES (?, 1, 'sha-y', 'test', 2, 'verified')`
    ).run(sid);
  }, /is_unofficial must be 0 or 1/);

  const snapId = seedSnapshot(db, sid, 1, 'sha-z', 'verified');
  const cid = seedContest(db, eid, 'c1');

  assert.throws(() => {
    db.prepare(
      `INSERT INTO election_snapshot_contests (snapshot_id, contest_id, precincts_reporting, precincts_total, reporting_status)
       VALUES (?, ?, -1, 10, 'certified')`
    ).run(snapId, cid);
  }, /must be nonnegative/);

  assert.throws(() => {
    db.prepare(
      `INSERT INTO election_snapshot_contests (snapshot_id, contest_id, precincts_reporting, precincts_total, reporting_status)
       VALUES (?, ?, 50, 10, 'certified')`
    ).run(snapId, cid);
  }, /precincts_reporting cannot exceed precincts_total/);

  db.close();
});

test('PRAGMA quick_check and foreign_key_check pass on a fully seeded schema', () => {
  const db = freshDb();
  const eid = seedElection(db);
  const sid = seedSource(db, eid, 's1');
  const snapId = seedSnapshot(db, sid, 1, 'sha-a', 'verified');
  const cid = seedContest(db, eid, 'c1');
  const scid = seedSnapshotContest(db, snapId, cid);
  seedResultRow(db, scid, 'Alice', 100, 'r1');

  const quickCheck = db.prepare('PRAGMA quick_check').get();
  assert.equal(Object.values(quickCheck)[0], 'ok');

  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fkViolations.length, 0);
  db.close();
});
