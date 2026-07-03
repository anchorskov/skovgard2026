// static/js/sms-cost-estimator.test.mjs
//
// Run with: node --test static/js
// Mirrors worker/src/sms-cost.test.js so the two implementations (worker
// and client) are verified against the same case table and can't drift
// silently.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SMS_RATES,
  totalPerSegment,
  analyzeSmsEncoding,
  analyzeSms,
  smsSegmentCount,
  estimateSmsCost,
} from "./sms-cost-estimator.mjs";

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
  const under = estimateSmsCost("hello", 100, rates);
  const over = estimateSmsCost("hello", 200, rates);
  assert.equal(under.exceedsWarningThreshold, false);
  assert.equal(over.exceedsWarningThreshold, true);
});
