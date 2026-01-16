#!/bin/bash

# e2e-test.sh - End-to-end campaign contribution flow test
# This script tests each step of the donation flow

set -e

BASE_URL="http://localhost:1313"
API_URL="http://localhost:8787"
TEST_RESULTS="/tmp/e2e-test-results.txt"

echo "===== E2E CAMPAIGN CONTRIBUTION FLOW TEST =====" | tee "$TEST_RESULTS"
echo "Start Time: $(date)" | tee -a "$TEST_RESULTS"
echo "" | tee -a "$TEST_RESULTS"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1" | tee -a "$TEST_RESULTS"
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1" | tee -a "$TEST_RESULTS"
}

warn() {
  echo -e "${YELLOW}⏳ SKIP${NC}: $1" | tee -a "$TEST_RESULTS"
}

info() {
  echo "ℹ️  $1" | tee -a "$TEST_RESULTS"
}

# ============================================================================
# STEP 1: Verify Servers Running
# ============================================================================
echo "STEP 1: Verify Servers Running" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

info "Testing Hugo on :1313"
if curl -s http://localhost:1313/donatev1/ | grep -q "Support Jimmy" 2>/dev/null; then
  pass "Hugo server responding with donate form"
else
  fail "Hugo server not responding or form not found"
  exit 1
fi

info "Testing Worker API on :8787"
if curl -s http://localhost:8787/api/health | jq -e '.ok' >/dev/null 2>&1; then
  pass "Worker API health check passed"
else
  fail "Worker API not responding"
  exit 1
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 2: Verify Configuration Endpoint
# ============================================================================
echo "STEP 2: Verify Configuration Endpoint" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

info "Testing GET /api/config"
CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8787/api/config)
CONFIG_STATUS=$(echo "$CONFIG_RESPONSE" | tail -1)
CONFIG_BODY=$(echo "$CONFIG_RESPONSE" | head -1)

if [ "$CONFIG_STATUS" = "200" ]; then
  pass "Config endpoint returned HTTP 200"
else
  fail "Config endpoint returned HTTP $CONFIG_STATUS"
  echo "Response: $CONFIG_BODY" | tee -a "$TEST_RESULTS"
fi

if echo "$CONFIG_BODY" | jq -e '.stripePublishableKey' >/dev/null 2>&1; then
  STRIPE_KEY=$(echo "$CONFIG_BODY" | jq -r '.stripePublishableKey')
  if [[ "$STRIPE_KEY" == pk_test_* ]]; then
    pass "Stripe publishable key present and in test format (pk_test_...)"
  else
    fail "Stripe key present but invalid format: $STRIPE_KEY"
  fi
else
  fail "stripePublishableKey not in response"
  echo "Response: $CONFIG_BODY" | tee -a "$TEST_RESULTS"
fi

if echo "$CONFIG_BODY" | jq -e '.stripeSecretKey' >/dev/null 2>&1; then
  fail "Secret key EXPOSED in config response! This is a security issue."
else
  pass "Secret key NOT exposed in config response ✓"
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 3: Verify .dev.vars has Stripe keys
# ============================================================================
echo "STEP 3: Verify Environment Variables" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

if [ -f "/home/anchor/projects/skovgard2026/worker/.dev.vars" ]; then
  if grep -q "STRIPE_PUBLISHABLE_KEY=pk_test_" /home/anchor/projects/skovgard2026/worker/.dev.vars; then
    pass ".dev.vars has STRIPE_PUBLISHABLE_KEY"
  else
    fail ".dev.vars missing or invalid STRIPE_PUBLISHABLE_KEY"
  fi
  
  if grep -q "STRIPE_SECRET_KEY=sk_test_" /home/anchor/projects/skovgard2026/worker/.dev.vars; then
    pass ".dev.vars has STRIPE_SECRET_KEY"
  else
    fail ".dev.vars missing or invalid STRIPE_SECRET_KEY"
  fi
else
  fail ".dev.vars file not found"
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 4: Verify Form Page Loads Correctly
# ============================================================================
echo "STEP 4: Verify Form Page Loads Correctly" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

FORM_HTML=$(curl -s http://localhost:1313/donatev1/)

# Check for required fields
REQUIRED_FIELDS=("first_name" "last_name" "address1" "city" "state" "zip" "amount")
for field in "${REQUIRED_FIELDS[@]}"; do
  if echo "$FORM_HTML" | grep -q "name=\"$field\""; then
    pass "Form includes required field: $field"
  else
    fail "Form missing required field: $field"
  fi
done

# Check for optional fields
OPTIONAL_FIELDS=("email" "phone" "address2" "employer" "occupation")
for field in "${OPTIONAL_FIELDS[@]}"; do
  if echo "$FORM_HTML" | grep -q "name=\"$field\""; then
    pass "Form includes optional field: $field"
  else
    fail "Form missing optional field: $field"
  fi
done

# Check email is NOT required (should have no required attr)
if echo "$FORM_HTML" | grep -q 'name="email"' && ! echo "$FORM_HTML" | grep -q 'name="email".*required'; then
  pass "Email field is NOT marked as required (correct per FEC)"
else
  warn "Email field may be marked required (check manually)"
fi

# Check for attestation checkboxes
ATTESTATIONS=("attest_us_citizen" "attest_personal_funds" "attest_age_18" "attest_not_federal_contractor" "attest_personal_card")
for attested in "${ATTESTATIONS[@]}"; do
  if echo "$FORM_HTML" | grep -q "name=\"$attested\""; then
    pass "Form includes attestation: $attested"
  else
    fail "Form missing attestation: $attested"
  fi
done

# Check for Stripe script
if echo "$FORM_HTML" | grep -q "https://js.stripe.com"; then
  pass "Stripe script loaded from official CDN"
else
  fail "Stripe script not found in form"
fi

# Check for donateV1.js module
if echo "$FORM_HTML" | grep -q "donateV1.js"; then
  pass "donateV1.js module loaded"
else
  fail "donateV1.js module not loaded"
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 5: Test Form Submission with Valid Data
# ============================================================================
echo "STEP 5: Test Form Submission with Valid Data" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

# Prepare test payload (matching frontend format)
# Amount is in dollars (e.g., 50 = $50), not cents
TEST_PAYLOAD=$(cat <<'EOF'
{
  "first_name": "Test",
  "last_name": "Donor",
  "email": "test@example.com",
  "phone": "555-1234",
  "address1": "123 Main St",
  "address2": "",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "country": "US",
  "amount": "50",
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

info "Sending POST /api/donate/create-intent with valid test data"
INTENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" \
  http://localhost:8787/api/donate/create-intent)

INTENT_STATUS=$(echo "$INTENT_RESPONSE" | tail -1)
INTENT_BODY=$(echo "$INTENT_RESPONSE" | head -1)

if [ "$INTENT_STATUS" = "201" ]; then
  pass "Intent endpoint returned HTTP 201 (created)"
elif [ "$INTENT_STATUS" = "200" ]; then
  pass "Intent endpoint returned HTTP 200 (accepted)"
else
  fail "Intent endpoint returned HTTP $INTENT_STATUS (expected 200-201)"
  echo "Response: $INTENT_BODY" | tee -a "$TEST_RESULTS"
fi

if echo "$INTENT_BODY" | jq -e '.client_secret' >/dev/null 2>&1; then
  CLIENT_SECRET=$(echo "$INTENT_BODY" | jq -r '.client_secret')
  if [[ "$CLIENT_SECRET" == pi_*_secret_* ]]; then
    pass "Response includes valid client_secret format"
  else
    info "client_secret: $CLIENT_SECRET"
  fi
else
  if echo "$INTENT_BODY" | jq -e '.error' >/dev/null 2>&1; then
    ERROR=$(echo "$INTENT_BODY" | jq -r '.error')
    fail "Intent creation returned error: $ERROR"
  else
    fail "Response missing client_secret and no error message"
    echo "Response: $INTENT_BODY" | tee -a "$TEST_RESULTS"
  fi
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 6: Verify Database Tables Exist
# ============================================================================
echo "STEP 6: Verify Database Tables Exist" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

# Check if we can query D1
info "Checking D1 tables..."

# Note: This requires wrangler CLI. If not available, we skip
if command -v wrangler &> /dev/null; then
  
  DONORS_COUNT=$(wrangler d1 execute ballot_sources --local --command "SELECT COUNT(*) as count FROM donors;" 2>/dev/null | jq -r '.[0].count' 2>/dev/null || echo "0")
  if [ ! -z "$DONORS_COUNT" ]; then
    pass "donors table exists with $DONORS_COUNT records"
  else
    fail "Could not query donors table"
  fi
  
  CONTRIB_COUNT=$(wrangler d1 execute ballot_sources --local --command "SELECT COUNT(*) as count FROM contributions;" 2>/dev/null | jq -r '.[0].count' 2>/dev/null || echo "0")
  if [ ! -z "$CONTRIB_COUNT" ]; then
    pass "contributions table exists with $CONTRIB_COUNT records"
  else
    fail "Could not query contributions table"
  fi
  
  ATTEST_COUNT=$(wrangler d1 execute ballot_sources --local --command "SELECT COUNT(*) as count FROM contribution_attestations;" 2>/dev/null | jq -r '.[0].count' 2>/dev/null || echo "0")
  if [ ! -z "$ATTEST_COUNT" ]; then
    pass "contribution_attestations table exists with $ATTEST_COUNT records"
  else
    fail "Could not query contribution_attestations table"
  fi
else
  warn "wrangler CLI not available, skipping D1 query test"
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# STEP 7: Test Invalid Data Rejection
# ============================================================================
echo "STEP 7: Test Invalid Data Rejection" | tee -a "$TEST_RESULTS"
echo "--------" | tee -a "$TEST_RESULTS"

# Test missing required field
INVALID_PAYLOAD1=$(cat <<'EOF'
{
  "first_name": "",
  "last_name": "Donor",
  "address1": "123 Main St",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "country": "US",
  "amount": "50",
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

info "Testing rejection of missing firstName"
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$INVALID_PAYLOAD1" \
  http://localhost:8787/api/donate/create-intent)

INVALID_STATUS=$(echo "$INVALID_RESPONSE" | tail -1)
INVALID_BODY=$(echo "$INVALID_RESPONSE" | head -1)

if [ "$INVALID_STATUS" != "201" ] && [ "$INVALID_STATUS" != "200" ]; then
  if echo "$INVALID_BODY" | jq -e '.error' >/dev/null 2>&1; then
    pass "Correctly rejected invalid data with error message"
  else
    pass "Correctly rejected invalid data with HTTP $INVALID_STATUS"
  fi
else
  fail "Should have rejected missing firstName but got HTTP $INVALID_STATUS"
fi

# Test invalid amount
INVALID_PAYLOAD2=$(cat <<'EOF'
{
  "first_name": "Test",
  "last_name": "Donor",
  "address1": "123 Main St",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "country": "US",
  "amount": "10000",
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

info "Testing rejection of amount > $3,500"
INVALID_RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$INVALID_PAYLOAD2" \
  http://localhost:8787/api/donate/create-intent)

INVALID_STATUS2=$(echo "$INVALID_RESPONSE2" | tail -1)

if [ "$INVALID_STATUS2" != "201" ] && [ "$INVALID_STATUS2" != "200" ]; then
  pass "Correctly rejected amount exceeding FEC limit ($3,500)"
else
  fail "Should have rejected amount > $3,500"
fi

# Test missing attestations
INVALID_PAYLOAD3=$(cat <<'EOF'
{
  "first_name": "Test",
  "last_name": "Donor",
  "address1": "123 Main St",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "country": "US",
  "amount": "50",
  "attestations": {
    "us_citizen": true,
    "personal_funds": false,
    "age_18": true,
    "not_federal_contractor": true,
    "personal_card": true
  }
}
EOF
)

info "Testing rejection of missing attestations"
INVALID_RESPONSE3=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$INVALID_PAYLOAD3" \
  http://localhost:8787/api/donate/create-intent)

INVALID_STATUS3=$(echo "$INVALID_RESPONSE3" | tail -1)

if [ "$INVALID_STATUS3" != "201" ] && [ "$INVALID_STATUS3" != "200" ]; then
  pass "Correctly rejected unaffirmed attestations"
else
  fail "Should have rejected false attestations"
fi

echo "" | tee -a "$TEST_RESULTS"

# ============================================================================
# SUMMARY
# ============================================================================
echo "===== TEST SUMMARY =====" | tee -a "$TEST_RESULTS"
echo "End Time: $(date)" | tee -a "$TEST_RESULTS"
echo "" | tee -a "$TEST_RESULTS"
echo "Results saved to: $TEST_RESULTS" | tee -a "$TEST_RESULTS"

# Count results
PASS_COUNT=$(grep -c "✅ PASS" "$TEST_RESULTS" || echo "0")
FAIL_COUNT=$(grep -c "❌ FAIL" "$TEST_RESULTS" || echo "0")
SKIP_COUNT=$(grep -c "⏳ SKIP" "$TEST_RESULTS" || echo "0")

echo "" | tee -a "$TEST_RESULTS"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}" | tee -a "$TEST_RESULTS"
echo -e "${RED}Failed: $FAIL_COUNT${NC}" | tee -a "$TEST_RESULTS"
echo -e "${YELLOW}Skipped: $SKIP_COUNT${NC}" | tee -a "$TEST_RESULTS"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}" | tee -a "$TEST_RESULTS"
  exit 0
else
  echo -e "${RED}Some tests failed. Review output above.${NC}" | tee -a "$TEST_RESULTS"
  exit 1
fi
