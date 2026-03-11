// static/js/donate/donate-router.js

const WINRED_DONATE_URL = "https://secure.winred.com/skovgard-for-senate/donate-today";
const STRIPE_DONATE_URL = "/donatev1/";
const DONATION_THRESHOLD = 75;
const WINRED_SUPPORTS_AMOUNT_PARAM = false;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

function parseAmount(rawValue) {
  if (typeof rawValue !== "string") return NaN;
  const normalized = rawValue.replace(/[$,\s]/g, "");
  if (!normalized) return NaN;
  return Number.parseFloat(normalized);
}

function validateAmount(amount) {
  if (!Number.isFinite(amount)) {
    return "Enter a valid dollar amount.";
  }
  if (amount < MIN_AMOUNT) {
    return `Amount must be at least $${MIN_AMOUNT}.`;
  }
  if (amount > MAX_AMOUNT) {
    return `Amount must be $${MAX_AMOUNT} or less.`;
  }
  return "";
}

function isPlaceholderUrl(url) {
  return url.startsWith("REPLACE_WITH_");
}

function routeForAmount(amount) {
  if (amount < DONATION_THRESHOLD && !isPlaceholderUrl(WINRED_DONATE_URL)) {
    return WINRED_DONATE_URL;
  }
  return STRIPE_DONATE_URL;
}

function buildDestinationUrl(basePath, amount, includeAmountParam) {
  const url = new URL(basePath, window.location.origin);
  if (includeAmountParam) {
    url.searchParams.set("amount", String(amount));
  }
  return url.toString();
}

function setError(errorElement, message) {
  errorElement.textContent = message;
}

function runDonation(amount, customInput, errorElement) {
  const validationError = validateAmount(amount);
  if (validationError) {
    setError(errorElement, validationError);
    customInput.focus();
    return;
  }

  const destination = routeForAmount(amount);
  const isStripeRoute = destination === STRIPE_DONATE_URL;
  const includeAmountParam = isStripeRoute || WINRED_SUPPORTS_AMOUNT_PARAM;
  const destinationUrl = buildDestinationUrl(destination, amount, includeAmountParam);

  setError(errorElement, "");
  window.location = destinationUrl;
}

function initDonateRouter() {
  const form = document.getElementById("donate-router-form");
  const customInput = document.getElementById("donate-custom-amount");
  const errorElement = document.getElementById("donate-router-error");
  const presetButtons = document.querySelectorAll(".donate-router-preset");

  if (!form || !customInput || !errorElement || presetButtons.length === 0) {
    return;
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const amountText = button.getAttribute("data-amount") || "";
      const amount = parseAmount(amountText);
      customInput.value = amountText;
      runDonation(amount, customInput, errorElement);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = parseAmount(customInput.value);
    runDonation(amount, customInput, errorElement);
  });

  customInput.addEventListener("input", () => {
    if (errorElement.textContent) {
      setError(errorElement, "");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDonateRouter);
} else {
  initDonateRouter();
}
