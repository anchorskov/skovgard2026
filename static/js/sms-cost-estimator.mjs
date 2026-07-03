// static/js/sms-cost-estimator.mjs
//
// Client-side mirror of worker/src/sms-cost.js, used by admin-texting.js
// for instant "as you type" cost feedback before a Preview round-trip to
// the Worker (which remains the authoritative source once a preview has
// run). Kept in sync manually with the worker copy — both are tested
// against the same case table (see sms-cost-estimator.test.mjs and
// worker/src/sms-cost.test.js) so drift between them is caught immediately.
//
// This file uses the .mjs extension (unlike sibling admin-*.js files) so it
// can be executed directly by `node --test` without adding a repo-wide
// "type": "module" field to the root package.json or publishing a stray
// package.json into the public static/ tree. Browsers load it the same way
// admin-texting.js already loads /js/env.js — an absolute-path ES module
// import doesn't require the importing file to share its extension.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

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
  baseSegmentRate: 0.004,
  carrierFeePerSegment: 0.0042,
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
