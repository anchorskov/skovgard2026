<!-- docs/pulse-quick-optin-prompt.md -->

# Pulse Quick Opt-In Prompt

This is the reviewed version of the quick opt-in prompt, adjusted to match the current `skovgard2026` repo and the existing Pulse opt-in contract.

## Repo reality check

- Current Pulse flow is not just one page. It currently includes:
  - `/pulse/` landing page
  - `/pulse/signup/` main opt-in form
  - `/pulse/setup-iphone/` and `/pulse/setup-android/` follow-on setup pages
- The current client and server contract already exists and is stricter than the original prompt assumed.
- If you reuse the existing `/api/optin` endpoint without changing server logic, the form must still submit:
  - `first_name`
  - `last_name`
  - `address1`
  - `city`
  - `state` = `WY`
  - `zip`
  - `phone`
  - `consent_sms`
- `city` is required.
- The SMS consent checkbox must be checked or submit fails.
- The current local/prod API pattern uses `static/js/env.js`:
  - production uses same-origin `/api/...`
  - localhost uses the existing `API_URL` pattern for the Worker dev server
- Privacy and Terms pages already exist at `/privacy` and `/terms`.
- The privacy page should be reviewed for explicit mobile opt-in non-sharing language before shipping a new SMS capture flow.

## Files to inspect first

- `src/pages/pulse/index.astro`
- `src/pages/pulse/signup/index.astro`
- `src/pages/pulse/setup-iphone/index.astro`
- `src/pages/pulse/setup-android/index.astro`
- `static/js/pulse-optin.js`
- `static/js/newsletter-signup.js`
- `static/js/env.js`
- `worker/src/index.js`
- `src/pages/privacy.astro`
- `src/pages/terms.astro`
- `src/components/Nav.astro`

## Revised implementation prompt

Goal:
Add a new quick opt-in page to simplify the current Pulse signup flow for speed, clarity, and mobile conversion, without breaking the existing Pulse opt-in and texting workflow.

Project rules:
- Work in WSL-friendly fashion.
- Preserve localhost and production parity.
- In production, keep API requests same-origin.
- In local development, preserve the existing `static/js/env.js` pattern so Astro and the local Worker continue to work together.
- Do not assume file contents. Inspect the actual repo first and reuse existing patterns.
- Prefer existing layouts, components, validation helpers, anti-bot protections, and API endpoints where they already exist.
- Keep changes minimal and compatible with the current Pulse admin/texting/export flow.

What to inspect first:
1. Find the current Pulse entry points and understand the existing multi-step flow.
2. Inspect the current Pulse form and the `/api/optin` endpoint contract before removing or renaming fields.
3. Inspect existing newsletter/contact signup patterns for lighter-weight form behavior you can reuse.
4. Find the privacy policy and terms pages so the new form can link to them.
5. Identify the cleanest CTA entry point from the current `/pulse/` page and, if appropriate, from the main navigation or homepage.

What to build:
Create a new lightweight quick opt-in page for campaign text updates.

Route suggestion:
- `/join`
- `/get-involved`
- `/pulse/join`

Use the existing project structure and naming conventions you find in the repo.

Recommended implementation approach:
- Treat this as an additive shortcut, not a destructive rewrite.
- Keep the existing `/pulse/signup/` and setup pages working unless there is a deliberate migration plan.
- Prefer creating a faster front door that still feeds the existing opt-in pipeline.

UX requirements:
- Mobile first
- Fast load
- Clean, campaign-consistent styling
- One clear CTA
- Fewer visible fields than the current Pulse signup page where possible
- Do not remove fields the existing endpoint still requires unless you also update the server safely

Form fields:
Required:
- `first_name`
- `last_name`
- `mobile`
- `city`
- `zip`
- `consent_sms`

Required if reusing the current `/api/optin` endpoint unchanged:
- `address1`

Hidden or prefilled if appropriate:
- `state` = `WY`
- `country` = `US`

Optional:
- `email`
- `email_opt_in`
- `volunteer_opt_in`

Consent checkboxes:
Required for SMS:
- I agree to receive campaign text messages from Jimmy Skovgard.

Optional:
- I want campaign email updates.
- I want volunteer opportunities.

Do NOT include:
- address line 2
- state dropdown
- long support checklists
- donation options on this page
- public endorsement checkbox
- yard sign requests

Important compatibility note:
- The current server requires `city`.
- The current server requires checked SMS consent.
- The current server still requires `address1` and `state = WY` if you reuse `/api/optin` as-is.
- Removing the voter checkbox is compatible with the current Pulse direction, but removing street address still requires careful server and workflow review.

Compliance copy:
Place this directly under the SMS checkbox in small text:

By checking this box and submitting your mobile number, you agree to receive campaign text messages from Jimmy Skovgard. Message frequency may vary. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of donation. View Privacy Policy and Terms.

Link Privacy Policy and Terms to the existing site pages.

Privacy policy requirement:
- Check whether the privacy policy explicitly states that mobile opt-in data is not sold or shared for promotional or marketing purposes.
- If it does not, update the privacy policy and note that change in your summary.

Data/API behavior:
- Reuse the existing `/api/optin` endpoint unless there is a clear reason to change the contract.
- If reusing `/api/optin`, keep payload compatibility with the current Worker implementation.
- Preserve existing anti-bot protections where appropriate:
  - Turnstile
  - honeypot
  - time-trap
  - duplicate / rapid-submit protection
- Validate required fields on both client and server.
- Normalize phone numbers using existing utilities if already present.
- Return clear success and error messages.
- Keep implementation compatible with current texting, admin export, and contact storage flows.

If a new endpoint is truly necessary, it must safely store:
- `first_name`
- `last_name`
- `address1` if still needed for voter or district workflows
- `city`
- `state`
- `zip`
- `mobile`
- `email`
- `sms_opt_in`
- `email_opt_in`
- `volunteer_opt_in`
- `source_page`
- `created_at`

Design/content:
Page heading:
- Join Team Jimmy

Alternative headings if the current site language suggests better alignment:
- Stay Connected
- Join the Campaign
- Add Your Voice

Subheading:
- Sign up for campaign updates, volunteer opportunities, and important news.

Button text:
- Join the Campaign

Success state:
- Show a clean inline success state or use an existing thank-you pattern if one already exists.
- Do not create a success flow that breaks localhost or production behavior.

Implementation steps:
1. Inspect the current Pulse pages, JS, and Worker endpoint.
2. Identify the exact files to edit before making changes.
3. Build the new quick opt-in page using the site's existing layout and styling patterns.
4. Reuse the existing endpoint if possible.
5. Keep client-side and server-side validation aligned.
6. Link Privacy Policy and Terms.
7. Add or adjust the CTA so the quick opt-in page is easy to reach.
8. Test locally against the current Astro plus Worker setup.
9. Summarize exact files changed, before/after behavior, and how to test.

Important:
- Use existing project conventions over inventing new ones.
- Keep the new page fast and substantially simpler than the current flow.
- Do not break the current Pulse signup flow while adding the quick path.
- Do not remove `city` from the submission contract.
- Do not allow submit without checked SMS consent.
- If there is tension between "fewer fields" and endpoint compatibility, preserve working data capture first and simplify second.
- Show the exact files changed and explain how to test locally.

## Recommended next step

Use this prompt as the implementation brief for the `pulse` branch. If the goal is to remove street address entirely, first decide whether that is acceptable for the current voter matching and Pulse admin workflow, because the existing `/api/optin` endpoint still depends on it.
