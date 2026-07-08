import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPermanentlySuppress, summarizeResendWebhookEvent } from "./resend-webhooks.js";

test("a Permanent bounce is suppressed", () => {
  assert.equal(
    shouldPermanentlySuppress("email.bounced", { bounce: { type: "Permanent" } }),
    true
  );
});

test("a Temporary bounce is not suppressed", () => {
  assert.equal(
    shouldPermanentlySuppress("email.bounced", { bounce: { type: "Temporary" } }),
    false
  );
});

test("a bounce with no bounce.type at all is not suppressed", () => {
  assert.equal(shouldPermanentlySuppress("email.bounced", {}), false);
});

test("bounce.type comparison is case-insensitive", () => {
  assert.equal(
    shouldPermanentlySuppress("email.bounced", { bounce: { type: "permanent" } }),
    true
  );
});

test("a complaint always suppresses regardless of any bounce data", () => {
  assert.equal(shouldPermanentlySuppress("email.complained", {}), true);
});

test("an explicit suppression event always suppresses", () => {
  assert.equal(shouldPermanentlySuppress("email.suppressed", {}), true);
});

test("delivered/opened/clicked events never suppress", () => {
  assert.equal(shouldPermanentlySuppress("email.delivered", {}), false);
  assert.equal(shouldPermanentlySuppress("email.opened", {}), false);
});

test("summarizeResendWebhookEvent extracts bounce type and subtype", () => {
  const summary = summarizeResendWebhookEvent({
    type: "email.bounced",
    data: {
      to: ["someone@example.com"],
      bounce: { type: "Permanent", subType: "Suppressed", message: "hard bounce" },
    },
  });
  assert.equal(summary.bounceType, "Permanent");
  assert.equal(summary.bounceSubType, "Suppressed");
  assert.equal(summary.recipientEmailNorm, "someone@example.com");
});

test("summarizeResendWebhookEvent gives null bounce fields for a non-bounce event", () => {
  const summary = summarizeResendWebhookEvent({
    type: "email.delivered",
    data: { to: ["someone@example.com"] },
  });
  assert.equal(summary.bounceType, null);
  assert.equal(summary.bounceSubType, null);
});
