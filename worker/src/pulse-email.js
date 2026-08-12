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

// This staff email fires on the very first opt-in submission and never
// again for that contact (see docs/pulse_flow.md), so for the redesigned
// /pulse flow it's usually built before someone has had a chance to reach
// the Citizen Poll step at all. No city was ever submitted yet, so
// matching hasn't been attempted. Reporting that as a flat "No" reads as a
// confirmed non-match and has confused staff into thinking a real match
// attempt failed, when the true state is "not tried yet." A later,
// successful match on a follow-up submission does not re-fire this email
// to correct it, so the wording has to be honest about that gap up front.
function wyVoterStatus(profile) {
  if (profile.wyVoter) return "Yes";
  if (!normalizeText(profile.city)) return "Not attempted yet (no address submitted on this step)";
  return "No";
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
      `Wyoming voter: ${wyVoterStatus(profile)}`,
      `Address: ${address}`,
      `Districts: ${districtSummary(profile)}`,
      `Consent version: ${normalizeText(profile.consentVersion) || "Unknown"}`,
      `Source: ${normalizeText(profile.sourceDetail || profile.source) || "pulse"}`,
      "",
      "View unresolved voter matches: https://www.skovgard2026.org/admin/pulse-voter-review/index.html",
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
        <li><strong>Wyoming voter:</strong> ${escapeHtml(wyVoterStatus(profile))}</li>
        <li><strong>Address:</strong> ${escapeHtml(address)}</li>
        <li><strong>Districts:</strong> ${escapeHtml(districtSummary(profile))}</li>
        <li><strong>Consent version:</strong> ${escapeHtml(normalizeText(profile.consentVersion) || "Unknown")}</li>
        <li><strong>Source:</strong> ${escapeHtml(normalizeText(profile.sourceDetail || profile.source) || "pulse")}</li>
      </ul>
      <p><a href="https://www.skovgard2026.org/admin/pulse-voter-review/index.html">View unresolved voter matches</a></p>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "staff_notification" },
    ],
  };
}

const MATCH_MODE_LABELS = {
  ambiguous_address: "Ambiguous (address)",
  ambiguous_name_city_zip: "Ambiguous (name/city/zip)",
  ambiguous_name_zip: "Ambiguous (name/zip, city didn't match)",
  ambiguous_name_city: "Unconfirmed (name+city, no ZIP submitted)",
  ambiguous_name_city_zip_conflict: "Unconfirmed (name+city match, submitted ZIP didn't match)",
  ambiguous_phone: "Ambiguous (phone matches multiple voters)",
  ambiguous_email: "Ambiguous (email matches multiple voters)",
  phone_belongs_to_other_voter: "Clean match, but phone linked to a different voter",
  missing_lookup_fields: "Insufficient data submitted",
  no_match: "No match found",
  callback_requested_no_address: "Callback requested (no address given)",
};

function matchModeLabel(mode) {
  return MATCH_MODE_LABELS[mode] || mode || "Unknown";
}

// Distinct from buildStaffEmail's per-opt-in notice above -- that one fires
// once per contact ever and says nothing about whether *this* submission
// needs action. This one fires specifically when a submission lands in
// pulse_voter_match_review (worker/migrations/031) unresolved, so it can't
// blend into routine "new opt-in" noise (see docs/who_needs_to_know.md
// recommendation 1).
function buildReviewNeededEmail(config, profile) {
  const name = fullName(profile);
  const phone = normalizeText(profile.phoneE164 || profile.phone);
  const mode = matchModeLabel(profile.matchMode);
  const address = addressLines(profile).join(", ") || "Not provided";
  const isCallbackRequest = profile.matchMode === "callback_requested_no_address";
  const subject = isCallbackRequest
    ? `Pulse callback requested ASAP: ${name}`
    : `Pulse review needed: ${name}`;
  const intro = isCallbackRequest
    ? "Someone opted in via /pulse and asked for a callback to finish Citizen Poll verification."
    : "A /pulse submission needs manual review. It didn't cleanly match a Wyoming voter record.";

  return {
    from: config.from,
    to: [config.staffTo],
    subject,
    text: [
      intro,
      "",
      `Name: ${name}`,
      `Phone: ${phone || "Not provided"}`,
      `Address: ${address}`,
      `Reason: ${mode}`,
      "",
      "Review it: https://www.skovgard2026.org/admin/pulse-voter-review/index.html",
    ].join("\n"),
    html: `
      <h1>${isCallbackRequest ? "Pulse callback requested" : "Pulse review needed"}</h1>
      <p>${escapeHtml(intro)}</p>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(name)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</li>
        <li><strong>Address:</strong> ${escapeHtml(address)}</li>
        <li><strong>Reason:</strong> ${escapeHtml(mode)}</li>
      </ul>
      <p><a href="https://www.skovgard2026.org/admin/pulse-voter-review/index.html">Review it</a></p>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "review_needed" },
    ],
  };
}

// Fire-and-forget from the caller's perspective (wrap in ctx.waitUntil where
// available) -- a failure here must never block the opt-in/admin action that
// triggered it.
export async function sendPulseReviewNeededEmail(env, profile) {
  const config = {
    enabled: String(env.PULSE_EMAIL_ENABLED || "0") === "1",
    apiKey: normalizeText(env.RESEND_API_KEY),
    from: normalizeText(env.PULSE_EMAIL_FROM),
    staffTo: normalizeText(env.PULSE_STAFF_NOTIFY_TO || "pulse@grassrootsmvt.org"),
  };
  if (!config.enabled || !config.apiKey || !config.from || !config.staffTo) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }
  try {
    const data = await sendResendEmail(config.apiKey, buildReviewNeededEmail(config, profile));
    return { sent: true, id: data?.id || null };
  } catch (error) {
    return { sent: false, reason: String(error?.message || error) };
  }
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

// Delivers a freshly-minted Citizen Poll ballot link by email, independent
// of buildConfirmationEmail's wasOptedIn/hadEmailConsent gating in
// worker/src/index.js -- that gating exists to avoid re-sending "thanks for
// joining" to an existing subscriber, which has nothing to do with whether
// *this* contact has ever actually received a poll link. The caller is
// responsible for only requesting this once per contact (gated on
// consent_status.poll_link_sent_at).
function buildPollLinkEmail(config, profile) {
  const email = normalizeText(profile.email);
  const pollLink = normalizeText(profile.pollLink);
  if (!email || !profile.consentEmail || !pollLink) return null;

  const firstName = normalizeText(profile.firstName);
  const greeting = firstName || "there";
  const candidatesUrl = "https://candidates.skovgard2026.org/";
  const subject = `Your ${config.campaignName} Citizen Poll ballot is ready`;

  return {
    from: config.from,
    to: [email],
    subject,
    text: [
      `Hi ${greeting},`,
      "",
      `You're verified as a Wyoming voter. Your Citizen Poll ballot is ready -- cast your vote: ${pollLink}`,
      "",
      `Find everyone on your ballot: ${candidatesUrl}`,
      "",
      "Don't see this in your inbox? Check your Spam or Junk folder. If it's there, please select the \"Not Spam\" button (or add pulse@grassrootsmvt.org to your contacts) so future updates reach you.",
      "",
      "Reply STOP to any campaign text to stop receiving text messages.",
      "Reply HELP for help, or email skovgard2026@gmail.com if you need assistance.",
    ].join("\n"),
    html: `
      <p>Hi ${escapeHtml(greeting)},</p>
      <p>You're verified as a Wyoming voter. Your Citizen Poll ballot is ready -- <a href="${escapeHtml(pollLink)}">cast your vote</a>.</p>
      <p>Find everyone on your ballot: <a href="${candidatesUrl}">${candidatesUrl}</a></p>
      <p>Don't see this in your inbox? Check your Spam or Junk folder. If it's there, please select the <strong>"Not Spam"</strong> button (or add <strong>pulse@grassrootsmvt.org</strong> to your contacts) so future updates reach you.</p>
      <p>Reply <strong>STOP</strong> to any campaign text to stop receiving text messages.</p>
      <p>Reply <strong>HELP</strong> for help, or email <a href="mailto:skovgard2026@gmail.com">skovgard2026@gmail.com</a> if you need assistance.</p>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "poll_link" },
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

// Standalone (not bundled into sendPulseOptInEmails' jobs array) so the
// caller gets an unambiguous sent/failed signal for this one email, needed
// to decide whether to mark consent_status.poll_link_sent_at.
export async function sendPollLinkEmail(env, profile, idempotencyKey = null) {
  const config = {
    enabled: String(env.PULSE_EMAIL_ENABLED || "0") === "1",
    apiKey: normalizeText(env.RESEND_API_KEY),
    from: normalizeText(env.PULSE_EMAIL_FROM),
    campaignName: normalizeText(env.PULSE_EMAIL_CAMPAIGN_NAME || "Skovgard for Senate") || "Skovgard for Senate",
  };

  if (!config.enabled || !config.apiKey || !config.from) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }

  const message = buildPollLinkEmail(config, profile);
  if (!message) return { sent: false, reason: "no_email_or_consent" };

  try {
    const data = await sendResendEmail(config.apiKey, message, idempotencyKey);
    return { sent: true, id: data?.id || null };
  } catch (error) {
    return { sent: false, reason: String(error?.message || error) };
  }
}

// Daily summary (worker/wrangler.toml [env.production.triggers], added
// 2026-07-19 -- see docs/who_needs_to_know.md recommendation 3) of the two
// admin call queues that otherwise have no push notification of their own:
// pulse_voter_match_review (partially covered by buildReviewNeededEmail
// above, but this adds an aggregate view) and pulse_abandoned_signups
// (which has NO other notification at all). Only sends when there's at
// least one open item, so a quiet day stays quiet instead of adding to
// inbox noise.
function buildFollowUpDigestEmail(config, counts) {
  const { reviewTotal, reviewStale, abandonedTotal, abandonedStale } = counts;
  const subject = `Pulse follow-up digest: ${reviewTotal + abandonedTotal} open item${reviewTotal + abandonedTotal === 1 ? "" : "s"}`;

  return {
    from: config.from,
    to: [config.staffTo],
    subject,
    text: [
      "Daily Pulse follow-up summary.",
      "",
      `Voter match review queue: ${reviewTotal} unresolved (${reviewStale} older than 48h).`,
      "  https://www.skovgard2026.org/admin/pulse-voter-review/index.html",
      "",
      `Abandoned-signup call queue: ${abandonedTotal} open (${abandonedStale} older than 48h).`,
      "  https://www.skovgard2026.org/admin/pulse-followup/index.html",
    ].join("\n"),
    html: `
      <h1>Pulse follow-up digest</h1>
      <p><strong>Voter match review queue:</strong> ${reviewTotal} unresolved (${reviewStale} older than 48h).<br>
        <a href="https://www.skovgard2026.org/admin/pulse-voter-review/index.html">Open the review queue</a></p>
      <p><strong>Abandoned-signup call queue:</strong> ${abandonedTotal} open (${abandonedStale} older than 48h).<br>
        <a href="https://www.skovgard2026.org/admin/pulse-followup/index.html">Open the follow-up queue</a></p>
    `,
    tags: [
      { name: "source", value: "pulse" },
      { name: "kind", value: "followup_digest" },
    ],
  };
}

export async function sendPulseFollowUpDigest(env, counts) {
  const config = {
    enabled: String(env.PULSE_EMAIL_ENABLED || "0") === "1",
    apiKey: normalizeText(env.RESEND_API_KEY),
    from: normalizeText(env.PULSE_EMAIL_FROM),
    staffTo: normalizeText(env.PULSE_STAFF_NOTIFY_TO || "pulse@grassrootsmvt.org"),
  };
  if (!config.enabled || !config.apiKey || !config.from || !config.staffTo) {
    return { sent: false, reason: "disabled_or_missing_config" };
  }
  const totalOpen = Number(counts?.reviewTotal || 0) + Number(counts?.abandonedTotal || 0);
  if (totalOpen === 0) return { sent: false, reason: "nothing_open" };

  try {
    const data = await sendResendEmail(config.apiKey, buildFollowUpDigestEmail(config, counts));
    return { sent: true, id: data?.id || null };
  } catch (error) {
    return { sent: false, reason: String(error?.message || error) };
  }
}
