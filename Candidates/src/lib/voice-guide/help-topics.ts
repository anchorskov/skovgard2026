// Candidates/src/lib/voice-guide/help-topics.ts
//
// Single source of truth for both the visible Help panel and the Voice
// Guide's spoken help. Keep spoken instructions shorter than the visible
// ones — a screen full of detail is fine to read; a screen full of detail
// is not fine to have read aloud. See Candidates/docs/voice_guide.md.
//
// Adding a new topic never requires touching the speech-recognition code
// in commands.ts or the VoiceGuide component's state machine — only this
// registry and, if it should be reachable, one entry in the pathname → id
// map in VoiceGuide.astro.

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  visibleInstructions: string[];
  spokenInstructions: string[];
  availableCommands: string[];
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
  home: {
    id: 'home',
    title: 'Homepage help',
    summary: 'Look up the races and candidates on your Wyoming primary ballot.',
    visibleInstructions: [
      'This page finds your ballot by matching your voting address to your county and legislative district.',
      'Use the address form to enter your house number, street, city, and ZIP Code, or use the "Use my location" button to fill it in automatically.',
      'You can also browse every race statewide without entering an address, or open the candidate guide if it is enabled for this site.',
    ],
    spokenInstructions: [
      'This is the Wyoming Primary Voter Guide homepage. You can look up your ballot by address, or browse all races without an address.',
    ],
    availableCommands: ['Find my ballot', 'Browse races', 'Candidate guide', 'Help', 'Repeat', 'Stop voice guide'],
  },

  'address-form': {
    id: 'address-form',
    title: 'Ballot address lookup help',
    summary: 'How the address lookup works and what happens to what you enter.',
    visibleInstructions: [
      'Your address is requested only to match you to your Wyoming county, legislative district, and precinct, so the site can show the races that apply to you.',
      'GPS coordinates from "Use my location" may be logged anonymously to improve district matching — no address or GPS data is otherwise stored on our servers.',
      '"Use my location" asks your browser for your device location and reverse-geocodes it to a street address automatically. "Enter address" lets you provide house number, street, city, and ZIP Code directly.',
      'House / Unit Number, Street Name, City, and ZIP Code are all required to run a lookup.',
      'You can correct any field at any time by typing directly into it, whether or not you used the Voice Guide to fill it in.',
      'Nothing is looked up or submitted until you confirm — by voice with "Confirm," or by selecting the existing "Find My Ballot" button.',
      'You can leave the Voice Guide at any point and finish the lookup manually with your keyboard, mouse, or touchscreen — nothing you did through the Voice Guide is lost.',
    ],
    spokenInstructions: [
      'Your address is used only to find your county and district. Say "Use my location" to fill in your address automatically, or "Enter address" to say it yourself. Nothing is submitted until you confirm.',
    ],
    availableCommands: ['Use my location', 'Enter address', 'Help', 'Repeat', 'Back', 'Stop voice guide'],
  },

  'address-confirm': {
    id: 'address-confirm',
    title: 'Confirm your address',
    summary: 'Review the address before it is used to look up your ballot.',
    visibleInstructions: [
      'The address you entered or spoke is shown above. Check it before continuing.',
      'Say "Confirm," or select the existing "Find My Ballot" button, to run the lookup. Say "Back" to change what you entered.',
      'Nothing is submitted automatically — a lookup only runs after this explicit confirmation.',
    ],
    spokenInstructions: [
      'Say Confirm to look up this address, or Back to change it.',
    ],
    availableCommands: ['Confirm', 'Back', 'Help', 'Repeat', 'Stop voice guide'],
  },

  races: {
    id: 'races',
    title: 'Browse races help',
    summary: 'Every race on the 2026 Wyoming primary ballot, grouped by level.',
    visibleInstructions: [
      'This page lists every tracked race statewide, grouped by federal, statewide, legislative, county, and city offices.',
      'Select any race to see its filed candidates.',
    ],
    spokenInstructions: [
      'This page lists every race statewide. Say Read this page to hear an overview, or use your existing navigation to open a specific race.',
    ],
    availableCommands: ['Find my ballot', 'Candidate guide', 'Help', 'Repeat', 'Back', 'Stop voice guide'],
  },

  'race-detail': {
    id: 'race-detail',
    title: 'Race detail help',
    summary: 'Hear who filed for this race, one candidate at a time.',
    visibleInstructions: [
      'This page lists the candidates filed for one race, in the same order shown on screen.',
      '"Read this page" starts reading from the first candidate. "Next item" and "Previous item" move through candidates one at a time.',
      'Say "My choice" to add or remove the candidate you are currently hearing from your saved list — the same list the on-screen "My choice" button controls.',
      'If this race allows more than one selection and you are at the limit, "My choice" will tell you to remove a choice first, the same as the on-screen button would.',
      'Say "Next race" to move to the next race that still needs a choice, or to hear the ballot lookup if none has been run yet.',
      'The Voice Guide only reads candidate information — it does not summarize, rank, or recommend any candidate.',
    ],
    spokenInstructions: [
      'This page lists the candidates for this race. Say Read this page to begin, Next item or Previous item to move between candidates, My choice to select who you are hearing, or Next race to continue your ballot.',
    ],
    availableCommands: ['Read this page', 'Next item', 'Previous item', 'My choice', 'Next race', 'Help', 'Repeat', 'Back', 'Stop voice guide'],
  },

  'candidate-guide': {
    id: 'candidate-guide',
    title: 'Candidate profile help',
    summary: 'Hear a candidate’s profile section by section.',
    visibleInstructions: [
      'This page shows one candidate’s profile: background, rubric scores, endorsement (if any), questionnaire answers, and sources.',
      '"Read this page" starts with the first section. "Next item" and "Previous item" move between sections.',
      'Detailed tables (like the rubric score breakdown) are shown on screen rather than read aloud in full — the Voice Guide will say when a section has more detail than it read.',
    ],
    spokenInstructions: [
      'This page is one candidate’s profile. Say Read this page to begin, then Next item or Previous item to move between sections.',
    ],
    availableCommands: ['Read this page', 'Next item', 'Previous item', 'Help', 'Repeat', 'Back', 'Stop voice guide'],
  },

  general: {
    id: 'general',
    title: 'Voice Guide controls',
    summary: 'The controls available anywhere the Voice Guide runs.',
    visibleInstructions: [
      'Say "Find my ballot," "Browse races," or "Candidate guide" to move between the main sections of the site.',
      'Say "Help" (or "What can I say") at any time to hear the options available on the current page.',
      'Say "Repeat" to hear the last message again, "Back" to return to the previous step, or "Stop voice guide" to close it.',
      'Every option here also has a visible button in the Voice Guide panel — nothing requires speech or a microphone to use.',
    ],
    spokenInstructions: [
      'You can say Find my ballot, Browse races, Candidate guide, Help, Repeat, Back, or Stop voice guide.',
    ],
    availableCommands: ['Find my ballot', 'Browse races', 'Candidate guide', 'Help', 'Repeat', 'Back', 'Stop voice guide'],
  },

  'unsupported-recognition': {
    id: 'unsupported-recognition',
    title: 'Spoken commands are unavailable in this browser',
    summary: 'Your browser does not support speech recognition — read-aloud help and all navigation still work.',
    visibleInstructions: [
      'This browser does not support speech recognition, so spoken commands are unavailable here.',
      'The Voice Guide still works as a read-aloud helper: every option is available as a button you can select with a keyboard, mouse, or touchscreen.',
      'Try a recent version of Chrome, Edge, or Android Chrome for spoken-command support in a future visit — this does not affect ordinary site navigation, which always works regardless of browser.',
    ],
    spokenInstructions: [
      'Spoken commands are not available in this browser. Every option is still available as a button below.',
    ],
    availableCommands: [],
  },

  'mic-permission-denied': {
    id: 'mic-permission-denied',
    title: 'Microphone access was not granted',
    summary: 'Spoken commands need microphone access — everything else still works without it.',
    visibleInstructions: [
      'Microphone access was denied or dismissed, so spoken commands are unavailable for now.',
      'You can allow microphone access from your browser’s address-bar or site-settings icon and try again, or continue using the Voice Guide entirely with the on-screen buttons.',
      'Read-aloud help and all ordinary site navigation work the same either way.',
    ],
    spokenInstructions: [
      'Microphone access was not granted. You can allow it in your browser settings, or continue using the buttons below.',
    ],
    availableCommands: [],
  },

  'voice-assist-compatibility': {
    id: 'voice-assist-compatibility',
    title: 'Voice Assist compatibility',
    summary: 'What determines which Voice Guide features are available in your browser.',
    visibleInstructions: [
      'The Voice Guide runs in one of three modes depending on what your browser supports: full (spoken commands and read-aloud help), read-only (read-aloud help and on-screen buttons, no spoken commands), or visual-only (on-screen buttons and visible Help, no audio).',
      'Chrome and Microsoft Edge, current versions, offer the most complete spoken-command support.',
      'To use spoken commands, your browser will ask to allow microphone access — you can allow this from your browser or device settings at any time.',
      'On Safari, spoken commands may require Siri and microphone access to be enabled in your device settings.',
      'On Firefox, read-aloud Help works normally, but spoken commands are not currently supported — use Chrome or Edge if spoken commands matter to you.',
      'Your browser and operating-system settings (including microphone permission, language settings, and network connectivity) can all affect which mode is active, and this can change between visits.',
      'Ordinary site navigation, the ballot lookup, and browsing candidates all work exactly the same regardless of which Voice Guide mode is active.',
      'This site does not intentionally store audio, voice transcripts, or recognized commands.',
    ],
    spokenInstructions: [
      'Voice command availability depends on your browser and settings. Chrome and Microsoft Edge are recommended. Safari may require Siri to be enabled. If voice commands are unavailable, read-aloud Help and all standard controls remain available.',
    ],
    availableCommands: [],
  },

  'recognition-failure': {
    id: 'recognition-failure',
    title: 'A spoken command was not understood',
    summary: 'What to do when the Voice Guide could not match what it heard.',
    visibleInstructions: [
      'The Voice Guide only acts on an exact match from its approved command list, shown below and in the on-screen buttons.',
      'Say "Help" or "What can I say" to hear the exact options available right now.',
      'You can also select any option directly with a keyboard, mouse, or touchscreen instead of retrying by voice.',
    ],
    spokenInstructions: [
      'I did not understand that command. Say Help to hear the available options.',
    ],
    availableCommands: [],
  },
};

export function getHelpTopic(id: string | null | undefined): HelpTopic {
  if (id && HELP_TOPICS[id]) return HELP_TOPICS[id];
  return HELP_TOPICS.general;
}

/**
 * Maps a URL pathname to its default help topic id. Shared by
 * VoiceGuide.astro and HelpPanel.astro so page → topic logic lives in
 * exactly one place. Sub-page context (e.g. the address-form stage within
 * "/") is layered on top of this by VoiceGuide's own state, not here.
 */
export function topicIdForPath(pathname: string): string {
  const path = pathname || '/';
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/races')) return 'races';
  if (path.startsWith('/race/')) return 'race-detail';
  if (path.startsWith('/candidate/')) return 'candidate-guide';
  return 'general';
}
