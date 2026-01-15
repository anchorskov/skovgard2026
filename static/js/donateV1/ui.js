// static/js/donateV1/ui.js

export function readFormData(form) {
  const data = new FormData(form);
  return {
    first_name: (data.get("first_name") || "").trim(),
    last_name: (data.get("last_name") || "").trim(),
    email: (data.get("email") || "").trim(),
    phone: (data.get("phone") || "").trim(),
    address1: (data.get("address1") || "").trim(),
    address2: (data.get("address2") || "").trim(),
    city: (data.get("city") || "").trim(),
    state: (data.get("state") || "").trim(),
    zip: (data.get("zip") || "").trim(),
    country: (data.get("country") || "").trim(),
    employer: (data.get("employer") || "").trim(),
    occupation: (data.get("occupation") || "").trim(),
    amount: (data.get("amount") || "").trim(),
    attestations: {
      us_citizen: data.get("attest_us_citizen") === "on",
      personal_funds: data.get("attest_personal_funds") === "on",
      age_18: data.get("attest_age_18") === "on",
      not_federal_contractor: data.get("attest_not_federal_contractor") === "on",
      personal_card: data.get("attest_personal_card") === "on",
    },
  };
}

export function validateDonation(data) {
  const errors = [];
  if (!data.first_name) errors.push("First name is required.");
  if (!data.last_name) errors.push("Last name is required.");
  if (data.email && !data.email.includes("@")) errors.push("Email is not valid.");
  if (!data.address1) errors.push("Address line 1 is required.");
  if (!data.city) errors.push("City is required.");
  if (!data.state) errors.push("State is required.");
  if (!data.zip) errors.push("ZIP is required.");
  if (!data.country) errors.push("Country is required.");
  if (!data.amount) errors.push("Amount is required.");

  const amountValue = Number(data.amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    errors.push("Amount must be greater than zero.");
  }

  const attest = data.attestations || {};
  const attestOk = attest.us_citizen && attest.personal_funds && attest.age_18 && attest.not_federal_contractor && attest.personal_card;
  if (!attestOk) errors.push("All attestations are required.");

  return { valid: errors.length === 0, errors };
}

export function setStatus(el, message, type = "") {
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
  if (!message) {
    el.classList.remove("error", "success");
  }
}

export function setDisabled(container, disabled) {
  if (!container) return;
  const fields = container.querySelectorAll("input, select, button");
  fields.forEach((field) => {
    field.disabled = Boolean(disabled);
  });
}
