// worker/src/email-template.js
// Reusable HTML email template for all /share messages.
// Outer chrome (header, buttons, footer) is constant; body_html is per-message.
// buildShareEmailText() auto-derives plain text from the same params — no separate doc to maintain.

// ── Utilities ─────────────────────────────────────────────────────────────────

export function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Strips HTML tags and decodes common entities to produce plain text.
 * Exported for future use when body_html comes from D1 (Phase 2).
 */
export function stripHtmlToText(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "")
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Per-message inner HTML ────────────────────────────────────────────────────
// These are the message-specific body fragments only — no <html>, <body>, or outer chrome.
// The outer chrome (header, stay-connected buttons, share CTA, footer) is in buildShareEmailHtml().

const JIMMYS_STORY_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This campaign is built around two simple beliefs.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:18px 18px 16px;">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
          <strong>First,</strong> Wyoming voters deserve leadership grounded in integrity,
          accountability, transparency, compassion, courage and bound by the Constitution
          and the rule of law.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
          <strong>Second,</strong> the citizens, you and I, are the fourth branch of
          government. Our representatives work for us and are accountable to us. Public
          office belongs to public service, and public service must answer to the people.
        </p>
      </td>
    </tr>
  </table>

  <h2 style="margin:26px 0 10px;font-size:22px;line-height:1.3;color:#0f2742;">
    Why this matters
  </h2>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Mass manipulation is dangerous because fear, outrage, and division weaken our judgment,
    separate us from one another, and pressure us to surrender choices that belong to us.
    When citizens are kept angry, afraid, and suspicious of one another, power becomes
    easier to hold and harder to question.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Freedom matters. Our right to make our own choices, speak our minds without fear of
    retribution, and associate freely or decline to associate is fundamental to
    self-government. When those freedoms are restricted, the voice of the people is
    weakened. When those freedoms are protected, Wyoming grows stronger.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The August 18th primary election matters &#8212; freedom works only when citizens use
    it. Every eligible Wyoming voter should make a plan, study the candidates, ask hard
    questions, and cast a ballot. Many of Wyoming&#8217;s most consequential choices are
    shaped in the primary &#8212; our voice belongs there. Power stays accountable when
    citizens show up.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    I am running to help restore trust in public service and make sure Wyoming&#8217;s
    voice is carried with honesty, courage, and respect. Restoring that trust begins by
    listening. It grows through conversation, and moves forward when neighbors decide the
    future belongs to all of us.
  </p>

  <h2 style="margin:28px 0 14px;font-size:22px;line-height:1.3;color:#0f2742;">
    Our campaign is focused on three commitments
  </h2>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;">
    <tr>
      <td style="padding:14px 0;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:16px;line-height:1.5;color:#0f2742;font-weight:bold;">
          1. Integrity in leadership
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
          Public service must be measured by truth, character, and accountability.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 0;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:16px;line-height:1.5;color:#0f2742;font-weight:bold;">
          2. A stronger Wyoming voice
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
          Wyoming communities deserve to be heard clearly, from small towns and ranch roads
          to main streets, schools, churches, coffee shops, and kitchen tables.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:16px;line-height:1.5;color:#0f2742;font-weight:bold;">
          3. A future built together
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
          We build lasting change by listening first, speaking honestly, and bringing
          people back into the work of self-government.
        </p>
      </td>
    </tr>
  </table>
`;

const FREEDOM_OR_CONTROL_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming voters are being shaped by forces most of them will never hear named.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    National PACs. Billionaire-funded advocacy networks. Out-of-state consulting firms.
    Dark money organizations. Social media algorithms built to divide. Cable news outrage
    engineered to exhaust. AI-generated persuasion at scale.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This is not a left problem or a right problem. It is a Wyoming problem.
  </p>

  <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
    The question is not whether the influence comes from one direction or another.
    The question is whether Wyoming voters are making Wyoming decisions &#8212; or whether
    powerful organizations headquartered outside this state are shaping our choices
    before we have a chance to think them through.
  </p>

  <h2 style="margin:26px 0 14px;font-size:20px;line-height:1.3;color:#0f2742;">
    What has been documented
  </h2>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border-left:5px solid #0f2742;background:#f8fafc;">
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#0f2742;">
          Americans for Prosperity / AFP-Wyoming
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          Connected to the Koch political network. AFP-Wyoming described its 2024 Wyoming
          primary investment as historic, endorsing legislative candidates before voters
          had spoken. In June 2026, AFP-Wyoming announced nine more endorsements ahead
          of the August 18 primary.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#0f2742;">
          Young Americans for Liberty and Make Liberty Win
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          Young Americans for Liberty (Austin, Texas) runs &#8220;Operation Win at the
          Door&#8221; nationwide. Its affiliated PAC, Make Liberty Win (Fairfax, Virginia),
          spent more than $370,000 on mail, texts, and voter outreach in Wyoming&#8217;s
          2024 legislative primaries &#8212; with YAL identified as the PAC&#8217;s
          primary financial backer. <em>Source: Wyoming Public Media.</em>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#0f2742;">
          State Freedom Caucus Network / Wyoming Freedom Caucus
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          WyoFile reported that the Wyoming Freedom Caucus aligned with a national
          organization and moved to control the statehouse. It is now working to retain
          and expand that position in 2026.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#0f2742;">
          Wyoming GOP Pre-Primary Endorsement Lawsuit
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          The Wyoming Republican Party filed a federal lawsuit challenging the state law
          that blocks parties from spending to back one primary candidate before voters
          choose the nominee. The fight is in court: can party insiders steer your
          primary before you vote?
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;background:#0f2742;border-radius:8px;">
    <tr>
      <td style="padding:20px 24px;">
        <p style="margin:0 0 14px;font-size:15px;line-height:2;color:#f1ece1;">
          Outside money comes in.<br/>
          Messages get sharpened.<br/>
          Neighbors get divided.<br/>
          Candidates get pressured.<br/>
          Local judgment gets weakened.
        </p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#f1ece1;">
          Then we are told this is &#8220;freedom.&#8221;
        </p>
        <p style="margin:0;font-size:17px;font-weight:bold;color:#e87a86;">
          I call it control.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 6px;font-size:16px;line-height:1.65;color:#111827;font-weight:600;">
    Transparency strengthens freedom.<br/>
    Hidden influence strengthens control.
  </p>

  <p style="margin:14px 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Every voter deserves to know who is speaking, who is paying for the message,
    and what interests are being advanced before casting a ballot.
  </p>

  <p style="margin:0 0 22px;font-size:17px;line-height:1.8;color:#0f2742;font-weight:bold;">
    The people choose.<br/>
    The party serves.<br/>
    The government answers to us.
  </p>

  <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/freedom-or-control/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the evidence with sources
    </a>
    at skovgard2026.org/share/freedom-or-control/sources/
  </p>
`;

const WYOMING_VOTERS_CHOOSE_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I want to share a message about what is happening inside Wyoming politics right now.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This is bigger than one candidate or one race. The issue is simple:
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
          <strong style="color:#b22234;">Freedom means voters choose.</strong>
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
          <strong style="color:#2b2b2b;">Control means insiders choose first</strong>
          and voters are expected to fall in line.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The new Wyoming GOP bylaw fight makes the issue plain. Party insiders now claim
    the power to endorse, oppose, and financially support candidates before voters have
    spoken in the primary.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    That turns the primary upside down.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I believe the people choose. The party serves. The government answers to us.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming voters can weigh in directly. Take the Wyoming primary elections and party
    pre-selection survey and add your voice to the public record:
    <a href="https://grassrootsmvt.org/surveys/wy-primary-elections-party-preselection"
        style="color:#0f2742;font-weight:bold;">
      grassrootsmvt.org/surveys/wy-primary-elections-party-preselection
    </a>
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/wyoming-voters-choose/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the full message with sources
    </a>
    at skovgard2026.org/share/wyoming-voters-choose/sources/
  </p>
`;

const REPRESENTATIVES_WORK_FOR_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    For too long, the voice of the constituency has been reduced to headlines, polls,
    social media arguments, and election-year promises. Then the election passes, the
    votes are cast, and the public is expected to simply remember four years later.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    We can do better.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Technology already allows us to organize the voice of the constituency in real time.
    Jimmy Skovgard has developed a working proof of concept through
    <a href="https://grassrootsmvt.org/surveys/wy-primary-elections-party-preselection" style="color:#0f2742;font-weight:bold;">GrassrootsMVT.org</a>
    designed to help Wyoming voters provide structured feedback on issues affecting our
    communities, our state, and our future.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Verified Wyoming voters participate in surveys designed to aggregate constituent
    feedback by issue and legislative district. Legislative actions and voting records
    can then be compared against the measured priorities of the people elected officials
    were chosen to represent.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:17px;line-height:1.7;color:#111827;font-weight:bold;">We ask.</p>
        <p style="margin:0 0 8px;font-size:17px;line-height:1.7;color:#111827;font-weight:bold;">Representatives vote.</p>
        <p style="margin:0 0 8px;font-size:17px;line-height:1.7;color:#111827;font-weight:bold;">We measure.</p>
        <p style="margin:0;font-size:17px;line-height:1.7;color:#b22234;font-weight:bold;">We remember.</p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This is foremost a tool for accountability.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;background:#f3f4f6;border-radius:8px;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#374151;font-style:italic;">
          Representation requires accountability.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;font-style:italic;">
          Accountability requires memory.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The goal is simple: strengthen communication between citizens and the people elected
    to serve us. Modern technology gives us the ability to organize public feedback,
    preserve transparency, and help ensure that the will of the constituency is neither
    forgotten nor ignored.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    Take part in the Wyoming primary election and party preselection survey &#8212;
    and join the proof of concept at
    <a href="https://grassrootsmvt.org/surveys/wy-primary-elections-party-preselection"
        style="color:#0f2742;font-weight:bold;">
      GrassrootsMVT.org
    </a>.
  </p>
`;

const WY_VOTER_ACCESS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming voices matter.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I am asking voters to take a short survey about voter access in Wyoming.
  </p>

  <p style="margin:0 0 6px;font-size:16px;line-height:1.65;color:#111827;">
    Should Wyoming create a statewide voting holiday?
  </p>
  <p style="margin:0 0 6px;font-size:16px;line-height:1.65;color:#111827;">
    Should eligible residents be automatically registered to vote when getting or renewing
    a driver&#8217;s license or state ID?
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Should Wyoming protect same-day voter registration?
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://grassrootsmvt.org/surveys/wy-voter-access"
        style="color:#2b2b2b;font-weight:bold;">
      Take the short survey
    </a>
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/surveys/wy-voter-access/info"
        style="color:#2b2b2b;font-weight:bold;">
      Want to know more?
    </a>:
    skovgard2026.org/surveys/wy-voter-access/info
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    Exact questions and results will be published in aggregate.
  </p>
`;

const WY_CITIZEN_BALLOT_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The Citizens Nonpartisan Ballot is a civic project through The Integrity Project:
    People&#8217;s Primary. The idea is simple: list every candidate for each office in one
    place and let voters choose one candidate per office, regardless of party label.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:18px 20px;">
        <p style="margin:0 0 8px;font-size:17px;line-height:1.65;color:#111827;font-weight:bold;">
          One voter. One ballot. One choice per office.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
          Every candidate for each office listed in one place. Voters compare people,
          records, service, character, and ideas &#8212; and choose.
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;background:#fef7f7;border-left:5px solid #b22234;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.65;color:#111827;font-style:italic;">
          <strong>This is not an official election.</strong>
          It is a voter education and public survey project to show what voter choice
          could look like in Wyoming.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Some voters choose by party. Some voters choose by candidate.
    Wyoming should respect both.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Keep party ballots. Add voter choice.
  </p>

  <table cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
    <tr>
      <td style="background:#b22234;border-radius:8px;padding:12px 24px;">
        <a href="https://grassrootsmvt.org/surveys/wy-citizens-nonpartisan-ballot"
           style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
          Take the Wyoming Citizens Nonpartisan Ballot Survey &#8594;
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#374151;">
    Learn more about the Citizens Nonpartisan Ballot:
    <a href="https://skovgard2026.org/share/wy-citizen-ballot"
        style="color:#0f2742;font-weight:bold;">
      skovgard2026.org/share/wy-citizen-ballot
    </a>
  </p>
`;

const UNTRAMMELED_SUFFRAGE_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I wanted to share a tool I have been building called <strong>Untrammeled Suffrage</strong>.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The name comes from Wyoming&#8217;s constitutional promise that elections shall be open,
    free, and equal. In plain language, <strong>untrammeled suffrage means the unrestricted
    right to vote</strong>.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I built this tool because when we need a tool, the Wyoming way is to build it.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Untrammeled Suffrage is a phone-friendly voter outreach and volunteer coordination
    tool created for Wyoming candidates and civic efforts that support every eligible
    voter&#8217;s right to vote and to choose a preferred candidate.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The app is currently a <strong>test product</strong>. The free version is set up
    primarily to support <strong>Skovgard for Senate</strong> field activity, data
    collection, volunteer follow-up, Pulse opt-ins, and voter outreach reporting. This
    gives your campaign a way to review the tool, test the workflow, and decide whether a
    campaign-specific version would be useful.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Skovgard for Senate campaign volunteers are granted free access through the volunteer page:
    <a href="https://skovgard2026.org/volunteer"
        style="color:#0f2742;font-weight:bold;">
      skovgard2026.org/volunteer
    </a>
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;background:#f3f4f6;border-radius:8px;">
    <tr>
      <td style="padding:18px 22px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
          For another candidate&#8217;s campaign, Skovgard for Senate is offering one test seat as a
          <strong>$100 in-kind contribution to your campaign</strong>.
        </p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#374151;">
          To opt in, email Jimmy at
          <a href="mailto:jimmy@grassrootsmvt.org" style="color:#0f2742;font-weight:bold;">jimmy@grassrootsmvt.org</a>
          with the subject line: <strong>Untrammeled Suffrage Test Seat</strong>
        </p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
          In the email, include your name, campaign name, office sought, preferred contact
          number, and the email address for the person who should receive access.
        </p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">
          If you would rather talk first, call or text Jimmy at
          <a href="tel:+13072772260" style="color:#0f2742;font-weight:bold;">307-277-2260</a>.
        </p>
        <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6b7280;font-style:italic;">Suggested filing description:</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;font-style:italic;">
          In-kind contribution from Skovgard for Senate: Untrammeled Suffrage voter
          outreach software test access, one active user seat, fair-market value $100.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Access is personally granted by me, one candidate at a time. Additional seats are
    available by request and are negotiable based on campaign needs, platform capacity,
    compliance requirements, and whether your campaign wants a campaign-specific setup.
    Any additional access would require a separate written understanding before activation.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    For another campaign&#8217;s active use, the tool can be upgraded or configured for
    that campaign. A campaign-specific setup would separate campaign users, campaign notes,
    contact activity, opt-ins, reports, and follow-up workflows so your campaign&#8217;s
    outreach work is organized for your own use.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#374151;">
          This is software access. Voter registry data is never sold.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
          Voter registry data may be used only for lawful political, campaign, voter outreach,
          voter participation, or election-related purposes. Commercial use is prohibited.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This tool is offered because voter participation belongs to us, and our system works
    best when more citizens can be reached, heard, and respected.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    I would be glad to walk through the app with you, provide one test seat, and discuss
    whether a campaign-specific setup makes sense for your team.
  </p>
`;

const WY_PRIMARY_ELECTION_PARTICIPATION_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I thought you might want to take this short Wyoming Primary Election Participation Survey.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The survey asks how Wyoming primary elections should work, including:
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#111827;">
          Who should be able to participate in Wyoming primary elections
        </p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#111827;">
          When party-affiliation deadlines should be set
        </p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#111827;">
          How voter access and party nomination rights should be balanced
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
          How results should be reported
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This survey is designed to gather registered Wyoming voter input. Responses may be
    verified against a Wyoming registered voter file obtained from the Secretary of State.
    Verified and unverified results can be reported separately, and individual responses
    remain confidential.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://grassrootsmvt.org/surveys/wy-primary-election-participation"
        style="color:#0f2742;font-weight:bold;">
      Take the survey
    </a>
    at grassrootsmvt.org/surveys/wy-primary-election-participation
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    Your voice helps build a clearer public record of what Wyoming voters want.
  </p>
`;

const WY_FOUR_PILLARS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming voters deserve more than slogans. The Wyoming Four Pillars Survey asks specific public
    policy questions and publishes results in aggregate &#8212; so we can see where Wyoming voters
    agree, where we differ, and where lawmakers need to listen.
  </p>

  <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#2b2b2b;">The four pillars covered:</p>
  <ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.7;color:#111827;">
    <li><strong>Life</strong> &#8212; abortion law, unborn life, exceptions, enforcement, medical decision-making, pregnancy support</li>
    <li><strong>Religious Liberty</strong> &#8212; conscience, public programs, schools, public meetings, religious expression, equal access</li>
    <li><strong>Family Values</strong> &#8212; parental rights, school transparency, child safety, online access, libraries, medical consent, due process</li>
    <li><strong>Education Freedom</strong> &#8212; public schools, private schools, religious schools, homeschool families, school choice funding, rural schools, accountability</li>
  </ul>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The survey is non-binding. Individual answers remain confidential. Results will be published
    in aggregate.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="text-align:center;padding:4px 0 20px;">
        <a href="https://grassrootsmvt.org/surveys/wy-four-pillars"
           style="display:inline-block;padding:14px 28px;background:#b22234;color:#f1ece1;font-weight:bold;font-size:16px;text-decoration:none;border-radius:8px;">
          Take the Survey
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    Please share with three Wyoming neighbors. The more Wyoming voices, the clearer the picture.
  </p>

  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
    This survey is a public-input proof of concept by Skovgard for Senate. It is not affiliated
    with, endorsed by, or reviewed by Wyoming Family Alliance. Results do not create binding
    policy, legal action, or an official position for any organization.
  </p>
`;

const WY_DATA_CENTERS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming is seeing more discussion about large data centers and other large-load facilities.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    These projects may bring investment, jobs, tax revenue, and technology infrastructure.
    They may also affect water, electric rates, roads, housing, wildlife, agriculture, and local planning.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This survey does not take a position for or against data centers. It asks what safeguards,
    benefits, and public-review standards Wyoming voters believe should apply before large
    projects move forward.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="text-align:center;padding:4px 0 20px;">
        <a href="https://grassrootsmvt.org/surveys/wy-data-centers"
           style="display:inline-block;padding:14px 28px;background:#b22234;color:#f1ece1;font-weight:bold;font-size:16px;text-decoration:none;border-radius:8px;">
          Take the Survey
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    Please share with three Wyoming neighbors. The more Wyoming voices, the clearer the picture.
  </p>

  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
    Individual responses are not published. Results are reported only in aggregate &#8212; statewide,
    county, State House district, or State Senate district totals when enough responses are available.
  </p>
`;

const WY_ROADLESS_AREAS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming has more than 3 million acres of inventoried roadless areas on National Forest System lands.
    A current federal rulemaking process is considering rescission of the 2001 Roadless Rule, which would
    return more decisions to local land managers. This survey asks Wyoming voters what standards should
    guide those decisions.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The questions cover water, wildlife, access, wildfire risk, and local voice. The survey presents
    both sides &#8212; management flexibility versus long-term land protection &#8212; and asks Wyoming
    voters to weigh in. Individual answers remain confidential. Results will be published in aggregate.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
    <tr>
      <td style="background:#f7f3ec;border-left:4px solid #c68a4a;padding:14px 18px;border-radius:6px;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          <strong style="color:#2b2b2b;">This survey is non-binding and education-focused.</strong>
          Individual responses are never published. Results are reported in aggregate only &#8212;
          statewide, by county, or by legislative district when enough responses are available.
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="text-align:center;padding:4px 0 20px;">
        <a href="https://grassrootsmvt.org/surveys/wy-roadless-areas"
           style="display:inline-block;padding:14px 28px;background:#b22234;color:#f1ece1;font-weight:bold;font-size:16px;text-decoration:none;border-radius:8px;">
          Take the Survey
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Please share with three Wyoming neighbors. The more Wyoming voices, the clearer the picture.
  </p>

  <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/wy-roadless-areas/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the full background with sources
    </a>
    at skovgard2026.org/share/wy-roadless-areas/sources/
  </p>

  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
    This survey is a public-input project by Skovgard for Senate. Results create a public record
    that can be compared with future agency decisions and legislation. Results do not create binding
    policy or legal action.
  </p>
`;

const WY_COMMERCIAL_PROPERTY_TAX_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Commercial property taxes affect more than building owners &#8212; they shape local businesses,
    rents, payroll, prices, downtown investment, county budgets, and the cost of doing business
    in Wyoming.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming&#8217;s commercial assessment rate is generally set statewide at 9.5&#37; of market
    value, so the real public question isn&#8217;t the rate &#8212; it&#8217;s whether valuation,
    classifications, notices, mill levies, business personal property rules, and appeal rights are
    clear enough for the people paying the bill. This survey uses Natrona County and Casper as a
    case study, since public records are available for review, then asks whether the same
    questions matter statewide.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
    <tr>
      <td style="background:#f7f3ec;border-left:4px solid #c68a4a;padding:14px 18px;border-radius:6px;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          <strong style="color:#2b2b2b;">This is about transparency, not wrongdoing.</strong>
          Wyoming&#8217;s Constitution calls for equal and uniform taxation within each class and
          subclass of property &#8212; citizens should be able to understand how values are set,
          how bills are calculated, and how to ask questions when something looks off.
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="text-align:center;padding:4px 0 20px;">
        <a href="https://grassrootsmvt.org/surveys/wy-commercial-property-tax"
           style="display:inline-block;padding:14px 28px;background:#b22234;color:#f1ece1;font-weight:bold;font-size:16px;text-decoration:none;border-radius:8px;">
          Take the Survey
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Please share with three Wyoming neighbors. The more counties represented, the clearer the picture.
  </p>

  <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/wy-commercial-property-tax/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the full breakdown with sources
    </a>
    at skovgard2026.org/share/wy-commercial-property-tax/sources/
  </p>

  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
    This survey is a public-input project by Skovgard for Senate. It does not claim wrongdoing.
    Individual responses are never published. Results are reported in aggregate only, by county
    where enough responses are available.
  </p>
`;

const NOTHING_BURGER_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I want to share a breakdown of a taxpayer-funded congressional mailing about Wyoming&#8217;s public lands &#8212; and the question it does not answer.
  </p>

  <h2 style="margin:26px 0 10px;font-size:20px;line-height:1.3;color:#0f2742;">
    1. The mailing
  </h2>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    Rep. Harriet Hageman sent Wyoming constituents a letter about federal public lands. The footer states:
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 18px;border-left:5px solid #c68a4a;background:#fbf8f1;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;font-style:italic;">
          &#8220;PAID FOR BY OFFICIAL FUNDS AUTHORIZED BY THE HOUSE OF REPRESENTATIVES.&#8221;
        </p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#374151;">
          <a href="https://www.skovgard2026.org/docs/hageman-nothing-burger-letter.pdf"
              style="color:#0f2742;font-weight:bold;text-decoration:none;">
            View the original mailing (PDF) &#8594;
          </a>
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The letter says Hageman &#8220;never voted for the mass sale&#8221; of public lands. That narrow denial is consistent with the record &#8212; the 2025 Senate land-sale provision was removed before any final vote.
  </p>

  <h2 style="margin:26px 0 10px;font-size:20px;line-height:1.3;color:#0f2742;">
    2. What the mailing does not explain
  </h2>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    The Senate budget bill included language that would have required federal land managers to dispose of land in 11 western states. Wyoming was on that list. Montana was not.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 18px;border:1px solid #e5e7eb;">
    <tr style="background:#f8fafc;">
      <td style="padding:8px 14px;font-size:12px;font-weight:bold;text-transform:uppercase;
          letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;width:50%;">
        Wyoming
      </td>
      <td style="padding:8px 14px;font-size:12px;font-weight:bold;text-transform:uppercase;
          letter-spacing:0.08em;color:#b22234;border-bottom:1px solid #e5e7eb;">
        Montana
      </td>
    </tr>
    <tr>
      <td style="padding:12px 14px;font-size:15px;color:#111827;border-right:1px solid #e5e7eb;">
        Listed in the Senate proposal.
      </td>
      <td style="padding:12px 14px;font-size:15px;color:#111827;">
        Carved out. Not listed.
      </td>
    </tr>
  </table>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    When asked why Montana was excluded, Hageman told Cowboy State Daily she was not sure and said: <em>&#8220;This is a Senate bill. I didn&#8217;t write it.&#8221;</em>
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The mailing answers the narrow vote question. It does not explain why Wyoming did not receive the same protection Montana received.
  </p>

  <h2 style="margin:26px 0 10px;font-size:20px;line-height:1.3;color:#0f2742;">
    3. What Wyoming deserves
  </h2>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    The proposal was removed before it became law &#8212; that is good news. But the question remains on the record:
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;font-weight:bold;">
          Why did Montana get a carve-out that Wyoming did not get?
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming public lands belong to Wyoming families. A taxpayer-funded mailing should answer that question directly, not leave it hanging. Wyoming deserves straight answers.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/nothing-burger/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the full breakdown with sources
    </a>
    at skovgard2026.org/share/nothing-burger/sources/
  </p>
`;

// ── Message registry ───────────────────────────────────────────────────────────
// One entry per shareable message. subject() and intro() accept an optional senderName.

const POSTAGE_BANDIT_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    We have a situation. Our representative gets to Washington, looks at the House franking
    privilege&#8212;a taxpayer-funded mailing right meant for official constituent communication&#8212;
    and decides it belongs to her reelection campaign.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I just filed an official FEC complaint against Representative Harriet Hageman. The 2025 House
    Communications Standards Manual is clear: official mass mailings paid for with public funds may
    not contain campaign content, electioneering, fundraising, or content that disparages individuals.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td style="padding:16px 20px;background:#fff5f5;border-left:4px solid #b22234;border-radius:4px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#b22234;">What the mailing actually says</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;font-style:italic;">
          Critics are called &#8220;fearmongering radicals&#8221; who are &#8220;conveniently
          fundraising off their dishonesty.&#8221; On official letterhead. Paid for with
          <strong>an estimated $130,000&#8211;$145,000 in public money</strong>.
        </p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    That is not policy explanation. That is a campaign-style political attack on the public dime.
    You do not have to take my word for it&#8212;the original mailing and the full text of the
    complaint are both available to review.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td>
        <a href="https://skovgard2026.org/share/postage-bandit/sources/"
           style="display:inline-block;background:#b22234;color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:4px;">
          Read the complaint and sources &#8594;
        </a>
      </td>
    </tr>
  </table>
`;

const CITIZENS_DEFEND_THE_CONSTITUTION_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I wanted to share a short video message from Jimmy Skovgard &#8212; filmed in Wyoming &#8212;
    on three things that drive this campaign.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The message is simple: citizens defend the Constitution. Public servants swear the oath.
    Wyoming deserves a Senator who takes that oath seriously.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td style="padding:16px 20px;background:#f7f3ec;border-left:4px solid #b22234;border-radius:4px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#b22234;">Three Pillars of the Campaign</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#111827;"><strong>1. Defend the Constitution</strong> &#8212; The oath still matters.</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#111827;"><strong>2. Restore Accountability</strong> &#8212; Public servants answer to Wyoming.</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;"><strong>3. Listen to Wyoming</strong> &#8212; Real decisions require real input.</p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    The video runs about five minutes, recorded with Heart Mountain as the backdrop. No teleprompter.
    No handlers. Just Wyoming and the Golden Rule.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td>
        <a href="https://skovgard2026.org/share/citizens-defend-the-constitution/"
           style="display:inline-block;background:#b22234;color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:4px;">
          Watch the Video
        </a>
      </td>
    </tr>
  </table>
`;

const FLEECING_LETTERS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Two letters arrived in Wyoming mailboxes on official congressional letterhead. Both stated
    &#8220;PAID FOR BY OFFICIAL FUNDS AUTHORIZED BY THE HOUSE OF REPRESENTATIVES.&#8221;
    Both used fear, blame, and campaign-style framing at public expense.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This is about how our tax dollars &#8212; or should we say our grandchildren&#8217;s tax dollars &#8212;
    are being misused to shape public opinion. We deserve clean information, honest costs, and public
    resources that serve the public.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td style="padding:16px 20px;background:#f7f3ec;border-left:4px solid #c68a4a;border-radius:4px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#c68a4a;">How these letters work</p>
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;"><strong>1. Fear comes first.</strong> Both letters open with danger, crisis, blocked access, fires, outside threats. When fear comes first, we react before we reflect.</p>
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;"><strong>2. Responsibility goes elsewhere.</strong> Rep. Hageman has held office for more than three years while many of the problems described continued to grow &#8212; yet the letters paint responsibility as living somewhere else.</p>
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;"><strong>3. Official authority lends weight.</strong> Congressional letterhead makes a campaign defense look like a public update.</p>
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;"><strong>4. Volume replaces clarity.</strong> A long list of bills, hearings, and agencies feels like proof. It is not the same as facts, costs, and tradeoffs.</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;"><strong>5. The middle gets skipped.</strong> What are the options? Costs? Who benefits? Who pays? Good public mail answers these questions. These letters do not.</p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Public money must serve the public. Read the letters. Follow the money. Ask better questions.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td>
        <a href="https://skovgard2026.org/share/fleecing-letters/"
           style="display:inline-block;background:#b22234;color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:4px;">
          Read the full analysis &#8594;
        </a>
      </td>
    </tr>
  </table>
`;

const CHANGING_HEALTH_CARE_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Wyoming is facing a hard question. After the Wyoming Supreme Court&#8217;s ruling on abortion policy
  and Article&nbsp;1, Section&nbsp;38 of the Wyoming Constitution, the path forward should be honest,
  constitutional, and led by the people of Wyoming.
</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  This campaign is built on a simple belief: we do not have to let hard issues tear us apart.
  We can face them directly. We can tell the truth. We can follow the Constitution. And when
  the Constitution needs to be changed, we can place that question before the people.
</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  The issue is bigger than one court case, one law, or one headline.
  It goes to the oath of office itself.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  Every elected representative is bound to support, obey, and defend the Constitution.
  Our representatives do not own that oath. We do.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #b22234;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b22234;">The Honest Path</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#111827;">
        If Wyoming wants to change how the Constitution applies to health care and abortion policy,
        the honest path is a constitutional amendment placed before the people of Wyoming.
      </p>
      <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#374151;">
        That path lets us answer the hard questions directly:
      </p>
      <ul style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.8;color:#374151;">
        <li>When does human life begin?</li>
        <li>When should human life receive the protections of law?</li>
        <li>What safeguards must exist for medical emergencies, miscarriage care, ectopic pregnancy care, fatal fetal anomalies, rape, incest, and serious threats to a pregnant patient&#8217;s health?</li>
        <li>How do we protect lawful, medically appropriate decisions between patients and medical providers?</li>
        <li>And how do we make sure our representatives stay within the guardrails of the Constitution?</li>
      </ul>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px;font-size:15px;font-weight:700;color:#0f2742;">GrassrootsMVT: A Proof of Concept</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  GrassrootsMVT.org is being built as a proof of concept for verified public input.
  The purpose is simple: give registered Wyoming voters a way to weigh in directly on difficult issues,
  district by district and county by county, so our representatives cannot hide behind noise,
  pressure, or assumptions.
</p>

<table cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
  <tr>
    <td style="background:#b22234;border-radius:8px;padding:12px 24px;">
      <a href="https://grassrootsmvt.org/surveys/wy-health-care-constitutional-process"
         style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
        Take the Wyoming Health Care and Constitutional Process Survey &#8594;
      </a>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
  Read the source packet for the constitutional background and court ruling:&nbsp;
  <a href="https://skovgard2026.org/docs/Wellspring_Completed_Questionnaire_Skovgard_With_Public_Input.pdf"
     style="color:#0f2742;font-weight:600;text-decoration:underline;">
    Wellspring Questionnaire with Public Input (PDF)
  </a>
</p>

<p style="margin:24px 0 0;font-size:16px;line-height:1.9;color:#111827;font-weight:700;">
  We are Wyoming.<br />
  Our representatives work for us.<br />
  The Constitution belongs to the people.
</p>
`;

const CANDIDATE_HUB_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Wyoming deserves an election process built around people, clarity, and trust.
</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  The Wyoming Candidate Hub is a simple place to find every candidate running for office in
  Wyoming &#8212; and begin comparing who is asking to represent us. It&#8217;s designed to help
  voters see the full field, ask better questions, and make their own decisions.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  This project is part of a larger effort to bring accountability, transparency, and public
  input back into the center of our election process. A complete candidate listing is something
  Wyoming voters deserve access to.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #c68a4a;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#c68a4a;">What you&#8217;ll find</p>
      <ul style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.85;color:#374151;">
        <li>Federal, statewide, and legislative candidates</li>
        <li>County and municipal races across Wyoming</li>
        <li>Campaign websites, social links, and contact information where available</li>
        <li>A ballot lookup tool to see which races are on your specific ballot</li>
      </ul>
    </td>
  </tr>
</table>

<table cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
  <tr>
    <td style="background:#b22234;border-radius:8px;padding:12px 28px;">
      <a href="https://candidates.skovgard2026.org/"
         style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
        View the Candidate Hub &#8594;
      </a>
    </td>
  </tr>
</table>

<p style="margin:0 0 0;font-size:15px;line-height:1.7;color:#374151;">
  Every candidate. One place. Wyoming voters decide.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #2b2b2b;padding:16px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#2b2b2b;">For candidates</p>
      <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#374151;">
        If you are a candidate or campaign representative, you can request corrections or additions
        to your card &#8212; name, office, website, photo, bio, and more.
      </p>
      <a href="https://skovgard2026.org/documents/candidate-card-update-instructions.pdf"
         style="color:#0f2742;font-weight:700;font-size:14px;text-decoration:underline;">
        Download the Candidate Card Update Instructions (PDF) &#8594;
      </a>
    </td>
  </tr>
</table>
`;

const PRIMARY_CANDIDATES_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Hi, {first_name},
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  I built a tool to help Wyoming voters build their primary ballot &#8212; every candidate
  in one place, all the way down to the precinct level where available.
</p>

<table cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
  <tr>
    <td style="background:#b22234;border-radius:8px;padding:13px 26px;">
      <a href="https://candidates.skovgard2026.org/"
         style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
        View the Wyoming Candidate Hub &#8594;
      </a>
    </td>
  </tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #7a8a6b;padding:16px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">
        My campaign is a digital neighbor-to-neighbor effort focused on truth,
        accountability, Wyoming voices, and a future we build together.
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;font-weight:600;">
  May I send you occasional campaign updates, candidate information, and ways to take part?
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
  <tr>
    <td style="padding-right:10px;">
      <a href="{optin_yes_url}" style="display:inline-block;background:#b22234;color:#f1ece1;
          font-weight:700;font-size:14px;text-decoration:none;padding:11px 18px;
          border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
        Yes, keep me updated
      </a>
    </td>
    <td>
      <a href="{optin_no_url}" style="display:inline-block;background:#ffffff;color:#2b2b2b;
          font-weight:700;font-size:14px;text-decoration:none;padding:11px 18px;
          border-radius:8px;border:1px solid #b7a88a;font-family:Arial,Helvetica,sans-serif;">
        No, unsubscribe me
      </a>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#6b7280;">
  You can opt out at any time.
</p>

<p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
  Thank you,<br>
  <strong>Jimmy Skovgard</strong>
</p>
`;

const HIGHER_PRICES_WASHINGTON_DEBT_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  The economy may look good on paper, but printed money and runaway spending show up where it
  matters &#8212; at the grocery store, the gas pump, the utility bill, and the cost of a home
  or vehicle. When the money supply keeps growing, prices keep rising, and it is Wyoming families
  who pay the price.
</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  At the same time, America keeps entering conflicts without a clear path out. Open-ended foreign
  war is expensive &#8212; in lives, in treasure, and in the trust that holds a nation together.
  We have seen this before. A conflict without a plan to end it is a conflict that never ends.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  And the debt keeps climbing. We went from around $36 trillion to nearly $40 trillion in less
  than two years &#8212; burning through $3.5 trillion of the $4 trillion ceiling that was just
  raised. Inflating a debt away only works if the spending stops. It hasn&#8217;t stopped.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #b22234;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b22234;">The Answer Starts With Accountability</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#111827;">
        We need representatives from the people &#8212; not tied to big money, not trapped inside
        the system, and willing to speak honestly about debt, spending, war, and the future we are
        leaving our children and grandchildren.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">
        That is why Jimmy Skovgard is running. Someone close to the people needs to step up and
        speak for the people.
      </p>
    </td>
  </tr>
</table>

<table cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
  <tr>
    <td style="background:#b22234;border-radius:8px;padding:12px 28px;">
      <a href="https://skovgard2026.org/pulse"
         style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
        Sign up for campaign updates on the Pulse page &#8594;
      </a>
    </td>
  </tr>
</table>

<p style="margin:24px 0 0;font-size:16px;line-height:1.9;color:#111827;font-weight:700;">
  Economy. War. Debt.<br />
  These are real problems.<br />
  Wyoming deserves real answers.
</p>
`;

const WYOMING_FAMILY_ECONOMY_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  A good economy is not measured only by a market index or a Washington talking point. It is measured
  at the kitchen table: whether a Wyoming family can pay for groceries, fuel, utilities, housing, and
  still save for the future.
</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  When the cost of necessities absorbs a modest pay increase, young families begin asking whether they
  can afford to stay and build a life in Wyoming. That is the financial reality public officials must
  face directly.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#f1ece1;border-left:4px solid #b22234;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b22234;">Responsible Stewardship</p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#111827;">
        Government must live within its limits, just as a household, ranch, or small business must.
        Honest budgets, stable energy policy, and clear explanations of every vote are how leaders
        protect the future and earn the public&#8217;s trust.
      </p>
    </td>
  </tr>
</table>
<p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#111827;">
  Every public dollar was first earned by a working taxpayer. Jimmy Skovgard believes government
  should listen to Wyoming citizens before it lectures them.
</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">
  <a href="https://skovgard2026.org/share/wyoming-family-economy/sources/" style="color:#b22234;font-weight:700;">Read the supporting public data</a>
  for this message.
</p>
`;

const WYOMING_NOT_FOR_SALE_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Wyoming politics should belong to Wyoming citizens. That sounds obvious. But our local races
    and legislative fights are being crowded by national organizations, out-of-state PACs, and
    opaque funding networks with agendas built far from our towns, ranches, schools, and main streets.
  </p>

  <h2 style="margin:26px 0 10px;font-size:20px;line-height:1.3;color:#0f2742;">
    The receipts
  </h2>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 18px;border-left:5px solid #b22234;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 18px;">
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#111827;">
          <strong>Americans for Prosperity&#8212;Wyoming</strong> announced its 2024 legislative
          endorsements would be the <em>single largest investment in Wyoming state-level politics
          in history.</em>
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
          <strong>Make Liberty Win</strong>, a Virginia-based PAC, spent just over
          <strong>$370,000</strong> on texts, phone calls, and mailers in Wyoming primary
          races&#8212;including mailers with wrong early-voting dates.
        </p>
      </td>
    </tr>
  </table>

  <h2 style="margin:26px 0 10px;font-size:20px;line-height:1.3;color:#0f2742;">
    How the machine works
  </h2>

  <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#111827;">
    Outside money moves through 501(c)(4) nonprofits, super PACs, donor networks, and issue
    campaigns. Some spending is disclosed. Donor origins are often harder to trace. AFP is a
    501(c)(4) and is not required to disclose its donors.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Legal is not the same as clean. Legal is not the same as accountable.
    Legal is not the same as Wyoming-grown.
  </p>

  <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#111827;font-weight:700;">
    Wyoming is not a testing ground. Wyoming is not a billionaire sandbox.
    Wyoming belongs to the people who live here.
  </p>

  <p style="margin:0;font-size:15px;line-height:1.65;color:#374151;">
    <a href="https://skovgard2026.org/share/wyoming-not-for-sale/sources/"
        style="color:#b22234;font-weight:700;">Read the full breakdown with sources</a>
    at skovgard2026.org/share/wyoming-not-for-sale/sources/
  </p>
`;

const ONE_MILLION_MESSAGES_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Every generation faces a defining question.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Will our future be shaped more by freedom or by control?
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I believe the answer begins with us.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#c68a4a;">Who</p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
          You. Me. Every citizen willing to have one honest conversation with another person.
          Together, our goal is simple: <strong>one million messages</strong>.
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b22234;">What</p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
          One million conversations centered on one question:
        </p>
        <p style="margin:0;font-size:17px;line-height:1.65;color:#111827;font-weight:bold;">
          Are we moving toward greater freedom, or greater control?
        </p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <tr style="background:#f8fafc;">
      <td style="padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;border-bottom:1px solid #e5e7eb;">When / Where / Why / How</td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#0f2742;">When:</strong> It starts today. One conversation at a time.
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#0f2742;">Where:</strong> Across Wyoming. Across America. At the kitchen table, over coffee, at work, at community events &#8212; anywhere people are willing to look each other in the eye.
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#0f2742;">Why:</strong> Freedom grows with informed, engaged citizens. Trust grows through conversation. Communities grow stronger when we listen, learn, and work together.
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#0f2742;">How:</strong> Join the Pulse platform at Skovgard2026.org. Receive conversation starters and ideas worth sharing. Then carry them into your community.
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#111827;">One conversation becomes ten.</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#111827;">Ten become one hundred.</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#111827;">One hundred become one thousand.</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#111827;font-weight:bold;">Together, we can share one million messages.</p>
      </td>
    </tr>
  </table>

  <h2 style="margin:26px 0 10px;font-size:22px;line-height:1.3;color:#0f2742;">Your Next Step</h2>

  <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
    Join the movement. Start one conversation today. Invite one other person to do the same.
    Share one message that encourages curiosity, understanding, and participation.
  </p>

  <table cellpadding="0" cellspacing="0" style="margin:18px 0 22px;">
    <tr>
      <td style="background:#b22234;border-radius:8px;padding:12px 28px;">
        <a href="https://skovgard2026.org/pulse"
           style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
          Join the Pulse platform at Skovgard2026.org &#8594;
        </a>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#111827;">One conversation.</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#111827;">One neighbor.</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#111827;">One community.</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#111827;font-weight:bold;">Our future begins with us.</p>
      </td>
    </tr>
  </table>
`;

const TOWN_HALL_INTRODUCTION_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    At a Wyoming town hall this spring, Jimmy Skovgard opened with something you don't hear
    from politicians very often — an honest admission.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:20px 22px;">
        <p style="margin:0 0 10px;font-size:18px;line-height:1.55;color:#111827;font-style:italic;font-weight:bold;">
          "If it said R, I hit the checkbox."
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
          — Jimmy Skovgard, Wyoming Town Hall, April 2026
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Most Wyoming voters have been exactly where he was. We pick a party and check the box
    without always looking closely at who we're actually electing or what they'll do
    once they get there.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Jimmy's message: that comfortable habit has a real cost, and Wyoming is paying it right now.
  </p>

  <h2 style="margin:26px 0 12px;font-size:20px;line-height:1.3;color:#0f2742;">The Legislative Branch Has Left Wyoming Behind</h2>

  <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">
    The founders placed Congress at Article I for a reason — it was meant to be the most powerful
    branch of government. Jimmy laid it out plainly: Article I legislators have handed their authority
    to Article II executives, and Wyoming citizens are left with representatives who follow
    rather than lead.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#c68a4a;">Example he raised</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#111827;">
          Nine cabinet members. <strong>Combined wealth over $460 billion.</strong>
          The wealthy are represented well — how about the rest of us?
          The Wyoming congressional delegation had one question to answer: do we confirm these appointments
          and trust the process, or do we ask harder questions first?
          Their answer told us something.
        </p>
      </td>
    </tr>
  </table>

  <h2 style="margin:26px 0 12px;font-size:20px;line-height:1.3;color:#0f2742;">The Tools Exist — the Willpower Doesn't</h2>

  <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">
    Jimmy pointed to the technology and the platforms Wyoming citizens now have to make their
    voices heard at the district level — verified public input, direct to their representatives.
    The tools are there. The bottleneck is whether the people we send to Washington are willing
    to listen and act.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    That's what this campaign is built around: putting Wyoming citizens back in the driver's seat.
  </p>

  <h2 style="margin:26px 0 12px;font-size:20px;line-height:1.3;color:#0f2742;">What You Can Do</h2>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#b22234;">1.</strong>&nbsp; Watch the town hall and share this page with a neighbor who might be thinking the same thing.
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#b22234;">2.</strong>&nbsp; Ask your own honest question: who did you vote for last time, and do you know what they did with it?
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;font-size:15px;line-height:1.6;color:#111827;">
        <strong style="color:#b22234;">3.</strong>&nbsp; Volunteer. The August 18th primary is close. Wyoming citizens deciding this race — not outside money — is exactly what Jimmy is talking about.
      </td>
    </tr>
  </table>

  <table cellpadding="0" cellspacing="0" style="margin:18px 0 22px;">
    <tr>
      <td style="background:#b22234;border-radius:8px;padding:12px 28px;">
        <a href="https://skovgard2026.org/share/town-hall-introduction"
           style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
          Watch the Town Hall &#8594;
        </a>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #d8b46a;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#111827;">Citizens are the fourth branch of government.</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#111827;">Our representatives work for us.</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#111827;font-weight:bold;">Freedom works only when citizens use it.</p>
      </td>
    </tr>
  </table>
`;

const BOULDER_AND_THE_WEEDS_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Something is deeply off with our political system. It has become a machine running on money
    and outrage &#8212; one that keeps regular citizens reacting, divided, and distracted while our
    freedom, our voice, and our local power keep moving farther away from our communities.
  </p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    While families pay more at the grocery store, the gas pump, and on utility bills, the machine
    manufactures a nonstop cycle of outrage that keeps neighbors staring sideways at each other
    instead of looking clearly at what is happening to our country. When neighbors are kept angry
    at neighbors, accountability disappears and the same old machine keeps rolling along.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fbf8f1;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
          Truth is the boulder &#8212; stoic, existing, and enduring. Misinformation, fear, and
          outrage are like invasive weeds finding a hairline crack to grow in.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
          Truth needs no advertising budget or corporate PAC to exist. It can sit quietly, it can
          wait, and it always rises &#8212; especially when a community has the courage to share.
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Real change does not come from the top down, and it will not come from another round of
    screaming. It starts quietly, when neighbors choose to share the truth, when citizens stop
    taking the bait, and when we remember that our communities were never built to be turned
    against one another.
  </p>
  <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#111827;font-weight:700;">
    Wyoming knows something about grit, patience, and building for the long haul. August 18 is
    coming. We may not reach everyone tomorrow, but we can reach a friend today.
  </p>

  <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:#374151;">
    <a href="https://skovgard2026.org/files/truth-and-weeds-essay.pdf"
        style="color:#b22234;font-weight:700;">Read the full essay, "The Boulder and the Weeds"</a>
    at skovgard2026.org/files/truth-and-weeds-essay.pdf
  </p>
`;

const QUESTIONNAIRE_CHALLENGE_QUESTIONS_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #c68a4a;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#c68a4a;">The 5 questions</p>
      <ol style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.85;color:#374151;">
        <li>Have you sworn an oath to the Constitution &#8212; and what does it mean to you?</li>
        <li>What&#8217;s your plan on the national debt and deficit spending?</li>
        <li>Where do you stand on public land sales and outside money in Wyoming politics?</li>
        <li>What&#8217;s the most important issue facing Wyoming, and what would you actually do about it?</li>
        <li>Why should Wyoming voters choose you?</li>
      </ol>
    </td>
  </tr>
</table>

<table cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
  <tr>
    <td style="background:#b22234;border-radius:8px;padding:12px 28px;">
      <a href="https://candidates.skovgard2026.org/guide"
         style="color:#f1ece1;font-weight:700;font-size:15px;text-decoration:none;">
        Read every candidate&#8217;s answers &#8594;
      </a>
    </td>
  </tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 0;">
  <tr>
    <td style="background:#f9f6f0;border-left:4px solid #7a8a6b;padding:18px 20px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#2b2b2b;">Build your primary ballot</p>
      <ul style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.85;color:#374151;">
        <li>Host a watch-party or a kitchen-table discussion with friends and neighbors</li>
        <li>Find a candidate who hasn&#8217;t answered yet and email them &#8212; their card has a link for it</li>
        <li>Register to vote or check your registration at <a href="https://sos.wyo.gov/Elections/" style="color:#0f2742;font-weight:700;">sos.wyo.gov/Elections</a></li>
      </ul>
    </td>
  </tr>
</table>
`;

const ANSWER_THE_QUESTIONS_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  If you want my vote, answer the questions.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  I put 5 questions to every candidate on the Wyoming 2026 primary ballot &#8212; on the oath of
  office, the national debt, public land sales, Wyoming&#8217;s top issue, and why they&#8217;re
  running. Their answers publish straight to their own candidate card, in their own words.
</p>
${QUESTIONNAIRE_CHALLENGE_QUESTIONS_HTML}
`;

const NO_SPIN_JUST_ANSWERS_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  No spin. No shouting. Just answers.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  The Wyoming candidate questionnaire is live &#8212; the same 5 questions, in writing, for every
  candidate on the primary ballot. No debate-stage theatrics, just a record of where each
  candidate actually stands.
</p>
${QUESTIONNAIRE_CHALLENGE_QUESTIONS_HTML}
`;

const STRAIGHT_ANSWERS_BODY_HTML = `
<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Wyoming voters deserve straight answers.
</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#111827;">
  Candidate questionnaire and card review are now open for the Wyoming 2026 primary &#8212; 5
  questions, every candidate, answers published in their own words.
</p>
${QUESTIONNAIRE_CHALLENGE_QUESTIONS_HTML}
`;

const KEVIN_CHRISTENSEN_VETTING_BODY_HTML = `
<h2 style="margin:26px 0 12px;font-size:20px;line-height:1.3;color:#0f2742;">Did Serving Our Country Count Against Him?</h2>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Kevin Christensen recently received notice that the Wyoming Republican Party&#8217;s 13-member
  Candidate Vetting Committee intended to recommend that he <strong>not receive the party&#8217;s
  endorsement at this time</strong>.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Kevin answered with respect and precision. He told the committee he is in 100% alignment with
  the Wyoming Republican Party Platform &#8212; then explained why some of its additional criteria
  deserve public scrutiny.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:0 0 18px;border-left:4px solid #c68a4a;background:#fef9f0;">
  <tr>
    <td style="padding:14px 18px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#8b1a26;">
        What the committee said it would weigh
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
        Past donations to state or county parties, attendance and involvement in party
        organizations, past party registration, and legislative scorecards.
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Kevin has no legislative voting record. His record is more than 27 years of military service
  &#8212; combat leadership in Iraq, command at the company, battalion, and brigade levels, and
  service on the Joint Staff at the Pentagon.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  During that service, Kevin&#8217;s duty required discipline, professional independence, and at
  times a nonpartisan posture. He asked the committee to distinguish actual party switching from
  periods of nonaffiliation connected to national security responsibilities.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  That is a fair request.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  The party&#8217;s executive director replied that Kevin&#8217;s response had been given to the
  committee for review. The available correspondence contains no final decision and no explanation
  of how the committee weighed his service.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  I find the process deeply disturbing.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  When donations, organizational attendance, and insider involvement become measures of loyalty,
  public service can become a disadvantage. A system like that risks rewarding proximity to party
  power while discounting years spent defending our country.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Kevin and I are seeking different federal offices. This question reaches beyond either campaign:
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:8px 0 24px;border-top:2px solid #2b2b2b;border-bottom:2px solid #2b2b2b;">
  <tr>
    <td style="padding:16px 4px;">
      <p style="margin:0;font-size:18px;line-height:1.4;color:#0f2742;font-weight:bold;">
        Does this process strengthen the ability of Wyoming citizens to govern ourselves, or does
        it place more influence into fewer hands?
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Wyoming law currently says political party funds cannot be spent directly or indirectly to help
  one primary candidate defeat another candidate from the same party. Party leadership has
  challenged that restriction in federal court. The court will decide the constitutional question.
  Wyoming voters should still decide our nominees.
</p>

<p style="margin:0 0 6px;font-size:17px;line-height:1.5;color:#b22234;font-weight:bold;">
  Service should count as service.
</p>
<p style="margin:0 0 24px;font-size:17px;line-height:1.5;color:#b22234;font-weight:bold;">
  Let Wyoming voters speak first.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  <a href="https://skovgard2026.org/share/kevin-christensen-vetting/sources/"
      style="color:#0f2742;font-weight:bold;">
    Read the full breakdown with sources
  </a>
  at skovgard2026.org/share/kevin-christensen-vetting/sources/
</p>
`;

const WASHINGTON_PUPPETS_BODY_HTML = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:0 0 22px;border-left:5px solid #2b2b2b;background:#f1ece1;">
  <tr>
    <td style="padding:14px 18px;">
      <p style="margin:0;font-size:16px;line-height:1.6;color:#111827;font-style:italic;">
        &#8220;The Party told you to reject the evidence of your eyes and ears.&#8221;
      </p>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#6b7280;">
        &#8212; George Orwell
      </p>
    </td>
  </tr>
</table>

<h2 style="margin:26px 0 12px;font-size:20px;line-height:1.3;color:#0f2742;">Who Gets to Choose?</h2>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  I recently received notice giving me exactly 24 hours to justify my candidacy to a 13-member
  committee. I have been a registered Republican for 40 years, yet this small group now proposes
  to decide whether party resources should favor another candidate before Wyoming voters ever
  have a chance to speak.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:0 0 18px;border-left:4px solid #c68a4a;background:#fef9f0;">
  <tr>
    <td style="padding:14px 18px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#8b1a26;">
        Wyoming Statute W.S. 22-25-104
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;font-style:italic;">
        &#8220;No political party funds shall be expended directly or indirectly in the aid of
        the nomination of any one person as against another person of the same political party
        running in the primary election.&#8221;
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Party leadership recently hired a Washington, D.C., law firm and filed a federal lawsuit
  challenging that law. The party has every right to challenge a statute in court, but until a
  judge rules otherwise, that statute remains the law.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  Many of us, including members of this committee, have sworn oaths to support and defend our
  constitution and the rule of law. We are all bound by those oaths. This vetting process does
  not strengthen democracy. Instead, it concentrates control in fewer hands while asking voters
  to stand aside.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:8px 0 24px;border-top:2px solid #2b2b2b;border-bottom:2px solid #2b2b2b;">
  <tr>
    <td style="padding:16px 4px;">
      <p style="margin:0 0 6px;font-size:18px;line-height:1.4;color:#0f2742;font-weight:bold;">
        We, the voters, will decide who represents us.
      </p>
      <p style="margin:0;font-size:18px;line-height:1.4;color:#0f2742;font-weight:bold;">
        In doing so, we will also decide whether the rule of law still matters in Wyoming.
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px;font-size:17px;line-height:1.5;color:#b22234;font-weight:bold;">
  Let the people speak first.
</p>

<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
  <a href="https://skovgard2026.org/share/washington-puppets/sources/"
      style="color:#0f2742;font-weight:bold;">
    Read the full breakdown with sources
  </a>
  at skovgard2026.org/share/washington-puppets/sources/
</p>
`;

export const SHARE_MESSAGES = {
  "answer-the-questions": {
    title:        "If You Want My Vote, Answer the Questions",
    body_html:    ANSWER_THE_QUESTIONS_BODY_HTML,
    preview_text: "5 questions, every Wyoming primary candidate, answers published in their own words.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — answer the questions`
        : "If you want my vote, answer the questions";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "no-spin-just-answers": {
    title:        "No Spin. No Shouting. Just Answers.",
    body_html:    NO_SPIN_JUST_ANSWERS_BODY_HTML,
    preview_text: "The new Wyoming candidate questionnaire is live — no spin, no shouting, just answers.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — no spin, just answers`
        : "No spin. No shouting. Just answers.";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "straight-answers": {
    title:        "Wyoming Voters Deserve Straight Answers",
    body_html:    STRAIGHT_ANSWERS_BODY_HTML,
    preview_text: "Candidate questionnaire and card review are now open for the Wyoming 2026 primary.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — straight answers`
        : "Wyoming voters deserve straight answers";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "wyoming-not-for-sale": {
    title:        "Wyoming Is Not for Sale",
    body_html:    WYOMING_NOT_FOR_SALE_BODY_HTML,
    preview_text: "Out-of-state PACs. Dark money. National templates. Wyoming citizens deserve to know who is paying for the message.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Wyoming Is Not for Sale`
        : "Wyoming Is Not for Sale — follow the money";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming accountability message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "wyoming-family-economy": {
    title:        "A Good Economy Starts at the Kitchen Table",
    body_html:    WYOMING_FAMILY_ECONOMY_BODY_HTML,
    preview_text: "A strong economy is one where Wyoming families can pay their bills, save money, and build a life at home.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — A Good Economy Starts at the Kitchen Table`
        : "A good economy starts at the kitchen table";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming economic message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "fleecing-letters": {
    title:        "The Fleecing Letters",
    body_html:    FLEECING_LETTERS_BODY_HTML,
    preview_text: "Two official letters. 'PAID FOR BY OFFICIAL FUNDS.' Five tactics worth recognizing. Wyoming deserves clean information.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — The Fleecing Letters`
        : "Official mail paid for by you. Here's what's in it.";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming accountability message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "postage-bandit": {
    title:        "Postage Bandit",
    body_html:    POSTAGE_BANDIT_BODY_HTML,
    preview_text: "FEC complaint filed: official funds used to attack critics on taxpayer-funded letterhead. House rules prohibit this.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Postage Bandit`
        : "Postage Bandit: FEC complaint filed against Rep. Hageman";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming accountability message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "citizens-defend-the-constitution": {
    title:        "Citizens Defend the Constitution",
    body_html:    CITIZENS_DEFEND_THE_CONSTITUTION_BODY_HTML,
    preview_text: "Heart Mountain as the backdrop. The Golden Rule. The three pillars of this campaign.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Citizens Defend the Constitution`
        : "Citizens defend the Constitution — a Wyoming message from Jimmy Skovgard";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "jimmys-story": {
    title:        "Jimmy's Story",
    body_html:    JIMMYS_STORY_BODY_HTML,
    preview_text: "Know someone who cares about Wyoming? Learn about Jimmy Skovgard.",
    subject(n) {
      return n
        ? `${n} wants you to hear about Jimmy Skovgard for Wyoming`
        : "Your neighbor wanted you to hear about Jimmy Skovgard for Wyoming";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "freedom-or-control": {
    title:        "Freedom or Control?",
    body_html:    FREEDOM_OR_CONTROL_BODY_HTML,
    preview_text: "National PACs and outside organizations are shaping Wyoming's 2026 primary. Here is what has been documented.",
    subject(n) {
      return n
        ? `${n} shared this with you — Freedom or Control?`
        : "Freedom or Control? — Wyoming voters deserve to know who's paying";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "wyoming-voters-choose": {
    title:        "Wyoming Voters Should Choose",
    body_html:    WYOMING_VOTERS_CHOOSE_BODY_HTML,
    preview_text: "Party insiders should serve. The people choose.",
    subject(n) {
      return n
        ? `${n} wanted you to see this`
        : "Wyoming voters should choose";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "kevin-christensen-vetting": {
    title:        "Did Serving Our Country Count Against Kevin Christensen?",
    body_html:    KEVIN_CHRISTENSEN_VETTING_BODY_HTML,
    preview_text: "A 27-year Army veteran was told his service didn't count. Should it?",
    subject(n) {
      return n
        ? `${n} wanted you to see this`
        : "Did serving our country count against him?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "washington-puppets": {
    title:        "Washington Puppets",
    body_html:    WASHINGTON_PUPPETS_BODY_HTML,
    preview_text: "A 13-member committee gave me 24 hours to justify my candidacy. Wyoming voters should decide first.",
    subject(n) {
      return n
        ? `${n} wanted you to see this`
        : "Who gets to choose? A message from Jimmy Skovgard";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "representatives-work-for": {
    title:        "Who Do Our Representatives Work For?",
    body_html:    REPRESENTATIVES_WORK_FOR_BODY_HTML,
    preview_text: "We ask. Representatives vote. We measure. We remember. This is accountability.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — GrassrootsMVT.org`
        : "Who do our representatives work for?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming accountability effort with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "wy-voter-access": {
    title:        "Wyoming Voter Access Survey",
    body_html:    WY_VOTER_ACCESS_BODY_HTML,
    preview_text: "Take a short Wyoming survey about voter access and registration.",
    subject() {
      return "Wyoming Voter Access Survey";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "wy-primary-election-participation": {
    title:        "Wyoming Primary Election Participation Survey",
    body_html:    WY_PRIMARY_ELECTION_PARTICIPATION_BODY_HTML,
    preview_text: "Take a short survey on how Wyoming primary elections should work.",
    subject() {
      return "Wyoming Primary Election Participation Survey";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "wy-citizen-ballot": {
    title:        "Citizens Nonpartisan Ballot",
    body_html:    WY_CITIZEN_BALLOT_BODY_HTML,
    preview_text: "One voter. One ballot. One choice per office. An unofficial civic project for Wyoming voter choice.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Citizens Nonpartisan Ballot`
        : "Wyoming voter choice: Citizens Nonpartisan Ballot";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this idea with you.`
        : "A Wyoming neighbor wanted to share this idea with you.";
    },
  },
  "untrammeled-suffrage": {
    title:        "Untrammeled Suffrage",
    body_html:    UNTRAMMELED_SUFFRAGE_BODY_HTML,
    preview_text: "Test access to Untrammeled Suffrage, a Wyoming voter outreach tool.",
    subject(n) {
      return n
        ? `${n} — Test access to Untrammeled Suffrage, a Wyoming voter outreach tool`
        : "Test access to Untrammeled Suffrage, a Wyoming voter outreach tool";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "Jimmy Skovgard wanted to share this with you.";
    },
  },
  "wy-data-centers": {
    title:        "Wyoming Data Centers Survey",
    body_html:    WY_DATA_CENTERS_BODY_HTML,
    preview_text: "Wyoming voters should help set the standards: water, power, rates, local input, transparency.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Wyoming Data Centers Survey`
        : "Wyoming data centers: what safeguards should come first?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "wy-four-pillars": {
    title:        "Wyoming Four Pillars Survey",
    body_html:    WY_FOUR_PILLARS_BODY_HTML,
    preview_text: "Life. Religious Liberty. Family Values. Education Freedom. Wyoming voters deserve clear questions and accountable answers.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Wyoming Four Pillars Survey`
        : "Wyoming Four Pillars Survey";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "wy-roadless-areas": {
    title:        "Wyoming Roadless Areas Survey",
    body_html:    WY_ROADLESS_AREAS_BODY_HTML,
    preview_text: "Wyoming has 3M+ acres of inventoried roadless areas. Water, wildlife, access, fire risk, local voice — Wyoming voters deserve a say.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Wyoming Roadless Areas Survey`
        : "Wyoming roadless areas: what standards should come first?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "wy-commercial-property-tax": {
    title:        "Wyoming Commercial Property Tax Transparency Survey",
    body_html:    WY_COMMERCIAL_PROPERTY_TAX_BODY_HTML,
    preview_text: "Same statewide rate. Real questions about valuation, clarity, and consistency — starting with Natrona County and Casper.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Commercial Property Tax Transparency`
        : "Wyoming commercial property tax: is the process clear enough?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this survey with you.`
        : "A Wyoming neighbor wanted to share this survey with you.";
    },
  },
  "nothing-burger": {
    title:        "Taxpayer-Funded Nothing Burger",
    body_html:    NOTHING_BURGER_BODY_HTML,
    preview_text: "Wyoming was listed. Montana was carved out. Why? Wyoming public lands deserve straight answers.",
    subject(n) {
      return n
        ? `${n} wanted you to see this: Wyoming public lands`
        : "Wyoming public lands: why did Montana get protection Wyoming didn't?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming public lands breakdown with you.`
        : "A Wyoming neighbor wanted to share this Wyoming public lands breakdown with you.";
    },
  },
  "changing-health-care": {
    title:        "Changing Health Care",
    body_html:    CHANGING_HEALTH_CARE_BODY_HTML,
    preview_text: "Wyoming is facing a hard question. The honest path is constitutional and led by the people.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Changing Health Care`
        : "Wyoming health care: the honest constitutional path";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "candidate-hub": {
    title:        "Wyoming Candidate Hub",
    body_html:    CANDIDATE_HUB_BODY_HTML,
    preview_text: "Every candidate. One place. Wyoming voters deserve a clear look at who is asking to represent us.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Wyoming Candidate Hub`
        : "Wyoming Candidate Hub: every candidate, one place";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming voter resource with you.`
        : "A Wyoming neighbor wanted to share this voter resource with you.";
    },
  },
  "primary-candidates": {
    title:        "One Place to See Every Wyoming Candidate",
    body_html:    PRIMARY_CANDIDATES_BODY_HTML,
    preview_text: "I built a tool to help Wyoming voters build their primary ballot — every candidate in one place, down to the precinct level.",
    subject(n) {
      return n
        ? `${n} wanted you to see this`
        : "One place to see every Wyoming candidate";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A message from Jimmy Skovgard for Wyoming.";
    },
  },
  "higher-prices-washington-debt": {
    title:        "Higher Prices, Endless Wars, and Washington Debt",
    body_html:    HIGHER_PRICES_WASHINGTON_DEBT_BODY_HTML,
    preview_text: "Rising costs, open-ended conflicts, and a $40 trillion debt spiral. Wyoming families pay the price. We need representatives from the people.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — Higher Prices, Endless Wars, and Washington Debt`
        : "Higher prices, endless wars, and Washington debt — a Wyoming message";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming message with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "one-million-messages": {
    title:        "One Million Messages",
    body_html:    ONE_MILLION_MESSAGES_BODY_HTML,
    preview_text: "One conversation. One neighbor. One community. One million messages toward freedom.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — One Million Messages`
        : "One million messages — will you start one today?";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this movement with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "town-hall-introduction": {
    title:        "If It Said R, I Hit the Checkbox.",
    body_html:    TOWN_HALL_INTRODUCTION_BODY_HTML,
    preview_text: "\"If it said R, I hit the checkbox.\" — Jimmy Skovgard's honest admission at a Wyoming town hall.",
    subject(n) {
      return n
        ? `${n} shared this — a Wyoming neighbor's honest admission`
        : '"If it said R, I hit the checkbox." — A Wyoming voice';
    },
    intro(n) {
      return n
        ? `${n} wanted to share this Wyoming town hall moment with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
  "boulder-and-the-weeds": {
    title:        "The Boulder and the Weeds",
    body_html:    BOULDER_AND_THE_WEEDS_BODY_HTML,
    preview_text: "Truth is the boulder — stoic and enduring. Fear and outrage are the weeds looking for a crack to grow in.",
    subject(n) {
      return n
        ? `${n} wanted you to see this — The Boulder and the Weeds`
        : "The Boulder and the Weeds";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this reflection with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
};

// ── Template functions ─────────────────────────────────────────────────────────

/**
 * Returns the complete HTML email document for a share message.
 * Outer chrome (header, stay-connected buttons, share CTA, footer) is identical
 * for every message. body_html is the per-message inner fragment.
 *
 * @param {object} p
 * @param {string} p.sender_name   — Optional display name used in footer attribution
 * @param {string} p.sender_intro  — Italic personalisation sentence already formatted
 * @param {string} p.body_html     — Inner message HTML fragment (no <html>/<body>)
 * @param {string} [p.preview_text] — Inbox preview line, 50–80 chars
 * @param {string} [p.headline]    — Large h1 in the campaign header; falls back to p.title
 * @param {string} [p.title]       — Fallback headline if p.headline is not provided
 */
export function buildShareEmailHtml({ sender_name = "", sender_intro, body_html, preview_text = "", headline = "", title = "" }) {
  const esc       = escHtml;
  const preheader = preview_text || sender_intro || "";
  const h1Text    = headline || title || "Jimmy Skovgard for Wyoming";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Jimmy Skovgard for Wyoming</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f7f3ec;font-family:Arial,Helvetica,sans-serif;color:#111827;">

  <!-- Inbox preview line (hidden from email body) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;">
    ${esc(preheader)}&nbsp;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f7f3ec;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Campaign header -->
          <tr>
            <td style="background:#0f2742;padding:28px 28px 22px;text-align:left;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.4;letter-spacing:1.5px;
                  text-transform:uppercase;color:#d8b46a;font-weight:bold;">
                Skovgard for Wyoming
              </p>
              <h1 style="margin:0;font-size:30px;line-height:1.2;color:#ffffff;font-weight:bold;">
                ${esc(h1Text)}
              </h1>
              <p style="margin:12px 0 0;font-size:16px;line-height:1.5;color:#f3f4f6;">
                Preserving our legacy. Empowering our future.
              </p>
            </td>
          </tr>

          <!-- Message body -->
          <tr>
            <td style="padding:28px;">

              <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">Hi,</p>

              <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#6b7280;font-style:italic;">
                ${esc(sender_intro)}
              </p>

              ${body_html}

              <!-- Stay connected -->
              <h2 style="margin:28px 0 14px;font-size:22px;line-height:1.3;color:#0f2742;">
                Stay connected
              </h2>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
                <tr>
                  <td style="padding:0 0 12px;">
                    <a href="https://www.skovgard2026.org/about/"
                        style="display:inline-block;background:#0f2742;color:#ffffff;
                          font-size:15px;line-height:1.2;font-weight:bold;
                          text-decoration:none;padding:13px 18px;border-radius:8px;">
                      Learn more about the campaign
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;">
                    <a href="https://www.skovgard2026.org/volunteer/"
                        style="display:inline-block;background:#d8b46a;color:#111827;
                          font-size:15px;line-height:1.2;font-weight:bold;
                          text-decoration:none;padding:13px 18px;border-radius:8px;">
                      Volunteer or join the effort
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;">
                    <a href="https://www.skovgard2026.org/donate/"
                        style="display:inline-block;background:#ffffff;color:#0f2742;
                          font-size:15px;line-height:1.2;font-weight:bold;
                          text-decoration:none;padding:12px 17px;border-radius:8px;
                          border:1px solid #0f2742;">
                      Support the campaign
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Share CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                  style="margin:26px 0;background:#0f2742;border-radius:12px;">
                <tr>
                  <td style="padding:22px;">
                    <h2 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#ffffff;">
                      Help grow the conversation
                    </h2>
                    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f3f4f6;">
                      Share this campaign with three or more people who care about
                      Wyoming&#8217;s future. One conversation can open the next door.
                    </p>
                    <a href="https://www.skovgard2026.org/share/"
                        style="display:inline-block;background:#d8b46a;color:#111827;
                          font-size:15px;line-height:1.2;font-weight:bold;
                          text-decoration:none;padding:13px 18px;border-radius:8px;">
                      Share with 3 or more contacts
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:12px 0 18px;font-size:16px;line-height:1.65;color:#111827;">
                Most of all, I would like to hear from you. Reply to this email and tell us
                what issue matters most in your community.
              </p>

              <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
                This campaign is built one conversation at a time.
                Thank you for being part of it.
              </p>

              <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">
                With respect,<br>
                <strong>Jimmy Skovgard</strong><br>
                Skovgard for Wyoming
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px 28px;">
              <p style="margin:0 0 10px;font-size:13px;line-height:1.5;
                  color:#374151;font-weight:bold;">
                Paid for by Skovgard for Senate.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">
                You received this because ${esc(sender_name || "a friend")} shared it with you.
                This is a one-time message &mdash; you are not being added to any mailing list.
                If you would like to
                <a href="https://www.skovgard2026.org/pulse/" style="color:#0f2742;">
                  subscribe to updates, click here</a>.
              </p>
            </td>
          </tr>

        </table>

        <p style="margin:14px 0 0;font-size:11px;line-height:1.5;color:#6b7280;text-align:center;">
          Skovgard for Wyoming | Preserving our legacy. Empowering our future.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Returns the plain-text email body for a share message.
 * Built from the same params as buildShareEmailHtml — no separate document to maintain.
 *
 * @param {object} p
 * @param {string} p.sender_name   — Optional display name
 * @param {string} p.sender_intro  — Personalisation sentence
 * @param {string} p.slug          — Message key from SHARE_MESSAGES
 */
const QUESTIONNAIRE_CHALLENGE_LINES = [
  "THE 5 QUESTIONS",
  "",
  "  1. Have you sworn an oath to the Constitution — and what does it mean to you?",
  "  2. What's your plan on the national debt and deficit spending?",
  "  3. Where do you stand on public land sales and outside money in Wyoming politics?",
  "  4. What's the most important issue facing Wyoming, and what would you actually do about it?",
  "  5. Why should Wyoming voters choose you?",
  "",
  "Read every candidate's answers: https://candidates.skovgard2026.org/guide",
  "",
  "BUILD YOUR PRIMARY BALLOT",
  "",
  "  - Host a watch-party or a kitchen-table discussion with friends and neighbors.",
  "  - Find a candidate who hasn't answered yet and email them — their card has a link for it.",
  "  - Register to vote or check your registration: https://sos.wyo.gov/Elections/",
];

export function buildShareEmailText({ sender_name = "", sender_intro, slug = "" }) {
  const specificLines =
    slug === "answer-the-questions"
      ? [
          "If you want my vote, answer the questions.",
          "",
          "I put 5 questions to every candidate on the Wyoming 2026 primary ballot — on the oath",
          "of office, the national debt, public land sales, Wyoming's top issue, and why they're",
          "running. Their answers publish straight to their own candidate card, in their own words.",
          "",
          ...QUESTIONNAIRE_CHALLENGE_LINES,
        ]
    : slug === "no-spin-just-answers"
      ? [
          "No spin. No shouting. Just answers.",
          "",
          "The Wyoming candidate questionnaire is live — the same 5 questions, in writing, for",
          "every candidate on the primary ballot. No debate-stage theatrics, just a record of",
          "where each candidate actually stands.",
          "",
          ...QUESTIONNAIRE_CHALLENGE_LINES,
        ]
    : slug === "straight-answers"
      ? [
          "Wyoming voters deserve straight answers.",
          "",
          "Candidate questionnaire and card review are now open for the Wyoming 2026 primary —",
          "5 questions, every candidate, answers published in their own words.",
          "",
          ...QUESTIONNAIRE_CHALLENGE_LINES,
        ]
    : slug === "fleecing-letters"
      ? [
          "Two letters arrived in Wyoming mailboxes on official congressional letterhead.",
          "",
          "Both stated 'PAID FOR BY OFFICIAL FUNDS AUTHORIZED BY THE HOUSE OF REPRESENTATIVES.'",
          "Both used fear, blame, and campaign-style framing at public expense.",
          "",
          "This is about how our tax dollars — or should we say our grandchildren's tax dollars —",
          "are being misused to shape public opinion.",
          "",
          "How these letters work:",
          "",
          "1. Fear comes first. Both letters open with danger, crisis, fires, blocked access, and outside",
          "   threats. When fear comes first, we react before we reflect.",
          "",
          "2. Responsibility goes elsewhere. Rep. Hageman has held office for more than three years while",
          "   many of the problems described in these letters continued to grow. Yet the letters paint",
          "   responsibility as living somewhere else.",
          "",
          "3. Official authority lends weight. Congressional letterhead makes a campaign defense look",
          "   like a public update — that is exactly why official funds require careful guardrails.",
          "",
          "4. Volume replaces clarity. A long list of bills, hearings, and agencies feels like proof.",
          "   It is not the same as plain facts, real costs, and side-by-side tradeoffs.",
          "",
          "5. The middle gets skipped. What are the options? What are the costs? Who benefits? Who pays?",
          "   A good public letter answers those questions clearly.",
          "",
          "Public money must serve the public.",
          "Read the letters. Follow the money. Ask better questions.",
          "",
          "Read more: https://skovgard2026.org/share/fleecing-letters/",
        ]
    : slug === "postage-bandit"
      ? [
          "We have a situation. Our representative gets to Washington, looks at the House",
          "franking privilege, and decides that taxpayer-funded tool belongs to her reelection campaign.",
          "",
          "I just filed an official FEC complaint against Representative Harriet Hageman for using",
          "public funds to send out a mass political mailing right in the middle of a statutory",
          "pre-election blackout period. By law, using congressional resources like this during a",
          "blackout window is strictly prohibited.",
          "",
          "THE COST TO WYOMING TAXPAYERS",
          "",
          "An estimated $130,000 to $145,000 in public money was spent to blast a defensive campaign",
          "letter on official letterhead to households across Wyoming.",
          "",
          "This speaks to an endemic disregard for the rule of law — a mindset that the rules apply",
          "to the citizens but never to the people who write them. When a candidate uses the financial",
          "machinery of the United States government as a personal piggy bank to protect a seat,",
          "it undermines the very foundation of fair elections.",
          "",
          "You do not have to take my word for it. The original mailing and the full text of the",
          "complaint are both available to review.",
          "",
          "We must hold our leaders to the letter of the law, or the law ceases to mean anything at all.",
          "",
          "Read the complaint and sources:",
          "https://skovgard2026.org/share/postage-bandit/sources/",
        ]
    : slug === "citizens-defend-the-constitution"
      ? [
          "I wanted to share a short video message from Jimmy Skovgard — filmed in Wyoming —",
          "on three things that drive this campaign.",
          "",
          "The message is simple: citizens defend the Constitution. Public servants swear the",
          "oath. Wyoming deserves a Senator who takes that oath seriously.",
          "",
          "THREE PILLARS OF THE CAMPAIGN",
          "",
          "  1. Defend the Constitution — The oath still matters.",
          "  2. Restore Accountability — Public servants answer to Wyoming.",
          "  3. Listen to Wyoming — Real decisions require real input.",
          "",
          "The video runs about five minutes, recorded with Heart Mountain as the backdrop.",
          "No teleprompter. No handlers. Just Wyoming and the Golden Rule.",
          "",
          "Watch the video:",
          "https://skovgard2026.org/share/citizens-defend-the-constitution/",
        ]
    : slug === "representatives-work-for"
      ? [
          "For too long, the voice of the constituency has been reduced to headlines,",
          "polls, social media arguments, and election-year promises. Then the election",
          "passes and the public is expected to simply remember four years later.",
          "",
          "We can do better.",
          "",
          "Jimmy Skovgard has developed a working proof of concept through GrassrootsMVT.org",
          "designed to help Wyoming voters provide structured feedback on issues affecting",
          "our communities, our state, and our future.",
          "",
          "Verified Wyoming voters participate in surveys designed to aggregate constituent",
          "feedback by issue and legislative district. Legislative actions and voting records",
          "can then be compared against the measured priorities of the people elected officials",
          "were chosen to represent.",
          "",
          "We ask.",
          "Representatives vote.",
          "We measure.",
          "We remember.",
          "",
          "This is foremost a tool for accountability.",
          "",
          "Representation requires accountability.",
          "Accountability requires memory.",
          "",
          "Take part in the Wyoming primary election and party preselection survey:",
          "https://grassrootsmvt.org/surveys/wy-primary-elections-party-preselection",
          "",
          "Join the proof of concept at GrassrootsMVT.org.",
        ]
    : slug === "kevin-christensen-vetting"
      ? [
          "DID SERVING OUR COUNTRY COUNT AGAINST HIM?",
          "",
          "Kevin Christensen recently received notice that the Wyoming Republican Party's 13-member",
          "Candidate Vetting Committee intended to recommend that he not receive the party's",
          "endorsement at this time.",
          "",
          "Kevin answered with respect and precision. He told the committee he is in 100% alignment",
          "with the Wyoming Republican Party Platform -- then explained why some of its additional",
          "criteria deserve public scrutiny.",
          "",
          "What the committee said it would weigh: past donations to state or county parties,",
          "attendance and involvement in party organizations, past party registration, and",
          "legislative scorecards.",
          "",
          "Kevin has no legislative voting record. His record is more than 27 years of military",
          "service -- combat leadership in Iraq, command at the company, battalion, and brigade",
          "levels, and service on the Joint Staff at the Pentagon.",
          "",
          "During that service, Kevin's duty required discipline, professional independence, and",
          "at times a nonpartisan posture. He asked the committee to distinguish actual party",
          "switching from periods of nonaffiliation connected to national security responsibilities.",
          "",
          "That is a fair request.",
          "",
          "The party's executive director replied that Kevin's response had been given to the",
          "committee for review. The available correspondence contains no final decision and no",
          "explanation of how the committee weighed his service.",
          "",
          "I find the process deeply disturbing. When donations, organizational attendance, and",
          "insider involvement become measures of loyalty, public service can become a",
          "disadvantage. A system like that risks rewarding proximity to party power while",
          "discounting years spent defending our country.",
          "",
          "Kevin and I are seeking different federal offices. This question reaches beyond either",
          "campaign: Does this process strengthen the ability of Wyoming citizens to govern",
          "ourselves, or does it place more influence into fewer hands?",
          "",
          "Wyoming law currently says political party funds cannot be spent directly or indirectly",
          "to help one primary candidate defeat another candidate from the same party. Party",
          "leadership has challenged that restriction in federal court. The court will decide the",
          "constitutional question. Wyoming voters should still decide our nominees.",
          "",
          "Service should count as service.",
          "Let Wyoming voters speak first.",
          "",
          "Read the full breakdown with sources:",
          "https://skovgard2026.org/share/kevin-christensen-vetting/sources/",
        ]
    : slug === "washington-puppets"
      ? [
          "\"The Party told you to reject the evidence of your eyes and ears.\" — George Orwell",
          "",
          "WHO GETS TO CHOOSE?",
          "",
          "I recently received notice giving me exactly 24 hours to justify my candidacy to a",
          "13-member committee. I have been a registered Republican for 40 years, yet this small",
          "group now proposes to decide whether party resources should favor another candidate",
          "before Wyoming voters ever have a chance to speak.",
          "",
          "Wyoming Statute W.S. 22-25-104 is clear:",
          "\"No political party funds shall be expended directly or indirectly in the aid of the",
          "nomination of any one person as against another person of the same political party",
          "running in the primary election.\"",
          "",
          "Party leadership recently hired a Washington, D.C., law firm and filed a federal lawsuit",
          "challenging that law. The party has every right to challenge a statute in court, but",
          "until a judge rules otherwise, that statute remains the law.",
          "",
          "Many of us, including members of this committee, have sworn oaths to support and defend",
          "our constitution and the rule of law. We are all bound by those oaths. This vetting",
          "process does not strengthen democracy. Instead, it concentrates control in fewer hands",
          "while asking voters to stand aside.",
          "",
          "We, the voters, will decide who represents us. In doing so, we will also decide whether",
          "the rule of law still matters in Wyoming.",
          "",
          "Let the people speak first.",
          "",
          "Read the full breakdown with sources:",
          "https://skovgard2026.org/share/washington-puppets/sources/",
        ]
    : slug === "wyoming-voters-choose"
      ? [
          "I want to share a message about what is happening inside Wyoming politics right now.",
          "",
          "This is bigger than one candidate or one race. The issue is simple:",
          "",
          "Freedom means voters choose.",
          "Control means insiders choose first and voters are expected to fall in line.",
          "",
          "The new Wyoming GOP bylaw fight makes the issue plain. Party insiders now claim",
          "the power to endorse, oppose, and financially support candidates before voters have",
          "spoken in the primary.",
          "",
          "That turns the primary upside down.",
          "",
          "I believe the people choose. The party serves. The government answers to us.",
          "",
          "Take the Wyoming primary elections and party pre-selection survey:",
          "https://grassrootsmvt.org/surveys/wy-primary-elections-party-preselection",
          "",
          "Read and share the full message:",
          "https://skovgard2026.org/share/wyoming-voters-choose/",
          "",
          "Read the sources:",
          "https://skovgard2026.org/share/wyoming-voters-choose/sources/",
        ]
    : slug === "freedom-or-control"
      ? [
          "Wyoming voters are being shaped by forces most of them will never hear named.",
          "",
          "National PACs. Billionaire-funded advocacy networks. Out-of-state consulting firms.",
          "Dark money organizations. Social media algorithms built to divide.",
          "AI-generated persuasion at scale.",
          "",
          "This is not a left problem or a right problem. It is a Wyoming problem.",
          "",
          "Here is what has been documented.",
          "",
          "AMERICANS FOR PROSPERITY / AFP-WYOMING",
          "Connected to the Koch political network. AFP-Wyoming described its 2024 Wyoming",
          "primary investment as historic and issued endorsements before voters had spoken.",
          "In June 2026, AFP-Wyoming announced nine more endorsements ahead of August 18.",
          "",
          "YOUNG AMERICANS FOR LIBERTY AND MAKE LIBERTY WIN",
          "YAL (Austin, Texas) runs Operation Win at the Door nationwide.",
          "Its affiliated PAC, Make Liberty Win (Fairfax, Virginia), spent more than $370,000",
          "in Wyoming's 2024 primary — with YAL as the PAC's primary financial backer.",
          "Source: Wyoming Public Media.",
          "",
          "STATE FREEDOM CAUCUS NETWORK / WYOMING FREEDOM CAUCUS",
          "WyoFile reported the Wyoming Freedom Caucus aligned with a national organization",
          "and moved to control the statehouse. Now seeking to retain that power in 2026.",
          "",
          "WYOMING GOP PRE-PRIMARY ENDORSEMENT LAWSUIT",
          "The Wyoming GOP filed a federal lawsuit challenging the state law that blocks",
          "parties from spending to back one primary candidate before voters choose.",
          "Can party insiders steer your primary before you vote? That fight is in court now.",
          "",
          "Outside money comes in.",
          "Messages get sharpened.",
          "Neighbors get divided.",
          "Candidates get pressured.",
          "Local judgment gets weakened.",
          "Then we are told this is \"freedom.\"",
          "",
          "I call it control.",
          "",
          "Transparency strengthens freedom.",
          "Hidden influence strengthens control.",
          "",
          "Every voter deserves to know who is speaking, who is paying for the message,",
          "and what interests are being advanced before casting a ballot.",
          "",
          "The people choose.",
          "The party serves.",
          "The government answers to us.",
          "",
          "Read the evidence with sources:",
          "https://skovgard2026.org/share/freedom-or-control/sources/",
        ]
    : slug === "wy-primary-election-participation"
      ? [
          "I thought you might want to take this short Wyoming Primary Election Participation Survey.",
          "",
          "The survey asks how Wyoming primary elections should work, including:",
          "  - Who should be able to participate in Wyoming primary elections",
          "  - When party-affiliation deadlines should be set",
          "  - How voter access and party nomination rights should be balanced",
          "  - How results should be reported",
          "",
          "This survey is designed to gather registered Wyoming voter input. Responses may be",
          "verified against a Wyoming registered voter file obtained from the Secretary of State.",
          "Verified and unverified results can be reported separately, and individual responses",
          "remain confidential.",
          "",
          "Take the survey:",
          "https://grassrootsmvt.org/surveys/wy-primary-election-participation",
          "",
          "Your voice helps build a clearer public record of what Wyoming voters want.",
        ]
    : slug === "wy-voter-access"
      ? [
          "Wyoming voices matter.",
          "",
          "I am asking voters to take a short survey about voter access in Wyoming.",
          "",
          "Should Wyoming create a statewide voting holiday?",
          "Should eligible residents be automatically registered to vote when getting or renewing",
          "a driver's license or state ID?",
          "Should Wyoming protect same-day voter registration?",
          "",
          "Take the short survey:",
          "https://grassrootsmvt.org/surveys/wy-voter-access",
          "",
          "Want to know more?",
          "https://skovgard2026.org/surveys/wy-voter-access/info",
          "",
          "Exact questions and results will be published in aggregate.",
        ]
    : slug === "wy-citizen-ballot"
      ? [
          "The Citizens Nonpartisan Ballot is a civic project through The Integrity Project:",
          "People's Primary. The idea is simple: list every candidate for each office in one",
          "place and let voters choose one candidate per office, regardless of party label.",
          "",
          "One voter. One ballot. One choice per office.",
          "",
          "This is NOT an official election. It is a voter education and public survey project",
          "to show what voter choice could look like in Wyoming.",
          "",
          "Some voters choose by party. Some voters choose by candidate.",
          "Wyoming should respect both.",
          "",
          "Keep party ballots. Add voter choice.",
          "",
          "THREE NOMINEES. ONE GENERAL ELECTION.",
          "",
          "Republican Primary → 1 nominee",
          "Citizens Nonpartisan → 1 nominee",
          "Democratic Primary → 1 nominee",
          "→ General Election — Wyoming voters decide.",
          "",
          "Take the survey:",
          "https://grassrootsmvt.org/surveys/wy-citizens-nonpartisan-ballot",
          "",
          "Learn more:",
          "https://skovgard2026.org/share/wy-citizen-ballot",
        ]
    : slug === "wy-four-pillars"
      ? [
          "Wyoming voters deserve more than slogans. The Wyoming Four Pillars Survey asks",
          "specific public policy questions and publishes results in aggregate.",
          "",
          "The four pillars covered:",
          "",
          "  LIFE — abortion law, unborn life, exceptions, enforcement, medical",
          "    decision-making, and pregnancy support.",
          "",
          "  RELIGIOUS LIBERTY — conscience, public programs, schools, public meetings,",
          "    religious expression, and equal access.",
          "",
          "  FAMILY VALUES — parental rights, school transparency, child safety,",
          "    online access, libraries, medical consent, and due process.",
          "",
          "  EDUCATION FREEDOM — public schools, private schools, religious schools,",
          "    homeschool families, school choice funding, rural schools, and accountability.",
          "",
          "The survey is non-binding. Individual answers remain confidential.",
          "Results will be published in aggregate.",
          "",
          "Take the survey:",
          "https://grassrootsmvt.org/surveys/wy-four-pillars",
          "",
          "Share page:",
          "https://www.skovgard2026.org/share/wy-four-pillars/",
          "",
          "This survey is a public-input proof of concept by Skovgard for Senate.",
          "It is not affiliated with, endorsed by, or reviewed by Wyoming Family Alliance.",
        ]
    : slug === "wy-data-centers"
      ? [
          "Wyoming is seeing more discussion about large data centers and other large-load facilities.",
          "",
          "These projects may bring investment, jobs, tax revenue, and technology infrastructure.",
          "They may also affect water, electric rates, roads, housing, wildlife, agriculture, and",
          "local planning.",
          "",
          "This survey does not take a position for or against data centers. It asks what safeguards,",
          "benefits, and public-review standards Wyoming voters believe should apply before large",
          "projects move forward.",
          "",
          "Please take the survey and share it with three Wyoming neighbors:",
          "https://grassrootsmvt.org/surveys/wy-data-centers",
        ]
    : slug === "wy-roadless-areas"
      ? [
          "Wyoming has more than 3 million acres of inventoried roadless areas on National Forest",
          "System lands. A federal rulemaking process is considering rescission of the 2001 Roadless Rule.",
          "",
          "This survey asks Wyoming voters what standards should guide decisions about these areas.",
          "The questions cover water, wildlife, access, wildfire risk, and local voice.",
          "",
          "The survey presents both sides — management flexibility versus long-term land protection.",
          "Individual answers remain confidential. Results are published in aggregate only.",
          "",
          "Take the survey:",
          "https://grassrootsmvt.org/surveys/wy-roadless-areas",
          "",
          "Read the sources and background:",
          "https://skovgard2026.org/share/wy-roadless-areas/sources/",
          "",
          "Share page:",
          "https://skovgard2026.org/share/wy-roadless-areas/",
        ]
    : slug === "wy-commercial-property-tax"
      ? [
          "Commercial property taxes affect more than building owners — they shape local businesses,",
          "rents, payroll, prices, downtown investment, county budgets, and the cost of doing business",
          "in Wyoming.",
          "",
          "Wyoming's commercial assessment rate is generally set statewide at 9.5% of market value, so",
          "the real public question isn't the rate — it's whether valuation, classifications, notices,",
          "mill levies, business personal property rules, and appeal rights are clear enough for the",
          "people paying the bill. This survey uses Natrona County and Casper as a case study, then asks",
          "whether the same questions matter statewide.",
          "",
          "This is about transparency, not wrongdoing. Wyoming's Constitution calls for equal and",
          "uniform taxation within each class and subclass of property.",
          "",
          "Take the survey:",
          "https://grassrootsmvt.org/surveys/wy-commercial-property-tax",
          "",
          "Read the sources and background:",
          "https://skovgard2026.org/share/wy-commercial-property-tax/sources/",
          "",
          "Share page:",
          "https://skovgard2026.org/share/wy-commercial-property-tax/",
        ]
    : slug === "nothing-burger"
      ? [
          "I want to share a breakdown of a taxpayer-funded congressional mailing about Wyoming's public lands — and the question it does not answer.",
          "",
          "THE MAILING",
          "",
          "Rep. Harriet Hageman sent Wyoming constituents a letter. The footer states:",
          "\"PAID FOR BY OFFICIAL FUNDS AUTHORIZED BY THE HOUSE OF REPRESENTATIVES.\"",
          "",
          "The letter says Hageman \"never voted for the mass sale\" of public lands.",
          "That narrow denial is consistent with the record — the 2025 Senate land-sale",
          "provision was removed before any final vote.",
          "",
          "WHAT THE MAILING DOES NOT EXPLAIN",
          "",
          "The Senate budget bill included language that would have required federal land",
          "managers to dispose of land in 11 western states. Wyoming was on that list.",
          "Montana was not.",
          "",
          "When asked why Montana was excluded, Hageman told Cowboy State Daily she was",
          "not sure and said: \"This is a Senate bill. I didn't write it.\"",
          "",
          "The mailing answers the narrow vote question. It does not explain why Wyoming",
          "did not receive the same protection Montana received.",
          "",
          "WHAT WYOMING DESERVES",
          "",
          "The proposal was removed before it became law — that is good news.",
          "But the question remains: why did Montana get a carve-out that Wyoming did not?",
          "",
          "Wyoming public lands belong to Wyoming families. A taxpayer-funded mailing",
          "should answer that question directly. Wyoming deserves straight answers.",
          "",
          "Read the full breakdown with sources:",
          "https://skovgard2026.org/share/nothing-burger/sources/",
        ]
    : slug === "untrammeled-suffrage"
      ? [
          "I wanted to share a tool I have been building called Untrammeled Suffrage.",
          "",
          "The name comes from Wyoming's constitutional promise that elections shall be open,",
          "free, and equal. In plain language, untrammeled suffrage means the unrestricted",
          "right to vote.",
          "",
          "I built this tool because when we need a tool, the Wyoming way is to build it.",
          "",
          "Untrammeled Suffrage is a phone-friendly voter outreach and volunteer coordination",
          "tool created for Wyoming candidates and civic efforts that support every eligible",
          "voter's right to vote and to choose a preferred candidate.",
          "",
          "The app is currently a test product. The free version is set up primarily to support",
          "Skovgard for Senate field activity, data collection, volunteer follow-up, Pulse",
          "opt-ins, and voter outreach reporting. This gives your campaign a way to review the",
          "tool, test the workflow, and decide whether a campaign-specific setup would be useful.",
          "",
          "Skovgard for Senate campaign volunteers are granted free access through the volunteer page:",
          "https://skovgard2026.org/volunteer",
          "",
          "For another candidate's campaign, Skovgard for Senate is offering one test seat as a",
          "$100 in-kind contribution to your campaign.",
          "",
          "To opt in, email Jimmy at jimmy@grassrootsmvt.org",
          "Subject line: Untrammeled Suffrage Test Seat",
          "",
          "In the email, include your name, campaign name, office sought, preferred contact",
          "number, and the email address for the person who should receive access.",
          "",
          "If you would rather talk first, call or text Jimmy at 307-277-2260.",
          "",
          "Suggested filing description:",
          "  In-kind contribution from Skovgard for Senate: Untrammeled Suffrage voter",
          "  outreach software test access, one active user seat, fair-market value $100.",
          "",
          "Access is personally granted by me, one candidate at a time. Additional seats are",
          "available by request and are negotiable based on campaign needs, platform capacity,",
          "compliance requirements, and whether your campaign wants a campaign-specific setup.",
          "",
          "This is software access. Voter registry data is never sold.",
          "Voter registry data may be used only for lawful political, campaign, voter outreach,",
          "voter participation, or election-related purposes. Commercial use is prohibited.",
          "",
          "This tool is offered because voter participation belongs to us, and our system works",
          "best when more citizens can be reached, heard, and respected.",
          "",
          "I would be glad to walk through the app with you, provide one test seat, and discuss",
          "whether a campaign-specific setup makes sense for your team.",
          "",
          "Read more: https://skovgard2026.org/share/untrammeled-suffrage",
        ]
    : slug === "candidate-hub"
      ? [
          "Wyoming deserves an election process built around people, clarity, and trust.",
          "",
          "The Wyoming Candidate Hub is a simple place to find every candidate running for office",
          "in Wyoming — so voters can compare the field, ask better questions, and make their own",
          "decisions.",
          "",
          "This project is part of a larger effort to bring accountability, transparency, and public",
          "input back into the center of our election process.",
          "",
          "WHAT YOU'LL FIND",
          "",
          "  - Federal, statewide, and legislative candidates",
          "  - County and municipal races across Wyoming",
          "  - Campaign websites, social links, and contact information where available",
          "  - A ballot lookup tool to see which races are on your specific ballot",
          "",
          "View the Candidate Hub: https://candidates.skovgard2026.org/",
          "",
          "Every candidate. One place. Wyoming voters decide.",
          "",
          "FOR CANDIDATES",
          "",
          "If you are a candidate or campaign representative, you can request corrections or",
          "additions to your card — name, office, website, photo, bio, and more.",
          "",
          "Download the Candidate Card Update Instructions (PDF):",
          "https://skovgard2026.org/documents/candidate-card-update-instructions.pdf",
        ]
    : slug === "primary-candidates"
      ? [
          "Hi, {first_name},",
          "",
          "I built a tool to help Wyoming voters build their primary ballot — every candidate",
          "in one place, all the way down to the precinct level where available.",
          "",
          "View the Wyoming Candidate Hub: https://candidates.skovgard2026.org/",
          "",
          "My campaign is a digital neighbor-to-neighbor effort focused on truth, accountability,",
          "Wyoming voices, and a future we build together.",
          "",
          "May I send you occasional campaign updates, candidate information, and ways to take part?",
          "",
          "Yes, keep me updated: {optin_yes_url}",
          "No, unsubscribe me: {optin_no_url}",
          "",
          "You can opt out at any time.",
          "",
          "Thank you,",
          "Jimmy Skovgard",
        ]
    : slug === "wyoming-family-economy"
      ? [
          "A good economy is not measured only by a market index or a Washington talking point.",
          "It is measured at the kitchen table: whether a Wyoming family can pay for groceries,",
          "fuel, utilities, housing, and still save for the future.",
          "",
          "When the cost of necessities absorbs a modest pay increase, young families begin asking",
          "whether they can afford to stay and build a life in Wyoming. That is the financial reality",
          "public officials must face directly.",
          "",
          "RESPONSIBLE STEWARDSHIP",
          "",
          "Government must live within its limits, just as a household, ranch, or small business must.",
          "Honest budgets, stable energy policy, and clear explanations of every vote are how leaders",
          "protect the future and earn the public's trust.",
          "",
          "Every public dollar was first earned by a working taxpayer. Government should listen to",
          "Wyoming citizens before it lectures them.",
          "",
          "Read the supporting public data:",
          "https://skovgard2026.org/share/wyoming-family-economy/sources/",
          "",
          "Watch the video: https://skovgard2026.org/share/wyoming-family-economy",
        ]
    : slug === "higher-prices-washington-debt"
      ? [
          "The economy may look good on paper, but printed money and runaway spending show up",
          "where it matters — at the grocery store, the gas pump, the utility bill, and the",
          "cost of a home or vehicle. When the money supply keeps growing, prices keep rising,",
          "and it is Wyoming families who pay the price.",
          "",
          "America keeps entering conflicts without a clear path out. Open-ended foreign war is",
          "expensive — in lives, in treasure, and in the trust that holds a nation together.",
          "We have seen this before. A conflict without a plan to end it never ends.",
          "",
          "And the debt keeps climbing. We went from around $36 trillion to nearly $40 trillion",
          "in less than two years. Inflating a debt away only works if the spending stops.",
          "It hasn't stopped.",
          "",
          "THE ANSWER STARTS WITH ACCOUNTABILITY",
          "",
          "We need representatives from the people — not tied to big money, not trapped inside",
          "the system, and willing to speak honestly about debt, spending, war, and the future",
          "we are leaving our children and grandchildren.",
          "",
          "That is why Jimmy Skovgard is running. Someone close to the people needs to step up",
          "and speak for the people.",
          "",
          "Sign up for campaign updates on the Pulse page:",
          "https://skovgard2026.org/pulse",
          "",
          "Watch the video: https://skovgard2026.org/share/higher-prices-washington-debt",
        ]
    : slug === "wyoming-not-for-sale"
      ? [
          "Wyoming politics should belong to Wyoming citizens. But our local races and",
          "legislative fights are being crowded by national organizations, out-of-state PACs,",
          "and opaque funding networks with agendas built far from our towns and main streets.",
          "",
          "THE RECEIPTS",
          "",
          "Americans for Prosperity-Wyoming announced its 2024 legislative endorsements would",
          "be the single largest investment in Wyoming state-level politics in history.",
          "",
          "Make Liberty Win, a Virginia-based PAC, spent just over $370,000 on texts, phone",
          "calls, and mailers in Wyoming primary races — including mailers with wrong",
          "early-voting dates.",
          "",
          "HOW THE MACHINE WORKS",
          "",
          "Outside money moves through 501(c)(4) nonprofits, super PACs, donor networks, and",
          "issue campaigns. Some spending is disclosed. Donor origins are often harder to trace.",
          "AFP is a 501(c)(4) and is not required to disclose its donors.",
          "",
          "Legal is not the same as clean. Legal is not the same as accountable.",
          "Legal is not the same as Wyoming-grown.",
          "",
          "Wyoming is not a testing ground. Wyoming is not a billionaire sandbox.",
          "Wyoming belongs to the people who live here.",
          "",
          "Read the full breakdown with sources:",
          "https://skovgard2026.org/share/wyoming-not-for-sale/sources/",
        ]
    : slug === "changing-health-care"
      ? [
          "Wyoming is facing a hard question. After the Wyoming Supreme Court's ruling on abortion",
          "policy and Article 1, Section 38 of the Wyoming Constitution, the path forward should be",
          "honest, constitutional, and led by the people of Wyoming.",
          "",
          "This campaign is built on a simple belief: we do not have to let hard issues tear us apart.",
          "We can face them directly. We can tell the truth. We can follow the Constitution. And when",
          "the Constitution needs to be changed, we can place that question before the people.",
          "",
          "Every elected representative is bound to support, obey, and defend the Constitution.",
          "Our representatives do not own that oath. We do.",
          "",
          "THE HONEST PATH",
          "",
          "If Wyoming wants to change how the Constitution applies to health care and abortion policy,",
          "the honest path is a constitutional amendment placed before the people of Wyoming.",
          "",
          "That path lets us answer the hard questions directly:",
          "  - When does human life begin?",
          "  - When should human life receive the protections of law?",
          "  - What safeguards must exist for medical emergencies, miscarriage care, ectopic pregnancy",
          "    care, fatal fetal anomalies, rape, incest, and serious threats to a pregnant patient's health?",
          "  - How do we protect lawful, medically appropriate decisions between patients and providers?",
          "  - And how do we make sure our representatives stay within the guardrails of the Constitution?",
          "",
          "GRASSROOTSMVT: A PROOF OF CONCEPT",
          "",
          "GrassrootsMVT.org is being built as a proof of concept for verified public input —",
          "giving registered Wyoming voters a way to weigh in directly, district by district,",
          "so our representatives cannot hide behind noise, pressure, or assumptions.",
          "",
          "Take the Wyoming Health Care and Constitutional Process Survey:",
          "https://grassrootsmvt.org/surveys/wy-health-care-constitutional-process",
          "",
          "Read the source packet (PDF):",
          "https://skovgard2026.org/docs/Wellspring_Completed_Questionnaire_Skovgard_With_Public_Input.pdf",
          "",
          "We are Wyoming.",
          "Our representatives work for us.",
          "The Constitution belongs to the people.",
        ]
    : slug === "town-hall-introduction"
      ? [
          "At a Wyoming town hall this spring, Jimmy Skovgard opened with an honest admission.",
          "",
          "  \"If it said R, I hit the checkbox.\"",
          "  — Jimmy Skovgard, Wyoming Town Hall, April 2026",
          "",
          "Most Wyoming voters have been exactly there. We pick a party and check the box",
          "without always looking closely at who we're electing or what they'll do in office.",
          "Jimmy's point: that comfortable habit has a real cost, and Wyoming is paying it.",
          "",
          "THE LEGISLATIVE BRANCH HAS LEFT WYOMING BEHIND",
          "",
          "Congress sits at Article I for a reason — it was meant to be the most powerful branch.",
          "Instead, Article I legislators have handed their authority to Article II executives.",
          "Wyoming is left with representatives who follow rather than lead.",
          "",
          "He raised a clear example: nine cabinet members, combined wealth over $460 billion.",
          "The wealthy are represented well — how about the rest of us?",
          "One question for the Wyoming delegation — confirm and trust the process, or ask",
          "harder questions first? Their answer told us something.",
          "",
          "THE TOOLS EXIST — THE WILLPOWER DOESN'T",
          "",
          "Wyoming citizens now have technology and platforms to deliver verified public input",
          "directly to their representatives, district by district. The bottleneck is whether",
          "the people we send to Washington are willing to listen and act.",
          "",
          "WHAT YOU CAN DO",
          "",
          "  1. Watch the town hall and share it with a neighbor who might be thinking the same thing.",
          "     https://skovgard2026.org/share/town-hall-introduction",
          "",
          "  2. Ask your own honest question: who did you vote for last time, and do you",
          "     know what they did with it?",
          "",
          "  3. Volunteer. The August 18th primary is close. Wyoming citizens deciding this",
          "     race — not outside money — is exactly what Jimmy is talking about.",
          "     https://skovgard2026.org/volunteer/",
          "",
          "Citizens are the fourth branch of government.",
          "Our representatives work for us.",
          "Freedom works only when citizens use it.",
        ]
    : slug === "boulder-and-the-weeds"
      ? [
          "Something is deeply off with our political system. It has become a machine running",
          "on money and outrage — one that keeps regular citizens reacting, divided, and",
          "distracted while our freedom, our voice, and our local power keep moving farther",
          "away from our communities.",
          "",
          "While families pay more at the grocery store, the gas pump, and on utility bills,",
          "the machine manufactures a nonstop cycle of outrage that keeps neighbors staring",
          "sideways at each other instead of looking clearly at what is happening to our",
          "country. When neighbors are kept angry at neighbors, accountability disappears",
          "and the same old machine keeps rolling along.",
          "",
          "Truth is the boulder — stoic, existing, and enduring. Misinformation, fear, and",
          "outrage are like invasive weeds finding a hairline crack to grow in. Truth needs",
          "no advertising budget or corporate PAC to exist. It can sit quietly, it can wait,",
          "and it always rises — especially when a community has the courage to share.",
          "",
          "Real change does not come from the top down, and it will not come from another",
          "round of screaming. It starts quietly, when neighbors choose to share the truth,",
          "when citizens stop taking the bait, and when we remember that our communities",
          "were never built to be turned against one another.",
          "",
          "Wyoming knows something about grit, patience, and building for the long haul.",
          "August 18 is coming. We may not reach everyone tomorrow, but we can reach a",
          "friend today.",
          "",
          "Read the full essay, \"The Boulder and the Weeds\":",
          "https://skovgard2026.org/files/truth-and-weeds-essay.pdf",
        ]
      : [
          "This campaign is built around two simple beliefs.",
          "",
          "First, Wyoming voters deserve leadership grounded in integrity, accountability,",
          "transparency, compassion, courage and bound by the Constitution and the rule of law.",
          "",
          "Second, the citizens, you and I, are the fourth branch of government.",
          "Our representatives work for us and are accountable to us. Public office belongs",
          "to public service, and public service must answer to the people.",
          "",
          "WHY THIS MATTERS",
          "",
          "Mass manipulation is dangerous because fear, outrage, and division weaken our",
          "judgment, separate us from one another, and pressure us to surrender choices that",
          "belong to us.",
          "",
          "Freedom matters. Our right to make our own choices, speak our minds without fear",
          "of retribution, and associate freely is fundamental to self-government.",
          "",
          "The August 18th primary election matters — freedom works only when citizens use it.",
          "Every eligible Wyoming voter should make a plan, study the candidates, ask hard",
          "questions, and cast a ballot.",
          "",
          "I am running to help restore trust in public service and make sure Wyoming's voice",
          "is carried with honesty, courage, and respect.",
          "",
          "THREE COMMITMENTS",
          "",
          "  1. Integrity in leadership — Public service measured by truth, character,",
          "     and accountability.",
          "  2. A stronger Wyoming voice — Wyoming communities heard clearly, from small",
          "     towns and ranch roads to main streets, schools, and kitchen tables.",
          "  3. A future built together — Lasting change built by listening first and",
          "     speaking honestly.",
        ];

  return [
    sender_intro,
    "",
    "Hi,",
    "",
    ...specificLines,
    "",
    "STAY CONNECTED",
    "",
    "  Learn more:   https://www.skovgard2026.org/about/",
    "  Volunteer:    https://www.skovgard2026.org/volunteer/",
    "  Support:      https://www.skovgard2026.org/donate/",
    "  Share:        https://www.skovgard2026.org/share/",
    "",
    "Most of all, I would like to hear from you. Reply to this email and tell us what",
    "issue matters most in your community.",
    "",
    "This campaign is built one conversation at a time. Thank you for being part of it.",
    "",
    "With respect,",
    "Jimmy Skovgard — Preserving our legacy. Empowering our future.",
    "",
    "Paid for by Skovgard for Senate.",
    "---",
    `You received this because ${sender_name || "a friend"} shared it with you.`,
    "This is a one-time message — you are not being added to any mailing list.",
  ].join("\n");
}
