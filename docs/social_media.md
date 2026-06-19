# Social Media Sharing — Requirements and Implementation Guide

Covers Open Graph tags, Twitter/X cards, share pages, meme images, and
per-domain setup for `skovgard2026.org` and `candidates.skovgard2026.org`.

---

## Domains and their sharing surfaces

| Domain | OG tags location | Default OG image | Share page flow |
|--------|-----------------|-----------------|-----------------|
| `skovgard2026.org` | `src/layouts/Base.astro` | none (each page sets its own) | `/share/<slug>` detail pages |
| `candidates.skovgard2026.org` | `Candidates/src/layouts/Base.astro` + `Candidates/src/pages/index.astro` | `https://candidates.skovgard2026.org/og-image.png` | none (voters share the Hub URL directly) |

---

## Required OG meta tags — every public page

Every page that can be linked on social media must emit all of the following
in `<head>`. Missing any one of them causes Facebook or X to fall back to
plain-text-only or no preview at all.

```html
<!-- Open Graph (Facebook, LinkedIn, iMessage, etc.) -->
<meta property="og:type"         content="website" />
<meta property="og:url"          content="https://example.com/path/" />
<meta property="og:title"        content="Page title — Site name" />
<meta property="og:description"  content="One or two sentences. No HTML." />
<meta property="og:image"        content="https://example.com/images/og-image.png" />
<meta property="og:image:width"  content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name"    content="Site name" />

<!-- Twitter / X card -->
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:title"       content="Page title — Site name" />
<meta name="twitter:description" content="One or two sentences. No HTML." />
<meta name="twitter:image"       content="https://example.com/images/og-image.png" />
```

### Rules for `og:image`

- Must be an **absolute URL** — relative paths (`/images/...`) are rejected by crawlers.
- Minimum size: **1200 × 630 px** for `summary_large_image`. Facebook will not display
  images smaller than 600 × 315 px.
- The image must be served from the **same domain as the page** or from a CDN that
  does not block external image crawlers. `media.skovgard2026.org` is acceptable.
- Preferred format: JPG or PNG. GIF and WebP have inconsistent crawler support.
- Facebook caches OG images aggressively — see the Cache section below.

---

## Main site: `skovgard2026.org`

### Layout-level defaults — `src/layouts/Base.astro`

`Base.astro` accepts an `ogImage` prop. Each page that needs a distinct social
preview passes its own image path. Pages that omit `ogImage` inherit the layout
default (currently no image — add one if the main landing page becomes a
social share target).

```astro
<Base
  title="Page Title"
  description="One sentence about this page."
  ogImage="/images/share/meme-candidate-hub.png"
>
```

The layout constructs absolute OG URLs by prepending `https://skovgard2026.org`.

### Share pages — `src/pages/share/<slug>.astro`

Each share page sets:
- `ogImage` prop pointing to `static/images/share/meme-<slug>.png`
- `title` and `description` matching the message

#### Meme image spec and location

| Field | Value |
|-------|-------|
| Directory | `static/images/share/` (served at `/images/share/`) |
| Naming | `meme-<slug>.png` — must match the slug exactly |
| Preferred size | 1200 × 630 px (16:9) |
| Format | PNG or JPG |
| Background | Include a visible background — crawlers show a white fallback if the image is transparent |

Current meme images:
- `meme-candidate-hub.png`
- `meme-changing-health-care.png`
- `meme-citizens-defend-the-constitution.png`
- `meme-fleecing-letters.png`
- `meme-freedom-vs-control.png`
- `meme-jimmys-story.png`
- `meme-nothing-burger.png` / `meme-nothing-burger-fb.png`
- `meme-postage-bandit.png`
- `meme-representatives-work-for.png`
- `meme-untrammeled-suffrage.png`
- `meme-wy-citizen-ballot.png`
- `meme-wy-data-centers.png`
- `meme-wy-four-pillars.png`
- `meme-wy-primary-election-participation.png`
- `meme-wy-roadless-areas.png` / `meme-wy-roadless-areas-fb.png`
- `meme-wyoming-voters-choose.png`

Some slugs have a `-fb.png` variant (Facebook-optimised crop). When both exist,
the `.astro` page uses the standard version; the `-fb` variant is for direct
posting and is referenced in the index card's `emailBody` or social copy as needed.

### Share social buttons — detail pages

Each `src/pages/share/<slug>.astro` includes three social buttons wired in
the page `<script>`:

```js
const PAGE_URL = 'https://skovgard2026.org/share/<slug>';
const tweetText = 'Max ~200 chars for X. No hashtag stuffing.';

// Facebook sharer (uses og:image from the page head automatically)
const fbUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(PAGE_URL);

// X / Twitter intent
const twUrl = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(PAGE_URL)
            + '&text=' + encodeURIComponent(tweetText);
```

The Facebook sharer reads `og:image` from the linked page's head — **it does not
accept an image parameter**. The image must be set in the page's OG tags.

### Share index card — `src/pages/share/index.astro`

Each card in the `cards` array requires:

```js
{
  slug:         'my-slug',
  href:         '/share/my-slug',
  label:        'Category label',
  title:        'Card title',
  teaser:       'One or two sentences shown under the title on the index.',
  meme:         '/images/share/meme-my-slug.png',   // shown as card image
  memeAlt:      'Descriptive alt text for screen readers',
  memeBg:       '#2b2b2b',                          // fallback while image loads
  tweetText:    'Max ~200 chars.',
  emailSubject: 'Subject line for the quick mailto button on the index card',
  emailBody:    '...',                              // plain-text for mailto
}
```

---

## Candidates site: `candidates.skovgard2026.org`

### Layout defaults — `Candidates/src/layouts/Base.astro`

The Base layout accepts an `ogImage` prop (defaults to the site-wide
`og-image.png`). Any page that wants a custom preview passes its own.

```astro
const {
  title       = 'Wyoming 2026 Voter Guide',
  description = 'Wyoming 2026 primary voter guide...',
  currentPath = '',
  ogImage     = 'https://candidates.skovgard2026.org/og-image.png',
} = Astro.props;
```

The layout also derives `canonicalUrl` from `currentPath` and uses it for
`og:url`. Pass `currentPath={Astro.url.pathname}` from each page.

### Index page — `Candidates/src/pages/index.astro`

The index page has its **own inline `<head>`** and does not use Base.astro.
OG tags must be kept in sync in both files when the image or description changes.

### Site-wide OG image

File: `Candidates/public/og-image.png`  
Public URL: `https://candidates.skovgard2026.org/og-image.png`  
Current image: the Vote meme (Votea.png, updated June 19, 2026).

To replace: overwrite `Candidates/public/og-image.png` and deploy.
**Also update the inline tags in `index.astro`** — they hard-code the URL.

---

## Adding a new share page

Follow the full checklist in `docs/share/AddShareMessage.md`. Social-specific
steps:

1. Add `meme-<slug>.png` to `static/images/share/` (1200 × 630 px recommended).
2. Set `ogImage="/images/share/meme-<slug>.png"` in the `<Base>` props of the
   detail page.
3. Set `const PAGE_URL = 'https://skovgard2026.org/share/<slug>'` in the
   page `<script>`.
4. Set `tweetText` (≤ 200 chars) in the same script block.
5. Add the card to `src/pages/share/index.astro` with `meme`, `tweetText`, and
   `emailBody` filled in.
6. After deploying, run the URL through the Facebook Sharing Debugger (see below)
   to confirm the image resolves before announcing the page.

---

## Facebook OG cache — how to force a refresh

Facebook caches OG data (title, description, image) per URL. When you update
a page's OG image or description, existing cached previews are stale.

**To force a rescrape:**

1. Go to [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug/)
2. Paste the full URL (e.g. `https://candidates.skovgard2026.org/`)
3. Click **"Scrape Again"** — Meta re-fetches the page and clears the cache.
4. Confirm the correct image appears in the preview panel before re-sharing.

This is required any time:
- An OG image is replaced (same filename, new content)
- The `og:title` or `og:description` is changed
- A new share page is published for the first time

---

## X / Twitter card notes

- Use `summary_large_image` for all share pages and any page with a meme.
- Use `summary` only for bare text pages (Terms, Finance disclosures, etc.).
- X cards are validated at [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
  (login required). Cache TTL on X is shorter than Facebook — usually picks up
  changes within a few minutes of deploy.
- `twitter:image` must be an absolute URL.
- X does not support `og:image:width` / `og:image:height` — those are for
  Facebook only and are safe to include alongside Twitter tags.

---

## Checklist — before announcing any new page on social

- [ ] `og:title`, `og:description`, `og:image` (absolute URL) present in `<head>`
- [ ] `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` present
- [ ] OG image is at least 1200 × 630 px and accessible without auth
- [ ] Facebook Sharing Debugger returns the correct image and title
- [ ] Facebook and X share buttons on the page link to the correct `PAGE_URL`
- [ ] `tweetText` is ≤ 200 chars
- [ ] Meme image committed to `static/images/share/meme-<slug>.png`
- [ ] Index card in `src/pages/share/index.astro` updated (for share pages)
