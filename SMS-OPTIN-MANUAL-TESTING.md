# SMS Opt-In Auto-Check Issue - Manual Testing & Diagnosis

**Status:** 🔍 INVESTIGATING  
**Issue:** Checkbox remains unchecked (false) after phone field is filled  
**Expected:** Checkbox should auto-check when valid phone is entered and field loses focus

---

## Test Procedure

### Step 1: Open the form
```
Navigate to: http://localhost:1313/donatev1/
Open DevTools (F12) → Console tab
```

### Step 2: Check initial state
```javascript
// Copy and paste in console:
document.getElementById('phone').value
document.getElementById('consent_sms_updates').checked
document.getElementById('sms-consent-hint').classList.contains('is-hidden')

// Expected output:
// "(empty)" or ""
// false
// true (hint should be hidden)
```

### Step 3: Check if event listeners are attached
```javascript
// Run in console:
const phoneInput = document.getElementById('phone');

// Check if blur listener exists by looking at the value
phoneInput.value = '307-555-0100';
console.log('Phone filled with: 307-555-0100');
console.log('Listeners attached: ', phoneInput.onblur || 'checking...');

// Now trigger blur manually
phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
```

### Step 4: Check checkbox after blur
```javascript
// In console right after blur:
const smsCheckbox = document.getElementById('consent_sms_updates');
console.log('SMS checkbox checked:', smsCheckbox.checked);
console.log('SMS checkbox.checked value:', smsCheckbox.checked ? 'TRUE' : 'FALSE');
```

### Step 5: If checkbox NOT checked, debug the validation
```javascript
// Check if validation function works:
const phoneValue = '307-555-0100';
const digits = phoneValue.replace(/\D/g, '');
console.log('Entered phone:', phoneValue);
console.log('Extracted digits:', digits);
console.log('Digit count:', digits.length);
console.log('Is valid (>=10):', digits.length >= 10);

// This should return:
// Digit count: 10
// Is valid (>=10): true
```

---

## Debugging Checklist

### ✓ Test 1: Phone Value Extraction
```javascript
// Does the phone regex work?
const testPhone = '307-555-0100';
const digits = testPhone.replace(/\D/g, '');
console.log(digits); // Should be: 3075550100 (10 digits)
```
**Expected:** 10 digits extracted  
**If failing:** Phone number format issue

---

### ✓ Test 2: Validation Function
```javascript
// Is the isValidSmsPhone function available?
// (This is defined in donateV1.js)
// Try calling it indirectly:

const phoneInput = document.getElementById('phone');
phoneInput.value = '307-555-0100';
const digits = phoneInput.value.replace(/\D/g, '');
const isValid = digits.length >= 10;
console.log('Is valid:', isValid); // Should be: true
```
**Expected:** true for valid phone  
**If false:** Phone validation logic broken

---

### ✓ Test 3: Event Listener Attachment
```javascript
// Check if blur listener fires:
const phoneInput = document.getElementById('phone');

// Add a test listener to verify blur fires
phoneInput.addEventListener('blur', () => {
  console.log('✓ Blur event fired!');
});

// Trigger blur
phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
```
**Expected:** "✓ Blur event fired!" in console  
**If not:** Event not propagating

---

### ✓ Test 4: Checkbox State Change
```javascript
// Manually set checkbox and dispatch event
const smsCheckbox = document.getElementById('consent_sms_updates');

// Before
console.log('Before - checked:', smsCheckbox.checked);

// Set and dispatch
smsCheckbox.checked = true;
smsCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

// After
console.log('After - checked:', smsCheckbox.checked);

// Check hint
const hint = document.getElementById('sms-consent-hint');
console.log('Hint hidden:', hint.classList.contains('is-hidden'));
```
**Expected:** 
- checked: true
- Hint hidden: false (hint should be visible)

---

### ✓ Test 5: Complete Flow Test
```javascript
// Full simulation of what should happen:

const phoneInput = document.getElementById('phone');
const smsCheckbox = document.getElementById('consent_sms_updates');
const smsHint = document.getElementById('sms-consent-hint');

console.log('=== Starting Full Flow Test ===\n');

// 1. Initial state
console.log('1. Initial state:');
console.log('   Phone:', phoneInput.value || '(empty)');
console.log('   SMS checked:', smsCheckbox.checked);
console.log('   Hint hidden:', smsHint.classList.contains('is-hidden'));

// 2. Fill phone
phoneInput.value = '307-555-0100';
console.log('\n2. After filling phone:');
console.log('   Phone:', phoneInput.value);
console.log('   SMS checked:', smsCheckbox.checked, '(should still be false)');

// 3. Trigger blur
phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
console.log('\n3. After blur event:');
console.log('   Phone:', phoneInput.value);
console.log('   SMS checked:', smsCheckbox.checked, '(should be TRUE now)');
console.log('   Hint hidden:', smsHint.classList.contains('is-hidden'), '(should be FALSE)');

// 4. Check the change listener fired
setTimeout(() => {
  console.log('\n4. After slight delay:');
  console.log('   SMS checked:', smsCheckbox.checked);
  console.log('   Hint hidden:', smsHint.classList.contains('is-hidden'));
  
  if (!smsCheckbox.checked) {
    console.log('\n❌ PROBLEM: Checkbox did not auto-check!');
  } else {
    console.log('\n✓ SUCCESS: Checkbox auto-checked!');
  }
}, 100);
```

---

## Possible Issues & Solutions

### Issue 1: Validation Function Not Defined
**Symptom:** `isValidSmsPhone is not defined` error  
**Cause:** Function defined in module but not accessible globally  
**Solution:** Check that function is defined before listener setup

---

### Issue 2: Event Listener Not Attached
**Symptom:** `handlePhoneCheck` doesn't run on blur  
**Cause:** Listener not registered, or phoneInput element is null  
**Solution:** Verify element exists and listener is attached

---

### Issue 3: Event Not Bubbling
**Symptom:** dispatchEvent('blur') doesn't trigger listener  
**Cause:** Listener setup issue or event bubbling prevented  
**Solution:** Check event listener registration

---

### Issue 4: Checkbox Not Updating Visually
**Symptom:** `checkbox.checked` is true but box doesn't appear checked  
**Cause:** CSS display issue or element reference wrong  
**Solution:** Check form state vs visual state

---

## Manual Browser Testing

### Steps:
1. Open http://localhost:1313/donatev1/ in browser
2. Right-click on SMS opt-in checkbox → Inspect
3. Note the element ID and current state
4. Scroll to phone field
5. Click phone field
6. Type: `307-555-0100`
7. Press Tab (triggers blur)
8. Check if SMS checkbox is now checked
9. If NOT checked, open console and run debug tests above

### Visual Indicators:
- ✓ Checkbox should have checkmark
- ✓ Hint text should appear below checkbox
- ✓ Phone field should have no error

---

## File References

**Main File:** `/home/anchor/projects/skovgard2026/static/js/donateV1/donateV1.js`

**Key Functions:**
- `phoneDigits()` - Line 111
- `isValidSmsPhone()` - Line 115  
- `handlePhoneCheck()` - Line 219-235
- SMS consent listener - Line 204-216

**Key Elements:**
- Phone input: `id="phone"`
- SMS checkbox: `id="consent_sms_updates"`
- SMS hint: `id="sms-consent-hint"`

---

## Test Execution Commands (Console)

Copy and run these in console one at a time:

```javascript
// Test 1: Element existence
[
  document.getElementById('phone'),
  document.getElementById('consent_sms_updates'),
  document.getElementById('sms-consent-hint')
].map(el => el ? '✓' : '✗')

// Test 2: Initial state
{
  phone: document.getElementById('phone').value,
  checked: document.getElementById('consent_sms_updates').checked,
  hintHidden: document.getElementById('sms-consent-hint').classList.contains('is-hidden')
}

// Test 3: Fill and blur
(() => {
  const p = document.getElementById('phone');
  p.value = '307-555-0100';
  p.dispatchEvent(new Event('blur', { bubbles: true }));
})()

// Test 4: Check result
{
  phone: document.getElementById('phone').value,
  checked: document.getElementById('consent_sms_updates').checked,
  hintHidden: document.getElementById('sms-consent-hint').classList.contains('is-hidden')
}
```

---

## Report Template

After running tests, fill in:

```
Test Date: ___________
Browser: ____________
Phone Value Entered: ___________
Validation Result: ___________
Checkbox Checked After Blur: ___________
Hint Visible: ___________
Errors in Console: ___________
```

---

## Next Steps Based on Results

### If checkbox DOES auto-check:
✓ Issue is RESOLVED  
✓ Feature working as expected

### If checkbox does NOT auto-check:
1. Check console for JavaScript errors
2. Run Test 1-5 above to isolate issue
3. Check if blur event fires
4. Check if validation passes
5. Check if listener exists
6. Report findings with error messages

