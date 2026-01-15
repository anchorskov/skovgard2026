// static/js/donateV1/donateV1.js

import { API_URL } from "../env.js";
import { readFormData, validateDonation, setStatus } from "./ui.js";
import { initStripe, mountPaymentElement, confirmPayment } from "./stripe-elements.js";

const form = document.getElementById("donate-v1-form");
const statusEl = document.getElementById("donate-v1-status");
const errorSummaryEl = document.getElementById("donate-v1-errors");
const paymentSection = document.getElementById("donate-v1-payment");
const submitButton = document.getElementById("donate-v1-submit");
const amountInput = document.getElementById("amount");
const phoneInput = document.getElementById("phone");
const smsConsentInput = document.getElementById("consent_sms_updates");
const smsConsentHint = document.getElementById("sms-consent-hint");

let stripe = null;

let elements = null;
let clientSecret = "";

const requiredFields = [
  { id: "first-name", label: "First name" },
  { id: "last-name", label: "Last name" },
  { id: "address1", label: "Address line 1" },
  { id: "city", label: "City" },
  { id: "state", label: "State" },
  { id: "zip", label: "ZIP" },
  { id: "country", label: "Country" },
];

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = Boolean(isLoading);
}

function showPaymentSection() {
  if (!paymentSection) return;
  paymentSection.classList.remove("is-hidden");
}

function lockDonorFields() {
  if (!form) return;
  const fields = form.querySelectorAll("input, select");
  fields.forEach((field) => {
    if (field.id === "amount") return;
    if (field.type === "checkbox") return;
    field.readOnly = true;
  });
  if (amountInput) amountInput.readOnly = true;
}

function getFieldContainer(field) {
  if (!field) return null;
  return field.closest(".field");
}

function ensureErrorEl(container) {
  if (!container) return null;
  let errorEl = container.querySelector(".field-error");
  if (!errorEl) {
    errorEl = document.createElement("div");
    errorEl.className = "field-error";
    errorEl.setAttribute("role", "alert");
    container.appendChild(errorEl);
  }
  return errorEl;
}

function setFieldError(field, message) {
  const container = getFieldContainer(field);
  if (!container) return;
  const errorEl = ensureErrorEl(container);
  if (!errorEl) return;
  if (message) {
    container.classList.add("has-error");
    errorEl.textContent = message;
  } else {
    container.classList.remove("has-error");
    errorEl.textContent = "";
  }
}

function validateRequiredField(field, label) {
  const value = (field?.value || "").trim();
  if (!value) {
    setFieldError(field, `${label} is required.`);
    return false;
  }
  setFieldError(field, "");
  return true;
}

function validateForm() {
  const missingLabels = [];
  requiredFields.forEach(({ id, label }) => {
    const field = document.getElementById(id);
    if (!field) return;
    const valid = validateRequiredField(field, label);
    if (!valid) missingLabels.push(label);
  });

  if (missingLabels.length) {
    setStatus(errorSummaryEl, `Please complete required fields: ${missingLabels.join(", ")}.`, "error");
  } else {
    setStatus(errorSummaryEl, "");
  }

  return { valid: missingLabels.length === 0, missingLabels };
}

function normalizeAmountValue(value) {
  return String(value || "").trim().replace(/\$/g, "").replace(/,/g, "");
}

function validateAmountField() {
  if (!amountInput) return { valid: true };
  const cleaned = normalizeAmountValue(amountInput.value);
  if (cleaned !== amountInput.value) {
    amountInput.value = cleaned;
  }
  if (!cleaned) {
    setFieldError(amountInput, "Amount is required.");
    return { valid: false, error: "Amount is required." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    setFieldError(amountInput, "Enter a valid amount.");
    return { valid: false, error: "Enter a valid amount." };
  }
  const amountValue = Number(cleaned);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    setFieldError(amountInput, "Enter a valid amount.");
    return { valid: false, error: "Enter a valid amount." };
  }
  if (amountValue > 3500) {
    setFieldError(amountInput, "Amount must be $3,500 or less.");
    return { valid: false, error: "Amount must be $3,500 or less." };
  }
  setFieldError(amountInput, "");
  return { valid: true, value: cleaned };
}

function apiUrl(path) {
  const base = String(API_URL || "").replace(/\/+$/, "");
  const suffix = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function waitForStripe() {
  if (typeof window.Stripe === "function") return Promise.resolve(true);
  const stripeScript = document.getElementById("stripe-js");
  if (!stripeScript) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = () => resolve(typeof window.Stripe === "function");
    stripeScript.addEventListener("load", done, { once: true });
    stripeScript.addEventListener("error", () => resolve(false), { once: true });
  });
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidSmsPhone(value) {
  const digits = phoneDigits(value);
  return digits.length >= 10;
}

function updateSmsConsentHint(isChecked) {
  if (!smsConsentHint) return;
  smsConsentHint.classList.toggle("is-hidden", !isChecked);
}

async function submitSmsOptIn(payload) {
  const res = await fetch(apiUrl("/api/donate/sms-optin"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error || "Text opt-in failed. Please try again." };
  }
  return data;
}

async function loadConfig() {
  try {
    const res = await fetch(apiUrl("/api/config"), { method: "GET" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errorMsg = data.error || `Configuration error (HTTP ${res.status})`;
      return { error: `${errorMsg}. Please refresh the page or email skovgard2026@gmail.com for support.` };
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.stripePublishableKey) {
      return { error: "Payment service not available. Please refresh the page or try again later." };
    }
    return data;
  } catch (e) {
    return { error: "Network error loading payment configuration. Please check your connection and refresh the page." };
  }
}

async function createIntent(payload) {
  const res = await fetch(apiUrl("/api/donate/create-intent"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error || "Unable to start payment." };
  }
  return data;
}

function getReturnUrl() {
  return new URL("/donatev1/thanks/", window.location.origin).toString();
}

async function initDonate() {
  if (!form) {
    console.warn("Donate form not found.");
    return;
  }

  const config = await loadConfig();
  if (config.error) {
    setStatus(statusEl, config.error, "error");
    return;
  }

  const stripeReady = await waitForStripe();
  if (!stripeReady) {
    setStatus(statusEl, "Stripe is not available. Please refresh and try again.", "error");
    return;
  }

  const stripeKey = config.stripePublishableKey || "";
  stripe = initStripe(stripeKey);
  if (!stripe) {
    setStatus(statusEl, "Stripe is not available. Please refresh and try again.", "error");
    return;
  }

  requiredFields.forEach(({ id }) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener("blur", () => {
      validateForm();
    });
  });

  if (smsConsentInput) {
    smsConsentInput.addEventListener("change", () => {
      const isChecked = smsConsentInput.checked;
      updateSmsConsentHint(isChecked);
      if (isChecked && phoneInput && !isValidSmsPhone(phoneInput.value)) {
        setFieldError(phoneInput, "Enter a valid mobile number for text opt-in.");
        phoneInput.focus();
        return;
      }
      if (!isChecked) {
        setFieldError(smsConsentInput, "");
        setFieldError(phoneInput, "");
        setStatus(errorSummaryEl, "");
      }
    });
    updateSmsConsentHint(smsConsentInput.checked);
  }

  if (phoneInput) {
    const handlePhoneCheck = () => {
      const isValid = isValidSmsPhone(phoneInput.value);
      if (isValid && smsConsentInput && !smsConsentInput.checked) {
        smsConsentInput.checked = true;
        updateSmsConsentHint(true);
        smsConsentInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (smsConsentInput?.checked) {
        if (!isValid) {
          setFieldError(phoneInput, "Enter a valid mobile number for text opt-in.");
        } else {
          setFieldError(phoneInput, "");
        }
      }
    };

    phoneInput.addEventListener("blur", handlePhoneCheck);
    phoneInput.addEventListener("change", handlePhoneCheck);
  }

  if (amountInput) {
    const handleAmountChange = () => {
      validateAmountField();
    };
    amountInput.addEventListener("blur", handleAmountChange);
    amountInput.addEventListener("change", handleAmountChange);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(statusEl, "");

    const { valid: formValid } = validateForm();
    if (!formValid) {
      return;
    }

    const amountCheck = validateAmountField();
    if (!amountCheck.valid) {
      setStatus(errorSummaryEl, amountCheck.error, "error");
      return;
    }

    const data = readFormData(form);
    if (smsConsentInput && smsConsentInput.checked) {
      if (!isValidSmsPhone(data.phone)) {
        setFieldError(phoneInput, "Enter a valid mobile number for text opt-in.");
        setStatus(errorSummaryEl, "Enter a valid mobile number for text opt-in.", "error");
        return;
      }

      const digits = phoneDigits(data.phone);
      setFieldError(phoneInput, "");
      setFieldError(smsConsentInput, "");
      setLoading(true);
      const smsResult = await submitSmsOptIn({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: digits,
        email: data.email || "",
        consent_sms: true,
      });
      setLoading(false);

      if (smsResult.error) {
        setFieldError(smsConsentInput, smsResult.error);
        setStatus(errorSummaryEl, smsResult.error, "error");
        return;
      }
    }

    const { valid, errors } = validateDonation(data);
    if (!valid) {
      setStatus(statusEl, errors[0], "error");
      return;
    }

    if (!clientSecret) {
      setLoading(true);
      const response = await createIntent(data);
      setLoading(false);

      if (response.error) {
        setStatus(statusEl, response.error, "error");
        return;
      }

      clientSecret = response.client_secret || "";
      if (!clientSecret) {
        setStatus(statusEl, "Missing client secret from server.", "error");
        return;
      }

      showPaymentSection();
      elements = mountPaymentElement(stripe, clientSecret, "#payment-element");
      lockDonorFields();
      submitButton.textContent = "Complete payment";
      setStatus(statusEl, "Enter your payment details to finish.", "success");
      return;
    }

    setLoading(true);
    const result = await confirmPayment(stripe, elements, clientSecret, getReturnUrl());
    setLoading(false);

    if (result.error) {
      setStatus(statusEl, result.error.message || "Payment could not be completed.", "error");
    } else {
      setStatus(statusEl, "Payment submitted. Completing checkout.", "success");
    }
  });
}

initDonate();

export { initDonate };
