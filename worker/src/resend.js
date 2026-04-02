export async function sendResendEmail(apiKey, message, idempotencyKey = null) {
  const token = String(apiKey || "").trim();
  if (!token) {
    throw new Error("Resend API key missing");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(message),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.message
      || body?.error?.message
      || body?.error
      || `Resend request failed with ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}
