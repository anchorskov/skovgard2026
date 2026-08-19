import assert from "node:assert/strict";
import test from "node:test";

import { runEmailConsentReconciliation } from "./index.js";

function reconciliationDb({ missing = 0, conflicts = {}, pulseNew = 0, staffSent = 0, failure = null } = {}) {
  return {
    prepare(sql) {
      return {
        async first() {
          if (failure) throw failure;
          if (sql.includes("NOT EXISTS")) return { n: missing };
          if (sql.includes("JOIN email_contacts")) {
            return {
              n: conflicts.total || 0,
              no_signal: conflicts.noSignal || 0,
              opted_out: conflicts.optedOut || 0,
              other: conflicts.other || 0,
            };
          }
          if (sql.includes("FROM consent_status")) return { n: pulseNew };
          if (sql.includes("FROM resend_webhook_events")) return { n: staffSent };
          throw new Error(`Unexpected reconciliation query: ${sql}`);
        },
      };
    },
  };
}

test("reconciliation reports missing rows and status conflicts separately", async () => {
  const result = await runEmailConsentReconciliation({
    DB: reconciliationDb({
      missing: 2,
      conflicts: { total: 3, noSignal: 1, optedOut: 1, other: 1 },
    }),
  });

  assert.equal(result.dualWriteGap, 5);
  assert.equal(result.missingContacts, 2);
  assert.equal(result.statusConflicts, 3);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "disabled_or_missing_config");
});

test("reconciliation detects a partial Pulse staff-notification delivery gap", async () => {
  const result = await runEmailConsentReconciliation({
    DB: reconciliationDb({ pulseNew: 3, staffSent: 2 }),
  });

  assert.equal(result.pulseNewContacts, 3);
  assert.equal(result.pulseStaffSent, 2);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "disabled_or_missing_config");
});

test("reconciliation does not turn a query failure into healthy zero counts", async () => {
  const failure = new Error("D1 unavailable");
  await assert.rejects(
    runEmailConsentReconciliation({ DB: reconciliationDb({ failure }) }),
    failure
  );
});
