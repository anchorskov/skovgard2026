// Candidates/src/lib/questionnaire.ts
// Single source of truth for the candidate questionnaire question set, shared
// by the public profile page, the self-serve answer form, and the submit API.

export const MAX_ANSWER_LENGTH = 1500;

export const QUESTIONNAIRE_QUESTIONS = [
  {
    number: 1,
    key: 'oath_and_limits',
    label:
      'Have you ever sworn or affirmed an oath to support and defend the Constitution of the United States or the Constitution of the State of Wyoming? If so, in what capacity?\n\n' +
      'Whether or not you have previously taken such an oath, what would the constitutional oath of the office you are seeking mean to you, and how would it guide your decisions?',
  },
  {
    number: 2,
    key: 'fiscal_course',
    label:
      'Explain the difference between the national debt and the annual federal budget deficit.\n\n' +
      'Can the country continue on its current fiscal course? What specific spending, revenue, or budget reforms would you propose, support, or work to enact?',
  },
  {
    number: 3,
    key: 'land_and_influence',
    intro:
      'Wyoming residents have raised concerns about the sale or transfer of public lands and the influence of campaign money, private interests, and outside organizations.',
    label:
      'What standards should govern any proposed sale, transfer, or exchange of public land in Wyoming? Please address public access, local consultation, transparency, and long-term public benefit.\n\n' +
      'What disclosure, recusal, transparency, or decision-making practices will you use to prevent campaign money, private interests, or outside organizations from controlling your decisions in office?',
  },
  {
    number: 4,
    key: 'top_priority',
    label:
      'In your judgment, what is the most important issue facing Wyoming today?\n\n' +
      'Explain why you selected that issue and identify the first practical and measurable action you would take within the authority of the office you are seeking.',
  },
  {
    number: 5,
    key: 'why_you',
    label:
      'What experience, judgment, record, and personal commitments distinguish you as a candidate for this office?\n\n' +
      'Please be specific about what Wyoming voters can expect from you if elected.',
  },
] as const;

export const QUESTIONNAIRE_LABELS: Record<string, string> = Object.fromEntries(
  QUESTIONNAIRE_QUESTIONS.map((q) => [q.key, q.label])
);

export const QUESTIONNAIRE_KEYS: string[] = QUESTIONNAIRE_QUESTIONS.map((q) => q.key);
