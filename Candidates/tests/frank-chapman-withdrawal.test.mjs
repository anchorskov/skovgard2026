import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const correctionUrl = new URL(
  '../db/seed/candidate_corrections_2026-07-27.sql',
  import.meta.url,
);

test('Frank Chapman correction preserves the filing and marks it withdrawn', async () => {
  const sql = await readFile(correctionUrl, 'utf8');

  assert.match(sql, /UPDATE candidates/);
  assert.match(sql, /withdrawn_at = '2026-07-27T00:00:00'/);
  assert.match(sql, /WHERE slug = 'frank-chapman' AND withdrawn_at IS NULL/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+candidates/i);
});
