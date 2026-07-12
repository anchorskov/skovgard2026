// Candidates/src/lib/resend.ts
// Minimal Resend client, mirrors worker/src/resend.js. Duplicated rather than
// imported across the project boundary — Candidates/ and worker/ are separate
// deployables with separate builds.

export async function sendResendEmail(apiKey: string, message: Record<string, unknown>): Promise<any> {
  const token = String(apiKey || '').trim();
  if (!token) {
    throw new Error('Resend API key missing');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.message || body?.error?.message || body?.error || `Resend request failed with ${response.status}`;
    const error: any = new Error(detail);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}
