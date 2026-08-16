// Candidates/src/lib/voice-guide/voice-session.ts
//
// Shared "speak a prompt, wait for an explicit Continue, listen once"
// engine — used by both VoiceGuide.astro (the main panel) and
// HelpPanel.astro (the help dialog) so the two carry exactly one
// maintained copy of this machinery instead of two independently drifting
// ones. See docs/voice_guide.md and docs/voice_industry_standard.md.
//
// Deliberately DOM-light: the caller owns capability detection (which
// varies slightly per surface — VoiceGuide shows a full/read-only/
// visual-only mode note, HelpPanel doesn't need to) and owns command
// matching (each surface has its own small allowed vocabulary). This
// module owns only the parts that are identical either way: how a message
// is spoken, how the microphone is opened for one utterance, and how the
// next listen is re-armed without requiring the user to hunt for a button
// or (per docs/voice_industry_standard.md §5) relying on an arbitrary
// keypress.

export interface VoiceSessionDom {
  messageEl: HTMLElement;
  continueBtn: HTMLButtonElement;
}

export interface ListenResult {
  ok: boolean;
  reason?: string;
  transcripts: string[];
}

export interface VoiceSessionCapabilities {
  canSpeak: boolean;
  canListen: boolean;
  synth: SpeechSynthesis | null;
  RecognitionCtor: (new () => any) | null;
}

const CONTINUE_CUE = ' Select Continue when you are ready.';
// This is a failure-recovery ceiling (browser never fires any event at
// all — see docs/voice_industry_standard.md §5), not the thing normally
// giving people time to think — that's `continuous = true` on the
// recognizer itself, below. Generous on purpose: a real answer, especially
// after a long prompt, can take a while to begin.
const LISTEN_WATCHDOG_MS = 20000;

export function createVoiceSession({ messageEl, continueBtn }: VoiceSessionDom) {
  let canSpeak = false;
  let canListen = false;
  let synth: SpeechSynthesis | null = null;
  let RecognitionCtor: (new () => any) | null = null;
  let rate = 1;
  let lastSpokenText = '';
  let activeRecognition: any = null;
  let pendingContinueAction: (() => void) | null = null;

  function setCapabilities(caps: VoiceSessionCapabilities) {
    canSpeak = caps.canSpeak;
    canListen = caps.canListen;
    synth = caps.synth;
    RecognitionCtor = caps.RecognitionCtor;
  }

  function setRate(next: number) {
    rate = next;
  }

  function getRate() {
    return rate;
  }

  function getLastSpokenText() {
    return lastSpokenText;
  }

  // Strips the continue cue back off for a caller's own "Repeat"/"Slower"
  // handling, so re-issuing it through promptAndListen() doesn't compound
  // the cue or read it back as literal text.
  function bareLastSpokenText(fallback: string) {
    const text = lastSpokenText || '';
    const stripped = text.endsWith(CONTINUE_CUE) ? text.slice(0, -CONTINUE_CUE.length) : text;
    return stripped || fallback;
  }

  // `onEnd`, when given, fires once the utterance finishes naturally (or
  // immediately, if this session can't speak at all) — or if synthesis
  // itself errors out, so a failure here can never strand a caller's
  // Pause/Repeat/Continue on a message that will never "finish" (per
  // docs/voice_industry_standard.md §8).
  function speak(text: string, onEnd?: () => void) {
    lastSpokenText = text;
    messageEl.textContent = text;
    if (!canSpeak || !text || !synth) {
      if (onEnd) onEnd();
      return;
    }
    synth.cancel(); // a new message always supersedes anything queued
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    synth.speak(utterance);
  }

  function cancelSpeech() {
    if (canSpeak && synth) synth.cancel();
  }

  function hideContinueButton() {
    pendingContinueAction = null;
    continueBtn.hidden = true;
  }

  function showContinueButton(onContinue: () => void) {
    pendingContinueAction = onContinue;
    continueBtn.hidden = false;
    continueBtn.focus();
  }

  continueBtn.addEventListener('click', () => {
    const action = pendingContinueAction;
    hideContinueButton();
    if (action) action();
  });

  // Wraps speak() for any prompt that expects a spoken reply next. Appends
  // the spoken cue and reveals+focuses the Continue button once the
  // message finishes — a real, visible, auto-focused button rather than a
  // document-level "any key" listener (see docs/voice_industry_standard.md
  // §5: an arbitrary keypress must not start the microphone). A plain
  // speak() — no cue, no button — when this session can't listen at all.
  function promptAndListen(text: string, onContinue: () => void) {
    hideContinueButton();
    if (!canListen) { speak(text); return; }
    speak(`${text}${CONTINUE_CUE}`, () => {
      showContinueButton(onContinue);
    });
  }

  function abortActiveRecognition() {
    if (!activeRecognition) return;
    try { activeRecognition.abort(); } catch { /* already stopped */ }
  }

  // ── Speech recognition — one short session per call ──────────────────
  // Never left continuously active: each call creates a fresh recognizer,
  // listens for a single utterance, and stops. The active instance is
  // retained (abortActiveRecognition()) so a caller can cancel it from
  // outside this promise — Stop, dialog close, visibilitychange, pagehide —
  // instead of only ever stopping itself. A watchdog forces recovery if
  // the browser never fires onresult/onerror/onend at all.
  function listenOnce(): Promise<ListenResult> {
    return new Promise((resolve) => {
      if (!canListen || !RecognitionCtor) {
        resolve({ ok: false, reason: 'unsupported', transcripts: [] });
        return;
      }
      let recognition: any;
      try {
        recognition = new RecognitionCtor();
      } catch {
        resolve({ ok: false, reason: 'unsupported', transcripts: [] });
        return;
      }
      recognition.lang = 'en-US';
      // REVERTED 2026-08-16 (see docs/known_issues.md): `continuous = true`
      // was tried here as a workaround for the browser's own
      // silence-before-speech-begins timeout, on the theory that continuous
      // mode is more patient about leading silence. In practice it made
      // things categorically worse — no waiting at all, on every prompt,
      // not just long ones — so whatever this browser's real continuous-mode
      // behavior is, it is not "more patient." Back to the original,
      // known-working `false`. If this needs revisiting, verify in an
      // actual browser first; don't reason from the spec alone, since Web
      // Speech API behavior here is undocumented and evidently
      // implementation-specific in ways that went the opposite direction
      // from what seemed reasonable.
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;

      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const finish = (result: ListenResult) => {
        if (settled) return; // guards a late event arriving after we've already resolved/aborted
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        if (activeRecognition === recognition) activeRecognition = null;
        // continuous mode doesn't end itself after one result the way a
        // non-continuous session does — stop it explicitly so a single
        // answer is still exactly one bounded session, not a session that
        // lingers open for a second thing the user didn't intend to say.
        try { recognition.stop(); } catch { /* already stopped */ }
        resolve(result);
      };

      recognition.onresult = (event: any) => {
        const result = event.results && event.results[event.results.length - 1];
        if (!result) { finish({ ok: false, reason: 'no-speech', transcripts: [] }); return; }
        const transcripts = Array.from(result as ArrayLike<any>).map((alt) => alt.transcript).filter(Boolean);
        finish({ ok: true, transcripts });
      };
      // Distinct from onerror per the Web Speech API spec — recognition
      // completed normally but found nothing usable, not a failure.
      recognition.onnomatch = () => finish({ ok: false, reason: 'nomatch', transcripts: [] });
      recognition.onerror = (event: any) => {
        const reason = (event && event.error) || 'unknown';
        finish({ ok: false, reason, transcripts: [] });
      };
      recognition.onend = () => finish({ ok: false, reason: 'no-speech', transcripts: [] });

      try {
        recognition.start();
        activeRecognition = recognition;
        watchdog = setTimeout(() => {
          abortActiveRecognition();
          finish({ ok: false, reason: 'timeout', transcripts: [] });
        }, LISTEN_WATCHDOG_MS);
      } catch {
        finish({ ok: false, reason: 'unsupported', transcripts: [] });
      }
    });
  }

  return {
    setCapabilities,
    setRate,
    getRate,
    getLastSpokenText,
    bareLastSpokenText,
    speak,
    cancelSpeech,
    hideContinueButton,
    promptAndListen,
    listenOnce,
    abortActiveRecognition,
  };
}

export type VoiceSession = ReturnType<typeof createVoiceSession>;
