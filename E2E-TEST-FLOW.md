# End-to-End Campaign Contribution Flow Test

**Test Date**: January 15, 2026  
**Environment**: Hugo (1313) + Wrangler (8787) + D1 local  
**Form URL**: http://localhost:1313/donatev1/

---

## Step 1: Map the Flow & Verify Config Load

### Expected Flow
1. Page load → Stripe config fetches from `/api/config`
2. Form displays with validation rules
3. User fills form → Client-side validation
4. User clicks "Continue to payment" → POST to `/api/donate/create-intent`
5. Backend creates Stripe PaymentIntent → Returns `client_secret`
6. Frontend mounts Stripe Payment Element
7. User completes payment → Stripe webhook confirms
8. Redirect to success page

### Configuration Endpoint Test

**Request**:
```
GET http://localhost:8787/api/config
```

**Expected Response** (200):
```json
{
  "stripePublishableKey": "pk_test_..."
}
```

**Code Path**:
- Worker: `worker/src/index.js` lines 309-320
- Frontend fetch: `static/js/donateV1/donateV1.js` lines 108-127

**Result**: ✅ SHOULD PASS
- Worker returns config endpoint at line 309
- Returns 200 with stripePublishableKey (line 320)
- No secret key exposed ✅
- Frontend handles response properly

---

## Step 2: Form Load & Validation

### Expected Behavior

**Required Fields**:
- first_name (text)
- last_name (text)
- address1 (text)
- city (text)
- state (select)
- zip (text)
- country (select, defaults to US)
- amount (number, $1-$3,500)
- All 5 attestations (checkboxes)

**Optional Fields**:
- email (text, no required attr per FEC)
- phone (text)
- address2 (text)
- employer (text, required if amount > $200)
- occupation (text, required if amount > $200)

### Validation Rules (client-side)

**File**: `static/js/donateV1/ui.js` lines 28-47

```
- firstName: required, non-empty ✓
- lastName: required, non-empty ✓
- address1: required, non-empty ✓
- city: required, non-empty ✓
- state: required, non-empty ✓
- zip: required, non-empty ✓
- amount: required, >= 1, <= 3500 ✓
- email: IF provided, must include '@' ✓
- employer: IF amount > 200, required ✓
- occupation: IF amount > 200, required ✓
- All 5 attestations: ALL must be checked ✓
```

**Result**: ✅ SHOULD PASS
- All validation rules present in code
- Email validation conditional (line 44)
- Employer/occupation conditional (lines 45-47)

---

## Step 3: Form Submission - Valid Data

### Test Case: Submit $50 donation

**Payload Sent** (POST `/api/donate/create-intent`):
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "address1": "123 Main St",
  "address2": "",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "country": "US",
  "amount": 50,
  "attest_us_citizen": "on",
  "attest_personal_funds": "on",
  "attest_age_18": "on",
  "attest_not_federal_contractor": "on",
  "attest_personal_card": "on"
}
```

**Expected Backend Processing** (`worker/src/index.js` lines 317-432):

1. **Normalize donor fields** (line 330)
   - Trim whitespace
   - Convert to strings

2. **Validate all required fields** (lines 345-362)
   - Check: firstName, lastName, address1, city, state, zip, country, amount
   - Check amount bounds: $1-$3,500
   - Check attestations: all 5 required
   - Check conditional: if amount > $200, employer + occupation required

3. **Convert attestations** (lines 338-343 via `isAffirmative()`)
   - Accepts: true, 1, "1", "true", "on"
   - FormData sends "on" for checked boxes
   - Result: all converted to boolean true

4. **Create Stripe PaymentIntent** (lines 367-379)
   - Amount: 5000 cents ($50)
   - Metadata: email, phone, donor fields
   - Idempotency key: based on email+amount+zip+minute
   - Result: `pi_xxx...` + `client_secret`

5. **Insert records into D1** (lines 390-432)
   - donors table: name, address, contact
   - contributions table: amount, payment_intent_id, status='pending'
   - contribution_attestations table: all 5 attestations + ip + user_agent

**Expected Response** (201):
```json
{
  "clientSecret": "pi_xxx_secret_yyy",
  "paymentIntentId": "pi_xxx"
}
```

**Result**: ✅ SHOULD PASS (if Stripe keys valid)
- All validation logic present
- All database inserts ready
- Error messages user-friendly

---

## Step 4: Stripe Payment Element

### Test Case: Use Stripe test card

**Card Details**:
```
Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/30)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

**Expected Behavior**:
1. Payment Element mounts in Stripe div
2. Form fields populate from form data
3. User clicks "Pay $50"
4. Stripe processes card → Returns success
5. Webhook triggered: `/api/donate/webhook`
6. Status updated in DB: pending → succeeded_webhook

**Result**: ✅ SHOULD PASS (if webhook configured)
- Stripe element code ready in `static/js/donateV1/stripe-elements.js`
- Webhook handler ready in `worker/src/index.js` lines 433-472

---

## Step 5: Confirmation Page

### Expected Behavior

**Redirect to**: `/donatev1/thanks/`

**Page Contents** (per `layouts/donatev1/thanks.html`):
- Thank you message
- Donation amount (formatted)
- No full PII (name, address, card hidden)
- Optional: receipt email notice
- No console logs of sensitive data

**Result**: ✅ SHOULD PASS
- Thank you page exists
- JS cleanup removes PII from DOM/console

---

## Step 6: Database Verification

### After successful payment, verify D1 records

**Query 1: Donors table**
```sql
SELECT * FROM donors 
ORDER BY id DESC LIMIT 1;
```

**Expected**:
- first_name: "John"
- last_name: "Doe"
- email: "john@example.com" (or NULL if not provided)
- address1: "123 Main St"
- city: "Boston"
- state: "MA"
- zip: "02101"
- country: "US"
- employer: NULL (only if amount > $200)
- occupation: NULL (only if amount > $200)

**Query 2: Contributions table**
```sql
SELECT * FROM contributions 
ORDER BY id DESC LIMIT 1;
```

**Expected**:
- donor_id: (matches donors.id)
- amount_cents: 5000
- currency: "usd"
- payment_intent_id: "pi_xxx..."
- status: "succeeded_webhook" (after webhook) or "pending" (awaiting webhook)

**Query 3: Contribution_attestations table**
```sql
SELECT * FROM contribution_attestations 
WHERE contribution_id = ? 
ORDER BY id DESC LIMIT 1;
```

**Expected**:
- contribution_id: (matches contributions.id)
- us_citizen: 1
- personal_funds: 1
- age_18: 1
- not_federal_contractor: 1
- personal_card: 1
- ip: (user's IP address)
- user_agent: (user's browser string)

**Result**: ✅ SHOULD PASS
- All 3 tables have prepared INSERT statements
- No SQL injection risk
- Full audit trail captured

---

## Summary: Test Results Table

| Step | Expected | Actual | Pass/Fail | Evidence |
|------|----------|--------|-----------|----------|
| 1. Config Load | GET /api/config → 200 + key | (Test in browser) | ? | Worker line 309-320 |
| 2. Form Display | All fields present + validation | (Inspect form) | ? | Template + JS |
| 3. Client Validation | Reject empty required fields | (Test in form) | ? | ui.js lines 28-47 |
| 4. Submit Valid Data | POST /api/donate/create-intent → 201 + clientSecret | (Submit test data) | ? | Worker lines 317-432 |
| 5. Stripe Payment | Card accepted, redirect to /thanks | (Use test card) | ? | stripe-elements.js |
| 6. Webhook Confirmation | DB status updated to succeeded_webhook | (Check D1) | ? | Worker lines 433-472 |
| 7. DB Persistence | All 3 tables populated correctly | (Query D1) | ? | donor_id, contribution_id, attestations |

---

## How to Test (Step-by-Step Manual)

### Prerequisite: Verify servers running
```bash
# Check Hugo
curl -s http://localhost:1313/donatev1/ | head -20

# Check Worker
curl -s http://localhost:8787/api/health | jq .

# Check Worker config
curl -s http://localhost:8787/api/config | jq .
```

### Test in Browser

1. Open DevTools (F12)
2. Go to Network tab
3. Navigate to http://localhost:1313/donatev1/
4. Record all requests:
   - Should see: GET /api/config
   - Should see: 200 response with Stripe key
5. Fill form with test data
6. Submit
7. Record request:
   - POST /api/donate/create-intent
   - Payload should include all fields + attestations
   - Response should include clientSecret
8. Complete payment with 4242 4242 4242 4242
9. Confirm redirect to /donatev1/thanks/

### Test Database

```bash
# View latest donors
wrangler d1 execute ballot_sources --local --command \
  "SELECT id, first_name, last_name, email FROM donors ORDER BY id DESC LIMIT 1;"

# View latest contributions
wrangler d1 execute ballot_sources --local --command \
  "SELECT id, donor_id, amount_cents, status FROM contributions ORDER BY id DESC LIMIT 1;"

# View latest attestations
wrangler d1 execute ballot_sources --local --command \
  "SELECT * FROM contribution_attestations ORDER BY contribution_id DESC LIMIT 1;"
```

---

## Known Issues & Resolutions

### Issue: "Unable to load configuration"
**Root Cause**: Stripe key missing or fetch fails  
**Check**:
1. Verify `.dev.vars` has `STRIPE_PUBLISHABLE_KEY`
2. Test endpoint: `curl http://localhost:8787/api/config`
3. Check worker logs: `wrangler dev` output
**Fix**: If missing key, add to `.dev.vars` and restart Wrangler

### Issue: Form won't submit
**Root Cause**: Client validation failing  
**Check**:
1. Open DevTools Console
2. Verify no JS errors
3. Check all required fields have values
4. Check all 5 attestations are checked
**Fix**: Complete all required fields per validation rules

### Issue: Payment fails after form submit
**Root Cause**: Server validation or Stripe API error  
**Check**:
1. Verify response status code (should be 201)
2. Check response body for error message
3. Review worker logs for Stripe error
**Fix**: See error message from backend and verify test card is 4242 4242 4242 4242

### Issue: No webhook confirmation
**Root Cause**: Webhook secret mismatch or endpoint down  
**Check**:
1. Verify `STRIPE_WEBHOOK_SECRET` in `.dev.vars`
2. Check worker logs for webhook attempts
3. Verify contribution status in DB still pending (not succeeded_webhook)
**Fix**: Webhook may be delayed; check DB status after 10-30 seconds

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| layouts/donatev1/single.html | Form template | ✅ HTML, required attrs, optional email |
| static/js/donateV1/donateV1.js | Form orchestrator | ✅ Config load, validation, intent creation |
| static/js/donateV1/ui.js | Validation logic | ✅ Conditional email/employer validation |
| static/js/donateV1/stripe-elements.js | Stripe integration | ✅ Payment Element mounting |
| worker/src/index.js | Backend API | ✅ Config, validation, Stripe, DB inserts |
| worker/.dev.vars | Env vars | ⏳ Must have Stripe keys |
| worker/wrangler.toml | Worker config | ✅ D1 binding present |

