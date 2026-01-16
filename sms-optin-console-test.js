// SMS Opt-In Debug Test - Paste this entire block into DevTools Console

console.clear();
console.log('%c🔍 SMS Opt-In Auto-Check Diagnostic', 'font-size: 16px; font-weight: bold; color: #0066cc;');
console.log('');

// Get elements
const phoneInput = document.getElementById('phone');
const smsCheckbox = document.getElementById('consent_sms_updates');
const smsHint = document.getElementById('sms-consent-hint');

// Test 1: Elements exist
console.log('%c1. DOM Element Check', 'font-weight: bold; color: #333;');
const elementsOK = phoneInput && smsCheckbox && smsHint;
console.log(`   Phone input: ${phoneInput ? '✓' : '✗'}`);
console.log(`   SMS checkbox: ${smsCheckbox ? '✓' : '✗'}`);
console.log(`   SMS hint: ${smsHint ? '✓' : '✗'}`);
if (!elementsOK) {
  console.error('❌ ERROR: One or more elements not found!');
  throw new Error('Elements missing');
}

// Test 2: Initial state
console.log('');
console.log('%c2. Initial State', 'font-weight: bold; color: #333;');
console.log(`   Phone value: "${phoneInput.value || '(empty)'}"`);
console.log(`   SMS checkbox.checked: ${smsCheckbox.checked}`);
console.log(`   Hint is-hidden: ${smsHint.classList.contains('is-hidden')}`);

// Test 3: Validation test
console.log('');
console.log('%c3. Phone Validation Test', 'font-weight: bold; color: #333;');
const testPhones = ['307-555-0100', '3075550100', '307 555 0100', '1234567890'];
testPhones.forEach(phone => {
  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length >= 10;
  console.log(`   "${phone}" → ${digits} → ${isValid ? '✓' : '✗'}`);
});

// Test 4: Fill phone and trigger blur
console.log('');
console.log('%c4. Simulating Phone Fill → Blur', 'font-weight: bold; color: #333;');
console.log('   Setting phone value to: 307-555-0100');
phoneInput.value = '307-555-0100';
console.log(`   Dispatching blur event...`);
phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));

// Test 5: Check result immediately
console.log('');
console.log('%c5. Result (Immediate)', 'font-weight: bold; color: #333;');
console.log(`   Phone value: "${phoneInput.value}"`);
console.log(`   SMS checkbox.checked: ${smsCheckbox.checked}`);
console.log(`   Hint is-hidden: ${smsHint.classList.contains('is-hidden')}`);

// Test 6: Check result after small delay (for async operations)
setTimeout(() => {
  console.log('');
  console.log('%c6. Result (After 100ms Delay)', 'font-weight: bold; color: #333;');
  console.log(`   Phone value: "${phoneInput.value}"`);
  console.log(`   SMS checkbox.checked: ${smsCheckbox.checked}`);
  console.log(`   Hint is-hidden: ${smsHint.classList.contains('is-hidden')}`);
  
  // Final verdict
  console.log('');
  if (smsCheckbox.checked && !smsHint.classList.contains('is-hidden')) {
    console.log('%c✓ SUCCESS: SMS Opt-In Auto-Check is WORKING', 'font-size: 14px; font-weight: bold; color: #00aa00;');
  } else {
    console.log('%c❌ FAILURE: SMS Opt-In Auto-Check is NOT WORKING', 'font-size: 14px; font-weight: bold; color: #aa0000;');
    console.log('');
    console.log('%cDiagnostic Info:', 'font-weight: bold; color: #333;');
    console.log(`   Checkbox checked: ${smsCheckbox.checked} (expected: true)`);
    console.log(`   Hint hidden: ${smsHint.classList.contains('is-hidden')} (expected: false)`);
    console.log('');
    console.log('%cPossible Issues:', 'font-weight: bold; color: #333;');
    console.log('   1. handlePhoneCheck() not running on blur');
    console.log('   2. isValidSmsPhone() returning false');
    console.log('   3. smsConsentInput.dispatchEvent() not working');
    console.log('   4. SMS consent change listener not attached');
  }
}, 100);
