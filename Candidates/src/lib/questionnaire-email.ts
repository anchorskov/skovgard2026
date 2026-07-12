// Candidates/src/lib/questionnaire-email.ts
import { sendResendEmail } from './resend';

const DEFAULT_FROM = 'profile@grassrootsmvt.org';

export async function sendQuestionnaireInviteEmail(
  env: any,
  { to, candidateName, officeTitle, link }: { to: string; candidateName: string; officeTitle: string; link: string }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = String(env?.RESEND_API_KEY || '').trim();
  if (!apiKey) return { sent: false, reason: 'missing_api_key' };

  const from = String(env?.QUESTIONNAIRE_EMAIL_FROM || DEFAULT_FROM).trim();
  const subject = `Your Wyoming 2026 Voter Guide questionnaire — ${candidateName}`;
  const text = [
    `Hi ${candidateName},`,
    '',
    `You (or someone using this email address) requested the candidate questionnaire link for your ${officeTitle} profile in the Wyoming 2026 Primary Voter Guide.`,
    '',
    `Complete it here: ${link}`,
    '',
    'This link is unique to your profile — please don\'t share it. You can revisit it any time before the primary to update your answers.',
    '',
    'Questions or corrections: jimmy@grassrootsmvt.org',
  ].join('\n');

  await sendResendEmail(apiKey, {
    from,
    to: [to],
    subject,
    text,
  });

  return { sent: true };
}
