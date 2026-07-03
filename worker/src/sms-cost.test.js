// worker/src/sms-cost.test.js
//
// Run with: node --test worker/src

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SMS_RATES,
  totalPerSegment,
  analyzeSmsEncoding,
  analyzeSms,
  smsSegmentCount,
  estimateSmsCost,
  estimatePersonalizedSmsCost,
  calcBlastCost,
} from "./sms-cost.js";

test("160 GSM-7 chars is 1 segment", () => {
  assert.equal(smsSegmentCount("a".repeat(160)), 1);
});

test("161 GSM-7 chars is 2 segments", () => {
  assert.equal(smsSegmentCount("a".repeat(161)), 2);
});

test("306 GSM-7 chars is 2 segments", () => {
  assert.equal(smsSegmentCount("a".repeat(306)), 2);
});

test("307 GSM-7 chars is 3 segments", () => {
  assert.equal(smsSegmentCount("a".repeat(307)), 3);
});

test("70 Unicode (non-GSM-7) chars is 1 segment", () => {
  // Em dash is BMP (single UTF-16 unit) and not in the GSM-7 alphabet,
  // so it forces UCS-2 without surrogate-pair complications in the test.
  assert.equal(smsSegmentCount("—".repeat(70)), 1);
});

test("71 Unicode (non-GSM-7) chars is 2 segments", () => {
  assert.equal(smsSegmentCount("—".repeat(71)), 2);
});

test("empty message is 0 segments", () => {
  assert.equal(smsSegmentCount(""), 0);
});

test("message with an emoji is detected as Unicode with an emoji reason", () => {
  const { encoding, reasons } = analyzeSmsEncoding("Hi there 🎉 see you soon");
  assert.equal(encoding, "UCS-2");
  assert.ok(reasons.some((r) => r.includes("emoji")), `expected an emoji reason, got: ${reasons.join(", ")}`);
});

test("message with smart quotes is detected as Unicode and the quote is named", () => {
  const { encoding, reasons } = analyzeSmsEncoding("She said “hello” to me");
  assert.equal(encoding, "UCS-2");
  assert.ok(
    reasons.some((r) => r.includes("smart quote")),
    `expected a smart quote reason, got: ${reasons.join(", ")}`
  );
});

test("message with an em dash is detected as Unicode and the dash is named", () => {
  const { encoding, reasons } = analyzeSmsEncoding("Wyoming — the Equality State");
  assert.equal(encoding, "UCS-2");
  assert.ok(
    reasons.some((r) => r.includes("em dash")),
    `expected an em dash reason, got: ${reasons.join(", ")}`
  );
});

test("plain GSM-7 message with no unusual punctuation stays GSM-7", () => {
  const { encoding, reasons } = analyzeSmsEncoding("Vote for Jimmy on election day! Reply STOP to opt out.");
  assert.equal(encoding, "GSM-7");
  assert.deepEqual(reasons, []);
});

test("GSM-7 extended characters count as 2 septets each", () => {
  // 159 plain chars + one extended char ({) = 161 septet-units, which
  // crosses the 160-char single-segment limit even though text.length is
  // only 160 — this is the bug the previous naive .length-based counter had.
  const text = "a".repeat(159) + "{";
  assert.equal(text.length, 160);
  const info = analyzeSms(text);
  assert.equal(info.encoding, "GSM-7");
  assert.equal(info.unitsCount, 161);
  assert.equal(info.segments, 2);
});

test("totalPerSegment derives $0.0082 from the default rates", () => {
  assert.equal(totalPerSegment(DEFAULT_SMS_RATES), 0.0082);
});

test("estimateSmsCost multiplies segments by recipients and applies the rate", () => {
  const result = estimateSmsCost("a".repeat(161), 10, DEFAULT_SMS_RATES);
  assert.equal(result.segmentsPerRecipient, 2);
  assert.equal(result.recipientCount, 10);
  assert.equal(result.totalBillableSegments, 20);
  assert.equal(result.costPerSegment, 0.0082);
  assert.equal(result.estimatedTotalCost, 0.16);
});

test("estimateSmsCost flags exceedsWarningThreshold correctly on both sides of the threshold", () => {
  const rates = { ...DEFAULT_SMS_RATES, warningThresholdDollars: 1.0 };
  const under = estimateSmsCost("hello", 100, rates); // 1 segment * 100 * 0.0082 = 0.82
  const over = estimateSmsCost("hello", 200, rates); // 1 segment * 200 * 0.0082 = 1.64
  assert.equal(under.exceedsWarningThreshold, false);
  assert.equal(over.exceedsWarningThreshold, true);
});

test("estimatePersonalizedSmsCost sums exact per-recipient segments, not a uniform multiply", () => {
  // One short name keeps its recipient at 1 segment, one long name pushes
  // theirs to 2 — the total should reflect that mix exactly (1 + 2 = 3),
  // not segments-of-longest * count (2 * 2 = 4) or segments-of-first * count.
  const short = "Hi Al, thanks for supporting the campaign!"; // well under 160
  const long = "Hi " + "Bartholomew".repeat(15) + ", thanks for supporting the campaign!"; // forces 2 segments
  const result = estimatePersonalizedSmsCost([short, long], DEFAULT_SMS_RATES);
  assert.equal(smsSegmentCount(short), 1);
  assert.equal(smsSegmentCount(long), 2);
  assert.equal(result.totalBillableSegments, 3);
  assert.equal(result.recipientCount, 2);
  assert.equal(result.segmentsPerRecipient, 2);
});

test("calcBlastCost keeps its legacy { segments, baseCost, maxCost } shape and folds in the STOP footer", () => {
  const result = calcBlastCost("Vote Tuesday!", 100, DEFAULT_SMS_RATES);
  assert.equal(typeof result.segments, "number");
  assert.equal(typeof result.baseCost, "number");
  assert.equal(typeof result.maxCost, "number");
  assert.ok(result.maxCost > result.baseCost, "maxCost should exceed baseCost once the carrier fee is included");
});
