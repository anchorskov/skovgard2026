// worker/src/pulse-optin-consent.test.js
// Verifies the overwriteProfile fix in upsertConsentStatus: a step-1-only
// ("join updates without voting") resubmission -- overwriteProfile: true,
// city/zip/address blank because step 2 was never shown -- must NOT erase a
// previously-stored address, while a real correction (a new, non-blank
// value) still applies.
//
// Uses a real in-memory SQLite database (node:sqlite, experimental but
// available on Node >=22.5) rather than a mock, because the behavior under
// test lives inside the SQL itself (the CASE/COALESCE expressions in the
// INSERT ... ON CONFLICT), which a mock that only records bound parameters
// can't exercise -- only a real SQL engine can prove what actually gets
// persisted.

import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { upsertConsentStatus } from "./telnyx.js";

function wrapD1(sqliteDb) {
  return {
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async run() {
          stmt.run(...boundArgs);
          return { success: true };
        },
        async first() {
          return stmt.get(...boundArgs) ?? null;
        },
        async all() {
          return { results: stmt.all(...boundArgs) };
        },
      };
    },
  };
}

function makeDb() {
  const sqliteDb = new DatabaseSync(":memory:");
  sqliteDb.exec(`
    CREATE TABLE contacts (
      phone_e164 TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE consent_status (
      phone_e164 TEXT PRIMARY KEY,
      status TEXT,
      source TEXT,
      source_detail TEXT,
      consented_at TEXT,
      revoked_at TEXT,
      last_inbound_keyword TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      consent_email INTEGER,
      wy_voter INTEGER,
      county TEXT,
      zip TEXT,
      address1 TEXT,
      address2 TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      state_house_district TEXT,
      state_senate_district TEXT,
      consent_version TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      voter_id TEXT,
      poll_link_sent_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  return wrapD1(sqliteDb);
}

const PHONE = "+13075551234";

// Explicit stateHouseDistrict/stateSenateDistrict so upsertConsentStatus's
// `if (!explicitStateHouseDistrict && !explicitStateSenateDistrict)` guard
// skips calling lookupWyLegislativeDistricts entirely -- that function
// hits a real address-lookup table and a Census API fallback, neither of
// which belongs in this unit test.
const DISTRICTS = { stateHouseDistrict: "HD01", stateSenateDistrict: "SD01" };

test("an 'updates only' resubmission (overwriteProfile, blank address fields) does not erase a previously-stored address", async () => {
  const db = makeDb();

  await upsertConsentStatus(db, {
    phone: PHONE,
    status: "opted_in",
    firstName: "Mollie",
    lastName: "Hand",
    email: "mollie_hand@yahoo.com",
    consentEmail: true,
    overwriteProfile: true,
    city: "Laramie",
    zip: "82070",
    address1: "123 Main St",
    state: "WY",
    ...DISTRICTS,
  });

  // Step-1-only resubmission: city/zip/address1 never collected, but
  // overwriteProfile is still true because /pulse always sends it.
  await upsertConsentStatus(db, {
    phone: PHONE,
    status: "opted_in",
    firstName: "Mollie",
    lastName: "Hand",
    email: "mollie_hand@yahoo.com",
    consentEmail: true,
    overwriteProfile: true,
    city: null,
    zip: null,
    address1: null,
    ...DISTRICTS,
  });

  const row = await db
    .prepare("SELECT city, zip, address1 FROM consent_status WHERE phone_e164 = ?1")
    .bind(PHONE)
    .first();

  assert.equal(row.city, "Laramie");
  assert.equal(row.zip, "82070");
  assert.equal(row.address1, "123 Main St");
});

test("a real correction (new non-blank address) still overwrites, even with overwriteProfile", async () => {
  const db = makeDb();

  await upsertConsentStatus(db, {
    phone: PHONE,
    status: "opted_in",
    firstName: "Mollie",
    lastName: "Hand",
    overwriteProfile: true,
    city: "Laramie",
    zip: "82070",
    address1: "123 Main St",
    ...DISTRICTS,
  });

  await upsertConsentStatus(db, {
    phone: PHONE,
    status: "opted_in",
    firstName: "Mollie",
    lastName: "Hand",
    overwriteProfile: true,
    city: "Cheyenne",
    zip: "82001",
    address1: "456 Elm St",
    ...DISTRICTS,
  });

  const row = await db
    .prepare("SELECT city, zip, address1 FROM consent_status WHERE phone_e164 = ?1")
    .bind(PHONE)
    .first();

  assert.equal(row.city, "Cheyenne");
  assert.equal(row.zip, "82001");
  assert.equal(row.address1, "456 Elm St");
});

test("a fresh contact with no prior row is unaffected (nothing to preserve yet)", async () => {
  const db = makeDb();

  await upsertConsentStatus(db, {
    phone: PHONE,
    status: "opted_in",
    firstName: "New",
    lastName: "Contact",
    overwriteProfile: true,
    city: null,
    zip: null,
    address1: null,
    ...DISTRICTS,
  });

  const row = await db
    .prepare("SELECT city, zip, address1 FROM consent_status WHERE phone_e164 = ?1")
    .bind(PHONE)
    .first();

  assert.equal(row.city, null);
  assert.equal(row.zip, null);
  assert.equal(row.address1, null);
});
