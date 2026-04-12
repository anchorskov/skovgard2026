# Skovgard 2026 — Locked Brand Spec

Last updated: 2026-04-12
Theme codename: `theme-frontier`
Status: Locked decisions. Do not deviate without brand keeper approval.

---

## Identity

- **Campaign:** Jimmy Skovgard for U.S. Senate 2026
- **State:** Wyoming
- **Party:** Republican
- **Positioning:** Frontier, grounded, durable. Wyoming-first, not consultant-polished.
- **Emotional target:** Steady, capable, plain-spoken, neighborly, battle-tested.
- **Site metaphor:** A weathered fence line under big sky. Practical materials, clear contrast, room to breathe.
- **Tagline direction:** "Who Actually Shows Up." / "Straight talk. Wyoming first."

---

## Palette (final — theme-frontier)

These are the locked production colors. No other colors may be introduced
without brand keeper approval.

| Token      | Hex       | CSS Variable             | Role |
|------------|-----------|--------------------------|------|
| charcoal   | `#2B2B2B` | `--color-wy-charcoal`    | Primary dark anchor for headings, nav/footer backgrounds, overlays |
| ember      | `#B22234` | `--color-wy-ember`       | Primary warm accent for CTAs, active links, hero emphasis, borders |
| ember-dark | `#8B1A26` | `--color-wy-ember-dark`  | Hover and pressed state for ember actions |
| sandstone  | `#C68A4A` | `--color-wy-sandstone`   | Secondary warm accent for kicker labels, subheads, stripes |
| sage       | `#7A8A6B` | `--color-wy-sage`        | Quiet secondary for rails, low-priority chrome, muted fills |
| bone       | `#F1ECE1` | `--color-wy-bone`        | Dominant page background |
| rust       | `#8A3D23` | `--color-wy-rust`        | Deep warm accent for tags, underlines, long-form accents |
| dust       | `#B7A88A` | `--color-wy-dust`        | Card borders, dividers, subtle structure |

### Legacy alias rules

The repo keeps old `wy-*` token names so existing markup keeps working.
These are intentional aliases, not mistakes.

| Legacy token      | Actual frontier meaning |
|-------------------|-------------------------|
| `--color-wy-navy` | `charcoal`              |
| `--color-wy-gold` | `sandstone`             |
| `--color-wy-stone`| `bone`                  |
| `--color-wy-sky`  | `sage`                  |

Do not "correct" those legacy names back to literal navy, gold, stone, or sky
without an explicit redesign request. On this branch, the frontier values are
the source of truth.

### Color discipline

- **50-60%** bone (background, whitespace, page mass)
- **20-25%** charcoal (structure, headings, overlays, nav/footer)
- **10-15%** ember (CTAs, accent words, active states, key borders)
- **5-10%** sandstone + rust (secondary warmth)
- **5% or less** sage + dust (quiet support colors)

### Hard constraints

- `bone` should dominate the page. Do not replace it with pure white.
- `charcoal` is the primary structural dark. Do not swap it back to blue.
- `ember` is the main accent on this branch. It is not limited to CTA-only use,
  but it should still read as accent, not page-mass background.
- `sage` is quiet. Do not use it for primary hero text or primary CTAs.
- `sandstone` is the secondary warm accent, not the lead CTA color.
- Do not add a separate "civic" blue/copper/sky-tint palette on this branch.
- Do NOT use the Wyoming Bucking Horse trademark in campaign materials.
- No glows, neon treatments, or polished corporate gradients.

---

## Typography (final)

| Role       | Family         | Weight         | Fallback stack |
|------------|----------------|----------------|----------------|
| Headlines  | Bitter         | 600 / 700 / 800| Merriweather, Georgia, serif |
| Body / UI  | Source Sans 3  | 400 / 500 / 600 / 700 | Inter, system-ui, sans-serif |

### Hard constraints

- Keep the primary font order as implemented in `src/layouts/Base.astro`.
- Do not swap Bitter out for Merriweather on this branch.
- Do not swap Source Sans 3 out for Inter on this branch.
- Headline letter-spacing stays slightly condensed at `-0.01em`.
- All-caps is reserved for short UI labels, kicker text, and small button copy.
- Do not introduce distressed display fonts, script fonts, or novelty Western fonts.

---

## Tone and posture

- Stronger and more rugged than the abandoned civic direction
- Still neighborly, still plain-spoken, still Wyoming-first
- Direct without becoming theatrical
- Patriotic without looking like merch-table flag graphics
- Assertive without sounding online-angry

---

## What this brand is NOT

- Not the calmer `theme-civic` palette from earlier exploration
- Not a corporate navy-and-cream consultant site
- Not cowboy costume or Western parody
- Not grayscale minimalist tech branding
- Not flag-merch kitsch or red-white-blue overload
- Not polished DC donor-deck aesthetics

---

## Current implementation note

The frontier theme is already implemented on this branch in:

- `src/styles/global.css`
- `src/layouts/Base.astro`
- `src/components/Nav.astro`
- `src/components/Footer.astro`
- `src/pages/index.astro`

Those files are the reference implementation. The purpose of `brand/` is to
keep future AI work aligned across web, email, video, print, and social.

If another branch, prompt, or old note mentions `theme-civic`, treat it as
historical exploration only. The locked direction for campaign media is
`theme-frontier`.

---

## Production checklist (remaining assets)

These items should match the frontier system when created or revised:

- [ ] Favicon (`.ico` + `.svg` + `apple-touch-icon.png`)
- [ ] OG social share image (`og-image.png`, 1200x630)
- [ ] Email header and CTA module matching the frontier palette
- [ ] Social quote-card template
- [ ] Event poster / handbill template
- [ ] Yard sign lockup
- [ ] Video lower-third template
- [ ] Video end card template
- [ ] Rapid-response statement graphic template
- [ ] Print one-pager / palm card template
- [ ] Admin/internal separation policy review
