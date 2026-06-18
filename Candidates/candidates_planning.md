# Candidates Voter Guide — Planning

## Project Goal
Wyoming Republican Primary voter guide — election date August 18, 2026.
~97% of Republican primary winners win the general election, making this the de facto election in Wyoming.

## Tech Stack
- Astro 6 + Cloudflare Pages (SSR) + D1 + Tailwind CSS v4
- Local D1: `wy_preview` (`de78cb41-176d-40e8-bd3b-e053e347ac3f`)
- Production D1: `wy` (`4b4227f1-bf30-4fcf-8a08-6967b536a5ab`)

## Data Sources
- **US Census Geocoder API** — free, no key needed; used for address → precinct lookup
- **Google Civic Information API** — polling place data; key in `.dev.vars` (`GOOGLE_CIVIC_API_KEY`)
- **Wyoming SOS 2026 candidate roster** — seed CSV (`db/seed/`)

## Address Lookup — 4-Tier Fallback
1. Census Geocoder
2. Voter file exact address match
3. Voter file nearest address on same street
4. Manual county selector

## Office Level Hierarchy
`federal > statewide state > wy_senate > wy_house > county > city > precinct`

## Candidate Profile Fields
`photo_url, summary, bio_full, occupation, education, hometown, years_in_wyoming,
website_url, email, phone, facebook_url, twitter_url, instagram_url, youtube_url,
endorsements_json, campaign_finance_url, intro_video_url` (3–5 min .mp4)

## Phase Checklist
- [ ] Schema migrations (`db/migrations/0001_candidates_schema.sql`)
- [ ] API lib helpers (`src/lib/`)
- [ ] API routes (`src/pages/api/`)
- [ ] Public UI
- [ ] Admin UI (`src/pages/admin/`)
- [ ] Seed data from SOS roster (`db/seed/`)
- [ ] Local verification
- [ ] Deploy

## Open Items
- [ ] Confirm production domain (`candidates.skovgard2026.org` assumed in wrangler.toml)
- [ ] Video hosting decision — CF R2 vs external URL
- [ ] Cloudflare Access policy on `/admin/*` path
- [ ] Set `GOOGLE_CIVIC_API_KEY` production secret via `wrangler pages secret put`
