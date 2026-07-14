import { sendResendEmail } from "./resend.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function fullName(profile) {
  const name = [profile.firstName, profile.lastName]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
  return name || "Unknown";
}

function addressLines(profile) {
  const cityStateZip = [
    normalizeText(profile.city),
    normalizeText(profile.state),
    normalizeText(profile.zip),
  ]
    .filter(Boolean)
    .join(", ")
    .replace(", ,", ",");

  return [
    normalizeText(profile.address1),
    normalizeText(profile.address2),
    cityStateZip,
  ].filter(Boolean);
}

function districtSummary(profile) {
  const house = normalizeText(profile.stateHouseDistrict);
  const senate = normalizeText(profile.stateSenateDistrict);
  if (!house && !senate) return "Not resolved";
  if (house && senate) return `House ${house}, Senate ${senate}`;
  if (house) return `House ${house}`;
  return `Senate ${senate}`;
}

function buildStaffEmail(config, profile) {
  const submittedAt = normalizeText(profile.consentedAt || profile.submittedAt || new Date().toISOString());
  const emailDisplay = profile.email
    ? `${profile.email} (${profile.consentEmail ? "email consent" : "no email consent"})`
    : "Not provided";
  const address = addressLines(profile).join(", ") || "Not provided";
  const name = fullName(profile);
  const phone = normalizeText(profile.phoneE164 || profile.phone);
  const subject = `New Pulse opt-in: ${name}`;

  return {
    from: config.from,
    to: [config.staffTo],
    subject,
    text: [
      "A new Pulse opt-in was submitted.",
      "",
      `Submitted at: ${submittedAt}`,
      `Name: ${name}`,
      `Phone: ${phone || "Not provided"}`,
      `Email: ${emailDisplay}`,
      `SMS consent: ${yesNo(profile.consentSms)}`,
      `Email consent: ${yesNo(profile.consentEmail)}`,
      `Wyoming voter: ${yesNo(profile.wyVoter)}`,
      `Address: ${address}`,
      `Districts: ${districtSummary(profile)}`,
      `Consent version: ${normalizeText(profile.consentVersion) || "Unknown"}`,
      `Source: ${normalizeText(profile.sourceDetail || profile.source) || "pulse"}`,
    ].join("\n"),
    html: `
      <h1>New Pulse opt-in</h1>
      <p>A new Pulse opt-in was submitted.</p>
      <ul>
        <li><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</li>
        <li><strong>Name:</strong> ${escapeHtml(name)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</li>
        <li><strong>Email:</strong> ${escapeHtml(emailDisplay)}</li>
        <li><strong>SMS consent:</strong> ${escapeHtml(yesNo(profile.consentSms))}</li>
        <li><strong>Email consent:</strong> ${escapeHtml(yesNo(profile.consentEmail))}</li>
        <li><strong>Wyoming voter:</strong> ${escapeHtml(yesNo(profile.wyVoter))}</li>
        <li><strong>Address:</strong> ${escapeHtml(address)}</li>
        <li><strong>Districts:</strong> ${escapeHtml(districtSummary(profile))}</li>
        <li><strong>Consent version:</strong> ${escapeHtml(normalizeText(profile.consentVersion) || "Unknown")}</li>
        <li><strong>Source:</strong> ${escapeHtml(normalizeText(profile.sourceDetail || profile.source) || "pulse")}</li>
      </ul>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "staff_notification" },
    ],
  };
}

function buildConfirmationEmail(config, profile) {
  const email = normalizeText(profile.email);
  if (!email || !profile.consentEmail) return null;

  const firstName = normalizeText(profile.firstName);
  const greeting = firstName || "there";
  const phone = normalizeText(profile.phoneE164 || profile.phone);
  const pollLink = normalizeText(profile.pollLink);
  const candidatesUrl = "https://candidates.skovgard2026.org/";
  const subject = `Thank you for joining the ${config.campaignName} Pulse list`;

  const pollTextLines = pollLink
    ? [
        "",
        `Your Citizen Poll ballot is ready -- cast your vote: ${pollLink}`,
      ]
    : [];
  const pollHtml = pollLink
    ? `<p>Your Citizen Poll ballot is ready -- <a href="${escapeHtml(pollLink)}">cast your vote</a>.</p>`
    : "";

  return {
    from: config.from,
    to: [email],
    subject,
    text: [
      `Hi ${greeting},`,
      "",
      `Thank you for signing up for Pulse updates from ${config.campaignName}.`,
      `You're on the list for campaign text updates, and we also recorded your request to receive campaign emails at ${email}.`,
      ...pollTextLines,
      "",
      `Find everyone on your ballot: ${candidatesUrl}`,
      "",
      `Mobile: ${phone || "Not provided"}`,
      "",
      "We'll use this contact information for occasional campaign updates.",
      "",
      "Don't see this in your inbox? Check your Spam or Junk folder. If it's there, please select the \"Not Spam\" button (or add pulse@grassrootsmvt.org to your contacts) so future updates reach you.",
      "",
      "Reply STOP to any campaign text to stop receiving text messages.",
      "Reply HELP for help, or email skovgard2026@gmail.com if you need assistance.",
    ].join("\n"),
    html: `
      <p>Hi ${escapeHtml(greeting)},</p>
      <p>Thank you for signing up for Pulse updates from ${escapeHtml(config.campaignName)}.</p>
      <p>You're on the list for campaign text updates, and we also recorded your request to receive campaign emails at <strong>${escapeHtml(email)}</strong>.</p>
      ${pollHtml}
      <p>Find everyone on your ballot: <a href="${candidatesUrl}">${candidatesUrl}</a></p>
      <p><strong>Mobile:</strong> ${escapeHtml(phone || "Not provided")}</p>
      <p>We'll use this contact information for occasional campaign updates.</p>
      <p>Don't see this in your inbox? Check your Spam or Junk folder. If it's there, please select the <strong>"Not Spam"</strong> button (or add <strong>pulse@grassrootsmvt.org</strong> to your contacts) so future updates reach you.</p>
      <p>Reply <strong>STOP</strong> to any campaign text to stop receiving text messages.</p>
      <p>Reply <strong>HELP</strong> for help, or email <a href="mailto:skovgard2026@gmail.com">skovgard2026@gmail.com</a> if you need assistance.</p>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "user_confirmation" },
    ],
  };
}

export async function sendPulseOptInEmails(env, profile, options = {}) {
  const config = {
    enabled: String(env.PULSE_EMAIL_ENABLED || "0") === "1",
    apiKey: normalizeText(env.RESEND_API_KEY),
    from: normalizeText(env.PULSE_EMAIL_FROM),
    staffTo: normalizeText(env.PULSE_STAFF_NOTIFY_TO || "pulse@grassrootsmvt.org"),
    campaignName: normalizeText(env.PULSE_EMAIL_CAMPAIGN_NAME || "Skovgard for Senate") || "Skovgard for Senate",
  };

  if (!config.enabled || !config.apiKey || !config.from) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }

  const jobs = [];

  if (options.sendStaff !== false && config.staffTo) {
    const staffMessage = buildStaffEmail(config, profile);
    jobs.push(
      sendResendEmail(config.apiKey, staffMessage, options.staffIdempotencyKey || null).then((data) => ({
        kind: "staff",
        id: data?.id || null,
      }))
    );
  }

  if (options.sendConfirmation !== false) {
    const confirmationMessage = buildConfirmationEmail(config, profile);
    if (confirmationMessage) {
      jobs.push(
        sendResendEmail(config.apiKey, confirmationMessage, options.confirmationIdempotencyKey || null).then((data) => ({
          kind: "confirmation",
          id: data?.id || null,
        }))
      );
    }
  }

  if (!jobs.length) {
    return { sent: false, reason: "no_messages" };
  }

  const settled = await Promise.allSettled(jobs);
  const failures = settled
    .filter((result) => result.status === "rejected")
    .map((result) => String(result.reason?.message || result.reason || "Unknown email error"));

  return {
    sent: failures.length < settled.length,
    results: settled.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { kind: "error", error: String(result.reason?.message || result.reason || "Unknown email error") }
    ),
    failures,
  };
}
