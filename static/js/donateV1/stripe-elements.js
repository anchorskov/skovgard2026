// static/js/donateV1/stripe-elements.js

export function initStripe(publicKey) {
  if (!publicKey) return null;
  if (typeof window.Stripe !== "function") return null;
  return window.Stripe(publicKey);
}

export function mountPaymentElement(stripe, clientSecret, mountId) {
  const elements = stripe.elements({ clientSecret });
  const paymentElement = elements.create("payment", { layout: "tabs" });
  paymentElement.mount(mountId);
  return elements;
}

export async function confirmPayment(stripe, elements, clientSecret, returnUrl) {
  const submitResult = await elements.submit();
  if (submitResult.error) return { error: submitResult.error };

  return stripe.confirmPayment({
    elements,
    clientSecret,
    confirmParams: {
      return_url: returnUrl,
    },
  });
}
