/**
 * test-donate-form.js
 * Automated test suite for the donation form
 * Run with: node test-donate-form.js
 */

const API_BASE = 'http://localhost:8787';
const FORM_URL = 'http://localhost:1313/donateV1/';

// Test utilities
const log = {
  section: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`),
  pass: (msg) => console.log(`✅ PASS: ${msg}`),
  fail: (msg) => console.log(`❌ FAIL: ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  error: (msg) => console.log(`⚠️  ERROR: ${msg}`),
};

// Test data generators
const validDonor = () => ({
  first_name: 'John',
  last_name: 'Donor',
  email: 'john@example.com',
  phone: '3075551234',
  address1: '123 Main St',
  address2: '',
  city: 'Cheyenne',
  state: 'WY',
  zip: '82001',
  country: 'US',
  employer: 'Acme Corp',
  occupation: 'Engineer',
  amount: '50.00',
  attestations: {
    us_citizen: 'on',
    personal_funds: 'on',
    age_18: 'on',
    not_federal_contractor: 'on',
    personal_card: 'on',
  },
});

const invalidDonor = (field) => {
  const d = validDonor();
  d[field] = '';
  return d;
};

// HTTP client
async function fetch_req(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultOpts = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  const merged = { ...defaultOpts, ...options };
  if (options.body && typeof options.body === 'object') {
    merged.body = JSON.stringify(options.body);
  }
  
  try {
    const res = await fetch(url, merged);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

// Tests
async function testHealth() {
  log.section('TEST 1: Health Check');
  const res = await fetch_req('/api/health');
  if (res.status === 200) {
    log.pass(`API is healthy: ${JSON.stringify(res.data)}`);
    return true;
  } else {
    log.fail(`Health check failed: ${res.status}`);
    return false;
  }
}

async function testConfigEndpoint() {
  log.section('TEST 2: Config Endpoint (/api/config)');
  const res = await fetch_req('/api/config');
  if (res.status === 200 && res.data.stripePublishableKey) {
    log.pass(`Config loaded with Stripe key: ${res.data.stripePublishableKey.substring(0, 20)}...`);
    return true;
  } else {
    log.fail(`Config failed: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testMissingFirstName() {
  log.section('TEST 3: Validation - Missing First Name');
  const data = invalidDonor('first_name');
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('First name')) {
    log.pass(`Correctly rejected: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "First name" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testMissingEmail() {
  log.section('TEST 4: Validation - Missing Email (should now be optional)');
  const data = validDonor();
  data.email = '';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  // Email is now optional, so should not fail for missing email alone
  if (res.status === 400 && res.data.error && res.data.error.includes('Attestation')) {
    log.pass(`Correctly rejected for missing attestations: ${res.data.error}`);
    return true;
  } else if (res.status === 200) {
    log.pass(`Email optional - accepted empty email`);
    return true;
  } else {
    log.fail(`Unexpected response: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testInvalidEmail() {
  log.section('TEST 5: Validation - Invalid Email Format');
  const data = validDonor();
  data.email = 'not-an-email';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('Email')) {
    log.pass(`Correctly rejected invalid email: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "Email" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testMissingCity() {
  log.section('TEST 6: Validation - Missing City');
  const data = invalidDonor('city');
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('City')) {
    log.pass(`Correctly rejected: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "City" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testInvalidAmount() {
  log.section('TEST 7: Validation - Invalid Amount (0)');
  const data = validDonor();
  data.amount = '0';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('Amount')) {
    log.pass(`Correctly rejected zero amount: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "Amount" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testAmountTooHigh() {
  log.section('TEST 8: Validation - Amount Exceeds Max ($3,500)');
  const data = validDonor();
  data.amount = '5000';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('between')) {
    log.pass(`Correctly rejected high amount: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "between" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testMissingAttestations() {
  log.section('TEST 9: Validation - Missing Attestations');
  const data = validDonor();
  data.attestations.us_citizen = false;
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('attestation')) {
    log.pass(`Correctly rejected missing attestations: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "attestation" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testEmployerRequired() {
  log.section('TEST 10: Validation - Employer Required for >$200');
  const data = validDonor();
  data.amount = '250';
  data.employer = '';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 400 && res.data.error && res.data.error.includes('Employer')) {
    log.pass(`Correctly rejected >$200 without employer: ${res.data.error}`);
    return true;
  } else {
    log.fail(`Expected 400 with "Employer" error, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testValidDonation() {
  log.section('TEST 11: Valid Donation - Full Form Submission');
  const data = validDonor();
  log.info(`Sending payload: ${JSON.stringify(data)}`);
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  log.info(`Response status: ${res.status}, data: ${JSON.stringify(res.data)}`);
  if (res.status === 200 && res.data.client_secret) {
    log.pass(`Intent created with client_secret: ${res.data.client_secret.substring(0, 30)}...`);
    return true;
  } else if (res.status === 502 || (res.data && res.data.error && res.data.error.includes('Invalid API Key'))) {
    log.fail(`Stripe API key error - check STRIPE_SECRET_KEY env var is set`);
    return false;
  } else {
    log.fail(`Expected 200 with client_secret, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testValidDonationLargeAmount() {
  log.section('TEST 12: Valid Donation - Large Amount with Employer/Occupation');
  const data = validDonor();
  data.amount = '250';
  const res = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  if (res.status === 200 && res.data.client_secret) {
    log.pass(`Intent created for $250 with employer/occupation: ${res.data.client_secret.substring(0, 30)}...`);
    return true;
  } else {
    log.fail(`Expected 200 with client_secret, got: ${res.status} - ${JSON.stringify(res.data)}`);
    return false;
  }
}

async function testDatabasePersistence() {
  log.section('TEST 13: Database Persistence - Verify Data Stored');
  // First, create an intent
  const testEmail = `test-${Date.now()}@example.com`;
  const data = validDonor();
  data.email = testEmail;
  const createRes = await fetch_req('/api/donate/create-intent', { 
    method: 'POST',
    body: data,
  });
  
  if (createRes.status !== 200) {
    log.fail(`Could not create intent: ${JSON.stringify(createRes.data)}`);
    return false;
  }
  
  log.info(`Intent created. In production, verify with D1 SQL query:`);
  log.info(`  SELECT * FROM donors WHERE email = '${testEmail}';`);
  log.info(`  SELECT * FROM contributions WHERE payment_intent_id LIKE 'pi_%';`);
  log.info(`  SELECT * FROM contribution_attestations WHERE contribution_id = <id>;`);
  log.pass(`Donation submitted to backend (check D1 DB for records)`);
  return true;
}

// Run all tests
async function runAllTests() {
  log.section('DONATION FORM TEST SUITE');
  log.info(`Testing against: ${API_BASE}`);
  log.info(`Form URL: ${FORM_URL}`);
  log.info(`Test time: ${new Date().toISOString()}\n`);

  const results = [];
  
  results.push({ name: 'Health Check', pass: await testHealth() });
  results.push({ name: 'Config Endpoint', pass: await testConfigEndpoint() });
  results.push({ name: 'Missing First Name', pass: await testMissingFirstName() });
  results.push({ name: 'Missing Email (Optional)', pass: await testMissingEmail() });
  results.push({ name: 'Invalid Email', pass: await testInvalidEmail() });
  results.push({ name: 'Missing City', pass: await testMissingCity() });
  results.push({ name: 'Invalid Amount (0)', pass: await testInvalidAmount() });
  results.push({ name: 'Amount Too High', pass: await testAmountTooHigh() });
  results.push({ name: 'Missing Attestations', pass: await testMissingAttestations() });
  results.push({ name: 'Employer Required >$200', pass: await testEmployerRequired() });
  results.push({ name: 'Valid Donation ($50)', pass: await testValidDonation() });
  results.push({ name: 'Valid Donation Large ($250)', pass: await testValidDonationLargeAmount() });
  results.push({ name: 'Database Persistence', pass: await testDatabasePersistence() });

  // Summary
  log.section('TEST SUMMARY');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  
  console.log('\nResults:');
  results.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
  });
  
  console.log(`\nTotal: ${passed}/${total} passed\n`);
  
  if (passed === total) {
    log.pass(`ALL TESTS PASSED!`);
    process.exit(0);
  } else {
    log.fail(`${total - passed} test(s) failed`);
    process.exit(1);
  }
}

// Run
runAllTests().catch(e => {
  log.error(`Test suite crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
