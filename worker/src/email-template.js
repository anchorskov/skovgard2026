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

const FREEDOM_VS_CONTROL_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    I want to share a breakdown of what Wyoming&#8217;s Legislature actually did on voting
    and elections in 2025 and 2026.
  </p>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Out of 38 election-related bills, one arguably helped voters. An email notice before
    your name is removed from the voter rolls. That is the high-water mark for voter access.
  </p>

  <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#111827;">
    Everything else moved the other direction.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border-left:5px solid #b22234;background:#fef7f7;">
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #fecdd3;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
          <strong style="color:#b22234;">WYOMING PASSED HB0156</strong> &#8212;
          requiring proof of citizenship, proof of residence, and a 30-day residency
          requirement before voter eligibility.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #fecdd3;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
          <strong style="color:#b22234;">WYOMING PASSED SF0078</strong> &#8212;
          no person except a county clerk or Secretary of State may distribute an absentee
          ballot request form unless the voter specifically asks for one.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#111827;">
          <strong style="color:#b22234;">WYOMING PASSED SF0030</strong> &#8212;
          clarifying the definition of &#8220;qualified elector&#8221; and making
          conforming changes to voter registration and qualifications.
        </p>
      </td>
    </tr>
  </table>

  <h2 style="margin:26px 0 14px;font-size:22px;line-height:1.3;color:#0f2742;">
    Freedom vs. Control
  </h2>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 22px;border:1px solid #e5e7eb;">
    <tr style="background:#f8fafc;">
      <td style="padding:8px 14px;font-size:12px;font-weight:bold;text-transform:uppercase;
          letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;width:50%;">
        Freedom would mean&#8230;
      </td>
      <td style="padding:8px 14px;font-size:12px;font-weight:bold;text-transform:uppercase;
          letter-spacing:0.08em;color:#b22234;border-bottom:1px solid #e5e7eb;">
        Control means&#8230;
      </td>
    </tr>
    <tr>
      <td style="padding:12px 14px;font-size:15px;color:#111827;
          border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        Online voter registration.
      </td>
      <td style="padding:12px 14px;font-size:15px;color:#111827;border-bottom:1px solid #e5e7eb;">
        More paperwork.
      </td>
    </tr>
    <tr>
      <td style="padding:12px 14px;font-size:15px;color:#111827;
          border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        Longer early voting.
      </td>
      <td style="padding:12px 14px;font-size:15px;color:#111827;border-bottom:1px solid #e5e7eb;">
        Proof before participation.
      </td>
    </tr>
    <tr>
      <td style="padding:12px 14px;font-size:15px;color:#111827;
          border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        Easier absentee access.
      </td>
      <td style="padding:12px 14px;font-size:15px;color:#111827;border-bottom:1px solid #e5e7eb;">
        Restricting who can hand you a form.
      </td>
    </tr>
    <tr>
      <td style="padding:12px 14px;font-size:15px;color:#111827;border-right:1px solid #e5e7eb;">
        Broader ballot access.
      </td>
      <td style="padding:12px 14px;font-size:15px;color:#111827;">
        Tighter deadlines and more barriers.
      </td>
    </tr>
  </table>

  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    This was not a voting freedom agenda. It was a control agenda dressed up as election
    security.
  </p>

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    <a href="https://skovgard2026.org/share/freedom-vs-control/sources/"
        style="color:#0f2742;font-weight:bold;">
      Read the full breakdown with sources
    </a>
    at skovgard2026.org/share/freedom-vs-control/sources/
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

  <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#111827;">
    Take a look here:
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

// ── Message registry ───────────────────────────────────────────────────────────
// One entry per shareable message. subject() and intro() accept an optional senderName.

export const SHARE_MESSAGES = {
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
  "freedom-vs-control": {
    title:        "Freedom vs. Control",
    body_html:    FREEDOM_VS_CONTROL_BODY_HTML,
    preview_text: "Wyoming passed 38 election bills. One helped voters. The rest moved toward control.",
    subject(n) {
      return n
        ? `${n} wanted you to see this Wyoming election breakdown`
        : "Wyoming's election legislation — freedom vs. control";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this breakdown with you.`
        : "A Wyoming neighbor wanted to share this breakdown with you.";
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
export function buildShareEmailText({ sender_name = "", sender_intro, slug = "" }) {
  const specificLines =
    slug === "representatives-work-for"
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
    : slug === "freedom-vs-control"
      ? [
          "I want to share a breakdown of what Wyoming's Legislature actually did on voting",
          "and elections in 2025 and 2026.",
          "",
          "Out of 38 election-related bills, one arguably helped voters. An email notice",
          "before your name is removed from the voter rolls. That is the high-water mark.",
          "",
          "Everything else moved the other direction.",
          "",
          "WYOMING PASSED HB0156 — requiring proof of citizenship, proof of residence, and",
          "a 30-day residency requirement before voter eligibility.",
          "",
          "WYOMING PASSED SF0078 — no person except a county clerk or Secretary of State",
          "may distribute an absentee ballot request form unless the voter specifically asks.",
          "",
          "WYOMING PASSED SF0030 — clarifying the definition of \"qualified elector\" and",
          "making conforming changes to voter registration and qualifications.",
          "",
          "Freedom would mean online voter registration.   Control means more paperwork.",
          "Freedom would mean longer early voting.          Control means proof before participation.",
          "Freedom would mean easier absentee access.       Control means restricting who can hand you a form.",
          "Freedom would mean broader ballot access.        Control means tighter deadlines and more barriers.",
          "",
          "This was not a voting freedom agenda. It was a control agenda dressed up as",
          "election security.",
          "",
          "Read the full breakdown with sources:",
          "https://skovgard2026.org/share/freedom-vs-control",
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
          "Take a look here:",
          "https://skovgard2026.org/share/wy-citizen-ballot",
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
