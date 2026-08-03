// Candidates/src/lib/selection-limit.ts
//
// Domain rules for how many candidates a voter may select in a given
// contest. See Candidates/docs/multi_selection.md — this file implements
// §2 (resolution chain), §3 (jurisdiction rules), and §6 (instruction
// parsing) verbatim. Do not add county- or office-specific conditionals
// here (§11); a new contest type is a new row in JURISDICTION_RULES, never
// a branch.

export type SelectionSource = 'ballot_instruction' | 'max_selections' | `derived:${string}` | null;

export interface SelectionLimitResult {
  limit: number | null;
  source: SelectionSource;
  instructionText: string | null;
  isMultiSelect: boolean;
  /** Set only for a §6 integrity-check failure (word/numeral disagreement). */
  error: string | null;
}

export interface ContestInput {
  electionPhase: string | null;
  jurisdictionType: string | null;
  partisanship: string | null;
  seatsOpen: number | null;
  maxSelections: number | null;
  ballotInstruction: string | null;
  /** Mirrors verification_status === 'verified' (§10). Gates both
   *  ballotInstruction and maxSelections — an unverified value is treated
   *  as absent, never used to set a limit. */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// §6 Ballot instruction parsing
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};

const NUMBER_WORD_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'i');
const PARENTHETICAL_NUMERAL_PATTERN = /\((\d+)\)/;
// Fallback only — a real observed format ("Vote for 2") has no parentheses
// and no spelled word at all. Parenthetical still wins when present.
const BARE_NUMERAL_PATTERN = /\b(\d+)\b/;

export interface ParsedInstruction {
  value: number | null;
  error: string | null;
}

/**
 * Parses strings like "VOTE FOR NOT MORE THAN TWO (2)". Case-insensitive.
 * Prefers the parenthetical numeral when present; falls back to a bare
 * standalone numeral (e.g. "Vote for 2") when there is no parenthetical one.
 * If a spelled-out word and whichever numeral was found disagree, this is a
 * transcription error from the research pipeline, not a value to guess at —
 * return UNKNOWN with a loud, contest-named error. When there's no word to
 * cross-check a bare numeral against, the integrity check simply doesn't
 * apply — there's nothing to disagree with. Unrecognized phrasing returns
 * null, never a guess.
 */
export function parseBallotInstruction(text: string, contestLabel = 'this contest'): ParsedInstruction {
  const normalized = String(text ?? '').trim();
  if (!normalized) return { value: null, error: null };

  const wordMatch = normalized.match(NUMBER_WORD_PATTERN);
  const parenNumeralMatch = normalized.match(PARENTHETICAL_NUMERAL_PATTERN);
  const bareNumeralMatch = normalized.match(BARE_NUMERAL_PATTERN);
  const numeralMatch = parenNumeralMatch ?? bareNumeralMatch;

  const wordValue = wordMatch ? NUMBER_WORDS[wordMatch[1].toLowerCase()] : null;
  const numeralValue = numeralMatch ? Number(numeralMatch[1]) : null;

  if (wordValue == null && numeralValue == null) {
    return { value: null, error: null };
  }

  if (wordValue != null && numeralValue != null && wordValue !== numeralValue) {
    return {
      value: null,
      error: `Ballot instruction integrity mismatch in ${contestLabel}: word "${wordMatch![1]}" (${wordValue}) disagrees with numeral (${numeralValue}) in "${normalized}".`,
    };
  }

  return { value: numeralValue ?? wordValue, error: null };
}

// ---------------------------------------------------------------------------
// §3 Jurisdiction rules — a lookup table, not branches. A new contest type
// is a new row here. Absence from the table means UNKNOWN, never a fallback
// formula.
//
// Every row currently resolves to `seats_open`, unmodified. Do NOT collapse
// this into a bare `return seatsOpen` — the table exists specifically to
// carry the warning below, and a formula has nowhere to put it.
//
// Municipal primaries do NOT double the vote-for number. This is the single
// most common error in this domain (it was wrong in an earlier draft of
// multi_selection.md). W.S. 22-23-303 sets max_selections = seats_to_elect;
// W.S. 22-23-307(a) separately provides that *twice* that number
// (`number_nominated`) advances to the general. number_nominated is real
// data but must never drive the UI — see §1/§7 of the spec. Confirmed three
// ways there: statute text, a Weston County 2026 sample ballot ("VOTE FOR
// NOT MORE THAN TWO (2)" against 2 Upton council seats), and the parity
// check in §7.
// ---------------------------------------------------------------------------

type JurisdictionRuleFn = (seatsOpen: number) => number;

interface JurisdictionRuleRow {
  electionPhase: string;
  /** '*' matches any jurisdictionType (used by the general-election row). */
  jurisdictionType: string | '*';
  /** '*' matches any partisanship. */
  partisanship: string | '*';
  ruleName: string;
  rule: JurisdictionRuleFn;
}

const JURISDICTION_RULES: JurisdictionRuleRow[] = [
  { electionPhase: 'primary', jurisdictionType: 'county', partisanship: 'partisan', ruleName: 'partisan_seats_open', rule: (seatsOpen) => seatsOpen },
  { electionPhase: 'primary', jurisdictionType: 'state', partisanship: 'partisan', ruleName: 'partisan_seats_open', rule: (seatsOpen) => seatsOpen },
  { electionPhase: 'primary', jurisdictionType: 'precinct', partisanship: 'partisan', ruleName: 'partisan_seats_open', rule: (seatsOpen) => seatsOpen },
  { electionPhase: 'primary', jurisdictionType: 'municipal', partisanship: 'nonpartisan', ruleName: 'municipal_seats_open', rule: (seatsOpen) => seatsOpen },
  { electionPhase: 'general', jurisdictionType: '*', partisanship: '*', ruleName: 'general_seats_open', rule: (seatsOpen) => seatsOpen },
];

function findJurisdictionRule(
  electionPhase: string,
  jurisdictionType: string,
  partisanship: string
): JurisdictionRuleRow | null {
  return JURISDICTION_RULES.find((row) =>
    row.electionPhase === electionPhase &&
    (row.jurisdictionType === jurisdictionType || row.jurisdictionType === '*') &&
    (row.partisanship === partisanship || row.partisanship === '*')
  ) ?? null;
}

// ---------------------------------------------------------------------------
// §2 Resolution chain — one function for every contest type and surface.
// ---------------------------------------------------------------------------

function unknown(error: string | null = null): SelectionLimitResult {
  return { limit: null, source: null, instructionText: null, isMultiSelect: false, error };
}

export function resolveSelectionLimit(contest: ContestInput, contestLabel = 'this contest'): SelectionLimitResult {
  // 1. Verbatim instruction. Presence + verified means this tier decides the
  // outcome outright — a parse failure here is UNKNOWN, not a fallthrough to
  // max_selections/seats_open (that would silently paper over a
  // verified-but-unparseable instruction with a guess).
  const instruction = contest.ballotInstruction?.trim();
  if (instruction && contest.verified) {
    const parsed = parseBallotInstruction(instruction, contestLabel);
    if (parsed.error) return unknown(parsed.error);
    if (parsed.value == null) return unknown(null);
    return {
      limit: parsed.value,
      source: 'ballot_instruction',
      instructionText: instruction,
      isMultiSelect: parsed.value > 1,
      error: null,
    };
  }

  // 2. Explicit value.
  if (contest.maxSelections != null && contest.verified) {
    return {
      limit: contest.maxSelections,
      source: 'max_selections',
      instructionText: null,
      isMultiSelect: contest.maxSelections > 1,
      error: null,
    };
  }

  // 3. Derived from the jurisdiction rule table.
  if (
    contest.seatsOpen != null &&
    contest.electionPhase &&
    contest.jurisdictionType &&
    contest.partisanship
  ) {
    const rule = findJurisdictionRule(
      contest.electionPhase.toLowerCase(),
      contest.jurisdictionType.toLowerCase(),
      contest.partisanship.toLowerCase()
    );
    if (rule) {
      const limit = rule.rule(contest.seatsOpen);
      return {
        limit,
        source: `derived:${rule.ruleName}`,
        instructionText: null,
        isMultiSelect: limit > 1,
        error: null,
      };
    }
  }

  // 4. Unknown. Never infer from filed-candidate counts, another contest,
  // county, precinct, or prior year, and never default to 1 — missing means
  // unknown, and unknown renders silently.
  return unknown(null);
}

// ---------------------------------------------------------------------------
// §11 Safety — "Enforce the limit in the browser and in any server/API write
// path." One function for both: the browser calls it before persisting to
// localStorage (race/[id].astro's saveChoices), and it's exported so a
// future server/API write path enforces the identical rule rather than
// re-implementing it. `limit` should be the raw resolveSelectionLimit()
// output — null is handled here (enforce 1), callers must not pre-substitute
// a default themselves.
// ---------------------------------------------------------------------------

export interface SelectionValidationResult {
  valid: boolean;
  error: string | null;
}

export function validateSelectionWrite(
  countForContest: number,
  limit: number | null,
  contestLabel = 'this contest'
): SelectionValidationResult {
  const effectiveLimit = limit ?? 1;
  if (countForContest > effectiveLimit) {
    return {
      valid: false,
      error: `Cannot save ${countForContest} selections for ${contestLabel} — the limit is ${effectiveLimit}.`,
    };
  }
  return { valid: true, error: null };
}
