import assert from "node:assert/strict";
import test from "node:test";

import { promoteDeliveredOptInPhone } from "./voter-phone.js";

function mockWyDb({ conflicts = [], priorPhone = "+13074316006" } = {}) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          return { results: conflicts };
        },
        async first() {
          return sql.includes("SELECT phone_e164 FROM v_best_phone")
            ? { phone_e164: priorPhone }
            : null;
        },
        async run() {
          writes.push({ sql, bindings });
          return { success: true };
        },
      };
    },
  };
}

test("delivered opt-in phone replaces best phone but retains history", async () => {
  const db = mockWyDb();
  const result = await promoteDeliveredOptInPhone(db, {
    voterId: "139834",
    phoneE164: "+13043432732",
  });

  assert.equal(result.promoted, true);
  assert.equal(result.changed, true);
  assert.equal(result.previousPhone, "+13074316006");
  assert.equal(db.writes.length, 2);
  assert.match(db.writes[0].sql, /INSERT INTO voter_phones/);
  assert.match(db.writes[1].sql, /INSERT INTO v_best_phone/);
  assert.equal(db.writes[0].bindings[5], "skovgard_optin_delivered");
});

test("phone already linked to another voter is not promoted", async () => {
  const db = mockWyDb({ conflicts: [{ voter_id: "999999" }] });
  const result = await promoteDeliveredOptInPhone(db, {
    voterId: "139834",
    phoneE164: "+13043432732",
  });

  assert.deepEqual(result, {
    promoted: false,
    reason: "phone_belongs_to_other_voter",
  });
  assert.equal(db.writes.length, 0);
});
