// worker/src/pulse-voter-match.test.js
// Covers the /pulse voter-matching cascade (findUniqueWyTargetMatch,
// syncSubmittedPhoneToWyVoter) and the WY area-code/ZIP-range helpers added
// alongside it. WY_DB is mocked -- see mockWyDb below -- since these
// functions only ever call `.prepare(sql).bind(...).all()/.first()`, the
// same D1-shaped surface the existing voter-phone.test.js mocks.

import assert from "node:assert/strict";
import test from "node:test";

import {
  findUniqueWyTargetMatch,
  syncSubmittedPhoneToWyVoter,
  isWyAreaCodePhone10,
  isWyZip5,
} from "./index.js";

// Classifies a query by shape so a test can hand back different canned rows
// for the phone tier, email tier, id-lookup, and each name/address tier --
// mirroring how voter-phone.test.js's mock keys off `sql.includes(...)`.
function sqlKind(sql) {
  if (sql.includes("sqlite_master")) return "object_exists";
  if (sql.includes("UNION ALL") && sql.includes("v_best_phone")) return "conflicts_check";
  if (sql.includes("v_best_phone") && sql.includes("voter_phones")) return "phone_tier";
  if (sql.includes("FROM voter_emails")) return "email_tier";
  if (sql.includes("WHERE voter_id IN (")) return "load_by_ids";
  if (sql.includes("COALESCE(addr1")) return "address_tier";
  if (/zip = \?4/.test(sql)) return "name_city_zip_tier";
  if (/zip = \?3/.test(sql)) return "zip_only_tier";
  if (sql.includes("v_voter_targeting")) return "city_only_tier";
  return "unknown";
}

function mockWyDb(responses = {}) {
  return {
    prepare(sql) {
      const kind = sqlKind(sql);
      return {
        bind(..._values) {
          return this;
        },
        async all() {
          return { results: responses[kind] || [] };
        },
        async first() {
          if (kind === "object_exists") {
            return responses.objectExists === false ? null : { ok: 1 };
          }
          return (responses[kind] || [])[0] || null;
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
}

test("isWyAreaCodePhone10 recognizes Wyoming's single area code", () => {
  assert.equal(isWyAreaCodePhone10("3075551234"), true);
  // the exact 304-instead-of-307 typo this check exists to catch
  assert.equal(isWyAreaCodePhone10("3045551234"), false);
  assert.equal(isWyAreaCodePhone10("307555123"), false); // wrong length
});

test("isWyZip5 recognizes Wyoming's contiguous ZIP range", () => {
  assert.equal(isWyZip5("82070"), true); // Laramie
  assert.equal(isWyZip5("82001"), true); // lower bound
  assert.equal(isWyZip5("83128"), true); // upper bound
  assert.equal(isWyZip5("81999"), false);
  assert.equal(isWyZip5("83129"), false);
  assert.equal(isWyZip5("10001"), false); // NYC
});

test("unique submitted phone resolves to a voter ahead of any name-based tier", async () => {
  const wyDb = mockWyDb({
    phone_tier: [{ voter_id: "139834" }],
    load_by_ids: [{ voter_id: "139834", first_name: "MOLLIE", last_name: "HAND" }],
    name_city_zip_tier: [{ voter_id: "999999" }], // would be wrong if this tier ran instead
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    phone: "+13075551234",
    firstName: "Mollie",
    lastName: "Hand",
    city: "Laramie",
    zip: "82070",
  });
  assert.equal(result.mode, "phone_match");
  assert.equal(result.match.voter_id, "139834");
});

test("phone linked to multiple voters is ambiguous, not auto-matched", async () => {
  const wyDb = mockWyDb({ phone_tier: [{ voter_id: "1" }, { voter_id: "2" }] });
  const result = await findUniqueWyTargetMatch(wyDb, {
    phone: "+13075551234",
    firstName: "A",
    lastName: "B",
  });
  assert.equal(result.mode, "ambiguous_phone");
  assert.equal(result.candidates.length, 2);
});

test("unique submitted email resolves to a voter when phone doesn't", async () => {
  const wyDb = mockWyDb({
    email_tier: [{ voter_id: "555" }],
    load_by_ids: [{ voter_id: "555", first_name: "JANE", last_name: "DOE" }],
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
  });
  assert.equal(result.mode, "email_match");
  assert.equal(result.match.voter_id, "555");
});

test("email linked to multiple voters is ambiguous, not auto-matched", async () => {
  const wyDb = mockWyDb({ email_tier: [{ voter_id: "1" }, { voter_id: "2" }] });
  const result = await findUniqueWyTargetMatch(wyDb, {
    email: "shared@example.com",
    firstName: "A",
    lastName: "B",
  });
  assert.equal(result.mode, "ambiguous_email");
});

test("no name at all -> missing_lookup_fields", async () => {
  const wyDb = mockWyDb({});
  const result = await findUniqueWyTargetMatch(wyDb, { firstName: "", lastName: "", city: "Casper", zip: "82601" });
  assert.equal(result.mode, "missing_lookup_fields");
});

test("name present but both city and zip blank -> missing_lookup_fields (nothing to search)", async () => {
  const wyDb = mockWyDb({});
  const result = await findUniqueWyTargetMatch(wyDb, { firstName: "Nobody", lastName: "Home", city: "", zip: "" });
  assert.equal(result.mode, "missing_lookup_fields");
});

test("name+city unique but zip missing is NEVER auto-accepted -- always routed for staff confirmation (the Mollie Hand case)", async () => {
  const wyDb = mockWyDb({
    city_only_tier: [{ voter_id: "139834", first_name: "MOLLIE", last_name: "HAND", city: "LARAMIE" }],
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Mollie",
    lastName: "Hand",
    city: "Laramie",
    zip: "",
  });
  assert.equal(result.mode, "ambiguous_name_city");
  assert.equal(result.match, null);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].voter_id, "139834");
});

test("name+city, zip missing, zero candidates -> no_match", async () => {
  const wyDb = mockWyDb({ city_only_tier: [] });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Nobody",
    lastName: "Real",
    city: "Casper",
    zip: "",
  });
  assert.equal(result.mode, "no_match");
});

test("name+city+zip+address1 unique match wins over broader tiers", async () => {
  const wyDb = mockWyDb({ address_tier: [{ voter_id: "42" }] });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Jane",
    lastName: "Doe",
    city: "Casper",
    zip: "82601",
    address1: "123 Main St",
  });
  assert.equal(result.mode, "name_city_zip_address");
  assert.equal(result.match.voter_id, "42");
});

test("ambiguous address match does not silently fall through to a broader, less precise tier", async () => {
  const wyDb = mockWyDb({
    address_tier: [{ voter_id: "1" }, { voter_id: "2" }],
    name_city_zip_tier: [{ voter_id: "3" }], // would be a *wrong* silent match if this ran instead
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Jane",
    lastName: "Doe",
    city: "Casper",
    zip: "82601",
    address1: "123 Main St",
  });
  assert.equal(result.mode, "ambiguous_address");
  assert.equal(result.candidates.length, 2);
});

test("name+city+zip unique match when no address submitted", async () => {
  const wyDb = mockWyDb({ name_city_zip_tier: [{ voter_id: "7" }] });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Jane",
    lastName: "Doe",
    city: "Casper",
    zip: "82601",
  });
  assert.equal(result.mode, "name_city_zip");
});

test("falls back to name+zip when the submitted city doesn't match the voter file's registered city", async () => {
  const wyDb = mockWyDb({
    name_city_zip_tier: [],
    zip_only_tier: [{ voter_id: "9" }],
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Jane",
    lastName: "Doe",
    city: "Mills",
    zip: "82601",
  });
  assert.equal(result.mode, "name_zip");
});

test("no match anywhere in the full cascade", async () => {
  const wyDb = mockWyDb({});
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Nobody",
    lastName: "Real",
    city: "Casper",
    zip: "82601",
  });
  assert.equal(result.mode, "no_match");
});

test("name+city fallback surfaces a candidate when the submitted ZIP doesn't match a real voter (Keith Goodenough case, 2026-07-19)", async () => {
  // Every zip-anchored tier comes back empty (submitted 82604 doesn't match
  // this voter's real 82609), but name+city alone still finds the real
  // record -- must not fall through to a bare no_match with zero
  // candidates for staff to work from.
  const wyDb = mockWyDb({
    city_only_tier: [{ voter_id: "8543", first_name: "KEITH", last_name: "GOODENOUGH", city: "CASPER", zip: "82609", addr1: "333 S SOCONY PL" }],
  });
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Keith",
    lastName: "Goodenough",
    city: "Casper",
    zip: "82604",
    address1: "333 S Socony",
  });
  assert.equal(result.mode, "ambiguous_name_city_zip_conflict");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].voter_id, "8543");
});

test("name+city fallback stays silent when even that tier finds nobody", async () => {
  const wyDb = mockWyDb({});
  const result = await findUniqueWyTargetMatch(wyDb, {
    firstName: "Nobody",
    lastName: "Real",
    city: "Casper",
    zip: "82604",
  });
  assert.equal(result.mode, "no_match");
  assert.equal(result.candidates, undefined);
});

test("syncSubmittedPhoneToWyVoter: clean unique name match is not silently dropped when the phone belongs to a different voter", async () => {
  const wyDb = mockWyDb({
    name_city_zip_tier: [{ voter_id: "139834", first_name: "MOLLIE", last_name: "HAND", city: "LARAMIE", zip: "82070" }],
    conflicts_check: [{ voter_id: "999999" }],
  });
  const result = await syncSubmittedPhoneToWyVoter(
    { WY_DB: wyDb },
    { phone: "+13075551234", firstName: "Mollie", lastName: "Hand", city: "Laramie", zip: "82070" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.skipped, "phone_belongs_to_other_voter");
  assert.equal(result.voterId, "139834");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].voter_id, "139834");
});

test("syncSubmittedPhoneToWyVoter: unique match with no phone conflict succeeds", async () => {
  const wyDb = mockWyDb({
    name_city_zip_tier: [{ voter_id: "139834" }],
    conflicts_check: [],
  });
  const result = await syncSubmittedPhoneToWyVoter(
    { WY_DB: wyDb },
    { phone: "+13075551234", firstName: "Mollie", lastName: "Hand", city: "Laramie", zip: "82070" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.voterId, "139834");
  assert.equal(result.matchedBy, "name_city_zip");
});

test("syncSubmittedPhoneToWyVoter: no WY_DB binding is a graceful infra skip, not a review-worthy failure", async () => {
  const result = await syncSubmittedPhoneToWyVoter({}, { phone: "+13075551234", firstName: "A", lastName: "B" });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, "missing_binding");
});
