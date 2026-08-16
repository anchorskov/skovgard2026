// Candidates/src/lib/voice-guide/capabilities.ts
//
// Passive browser-capability detection for the Voice Guide. Feature
// detection only — never a browser-name check. Nothing here touches the
// microphone: detectCapabilities() only reads whether APIs exist and
// whether the page is a secure context. Calling it never prompts for
// permission. See Candidates/docs/voice_guide.md.

export type VoiceCapabilityMode = 'full' | 'read-only' | 'visual-only';

export type CapabilityReason =
  | null
  | 'insecure-context'      // recognition API exists but blocked by a non-secure context
  | 'recognition-unsupported' // recognition API does not exist at all
  | 'synthesis-unsupported';  // speechSynthesis does not exist at all

export interface VoiceCapabilities {
  mode: VoiceCapabilityMode;
  secureContext: boolean;
  canSpeak: boolean;
  canListen: boolean;
  /**
   * Optional-enhancement signal only — see detectOnDeviceRecognition().
   * True only means the *API shape* exists (a recognition constructor
   * exposes `.available`) — it is not evidence that a language pack is
   * installed, and it is not evidence that the current session is actually
   * running local processing. See localLanguageStatus()/usingLocalRecognition()
   * in docs/voice_industry_standard.md if/when that distinction is needed;
   * neither is implemented here yet. Expect `false` on the overwhelming
   * majority of real browsers today. Never treat this as required for
   * `canListen`.
   */
  supportsLocalRecognitionApi: boolean;
  reason: CapabilityReason;
}

/**
 * Minimal shape of the ambient globals this module reads. Accepting an
 * injectable `env` (defaulting to `globalThis`) is what makes this testable
 * under plain `node --test` — there is no `window` in Node, and the project
 * deliberately doesn't add a DOM-shimming test dependency for this feature.
 */
export interface CapabilityEnv {
  isSecureContext?: boolean;
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

function resolveEnv(env?: CapabilityEnv): CapabilityEnv {
  if (env) return env;
  if (typeof globalThis !== 'undefined') return globalThis as unknown as CapabilityEnv;
  return {};
}

/**
 * Never call this in response to anything other than passive inspection —
 * it does not call recognition.start() or getUserMedia, so it cannot itself
 * trigger a permission prompt. Safe to call at page load and again every
 * time "Start Voice Guide" is activated (browser settings can change
 * between the two).
 */
export function detectCapabilities(env?: CapabilityEnv): VoiceCapabilities {
  const g = resolveEnv(env);
  const secureContext = Boolean(g.isSecureContext);
  const canSpeak = Boolean(g.speechSynthesis) && Boolean(g.SpeechSynthesisUtterance);
  const recognitionCtor = g.SpeechRecognition || g.webkitSpeechRecognition || null;
  const canListen = secureContext && Boolean(recognitionCtor);
  const supportsLocalRecognitionApi = detectOnDeviceRecognition(g, recognitionCtor);

  let mode: VoiceCapabilityMode;
  let reason: CapabilityReason = null;

  if (canSpeak && canListen) {
    mode = 'full';
  } else if (canSpeak && !canListen) {
    mode = 'read-only';
    if (recognitionCtor && !secureContext) reason = 'insecure-context';
    else if (!recognitionCtor) reason = 'recognition-unsupported';
  } else {
    mode = 'visual-only';
    reason = 'synthesis-unsupported';
  }

  return { mode, secureContext, canSpeak, canListen, supportsLocalRecognitionApi, reason };
}

/**
 * Optional-enhancement check for on-device speech recognition (§3). This is
 * deliberately conservative: as of this writing there is no standardized,
 * cross-browser way to positively confirm on-device processing through
 * public Web Speech API surface, so this returns false unless a browser
 * explicitly exposes a verifiable signal. It must never be required for
 * `canListen`, never trigger a language-pack download, and never claim
 * on-device processing that hasn't been positively confirmed.
 */
function detectOnDeviceRecognition(env: CapabilityEnv, recognitionCtor: unknown): boolean {
  if (!recognitionCtor) return false;
  const ctor = recognitionCtor as { available?: unknown };
  // Chrome's experimental on-device availability surface, when present, is
  // the only thing treated as a positive signal. Its absence is the normal,
  // expected case — not an error.
  return typeof ctor.available === 'function';
}

// The single choke point for "never expose the recognition constructor in
// serialized state" — VoiceCapabilities never held one to begin with, so
// this is an identity function today, but any future field added here that
// isn't safe to log/display has to go through this function to leave the module.
export function toSerializableCapabilities(caps: VoiceCapabilities): VoiceCapabilities {
  const { mode, secureContext, canSpeak, canListen, supportsLocalRecognitionApi, reason } = caps;
  return { mode, secureContext, canSpeak, canListen, supportsLocalRecognitionApi, reason };
}

// ── Runtime recognition error mapping (§5) ──────────────────────────────

export type RecognitionErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'audio-capture'
  | 'network'
  | 'language-not-supported'
  | 'no-speech'
  | 'timeout'
  | 'aborted'
  | 'unknown';

export interface RecognitionErrorInfo {
  code: RecognitionErrorCode;
  /** Plain-language guidance to speak/display. Empty for 'aborted' — that case is handled silently by design. */
  message: string;
  /**
   * Whether this error indicates a persistent-for-now problem (permission,
   * microphone, language, network, or service) that should downgrade the
   * session into temporarily-unavailable mode until a later attempt
   * succeeds. False for one-off, unremarkable outcomes (no-speech, aborted).
   */
  temporary: boolean;
  /** False only for 'aborted' — return to the prior stable state quietly, no message shown. */
  alarming: boolean;
}

const KNOWN_ERROR_CODES: RecognitionErrorCode[] = [
  'not-allowed', 'service-not-allowed', 'audio-capture', 'network',
  'language-not-supported', 'no-speech', 'timeout', 'aborted',
];

export function mapRecognitionError(rawCode: string | null | undefined): RecognitionErrorInfo {
  const code = (KNOWN_ERROR_CODES as string[]).includes(rawCode || '')
    ? (rawCode as RecognitionErrorCode)
    : 'unknown';

  switch (code) {
    case 'not-allowed':
      return {
        code,
        message: 'Microphone access was blocked. Allow microphone access in your browser settings, or continue with read-aloud Help and standard controls.',
        temporary: true,
        alarming: true,
      };
    case 'service-not-allowed':
      return {
        code,
        message: 'The speech-recognition service is unavailable. Check the connection and try again, or continue without spoken commands.',
        temporary: true,
        alarming: true,
      };
    case 'audio-capture':
      return {
        code,
        message: 'A working microphone was not found. Check the microphone connection, or continue with read-aloud Help and standard controls.',
        temporary: true,
        alarming: true,
      };
    case 'network':
      return {
        code,
        message: 'The speech-recognition service is unavailable. Check the connection and try again, or continue without spoken commands.',
        temporary: true,
        alarming: true,
      };
    case 'language-not-supported':
      return {
        code,
        message: 'The speech-recognition service is unavailable. Check the connection and try again, or continue without spoken commands.',
        temporary: true,
        alarming: true,
      };
    case 'no-speech':
      return {
        code,
        // Does not tell the user to "Select Speak Command" — this message
        // reaches the user through promptAndListen() (see
        // VoiceGuide.astro's triggerListen()), which already appends its
        // own "Select Continue when you are ready" cue immediately after.
        // Naming a different button here previously produced two
        // contradictory instructions back to back. See docs/known_issues.md.
        message: 'No speech was detected. Try again, or say Help once listening begins.',
        temporary: false,
        alarming: true,
      };
    case 'timeout':
      return {
        code,
        message: 'The Voice Guide did not hear a response in time. Select Continue to try again, or use the buttons below.',
        temporary: false,
        alarming: true,
      };
    case 'aborted':
      return { code, message: '', temporary: false, alarming: false };
    default:
      return {
        code: 'unknown',
        message: 'Something went wrong with spoken commands. Continue with read-aloud Help and standard controls, or try again.',
        temporary: true,
        alarming: true,
      };
  }
}
