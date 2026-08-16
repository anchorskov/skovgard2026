// Candidates/src/lib/voice-guide/browser-hints.ts
//
// Advisory-only browser/platform hints for troubleshooting copy after
// feature detection or a runtime recognition failure — never used to grant
// or deny functionality. capabilities.ts is the only source of truth for
// what actually works; this module only shapes which sentence to show.
//
// Deliberately small. No general-purpose UA parser — just enough to tell
// Chrome/Edge apart from Safari, iOS, and Firefox for the five guidance
// strings in Candidates/docs/voice_guide.md §6.

export type BrowserHint = 'chrome-edge' | 'safari-macos' | 'ios' | 'firefox' | 'unknown';

export interface HintEnv {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

function resolveNavigator(env?: HintEnv): HintEnv {
  if (env) return env;
  if (typeof navigator !== 'undefined') return navigator as unknown as HintEnv;
  return {};
}

// iPadOS reports platform "MacIntel" like a real Mac since iPadOS 13 — the
// only reliable distinguisher left in the UA/platform surface is touch
// point count, since a real Mac never reports more than 1.
function isIOSDevice(nav: HintEnv): boolean {
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

export function detectBrowserHint(env?: HintEnv): BrowserHint {
  const nav = resolveNavigator(env);
  const ua = nav.userAgent || '';

  if (isIOSDevice(nav)) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  // Safari on macOS: has "Safari" but not "Chrome"/"Chromium"/"Edg" (Chrome,
  // Chromium-based browsers, and Edge all include "Safari" in their UA for
  // legacy-compatibility reasons, so those must be excluded first).
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'safari-macos';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chrome-edge';
  return 'unknown';
}

export function browserGuidanceFor(hint: BrowserHint): string {
  switch (hint) {
    case 'chrome-edge':
      return 'Update Chrome or Microsoft Edge, confirm microphone access, and try again.';
    case 'safari-macos':
      return 'Confirm that Siri and microphone access are enabled. You can also continue with read-aloud Help and standard controls.';
    case 'ios':
      return 'For best results on iPhone or iPad, open the site in Safari and confirm that Siri and microphone access are enabled.';
    case 'firefox':
      return 'Firefox supports read-aloud Help, but spoken commands are unavailable. For spoken commands, use the current version of Chrome or Microsoft Edge.';
    default:
      return 'Spoken commands are unavailable in this browser. Read-aloud Help and standard controls remain available.';
  }
}
