// Candidates/tests/voice-guide-voice-session.test.mjs
//
// Regression coverage for the duplicate-continueBtn-listener bug (see
// docs/known_issues.md) — createVoiceSession() must be the *only* place
// that ever wires continueBtn's click, since the caller (VoiceGuide.astro/
// HelpPanel.astro) is expected to rely entirely on the onContinue callback
// passed to promptAndListen() rather than adding its own listener on the
// same element. A minimal hand-built DOM stub is used rather than a real
// browser/jsdom — consistent with the project's existing "no DOM-shimming
// dependency" testing convention (see voice-guide-capabilities.test.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceSession } from '../src/lib/voice-guide/voice-session.ts';

function makeFakeMessageEl() {
  return { textContent: '' };
}

function makeFakeButton() {
  const listeners = {};
  return {
    hidden: true,
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners[type];
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    _fire(type) {
      (listeners[type] || []).slice().forEach((fn) => fn());
    },
    _listenerCount(type) {
      return (listeners[type] || []).length;
    },
  };
}

test('createVoiceSession registers exactly one click listener on continueBtn', () => {
  const continueBtn = makeFakeButton();
  createVoiceSession({ messageEl: makeFakeMessageEl(), continueBtn });
  assert.equal(continueBtn._listenerCount('click'), 1,
    'continueBtn must have exactly one click listener — a caller adding a second one is the exact bug this guards against');
});

test('a single continueBtn click invokes the pending continuation exactly once', () => {
  const continueBtn = makeFakeButton();
  const session = createVoiceSession({ messageEl: makeFakeMessageEl(), continueBtn });
  // No synthesis/recognition available in this env — promptAndListen()
  // falls back to a plain, unlistened speak() in that case, so arm the
  // continuation directly the same way promptAndListen() would once
  // speech ends, rather than depending on real SpeechSynthesis here.
  let calls = 0;
  session.setCapabilities({ canSpeak: false, canListen: true, synth: null, RecognitionCtor: null });
  session.promptAndListen('test prompt', () => { calls += 1; });
  continueBtn._fire('click');
  assert.equal(calls, 1, 'the continuation should fire exactly once per click, not twice');
  continueBtn._fire('click');
  assert.equal(calls, 1, 'a second click with no new pending action must not re-fire the old one');
});

test('multiple createVoiceSession instances on different buttons stay independent', () => {
  const btnA = makeFakeButton();
  const btnB = makeFakeButton();
  const sessionA = createVoiceSession({ messageEl: makeFakeMessageEl(), continueBtn: btnA });
  createVoiceSession({ messageEl: makeFakeMessageEl(), continueBtn: btnB });
  let calledA = false;
  sessionA.setCapabilities({ canSpeak: false, canListen: true, synth: null, RecognitionCtor: null });
  sessionA.promptAndListen('a', () => { calledA = true; });
  btnB._fire('click'); // firing the *other* button's click must not trigger A's pending action
  assert.equal(calledA, false);
  assert.equal(btnA._listenerCount('click'), 1);
  assert.equal(btnB._listenerCount('click'), 1);
});
