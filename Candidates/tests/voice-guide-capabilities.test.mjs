// Candidates/tests/voice-guide-capabilities.test.mjs
//
// Pure-logic tests for capability detection, mode resolution, and
// runtime-error mapping — no real browser or speech-recognition service is
// contacted. detectCapabilities()/detectBrowserHint() accept an injectable
// env object specifically so this works under plain `node --test`, which
// has no `window`/`navigator`. DOM-lifecycle behaviors (closing the panel
// mid-recognition, a visibility change during recognition, an actual
// Continue click) aren't unit-testable this way without a new
// DOM-shimming dependency — those are covered by the manual browser matrix
// in Candidates/docs/voice_guide.md instead.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectCapabilities,
  mapRecognitionError,
  toSerializableCapabilities,
} from '../src/lib/voice-guide/capabilities.ts';
import { detectBrowserHint, browserGuidanceFor } from '../src/lib/voice-guide/browser-hints.ts';
import { HELP_TOPICS, getHelpTopic } from '../src/lib/voice-guide/help-topics.ts';

function FakeSpeechRecognition() {}
function FakeSpeechSynthesisUtterance() {}

// §10 capability matrix.
const matrix = [
  { canSpeak: true, canListen: true, secureContext: true, expected: 'full' },
  { canSpeak: true, canListen: true, secureContext: false, expected: 'read-only' },
  { canSpeak: true, canListen: false, secureContext: true, expected: 'read-only' },
  { canSpeak: false, canListen: true, secureContext: true, expected: 'visual-only' },
  { canSpeak: false, canListen: false, secureContext: true, expected: 'visual-only' },
];

for (const row of matrix) {
  test(`capability matrix: speak=${row.canSpeak} listen=${row.canListen} secure=${row.secureContext} -> ${row.expected}`, () => {
    const env = {
      isSecureContext: row.secureContext,
      speechSynthesis: row.canSpeak ? {} : undefined,
      SpeechSynthesisUtterance: row.canSpeak ? FakeSpeechSynthesisUtterance : undefined,
      // The table's "speech recognition" column means "the API exists" —
      // detectCapabilities is what ANDs that with secureContext internally
      // (§2's formula), so the row-2 insecure-context case still needs the
      // constructor present here to actually exercise that gate.
      SpeechRecognition: row.canListen ? FakeSpeechRecognition : undefined,
    };
    const caps = detectCapabilities(env);
    assert.equal(caps.mode, row.expected);
  });
}

test('canListen is false when recognition exists but the context is insecure, and reason reflects that', () => {
  const caps = detectCapabilities({
    isSecureContext: false,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  });
  assert.equal(caps.canListen, false);
  assert.equal(caps.mode, 'read-only');
  assert.equal(caps.reason, 'insecure-context');
});

test('recognition-unsupported reason is set when no recognition constructor exists at all', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
  });
  assert.equal(caps.mode, 'read-only');
  assert.equal(caps.reason, 'recognition-unsupported');
});

test('synthesis-unsupported reason is set for visual-only mode', () => {
  const caps = detectCapabilities({ isSecureContext: true, SpeechRecognition: FakeSpeechRecognition });
  assert.equal(caps.mode, 'visual-only');
  assert.equal(caps.reason, 'synthesis-unsupported');
});

test('prefixed webkitSpeechRecognition is recognized the same as standard SpeechRecognition', () => {
  const capsStandard = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  });
  const capsPrefixed = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    webkitSpeechRecognition: FakeSpeechRecognition,
  });
  assert.equal(capsStandard.mode, 'full');
  assert.equal(capsPrefixed.mode, 'full');
});

test('supportsLocalRecognitionApi is false by default — no on-device signal available', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  });
  assert.equal(caps.supportsLocalRecognitionApi, false);
});

test('supportsLocalRecognitionApi is true only when the recognition constructor exposes a verifiable on-device signal — this reflects API-shape existence only, not language-pack availability or an active local session (see docs/voice_industry_standard.md)', () => {
  function LocalCapableRecognition() {}
  LocalCapableRecognition.available = function available() { return true; };
  const caps = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: LocalCapableRecognition,
  });
  assert.equal(caps.supportsLocalRecognitionApi, true);
});

test('detectCapabilities never touches microphone-adjacent APIs — passive only', () => {
  // If detectCapabilities ever called getUserMedia or recognition.start(),
  // an env object without those methods would throw. It shouldn't.
  assert.doesNotThrow(() => detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  }));
});

test('toSerializableCapabilities never carries a constructor reference', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  });
  const serialized = toSerializableCapabilities(caps);
  assert.equal('recognitionConstructor' in serialized, false);
  assert.doesNotThrow(() => JSON.stringify(serialized));
});

test('toSerializableCapabilities preserves supportsLocalRecognitionApi', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    speechSynthesis: {},
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    SpeechRecognition: FakeSpeechRecognition,
  });
  const serialized = toSerializableCapabilities(caps);
  assert.equal(serialized.supportsLocalRecognitionApi, false);
});

// ── Runtime recognition error mapping (§5) ───────────────────────────────

test('mapRecognitionError covers every required error code with non-empty guidance (except aborted)', () => {
  const codes = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'no-speech', 'timeout'];
  for (const code of codes) {
    const info = mapRecognitionError(code);
    assert.equal(info.code, code);
    assert.ok(info.message.length > 0, `${code} should have guidance text`);
    assert.equal(info.alarming, true);
  }
});

test('timeout is not treated as a persistent problem — same retry-friendly bucket as no-speech', () => {
  const info = mapRecognitionError('timeout');
  assert.equal(info.temporary, false);
  assert.equal(info.alarming, true);
});

test('aborted returns quietly — no alarming message, matching "return to previous stable state"', () => {
  const info = mapRecognitionError('aborted');
  assert.equal(info.alarming, false);
  assert.equal(info.message, '');
});

test('an unrecognized error code falls back to "unknown" with guidance, not a thrown error or blank message', () => {
  const info = mapRecognitionError('some-future-error-code');
  assert.equal(info.code, 'unknown');
  assert.ok(info.message.length > 0);
  assert.equal(info.alarming, true);
});

test('permission/microphone/network/language/service errors are marked temporary (downgrade to temporarily-unavailable); no-speech and aborted are not', () => {
  for (const code of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported']) {
    assert.equal(mapRecognitionError(code).temporary, true, `${code} should be temporary`);
  }
  assert.equal(mapRecognitionError('no-speech').temporary, false);
  assert.equal(mapRecognitionError('timeout').temporary, false);
  assert.equal(mapRecognitionError('aborted').temporary, false);
});

test('not-allowed and no-speech never recommend switching browsers within mapRecognitionError itself (browser tips are a separate, one-shot layer)', () => {
  assert.doesNotMatch(mapRecognitionError('not-allowed').message, /chrome|edge|safari|firefox/i);
  assert.doesNotMatch(mapRecognitionError('no-speech').message, /chrome|edge|safari|firefox/i);
});

// ── Browser hints (§6) — advisory only, never gates functionality ───────

test('detectBrowserHint identifies Chrome/Edge, Safari on macOS, iOS, and Firefox', () => {
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const edgeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0';
  const safariMacUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const iphoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0';

  assert.equal(detectBrowserHint({ userAgent: chromeUA }), 'chrome-edge');
  assert.equal(detectBrowserHint({ userAgent: edgeUA }), 'chrome-edge');
  assert.equal(detectBrowserHint({ userAgent: safariMacUA }), 'safari-macos');
  assert.equal(detectBrowserHint({ userAgent: iphoneUA }), 'ios');
  assert.equal(detectBrowserHint({ userAgent: firefoxUA }), 'firefox');
});

test('detectBrowserHint identifies iPadOS reporting as MacIntel via touch points, not UA alone', () => {
  const ipadOSUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const realMac = detectBrowserHint({ userAgent: ipadOSUA, platform: 'MacIntel', maxTouchPoints: 0 });
  const ipad = detectBrowserHint({ userAgent: ipadOSUA, platform: 'MacIntel', maxTouchPoints: 5 });
  assert.equal(realMac, 'safari-macos');
  assert.equal(ipad, 'ios');
});

test('an unrecognized user agent falls back to "unknown", not a thrown error', () => {
  assert.equal(detectBrowserHint({ userAgent: 'SomeObscureBrowser/1.0' }), 'unknown');
});

test('browserGuidanceFor never claims Chrome-on-iOS is equivalent to desktop Chrome', () => {
  const iosGuidance = browserGuidanceFor('ios');
  assert.doesNotMatch(iosGuidance, /desktop chrome|same as chrome/i);
  assert.match(iosGuidance, /safari/i);
});

test('browserGuidanceFor returns non-empty advisory text for every hint value, including unknown', () => {
  for (const hint of ['chrome-edge', 'safari-macos', 'ios', 'firefox', 'unknown']) {
    assert.ok(browserGuidanceFor(hint).length > 0);
  }
});

// ── Help-topic integration (§7) ──────────────────────────────────────────

test('"voice-assist-compatibility" topic exists and covers the required content areas', () => {
  const topic = getHelpTopic('voice-assist-compatibility');
  const visible = topic.visibleInstructions.join(' ').toLowerCase();
  assert.match(visible, /full|read-only|visual-only/);
  assert.match(visible, /chrome|edge/);
  assert.match(visible, /microphone/);
  assert.match(visible, /safari/);
  assert.match(visible, /siri/);
  assert.match(visible, /firefox/);
  assert.match(visible, /does not intentionally store/);
});

test('every topic in the registry (including the new one) keeps spoken help no longer than visible help', () => {
  for (const topic of Object.values(HELP_TOPICS)) {
    const visibleLength = topic.visibleInstructions.join(' ').length;
    const spokenLength = topic.spokenInstructions.join(' ').length;
    assert.ok(spokenLength <= visibleLength, `${topic.id} spoken help should not exceed visible help`);
  }
});
