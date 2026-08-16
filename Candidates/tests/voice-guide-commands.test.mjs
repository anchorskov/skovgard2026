// Candidates/tests/voice-guide-commands.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSpokenText,
  matchCommand,
  isKnownPhrase,
  canonicalPhraseFor,
} from '../src/lib/voice-guide/commands.ts';
import { getHelpTopic, topicIdForPath, HELP_TOPICS } from '../src/lib/voice-guide/help-topics.ts';

test('normalizeSpokenText lowercases, strips punctuation, and collapses whitespace', () => {
  assert.equal(normalizeSpokenText('Find My Ballot!'), 'find my ballot');
  assert.equal(normalizeSpokenText('  Browse   the   races?  '), 'browse the races');
  assert.equal(normalizeSpokenText(`"Help"`), 'help');
  assert.equal(normalizeSpokenText(''), '');
  assert.equal(normalizeSpokenText(undefined), '');
});

test('matchCommand matches an exact canonical phrase when allowed', () => {
  assert.equal(matchCommand('find my ballot', ['find-ballot', 'help']), 'find-ballot');
});

test('matchCommand tolerates capitalization and punctuation variation', () => {
  assert.equal(matchCommand('Find My Ballot!', ['find-ballot']), 'find-ballot');
  assert.equal(matchCommand('  BROWSE THE RACES  ', ['browse-races']), 'browse-races');
});

test('"my choice" and its aliases match the my-choice command', () => {
  assert.equal(matchCommand('my choice', ['my-choice']), 'my-choice');
  assert.equal(matchCommand('Select this candidate', ['my-choice']), 'my-choice');
  assert.equal(matchCommand('choose this candidate', ['my-choice']), 'my-choice');
});

test('"next race" and its aliases match the next-race command', () => {
  assert.equal(matchCommand('next race', ['next-race']), 'next-race');
  assert.equal(matchCommand('Next undecided race', ['next-race']), 'next-race');
  assert.equal(matchCommand('go to the next race', ['next-race']), 'next-race');
});

test('my-choice and next-race are not matched when absent from the allowed list (e.g. on a candidate-profile page)', () => {
  assert.equal(matchCommand('my choice', ['read-page', 'next-item', 'previous-item']), null);
  assert.equal(matchCommand('next race', ['read-page', 'next-item', 'previous-item']), null);
});

test('"what can i say" is an alias for help, not a separate command', () => {
  assert.equal(matchCommand('what can i say', ['help']), 'help');
  assert.equal(matchCommand('What can I say?', ['help']), 'help');
});

test('matchCommand returns null for a known phrase not in the allowed list for this stage', () => {
  // "confirm" is a real command, but not valid at the root menu stage.
  assert.equal(matchCommand('confirm', ['find-ballot', 'browse-races', 'help']), null);
});

test('matchCommand returns null for unrecognized speech — never a guess', () => {
  assert.equal(matchCommand('take me to the moon', ['find-ballot', 'help']), null);
  assert.equal(matchCommand('', ['find-ballot']), null);
});

test('isKnownPhrase distinguishes "not understood at all" from "unavailable here"', () => {
  assert.equal(isKnownPhrase('confirm'), true); // known command, just not allowed everywhere
  assert.equal(isKnownPhrase('take me to the moon'), false); // not a command at all
});

test('canonicalPhraseFor returns the first/display phrase for a command id', () => {
  assert.equal(canonicalPhraseFor('find-ballot'), 'find my ballot');
  assert.equal(canonicalPhraseFor('help'), 'help');
});

const ALL_COMMAND_IDS = ['find-ballot', 'browse-races', 'candidate-guide', 'help', 'repeat', 'back', 'stop',
  'use-location', 'enter-address', 'confirm', 'read-page', 'next-item', 'previous-item',
  'my-choice', 'next-race', 'begin-review', 'review-choices', 'jump-to-race', 'save-choices',
  'pause', 'resume', 'slower'];

test('every command id\'s canonical phrase matches itself', () => {
  for (const id of ALL_COMMAND_IDS) {
    const phrase = canonicalPhraseFor(id);
    assert.equal(matchCommand(phrase, [id]), id, `canonical phrase for ${id} should match itself`);
  }
});

test('no command phrase collides across two different command ids', () => {
  const seenBy = new Map();
  for (const id of ALL_COMMAND_IDS) {
    // Probe every id's canonical phrase against every other id's allowed
    // list — a collision would show up as a false match here.
    for (const otherId of ALL_COMMAND_IDS) {
      if (otherId === id) continue;
      const phrase = canonicalPhraseFor(id);
      const result = matchCommand(phrase, [otherId]);
      assert.equal(result, null, `"${phrase}" (canonical for ${id}) unexpectedly matched ${otherId}`);
    }
    seenBy.set(id, canonicalPhraseFor(id));
  }
  assert.equal(seenBy.size, ALL_COMMAND_IDS.length);
});

test('topicIdForPath maps known routes to their contextual topic', () => {
  assert.equal(topicIdForPath('/'), 'home');
  assert.equal(topicIdForPath(''), 'home');
  assert.equal(topicIdForPath('/races'), 'races');
  assert.equal(topicIdForPath('/race/42'), 'race-detail');
  assert.equal(topicIdForPath('/candidate/some-slug'), 'candidate-guide');
  assert.equal(topicIdForPath('/guide'), 'general');
  assert.equal(topicIdForPath('/ballot-recovery/'), 'general');
});

test('getHelpTopic falls back to "general" for an unknown or missing id', () => {
  assert.equal(getHelpTopic('not-a-real-topic').id, 'general');
  assert.equal(getHelpTopic(null).id, 'general');
  assert.equal(getHelpTopic(undefined).id, 'general');
});

test('every help topic has non-empty visible instructions and a spoken form shorter than the visible one', () => {
  for (const topic of Object.values(HELP_TOPICS)) {
    assert.ok(topic.visibleInstructions.length > 0, `${topic.id} should have visible instructions`);
    assert.ok(topic.spokenInstructions.length > 0, `${topic.id} should have spoken instructions`);
    const visibleLength = topic.visibleInstructions.join(' ').length;
    const spokenLength = topic.spokenInstructions.join(' ').length;
    assert.ok(spokenLength <= visibleLength, `${topic.id}'s spoken help should not be longer than its visible help`);
  }
});
