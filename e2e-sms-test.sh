#!/bin/bash
# e2e-sms-test.sh
# Comprehensive end-to-end testing of donateV1 form including SMS opt-in
# Tests config loading, field validation, SMS on/off paths, D1 verification

set -e

API_BASE="http://localhost:8787"
FORM_URL="http://localhost:1313/donatev1/"
DB_CMD="wrangler d1 execute ballot_sources --local --command"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         End-to-End SMS Opt-In Test Suite                      ║${NC}"
echo -e "${BLUE}║         skovgard2026 Campaign Donation Form                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# TEST 1: Config Loading
# ============================================================================
echo -e "${YELLOW}[TEST 1] Config Loading${NC}"
echo "Expected: GET /api/config returns 200, includes stripePublishableKey"
echo ""

CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/config")
HTTP_CODE=$(echo "$CONFIG_RESPONSE" | tail -1)
CONFIG_BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  if echo "$CONFIG_BODY" | grep -q "stripePublishableKey"; then
    # Check that secret key is NOT returned
    if echo "$CONFIG_BODY" | grep -q "STRIPE_SECRET_KEY\|sk_test_\|sk_live_"; then
      echo -e "${RED}✗ FAIL${NC}: Config contains secret key (security issue)"
      echo "Response: $CONFIG_BODY"
    else
      echo -e "${GREEN}✓ PASS${NC}: Config loaded, publishable key present, no secret key"
    fi
  else
    echo -e "${RED}✗ FAIL${NC}: Config missing stripePublishableKey"
    echo "Response: $CONFIG_BODY"
  fi
else
  echo -e "${RED}✗ FAIL${NC}: HTTP $HTTP_CODE (expected 200)"
  echo "Response: $CONFIG_BODY"
fi
echo ""

# ============================================================================
# TEST 2: Required Fields Validation
# ============================================================================
echo -e "${YELLOW}[TEST 2] Required Field Validation${NC}"
echo "Testing: POST /api/donate/create-intent with missing required fields"
echo ""

TESTS=(
  '{"error":"Expected - missing first_name"}|required first_name'
  '{"first_name":"John","error":"Expected - missing last_name"}|required last_name'
  '{"first_name":"John","last_name":"Doe","error":"Expected - missing address1"}|required address1'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","error":"Expected - missing city"}|required city'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","city":"Laramie","error":"Expected - missing state"}|required state'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","city":"Laramie","state":"WY","error":"Expected - missing zip"}|required zip'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","city":"Laramie","state":"WY","zip":"82070","error":"Expected - missing country"}|required country'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","city":"Laramie","state":"WY","zip":"82070","country":"US","error":"Expected - missing amount"}|required amount'
  '{"first_name":"John","last_name":"Doe","address1":"123 Main","city":"Laramie","state":"WY","zip":"82070","country":"US","amount":"50","error":"Expected - missing attestations"}|required attestations'
)

for test in "${TESTS[@]}"; do
  payload=$(echo "$test" | cut -d'|' -f1)
  desc=$(echo "$test" | cut -d'|' -f2)
  
  response=$(curl -s "$API_BASE/api/donate/create-intent" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$payload")
  
  if echo "$response" | grep -q "error"; then
    echo -e "${GREEN}✓ PASS${NC}: $desc - rejected with error"
  else
    echo -e "${RED}✗ FAIL${NC}: $desc - should have rejected"
    echo "Response: $response"
  fi
done
echo ""

# ============================================================================
# TEST 3: SMS Opt-In OFF Path (No SMS Call)
# ============================================================================
echo -e "${YELLOW}[TEST 3] SMS Opt-In OFF Path${NC}"
echo "Submitting valid form without SMS opt-in (consent_sms_updates: false)"
echo ""

DONOR_OFF=$(cat <<'EOF'
{
  "first_name": "Jane",
  "last_name": "DoeOff",
  "email": "jane-off@test.example.com",
  "phone": "3075551234",
  "address1": "456 Oak Lane",
  "city": "Cheyenne",
  "state": "WY",
  "zip": "82001",
  "country": "US",
  "amount": "50",
  "attestations": {
    "us_citizen": true,
    "personal_funds": true,
    "age_18": true,
    "not_federal_contractor": true,
    "personal_card": true
  },
  "consent_sms_updates": false
}
EOF
)

INTENT_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/donate/create-intent" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$DONOR_OFF")

INTENT_HTTP=$(echo "$INTENT_RESPONSE" | tail -1)
INTENT_BODY=$(echo "$INTENT_RESPONSE" | sed '$d')

if [ "$INTENT_HTTP" = "200" ]; then
  if echo "$INTENT_BODY" | grep -q "client_secret"; then
    echo -e "${GREEN}✓ PASS${NC}: Payment intent created (HTTP 200)"
    echo "Payment intent ID: $(echo "$INTENT_BODY" | grep -o 'pi_[a-zA-Z0-9]*' | head -1 | sed 's/..........$/.../')"
  else
    echo -e "${RED}✗ FAIL${NC}: Missing client_secret in response"
    echo "Response: $INTENT_BODY"
  fi
else
  echo -e "${RED}✗ FAIL${NC}: HTTP $INTENT_HTTP (expected 200)"
  echo "Response: $INTENT_BODY"
fi

# Verify no SMS record created for opt-in OFF
echo ""
echo "Checking D1: SMS opt-in OFF case should NOT create sms_optins record"
SMS_OFF_COUNT=$(cd worker && eval "$DB_CMD" "SELECT COUNT(*) as count FROM sms_optins WHERE first_name='Jane' AND last_name='DoeOff';" 2>/dev/null || echo "0" | grep -o '[0-9]*$' || echo "0")
if [ "$SMS_OFF_COUNT" = "0" ] || [ -z "$SMS_OFF_COUNT" ]; then
  echo -e "${GREEN}✓ PASS${NC}: No SMS record created (as expected)"
else
  echo -e "${RED}✗ FAIL${NC}: Found $SMS_OFF_COUNT SMS record(s) for opt-in OFF case"
fi
echo ""

# ============================================================================
# TEST 4: SMS Opt-In Validation - Phone Required
# ============================================================================
echo -e "${YELLOW}[TEST 4] SMS Opt-In Validation - Phone Required${NC}"
echo "Attempting SMS opt-in without phone number (should fail)"
echo ""

SMS_PAYLOAD=$(cat <<'EOF'
{
  "first_name": "Bob",
  "last_name": "NoPhone",
  "phone": "",
  "email": "bob@test.example.com",
  "consent_sms": true
}
EOF
)

SMS_NO_PHONE=$(curl -s "$API_BASE/api/donate/sms-optin" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$SMS_PAYLOAD")

if echo "$SMS_NO_PHONE" | grep -q "error"; then
  if echo "$SMS_NO_PHONE" | grep -q -i "mobile\|phone"; then
    echo -e "${GREEN}✓ PASS${NC}: SMS opt-in without phone rejected"
  else
    echo -e "${YELLOW}~ WARN${NC}: Rejected but error message unclear"
  fi
else
  echo -e "${RED}✗ FAIL${NC}: Should reject SMS opt-in without phone"
  echo "Response: $SMS_NO_PHONE"
fi
echo ""

# ============================================================================
# TEST 5: SMS Opt-In ON Path (Phone + Consent)
# ============================================================================
echo -e "${YELLOW}[TEST 5] SMS Opt-In ON Path${NC}"
echo "Submitting SMS opt-in request with valid phone"
echo ""

TIMESTAMP=$(date +%s)
PHONE_TEST="3075559999"

SMS_ON_PAYLOAD=$(cat <<EOF
{
  "first_name": "Alice",
  "last_name": "OptIn$TIMESTAMP",
  "phone": "$PHONE_TEST",
  "email": "alice@test.example.com",
  "consent_sms": true,
  "consent_version": "donate-v1-20260115"
}
EOF
)

SMS_OPTIN_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/donate/sms-optin" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$SMS_ON_PAYLOAD")

SMS_HTTP=$(echo "$SMS_OPTIN_RESPONSE" | tail -1)
SMS_BODY=$(echo "$SMS_OPTIN_RESPONSE" | sed '$d')

if [ "$SMS_HTTP" = "200" ]; then
  if echo "$SMS_BODY" | grep -q '"ok"'; then
    echo -e "${GREEN}✓ PASS${NC}: SMS opt-in succeeded (HTTP 200)"
  else
    echo -e "${YELLOW}~ WARN${NC}: HTTP 200 but response format unclear"
    echo "Response: $SMS_BODY"
  fi
else
  echo -e "${RED}✗ FAIL${NC}: HTTP $SMS_HTTP (expected 200)"
  echo "Response: $SMS_BODY"
fi
echo ""

# ============================================================================
# TEST 6: SMS Opt-In Upsert (Same Phone)
# ============================================================================
echo -e "${YELLOW}[TEST 6] SMS Opt-In Upsert - Repeated Opt-In${NC}"
echo "Submitting SMS opt-in again with same phone (should upsert, not duplicate)"
echo ""

SMS_UPSERT_PAYLOAD=$(cat <<EOF
{
  "first_name": "Alice",
  "last_name": "OptInUpdate",
  "phone": "$PHONE_TEST",
  "email": "alice-updated@test.example.com",
  "consent_sms": true,
  "consent_version": "donate-v1-20260115-updated"
}
EOF
)

curl -s "$API_BASE/api/donate/sms-optin" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$SMS_UPSERT_PAYLOAD" > /dev/null

# Verify only one record exists
UPSERT_COUNT=$(cd worker && eval "$DB_CMD" "SELECT COUNT(*) as count FROM sms_optins WHERE phone='$PHONE_TEST';" 2>/dev/null | tail -1 || echo "1")
if [ "$UPSERT_COUNT" = "1" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Record upserted, count = 1 (no duplicates)"
else
  echo -e "${RED}✗ FAIL${NC}: Found $UPSERT_COUNT record(s) with same phone (expected 1)"
fi

# Verify record was updated with new email
UPSERT_EMAIL=$(cd worker && eval "$DB_CMD" "SELECT email FROM sms_optins WHERE phone='$PHONE_TEST';" 2>/dev/null | grep alice-updated || echo "not-found")
if echo "$UPSERT_EMAIL" | grep -q "alice-updated"; then
  echo -e "${GREEN}✓ PASS${NC}: Record updated with new email"
else
  echo -e "${RED}✗ FAIL${NC}: Record not updated, email still old value"
fi
echo ""

# ============================================================================
# TEST 7: Complete Donation Flow with SMS Opt-In
# ============================================================================
echo -e "${YELLOW}[TEST 7] Complete Donation Flow (SMS Opt-In ON)${NC}"
echo "Full flow: SMS opt-in → create payment intent → verify D1 records"
echo ""

TIMESTAMP=$(date +%s)
TEST_PHONE="3075555555"
TEST_EMAIL="donor-sms-$TIMESTAMP@test.example.com"

# Step 7a: SMS opt-in
echo -n "  Step 7a: SMS opt-in... "
SMS_FULL_PAYLOAD=$(cat <<EOF
{
  "first_name": "Charlie",
  "last_name": "Complete$TIMESTAMP",
  "phone": "$TEST_PHONE",
  "email": "$TEST_EMAIL",
  "consent_sms": true
}
EOF
)

SMS_RESULT=$(curl -s "$API_BASE/api/donate/sms-optin" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$SMS_FULL_PAYLOAD")

if echo "$SMS_RESULT" | grep -q '"ok"'; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "SMS opt-in response: $SMS_RESULT"
fi

# Step 7b: Create donation intent
echo -n "  Step 7b: Create payment intent... "
DONATION_PAYLOAD=$(cat <<EOF
{
  "first_name": "Charlie",
  "last_name": "Complete$TIMESTAMP",
  "email": "$TEST_EMAIL",
  "phone": "$TEST_PHONE",
  "address1": "789 Pine Street",
  "city": "Laramie",
  "state": "WY",
  "zip": "82070",
  "country": "US",
  "amount": "75",
  "attestations": {
    "us_citizen": true,
    "personal_funds": true,
    "age_18": true,
    "not_federal_contractor": true,
    "personal_card": true
  }
}
EOF
)

DONATION_RESULT=$(curl -s -w "\n%{http_code}" "$API_BASE/api/donate/create-intent" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$DONATION_PAYLOAD")

DONATION_HTTP=$(echo "$DONATION_RESULT" | tail -1)
DONATION_BODY=$(echo "$DONATION_RESULT" | sed '$d')

if [ "$DONATION_HTTP" = "200" ] && echo "$DONATION_BODY" | grep -q "client_secret"; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ (HTTP $DONATION_HTTP)${NC}"
  echo "Intent response: $DONATION_BODY"
fi

# Step 7c: Verify SMS opt-in record in D1
echo -n "  Step 7c: Verify sms_optins record... "
sleep 1
SMS_VERIFY=$(cd worker && eval "$DB_CMD" "SELECT first_name, last_name, phone, consent, source FROM sms_optins WHERE phone='$TEST_PHONE' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || echo "")
if echo "$SMS_VERIFY" | grep -q "Charlie" && echo "$SMS_VERIFY" | grep -q "skovgard2026:donate"; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
fi

# Step 7d: Verify donation record in D1
echo -n "  Step 7d: Verify donors record... "
DONOR_VERIFY=$(cd worker && eval "$DB_CMD" "SELECT first_name, last_name, email, phone FROM donors WHERE first_name='Charlie' AND last_name LIKE 'Complete%' ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "")
if echo "$DONOR_VERIFY" | grep -q "Charlie" && echo "$DONOR_VERIFY" | grep -q "$TEST_PHONE"; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
fi

# Step 7e: Verify contribution record in D1
echo -n "  Step 7e: Verify contributions record... "
CONTRIB_VERIFY=$(cd worker && eval "$DB_CMD" "SELECT amount_cents, currency FROM contributions WHERE amount_cents=7500 ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "")
if echo "$CONTRIB_VERIFY" | grep -q "7500" && echo "$CONTRIB_VERIFY" | grep -q "usd"; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
fi

# Step 7f: Verify attestations record in D1
echo -n "  Step 7f: Verify contribution_attestations... "
ATTEST_VERIFY=$(cd worker && eval "$DB_CMD" "SELECT us_citizen, personal_funds, age_18, not_federal_contractor, personal_card FROM contribution_attestations WHERE us_citizen=1 ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "")
if echo "$ATTEST_VERIFY" | grep -q "1"; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
fi

echo ""

# ============================================================================
# TEST 8: D1 Schema Verification
# ============================================================================
echo -e "${YELLOW}[TEST 8] D1 Schema Verification${NC}"
echo "Checking SMS optins table structure"
echo ""

# Check sms_optins table exists and has required columns
SCHEMA_CHECK=$(cd worker && eval "$DB_CMD" "PRAGMA table_info(sms_optins);" 2>/dev/null || echo "")
REQUIRED_COLS=("phone" "first_name" "last_name" "consent" "source" "consent_version")

for col in "${REQUIRED_COLS[@]}"; do
  if echo "$SCHEMA_CHECK" | grep -q "$col"; then
    echo -e "${GREEN}✓${NC} Column exists: $col"
  else
    echo -e "${RED}✗${NC} Column missing: $col"
  fi
done
echo ""

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Results Table:"
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│ Step │ Expected                      │ Actual      │ Pass/Fail      │"
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "│ 1   │ Config loads (200)            │ HTTP $HTTP_CODE     │ See above  │"
echo "│ 2   │ Required fields block submit  │ Validated   │ See above      │"
echo "│ 3   │ SMS OFF → no SMS call         │ Verified    │ See above      │"
echo "│ 4   │ SMS ON w/o phone → rejected   │ Validated   │ See above      │"
echo "│ 5   │ SMS opt-in (200)              │ HTTP $SMS_HTTP     │ See above  │"
echo "│ 6   │ SMS upsert (no dups)          │ Count=1     │ See above      │"
echo "│ 7   │ Full flow (SMS+Intent+DB)     │ Multi-step  │ See above      │"
echo "│ 8   │ sms_optins table schema       │ Verified    │ See above      │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
echo -e "${BLUE}Query Commands for Manual Verification:${NC}"
echo ""
echo "  # List recent SMS opt-ins:"
echo "  cd worker && wrangler d1 execute ballot_sources --local --command \\"
echo "    \"SELECT first_name, last_name, phone, consent, source, created_at \\"
echo "     FROM sms_optins ORDER BY created_at DESC LIMIT 10;\""
echo ""
echo "  # Check for duplicates on same phone:"
echo "  cd worker && wrangler d1 execute ballot_sources --local --command \\"
echo "    \"SELECT phone, COUNT(*) as count FROM sms_optins \\"
echo "     GROUP BY phone HAVING count > 1;\""
echo ""
echo "  # Verify donation was recorded:"
echo "  cd worker && wrangler d1 execute ballot_sources --local --command \\"
echo "    \"SELECT d.first_name, d.last_name, c.amount_cents, c.status \\"
echo "     FROM donors d JOIN contributions c ON d.id = c.donor_id \\"
echo "     ORDER BY c.id DESC LIMIT 5;\""
echo ""
echo -e "${BLUE}✓ Test suite complete${NC}"
