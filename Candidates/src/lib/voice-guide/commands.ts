// Candidates/src/lib/voice-guide/commands.ts
//
// Deterministic, allowlist-only spoken-command matching for the Voice
// Guide. No AI/NLU interpretation — a normalized transcript either equals
// one of a fixed set of approved phrases or it doesn't. See
// Candidates/docs/voice_guide.md and Candidates/docs/multi_selection.md's
// sibling spec for why: predictable failure modes matter more than
// flexible matching for a voting-adjacent tool.

export type VoiceCommandId =
  | 'find-ballot'
  | 'browse-races'
  | 'candidate-guide'
  | 'help'
  | 'repeat'
  | 'back'
  | 'stop'
  | 'use-location'
  | 'enter-address'
  | 'confirm'
  | 'read-page'
  | 'next-item'
  | 'previous-item'
  | 'my-choice'
  | 'next-race'
  | 'begin-review'
  | 'review-choices'
  | 'jump-to-race'
  | 'save-choices'
  | 'pause'
  | 'resume'
  | 'slower';

interface CommandDefinition {
  id: VoiceCommandId;
  /** The canonical phrase is phrases[0] — used for display/spoken prompts. */
  phrases: string[];
}

// "What can I say" is explicitly an alias for "help" per spec, not a
// separate command — it lives in the `help` phrase list rather than
// getting its own id.
const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { id: 'find-ballot', phrases: ['find my ballot', 'find ballot', 'my ballot', 'find my ballots'] },
  { id: 'browse-races', phrases: ['browse races', 'browse the races', 'races', 'see all races'] },
  { id: 'candidate-guide', phrases: ['candidate guide', 'the candidate guide', 'guide'] },
  { id: 'help', phrases: ['help', 'what can i say'] },
  { id: 'repeat', phrases: ['repeat', 'say that again', 'repeat that', 'repeat please'] },
  { id: 'back', phrases: ['back', 'go back'] },
  { id: 'stop', phrases: ['stop voice guide', 'stop the voice guide', 'stop'] },
  { id: 'use-location', phrases: ['use my location', 'use location', 'my location'] },
  { id: 'enter-address', phrases: ['enter address', 'enter my address', 'type my address', 'type address'] },
  { id: 'confirm', phrases: ['confirm', 'confirm address', 'yes confirm', 'that is correct'] },
  { id: 'read-page', phrases: ['read this page', 'read page', 'read the page'] },
  { id: 'next-item', phrases: ['next item', 'next', 'next candidate'] },
  { id: 'previous-item', phrases: ['previous item', 'previous', 'previous candidate', 'go back one'] },
  { id: 'my-choice', phrases: ['my choice', 'select this candidate', 'choose this candidate'] },
  { id: 'next-race', phrases: ['next race', 'next undecided race', 'go to the next race'] },
  { id: 'begin-review', phrases: ['begin candidate review', 'begin review', 'start candidate review', 'review candidates'] },
  // "View my choices" is deliberately an alias here, not a separate id —
  // re-hearing the list mid-review and starting the review from the menu
  // are the same underlying action (see beginReview() in VoiceGuide.astro).
  { id: 'review-choices', phrases: ['review my choices', 'view my choices', 'view choices', 'my choices', 'hear my choices'] },
  { id: 'jump-to-race', phrases: ['jump to race', 'jump to a race', 'change a race', 'change my choice', 'change my choices', 'edit my choices'] },
  // Canonical phrase (phrases[0]) is now the "email a recovery link" framing
  // rather than "save," since choices are already saved on-device the
  // instant My choice is confirmed — this command only ever emails a
  // recovery link for another device. "Save my choices" stays as an alias
  // since it's still a natural, common thing to say. See
  // docs/known_issues.md.
  { id: 'save-choices', phrases: ['email my recovery link', 'email me a recovery link', 'sync my choices', 'save my choices', 'save choices', 'send my choices', 'email my choices'] },
  { id: 'pause', phrases: ['pause'] },
  { id: 'resume', phrases: ['resume', 'continue', 'unpause'] },
  { id: 'slower', phrases: ['slower', 'speak slower', 'talk slower', 'slow down'] },
];

const PHRASE_TO_ID: Map<string, VoiceCommandId> = new Map();
const ID_TO_CANONICAL_PHRASE: Map<VoiceCommandId, string> = new Map();
for (const def of COMMAND_DEFINITIONS) {
  ID_TO_CANONICAL_PHRASE.set(def.id, def.phrases[0]);
  for (const phrase of def.phrases) {
    PHRASE_TO_ID.set(phrase, def.id);
  }
}

/**
 * Lowercases, strips punctuation, and collapses whitespace so that minor
 * capitalization/punctuation differences from speech recognition (or typed
 * input in the editable recognition-result field) don't prevent a match.
 * This is normalization only — it never guesses at intent.
 */
export function normalizeSpokenText(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,!?;:'"“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches normalized text against the approved command list, restricted to
 * `allowed` (the commands valid in the current Voice Guide stage/page).
 * Returns null on no match — callers must treat that as "did not
 * understand," never as a fallback action.
 */
export function matchCommand(raw: string, allowed: VoiceCommandId[]): VoiceCommandId | null {
  const normalized = normalizeSpokenText(raw);
  if (!normalized) return null;
  const id = PHRASE_TO_ID.get(normalized);
  if (!id) return null;
  return allowed.includes(id) ? id : null;
}

/** True if the text matches some known command, regardless of `allowed` — used to distinguish "unavailable here" from "not understood at all." */
export function isKnownPhrase(raw: string): boolean {
  return PHRASE_TO_ID.has(normalizeSpokenText(raw));
}

export function canonicalPhraseFor(id: VoiceCommandId): string {
  return ID_TO_CANONICAL_PHRASE.get(id) ?? id;
}
