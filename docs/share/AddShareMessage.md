# Adding a New /share Message

Step-by-step checklist for adding a shareable message at `/share/<slug>`.
Follow every step in order — skipping any leaves the flow broken in at least one place.

---

## 1. Choose a slug

- Lowercase kebab-case only: `voting-rights`, `budget-priorities`
- The slug is used as a JS object key, a URL path segment, and a D1 audit column — keep it stable once published
- Must be unique inside `SHARE_MESSAGES` in `worker/src/email-template.js`

---

## 2. Files to create or edit

| Action | File |
|--------|------|
| Edit | `worker/src/email-template.js` |
| Edit | `src/pages/share/index.astro` |
| Create | `src/pages/share/<slug>.astro` |
| Add | `static/images/share/meme-<slug>.png` *(see §8)* |

No new D1 migration is needed for a new message — the `share_sends` table already has a `message_slug` column that accepts any string. Migrations only apply when new D1 tables or columns are added (Phase 2, deferred).

---

## 3. Add the message to `worker/src/email-template.js`

This is the single source of truth for all email content. Two changes are required.

### 3a. Write the inner body HTML constant

Add a new constant above the `SHARE_MESSAGES` registry:

```js
const NEW_TOPIC_BODY_HTML = `
  <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">
    Opening paragraph...
  </p>
  <!-- more table-based inner HTML -->
`;
```

Rules for `body_html`:
- **Fragment only** — no `<html>`, `<head>`, `<body>`, or outer chrome. Those come from `buildShareEmailHtml()`.
- **Table-based layout with inline styles** — no class attributes, no `<style>` blocks, no `<link>` tags.
- **No `<script>` tags** — email clients strip them and some block the entire message.
- **No `<img>` tags** — see §10 (images deferred).
- Use `&#8212;` for em-dash, `&#8217;` for right single-quote, etc. to avoid encoding issues.
- Test in an email client or with a real send before publishing. Tables render differently than browser HTML.

### 3b. Add the registry entry

Add a new key inside the `SHARE_MESSAGES` object:

```js
export const SHARE_MESSAGES = {
  "jimmys-story":       { /* existing */ },
  "freedom-vs-control": { /* existing */ },

  "new-topic": {
    title:        "Human-readable title",
    body_html:    NEW_TOPIC_BODY_HTML,
    preview_text: "Inbox preview line — 50-80 characters, no HTML.",
    subject(n) {
      return n
        ? `${n} wanted you to see this`
        : "A Wyoming neighbor wanted you to see this";
    },
    intro(n) {
      return n
        ? `${n} wanted to share this with you.`
        : "A Wyoming neighbor wanted to share this with you.";
    },
  },
};
```

### 3c. Add the plain-text block to `buildShareEmailText()`

The function uses a `slug ===` chain to select the correct plain-text body. Add a new branch **before** the default `else`:

```js
export function buildShareEmailText({ sender_name = "", sender_intro, slug = "" }) {
  const specificLines =
    slug === "freedom-vs-control"
      ? [ /* existing */ ]
    : slug === "new-topic"
      ? [
          "Opening line in plain text.",
          "",
          "Second paragraph...",
          "",
          "Read more: https://skovgard2026.org/share/new-topic",
        ]
    : [ /* existing jimmys-story default */ ];

  return [ sender_intro, "", "Hi,", "", ...specificLines, /* footer lines */ ].join("\n");
}
```

This is **not** auto-generated from `body_html`. Write the plain-text lines by hand alongside the HTML. Keep them in sync when the HTML changes. `stripHtmlToText()` is exported for future Phase 2 D1 use but is not currently wired into the send flow.

---

## 4. Create the Astro page

Copy `src/pages/share/jimmys-story.astro` as a starting point:

```
cp src/pages/share/jimmys-story.astro src/pages/share/new-topic.astro
```

Then update the copy:

1. **Top comment** — change to `// src/pages/share/new-topic.astro`
2. **`<Base>` title and description** — update to match the message
3. **Breadcrumb label** — change `"Jimmy's Story"` to the new title
4. **Section description text** — update to describe the new message
5. **Meme image** — update `src`, `alt`, `style="background-color:..."` and the shadow `min-height` fallback
6. **`PAGE_URL`** in `<script>` — change to `'https://skovgard2026.org/share/new-topic'`
7. **`tweetText`** in `<script>` — write a 200-character-max tweet for this topic
8. **`message_slug`** in the `fetch('/api/share', ...)` body — change to `'new-topic'`
9. **`slug` param** in `buildPreviewUrl()` — change to `'new-topic'`
10. **`updateSubjectLine()`** — update the default/named subject text to match the new `SHARE_MESSAGES` entry

Do not add a `buildMailtoBody()` function, a mailto button, or any `window.location.href = 'mailto:...'` handler. The detail page send flow is server-side Resend only.

---

## 5. Add the card to `/share` index

Edit `src/pages/share/index.astro` and add an entry to the `cards` array:

```js
const cards = [
  // existing entries ...
  {
    slug:         'new-topic',
    href:         '/share/new-topic',
    label:        'Category label',           // e.g. "Economic Policy"
    title:        'New Topic Title',
    teaser:       'One or two sentences...',
    meme:         '/images/share/meme-new-topic.png',
    memeAlt:      'Descriptive alt text for screen readers',
    memeBg:       '#2b2b2b',                  // fallback color while image loads
    tweetText:    'Short tweet text (max ~200 chars).',
    emailSubject: 'Subject line for the index quick-share mailto button',
    emailBody:    [
      "Hi,",
      "",
      "One-paragraph plain-text summary for the quick-share mailto.",
      "",
      `Read more: ${BASE}/share/new-topic`,
      "",
      "Jimmy Skovgard — Preserving our legacy. Empowering our future.",
      "Paid for by Skovgard for Senate.",
    ].join("\n"),
  },
];
```

`emailSubject` and `emailBody` on the index card are used only by the quick-bar "Email" button, which opens a `mailto:` link as a quick-share convenience. This is separate from the detail page send flow. The card's quick-bar mailto is acceptable; the detail page must not have one.

---

## 6. How the email preview and send are wired

The flow at runtime:

```
User types name in #share-sender
  → schedulePreview() debounced 300ms
  → fetch('/api/share/preview?slug=new-topic&sender_name=...')
  → Worker: GET /api/share/preview
      SHARE_MESSAGES['new-topic'] → msg.intro() → buildShareEmailHtml()
      → returns full HTML document
  → previewIframe.srcdoc = html

User clicks "Have us send it"
  → POST /api/share { message_slug: 'new-topic', sender_name, recipients }
  → Worker validates slug, builds html + text, sends via Resend
  → Logs to share_sends table
```

GET `/api/share/preview` is not gated by `SHARE_ENABLED` — it works in every environment, including preview and dev. POST `/api/share` requires `SHARE_ENABLED=1`, which is set only in production (`worker/wrangler.toml` `[env.production.vars]`).

---

## 7. Security checklist

Before merging, verify:

- [ ] `body_html` contains no `<script>`, `<style>`, `onclick`, `onerror`, or other event attributes
- [ ] `body_html` uses no class-based CSS (email clients strip `<head>` styles; only inline styles survive)
- [ ] `sender_name` is never injected raw — it passes through `escHtml()` inside `buildShareEmailHtml()` and is limited to 80 chars + newline-stripped in the POST handler
- [ ] The detail page `<script>` block uses only relative API paths (`/api/share`, `/api/share/preview`) — never absolute Worker URLs in client code
- [ ] No new `data-body` attributes containing multi-line text are added to the index page without sanitizing for XSS via `encodeURIComponent` (already done in the index quick-bar event handler)

---

## 8. Social share buttons

**Index card (index.astro):**
- Facebook and X links are built from `card.href` and `card.tweetText` automatically by the card template — no extra code needed
- `tweetText` should be 200 characters or less

**Detail page (.astro `<script>` block):**
- `tweetText` is a const at the top of the IIFE — set it to the same value as the index card
- `fbUrl` and `twUrl` are constructed from `PAGE_URL` + `tweetText` — no other changes needed
- Copy link works off `PAGE_URL` with no changes

---

## 9. Avoid reintroducing "Open in my email"

The `mailto:` flow was intentionally removed from detail pages. Do not add:
- A `buildMailtoBody()` function
- A `mailtoBtn` element or event listener
- Any `window.location.href = 'mailto:...'` call in the detail page script

The index quick-bar retains an "Email" button for quick-share convenience — that is the only acceptable `mailto:` path and it lives in `index.astro`, not in detail pages.

---

## 10. Images — deferred by default

Do not add `<img>` tags to `body_html` unless the user explicitly requests it.

Reasons: email clients block remote images by default, some strip them entirely, and hosted image URLs must be on `https://media.skovgard2026.org` with confirmed CDN availability before use.

The meme PNG in `static/images/share/` is for the social section of the detail page and the index card only — it is not embedded in the email.

---

## 11. Local testing

Start both servers in separate terminals:

```bash
# Terminal 1 — Astro site
npm run dev          # http://localhost:4321

# Terminal 2 — Worker API
cd worker
npx wrangler dev     # http://localhost:8787
```

**Preview iframe:** The detail page fetches `/api/share/preview` as a relative path. On the Astro dev server (port 4321) this does not proxy to the Worker (port 8787) — the iframe will remain blank locally. This is expected and intentional. To confirm preview rendering, deploy to the Cloudflare preview environment or deploy to production.

**Send flow:** POST `/api/share` requires `SHARE_ENABLED=1`. In the default wrangler.toml `[vars]` block, `SHARE_ENABLED = "0"`. To test sends locally, either temporarily set `SHARE_ENABLED = "1"` in the shared `[vars]` block or pass `--var SHARE_ENABLED:1` to `wrangler dev`. Revert before committing.

**Audit log:** Check `share_sends` locally with:
```bash
npx wrangler d1 execute ballot_sources --command "SELECT * FROM share_sends ORDER BY created_at DESC LIMIT 10;"
```

---

## 12. Production checklist

1. Run `npm run build` locally — confirm no Astro build errors
2. Check that `SHARE_MESSAGES['new-topic']` exists and `subject()` / `intro()` return expected strings
3. Test GET `/api/share/preview?slug=new-topic` from the deployed Worker before announcing the page
4. Confirm `share_sends` rows are written after a real send:
   ```bash
   npx wrangler d1 execute ballot_sources --remote --env production \
     --command "SELECT * FROM share_sends WHERE message_slug='new-topic' ORDER BY created_at DESC LIMIT 5;"
   ```
5. Deploy with `./scripts/deploy_cf.sh` (Astro Pages) and `./scripts/deploy_worker.sh` (Worker) — both must run

---

## 13. Naming conventions

- Slug: lowercase kebab-case, no underscores, no uppercase (`new-topic` not `New_Topic`)
- Astro file: `src/pages/share/<slug>.astro` — first line must be `// src/pages/share/<slug>.astro`
- Body HTML constant: `SCREAMING_SNAKE_CASE` matching the slug (`NEW_TOPIC_BODY_HTML`)
- Meme image: `static/images/share/meme-<slug>.png`
- No new D1 migrations unless new tables or columns are explicitly requested
