// Candidates/tests/selection-limit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSelectionLimit,
  parseBallotInstruction,
  validateSelectionWrite,
} from '../src/lib/selection-limit.ts';

function contest(overrides = {}) {
  return {
    electionPhase: null,
    jurisdictionType: null,
    partisanship: null,
    seatsOpen: null,
    maxSelections: null,
    ballotInstruction: null,
    verified: false,
    ...overrides,
  };
}

test('§3 — two precincts in the same county resolve to different limits (5 and 3)', () => {
  const precinctA = contest({
    electionPhase: 'primary',
    jurisdictionType: 'precinct',
    partisanship: 'partisan',
    seatsOpen: 5,
  });
  const precinctB = contest({
    electionPhase: 'primary',
    jurisdictionType: 'precinct',
    partisanship: 'partisan',
    seatsOpen: 3,
  });

  const resultA = resolveSelectionLimit(precinctA, 'Precinct A');
  const resultB = resolveSelectionLimit(precinctB, 'Precinct B');

  assert.equal(resultA.limit, 5);
  assert.equal(resultA.source, 'derived:partisan_seats_open');
  assert.equal(resultA.isMultiSelect, true);

  assert.equal(resultB.limit, 3);
  assert.equal(resultB.source, 'derived:partisan_seats_open');
  assert.notEqual(resultA.limit, resultB.limit);
});

test('§3 — municipal nonpartisan primary with 2 seats resolves to limit 2, not 4 (number_nominated must never drive the UI)', () => {
  const municipal = contest({
    electionPhase: 'primary',
    jurisdictionType: 'municipal',
    partisanship: 'nonpartisan',
    seatsOpen: 2,
  });

  const result = resolveSelectionLimit(municipal, 'Town Council');

  assert.equal(result.limit, 2);
  assert.notEqual(result.limit, 4);
  assert.equal(result.source, 'derived:municipal_seats_open');
});

test('§3 — general election always uses seats_open regardless of jurisdiction/partisanship', () => {
  const general = contest({
    electionPhase: 'general',
    jurisdictionType: 'municipal',
    partisanship: 'nonpartisan',
    seatsOpen: 2,
  });
  assert.equal(resolveSelectionLimit(general).limit, 2);
});

test('§3 — a combination absent from the table returns UNKNOWN, not a fallback formula', () => {
  const unmapped = contest({
    electionPhase: 'primary',
    jurisdictionType: 'special_district',
    partisanship: 'nonpartisan',
    seatsOpen: 2,
  });
  const result = resolveSelectionLimit(unmapped);
  assert.equal(result.limit, null);
  assert.equal(result.isMultiSelect, false);
  assert.equal(result.source, null);
});

test('§6 — parses the four real observed instruction strings', () => {
  assert.equal(parseBallotInstruction('VOTE FOR NOT MORE THAN TWO (2)').value, 2);
  assert.equal(parseBallotInstruction('VOTE FOR NOT MORE THAN THREE (3)').value, 3);
  assert.equal(parseBallotInstruction('Vote for not more than two (2)').value, 2);
  assert.equal(parseBallotInstruction('VOTE FOR ONE (1)').value, 1);
});

test('§6 — "VOTE FOR TWO (2)" parses fine without a "not more than" clause', () => {
  // Big Horn County's real 2026 sample ballot instruction.
  assert.equal(parseBallotInstruction('VOTE FOR TWO (2)').value, 2);
});

test('§6 — a bare numeral with no parentheses and no spelled word parses, with no integrity error', () => {
  // Johnson County's real 2026 clerk-page instruction: "Vote for 2". No word
  // to cross-check against, so the integrity check simply doesn't apply.
  const parsed = parseBallotInstruction('Vote for 2', 'Johnson County Commission');
  assert.equal(parsed.value, 2);
  assert.equal(parsed.error, null);

  const result = resolveSelectionLimit(
    contest({ ballotInstruction: 'Vote for 2', maxSelections: 2, verified: true }),
    'Johnson County Commission'
  );
  assert.equal(result.limit, 2);
  assert.equal(result.source, 'ballot_instruction');
  assert.equal(result.error, null);
});

test('§6 — parenthetical numeral still wins over a bare numeral elsewhere in the string', () => {
  // e.g. a hypothetical "2026 ballot: vote for not more than three (3)" —
  // the year is a bare numeral, but the parenthetical is authoritative.
  assert.equal(parseBallotInstruction('2026 ballot: VOTE FOR NOT MORE THAN THREE (3)').value, 3);
});

test('§6 — "TWO (3)" is a word/numeral mismatch: UNKNOWN plus a named error', () => {
  const parsed = parseBallotInstruction('VOTE FOR NOT MORE THAN TWO (3)', 'Weston County Commissioner');
  assert.equal(parsed.value, null);
  assert.ok(parsed.error, 'expected a non-null error message');
  assert.match(parsed.error, /Weston County Commissioner/);
  assert.match(parsed.error, /two.*3|3.*two/i);

  const result = resolveSelectionLimit(
    contest({ ballotInstruction: 'VOTE FOR NOT MORE THAN TWO (3)', verified: true }),
    'Weston County Commissioner'
  );
  assert.equal(result.limit, null);
  assert.ok(result.error);
  assert.equal(result.isMultiSelect, false);
});

test('§6 — unrecognized phrasing returns null, never a guess', () => {
  const parsed = parseBallotInstruction('Choose your favorite candidates');
  assert.equal(parsed.value, null);
  assert.equal(parsed.error, null);
});

test('§2 — precedence: verbatim instruction beats max_selections beats derived', () => {
  const withInstruction = contest({
    ballotInstruction: 'VOTE FOR ONE (1)',
    maxSelections: 5,
    seatsOpen: 5,
    electionPhase: 'primary',
    jurisdictionType: 'county',
    partisanship: 'partisan',
    verified: true,
  });
  assert.equal(resolveSelectionLimit(withInstruction).source, 'ballot_instruction');
  assert.equal(resolveSelectionLimit(withInstruction).limit, 1);

  const withMaxSelectionsOnly = contest({
    maxSelections: 3,
    seatsOpen: 5,
    electionPhase: 'primary',
    jurisdictionType: 'county',
    partisanship: 'partisan',
    verified: true,
  });
  assert.equal(resolveSelectionLimit(withMaxSelectionsOnly).source, 'max_selections');
  assert.equal(resolveSelectionLimit(withMaxSelectionsOnly).limit, 3);
});

test('§2 — unverified ballot_instruction/max_selections are treated as absent', () => {
  const unverified = contest({
    ballotInstruction: 'VOTE FOR ONE (1)',
    maxSelections: 5,
    seatsOpen: 3,
    electionPhase: 'primary',
    jurisdictionType: 'county',
    partisanship: 'partisan',
    verified: false,
  });
  const result = resolveSelectionLimit(unverified);
  assert.equal(result.source, 'derived:partisan_seats_open');
  assert.equal(result.limit, 3);
});

test('§2 — missing data resolves to UNKNOWN, never defaults to 1', () => {
  const result = resolveSelectionLimit(contest());
  assert.equal(result.limit, null);
  assert.equal(result.isMultiSelect, false);
  assert.equal(result.instructionText, null);
});

test('§9 — instructionText is only populated when a verified verbatim instruction resolved', () => {
  const derived = contest({
    seatsOpen: 2,
    electionPhase: 'general',
    jurisdictionType: 'county',
    partisanship: 'partisan',
  });
  assert.equal(resolveSelectionLimit(derived).instructionText, null);
});

test('§11 — validateSelectionWrite accepts a count at or under the limit', () => {
  assert.equal(validateSelectionWrite(0, 3).valid, true);
  assert.equal(validateSelectionWrite(2, 3).valid, true);
  assert.equal(validateSelectionWrite(3, 3).valid, true);
});

test('§11 — validateSelectionWrite rejects a count over the limit with a clear, named error', () => {
  const result = validateSelectionWrite(4, 3, 'Weston County Commissioner');
  assert.equal(result.valid, false);
  assert.match(result.error, /Weston County Commissioner/);
  assert.match(result.error, /4/);
  assert.match(result.error, /3/);
});

test('§11 — validateSelectionWrite enforces 1 when limit is null (never defaults implicitly upstream)', () => {
  assert.equal(validateSelectionWrite(1, null).valid, true);
  assert.equal(validateSelectionWrite(2, null).valid, false);
});
