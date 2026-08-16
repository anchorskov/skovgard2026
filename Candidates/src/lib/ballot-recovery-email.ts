// Candidates/src/lib/ballot-recovery-email.ts
import { sendResendEmail } from './resend';

const DEFAULT_FROM = 'profile@updates.grassrootsmvt.org';

// Unlike sendQuestionnaireInviteEmail (which only ever sends to an address
// already on file with a candidate filing), this sends to an arbitrary
// voter-supplied address. There's no "matches records" secret to protect by
// staying silent on failure, so — deliberately, unlike the questionnaire
// helper — delivery failures here are caught and reported rather than left
// to propagate as an unhandled exception out of the API route.
export async function sendBallotRecoveryEmail(
  env: any,
  { to, link }: { to: string; link: string }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = String(env?.RESEND_API_KEY || '').trim();
  if (!apiKey) return { sent: false, reason: 'missing_api_key' };

  const from = String(env?.QUESTIONNAIRE_EMAIL_FROM || DEFAULT_FROM).trim();
  const subject = 'Your Wyoming 2026 Voter Guide ballot list';
  const text = [
    'Someone (hopefully you) requested a link to restore a saved ballot list',
    'from the Wyoming 2026 Primary Voter Guide on this device.',
    '',
    `Open this link on the device where you'd like the list restored: ${link}`,
    '',
    'This link expires in 24 hours and can be used more than once during that',
    'window — open it on as many devices as you like.',
    '',
    'There is no account tied to this email address, and nothing changes',
    'until this link is opened. If you didn\'t request this, you can safely',
    'ignore it.',
  ].join('\n');

  try {
    await sendResendEmail(apiKey, {
      from,
      to: [to],
      subject,
      text,
    });
    return { sent: true };
  } catch (err: any) {
    console.error('sendBallotRecoveryEmail failed', err?.status, err?.message, err?.body);
    return { sent: false, reason: 'delivery_failed' };
  }
}
