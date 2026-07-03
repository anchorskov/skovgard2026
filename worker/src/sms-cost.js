// worker/src/sms-cost.js
//
// Canonical SMS segment-counting and cost-estimation logic, shared by the
// admin texting portal (single send + broadcast) and the Voter Blast tool.
// Mirrored (kept in sync manually) by static/js/sms-cost-estimator.mjs for
// instant client-side feedback before a preview round-trip; both files are
// tested against the same case table so drift is caught immediately.

// GSM 03.38 basic character set — 1 septet each.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// GSM 03.38 extended character set — 2 septets each (escape sequence + code).
const GSM7_EXTENDED = "^{}\\[~]|€\f";

const GSM7_BASIC_SET = new Set(GSM7_BASIC);
const GSM7_EXTENDED_SET = new Set(GSM7_EXTENDED);

const SMART_QUOTE_NAMES = {
  "‘": "left single smart quote",
  "’": "right single smart quote",
  "“": "left double smart quote",
  "”": "right double smart quote",
};

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export const DEFAULT_SMS_RATES = {
  // Base SMS segment cost (Telnyx 10DLC).
  baseSegmentRate: 0.004,
  // Estimated carrier/pass-through cost per segment (varies by carrier/route).
  carrierFeePerSegment: 0.0042,
  // Above this estimated total ($), the UI should show a cost warning.
  warningThresholdDollars: 25.0,
};

export function totalPerSegment(rates = DEFAULT_SMS_RATES) {
  // Round to a hundredth of a cent to avoid IEEE754 noise like
  // 0.004 + 0.0042 === 0.008199999999999999.
  return +(rates.baseSegmentRate + rates.carrierFeePerSegment).toFixed(4);
}

function describeNonGsm7Char(ch) {
  if (SMART_QUOTE_NAMES[ch]) return `smart quote "${ch}" (${SMART_QUOTE_NAMES[ch]})`;
  if (ch === "—") return 'em dash "—"';
  if (ch === "–") return 'en dash "–"';
  if (EMOJI_RE.test(ch)) return `emoji "${ch}"`;
  const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  return `non-GSM-7 character "${ch}" (U+${code})`;
}

// Returns { encoding: 'GSM-7'|'UCS-2', reasons: string[] }. Any character
// outside the GSM-7 basic+extended alphabet (smart quotes, em/en dash,
// emoji, accented characters outside the set, etc.) forces the whole
// message to UCS-2 — there is no partial/mixed encoding in SMS.
export function analyzeSmsEncoding(text) {
  const str = String(text || "");
  const reasons = [];
  const seen = new Set();
  let isGsm7 = true;
  for (const ch of str) {
    if (GSM7_BASIC_SET.has(ch) || GSM7_EXTENDED_SET.has(ch)) continue;
    isGsm7 = false;
    if (seen.has(ch)) continue;
    seen.add(ch);
    reasons.push(describeNonGsm7Char(ch));
  }
  return { encoding: isGsm7 ? "GSM-7" : "UCS-2", reasons };
}

// Full segment analysis for a message: encoding, per-segment sizing, and
// segment count. GSM-7 extended characters (^{}\[~]|€ and form feed) count
// as 2 septets, not 1 — this is the bug this module fixes relative to the
// previous inline implementation.
export function analyzeSms(text) {
  const str = String(text || "");
  const { encoding, reasons } = analyzeSmsEncoding(str);

  let unitsCount;
  let singleSegmentLimit;
  let charsPerSegment;

  if (encoding === "GSM-7") {
    unitsCount = 0;
    for (const ch of str) unitsCount += GSM7_EXTENDED_SET.has(ch) ? 2 : 1;
    singleSegmentLimit = 160;
    charsPerSegment = 153;
  } else {
    // UTF-16 code units — correct for UCS-2 SMS sizing, and naturally
    // counts astral characters (most emoji) as 2 units via surrogate pairs.
    unitsCount = str.length;
    singleSegmentLimit = 70;
    charsPerSegment = 67;
  }

  const segments =
    unitsCount === 0 ? 0 : unitsCount <= singleSegmentLimit ? 1 : Math.ceil(unitsCount / charsPerSegment);

  return {
    characterCount: str.length,
    encoding,
    encodingReasons: reasons,
    unitsCount,
    singleSegmentLimit,
    charsPerSegment,
    segments,
  };
}

export function smsSegmentCount(text) {
  return analyzeSms(text).segments;
}

// Full cost estimate for a single message sent to `recipientCount` people
// (all receiving the same final text — for personalized/per-recipient text
// that varies in length, use estimatePersonalizedSmsCost instead).
export function estimateSmsCost(text, recipientCount, rates = DEFAULT_SMS_RATES) {
  const info = analyzeSms(text);
  const perSegmentCost = totalPerSegment(rates);
  const count = Math.max(0, Math.trunc(Number(recipientCount) || 0));
  const totalBillableSegments = info.segments * count;
  const estimatedTotalCost = +(totalBillableSegments * perSegmentCost).toFixed(2);
  const threshold = rates.warningThresholdDollars ?? DEFAULT_SMS_RATES.warningThresholdDollars;

  return {
    characterCount: info.characterCount,
    encoding: info.encoding,
    encodingReasons: info.encodingReasons,
    charsPerSegment: info.charsPerSegment,
    singleSegmentLimit: info.singleSegmentLimit,
    segmentsPerRecipient: info.segments,
    recipientCount: count,
    totalBillableSegments,
    costPerSegment: perSegmentCost,
    estimatedTotalCost,
    exceedsWarningThreshold: estimatedTotalCost > threshold,
  };
}

// Cost estimate for a batch where each recipient's final text may differ in
// length (e.g. {first_name} personalization can push some recipients over a
// segment boundary while others stay under). Sums exact per-recipient
// segments rather than segments-of-template × recipientCount.
export function estimatePersonalizedSmsCost(personalizedTexts, rates = DEFAULT_SMS_RATES) {
  const perSegmentCost = totalPerSegment(rates);
  const perRecipientSegments = personalizedTexts.map((text) => smsSegmentCount(text));
  const totalBillableSegments = perRecipientSegments.reduce((sum, n) => sum + n, 0);
  const segmentsPerRecipient = perRecipientSegments.length ? Math.max(...perRecipientSegments) : 0;
  const estimatedTotalCost = +(totalBillableSegments * perSegmentCost).toFixed(2);
  const threshold = rates.warningThresholdDollars ?? DEFAULT_SMS_RATES.warningThresholdDollars;

  // Encoding/character info reported from the first personalized message as
  // a representative sample (all recipients share the same template).
  const sample = personalizedTexts.length ? analyzeSms(personalizedTexts[0]) : analyzeSms("");

  return {
    characterCount: sample.characterCount,
    encoding: sample.encoding,
    encodingReasons: sample.encodingReasons,
    charsPerSegment: sample.charsPerSegment,
    singleSegmentLimit: sample.singleSegmentLimit,
    segmentsPerRecipient,
    recipientCount: personalizedTexts.length,
    totalBillableSegments,
    costPerSegment: perSegmentCost,
    estimatedTotalCost,
    exceedsWarningThreshold: estimatedTotalCost > threshold,
  };
}

// Legacy-shaped estimate used by the Voter Blast preview route. Keeps the
// original { segments, baseCost, maxCost } return shape (baseCost = base
// rate only, maxCost = base + carrier fee) and folds the STOP-opt-out
// footer into the segment count, since that is what the Voter Blast send
// path actually appends before sending.
const SMS_STOP_FOOTER = "\n\nReply STOP to opt out.";

export function calcBlastCost(messageText, total, rates = DEFAULT_SMS_RATES) {
  const segments = smsSegmentCount(String(messageText || "") + SMS_STOP_FOOTER);
  const baseCost = +(segments * rates.baseSegmentRate * total).toFixed(2);
  const maxCost = +(segments * totalPerSegment(rates) * total).toFixed(2);
  return { segments, baseCost, maxCost };
}
