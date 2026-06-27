# Channel Rules — Skovgard 2026

Last updated: 2026-06-27

---

The frontier system applies across campaign media. The palette, typography, and
voice stay consistent. What changes by channel is intensity, scale, and how
prominent the ember accent becomes.

---

## Website (`skovgard2026.org`)

- **Tone:** Grounded, sturdy, readable, Wyoming-first
- **Palette:** Bone dominant, charcoal structural, ember as primary accent
- **Links:** Ember or sandstone for emphasis, charcoal for structural text
- **Typography:** Bitter headlines, Source Sans 3 body
- **Motion:** Minimal. Hover transitions only.
- **Do not:** Reintroduce the civic navy/copper palette on this branch

## Email templates

- **Tone:** Direct, respectful, brief
- **Layout:** Single column, max width 600px
- **Background:** Bone or white with charcoal text and one ember CTA
- **Accent use:** Sandstone dividers or subheads are acceptable
- **Subject lines:** Plain and concrete, not clickbait

## Social media graphics

- **Tone:** Brief, human, a little sharper than the website
- **Palette:** Ember can be more prominent here than on the website
- **Templates:** Quote cards, event promos, endorsements, short issue statements
- **Typography:** Bitter for the main quote or headline, Source Sans 3 for details
- **Do not:** Use meme formats, reactive rage graphics, or all-caps attack posts

### Open Graph / share card images (`og:image`)

Every share page at `/share/<slug>` uses an OG image that Facebook, X, and iMessage
pull when the URL is pasted. Sizing errors here cause the image to be cropped,
letterboxed, or rejected entirely.

**Required dimensions: 1200 × 630 px (1.91:1 ratio)**

| Platform | Displays at | Notes |
|---|---|---|
| Facebook feed | ~470 × 246 | Crops to 1.91:1 — a square or portrait image will be letterboxed |
| Facebook messenger | ~280 × 150 | Same crop |
| X (Twitter) `summary_large_image` | 600 × 314 min | Crops to 2:1 if taller than wide |
| iMessage link preview | ~300 × 157 | Crops to roughly 1.91:1 |
| LinkedIn | 1200 × 627 | Accepts 1.91:1 natively |

**Rules:**
- **Always export at 1200 × 630 px.** This is the one size that renders correctly on all platforms without cropping.
- **Landscape only.** Never use a square (1:1) or portrait image as an `og:image` — Facebook will letterbox it with white bars and the text will be unreadable at preview size.
- **File size under 1 MB.** Facebook will not fetch images over 8 MB, and large files slow the scrape. Export as PNG only if transparency is needed; otherwise use JPEG at 85% quality.
- **File location:** `static/images/share/meme-<slug>.png` (or `.jpg`). The filename must match the `ogImage` prop passed to `<Base>` on the share page.
- **After updating an image:** force Facebook to re-scrape at `developers.facebook.com/tools/debug/` — paste the share URL, click Debug, then click **Scrape Again**. Do this twice if the old image persists.

**Checking the current image dimensions before deploying:**
```bash
python3 -c "
from PIL import Image
img = Image.open('static/images/share/meme-<slug>.png')
print(img.size)  # should be (1200, 630)
"
```

## Event materials

- **Tone:** Bigger and bolder, still grounded
- **Palette:** Charcoal, bone, and ember can all lead depending on format
- **Yard signs:** High contrast, simple, readable at speed
- **Posters / banners:** Bitter headlines, clear office/title lockup, strong accent stripe
- **Do not:** Clutter layouts with too many supporting colors or badges

## Video (town halls, ads, social clips)

- **Lower third:** Charcoal base, bone text, ember or sandstone accent rule
- **End card:** Bone or charcoal base, clear ember CTA, simple URL treatment
- **Motion:** Minimal. Hard cuts, fades, and restrained motion graphics only.
- **Captions:** High contrast and easy to read on mobile

## Rapid-response statements

- **Tone:** Firm, controlled, factual
- **Layout:** Bone background or charcoal header bar with ember accent rule
- **Length:** Under 200 words when possible
- **Priority:** Clarity first, then style

## Admin / internal tools

- **Visual separation:** Internal tools should remain distinct from the public campaign brand
- **Allowed:** Functional blue/gray admin UI
- **Required:** Clear "ADMIN" labeling and separation from public-facing materials
