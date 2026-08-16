// Candidates/src/lib/turnstile.ts
// Shared Cloudflare Turnstile server-side verification, used by every
// endpoint that accepts a cf_turnstile_response token (ballot-lookup,
// questionnaire request, ballot-recovery request). Previously copy-pasted
// verbatim across those endpoints — extracted here so a change to the
// verification logic (or the DEV/no-secret bypasses) only has one place to
// go wrong.
export async function verifyTurnstile(env: any, token: string | undefined | null): Promise<boolean> {
  if (import.meta.env.DEV) return true;

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — skip in local dev

  if (!token) return false;

  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}
