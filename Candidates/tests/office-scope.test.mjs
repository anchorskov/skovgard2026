import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePrecinctCode,
  normalizeWard,
  officeMatchesPrecinct,
} from '../src/lib/office-scope.js';

test('normalizes ward and Fremont precinct labels', () => {
  assert.equal(normalizeWard('1'), 'WARD 1');
  assert.equal(normalizeWard('Ward 3'), 'WARD 3');
  assert.equal(normalizePrecinctCode('Precinct 03-02'), '3-2');
});

test('matches a ward office through its D1-backed precinct mapping', () => {
  const ward1 = {
    title: 'Lander City Council Ward 1',
    precinct_code: null,
    mapped_precinct_codes: '1-1,1-2',
  };
  assert.equal(officeMatchesPrecinct(ward1, '1-1'), true);
  assert.equal(officeMatchesPrecinct(ward1, '1-2'), true);
  assert.equal(officeMatchesPrecinct(ward1, '1-3'), false);
});

test('retains direct precinct-office matching', () => {
  const committee = {
    title: 'Fremont Precinct 3-4 Republican Precinct Committeeman',
    precinct_code: '3-4',
    mapped_precinct_codes: null,
  };
  assert.equal(officeMatchesPrecinct(committee, '03-04'), true);
  assert.equal(officeMatchesPrecinct(committee, '3-5'), false);
});
