<!-- docs/share/show_shares.md -->
# Share Card Ordering

`/share` and `/share/more-shares` don't sort cards by date — there is no
`created_at` field on a card. Both pages render `cards` from
`src/components/ShareListing.astro` in **plain array order**, split only by
`FEATURED_SLUGS` membership (`archive !== FEATURED_SLUGS.has(card.slug)`).
Whoever adds a card controls where it lands purely by where they insert it
in the array. This file exists so that placement is a deliberate, tracked
decision instead of "wherever `AddShareMessage.md` said to paste it."

## The rule

**A newly added share that should be featured goes at index 0** — the top
of the `cards` array — so it's the first card on `/share`. If the
previous top card should also stay visible as recent (not bumped to
archive), leave it at index 1. This repo's working convention is to keep
the **two most recent messages** leading the featured page; older featured
cards keep their relative order below that.

Adding a card to `cards` does **not** automatically make it featured —
its slug must also be added to `FEATURED_SLUGS` in the same file (see
`docs/share/AddShareMessage.md` §5). A card can exist in `cards` without
being in `FEATURED_SLUGS` at all — it will only ever appear on
`/share/more-shares`.

## Current order (as of 2026-07-20)

### Featured (`/share`), in display order

1. `kevin-christensen-vetting` — added 2026-07-20
2. `washington-puppets` — added 2026-07-18
3. `wyoming-family-economy`
4. `one-million-messages`
5. `higher-prices-washington-debt`
6. `candidate-hub`
7. `citizens-defend-the-constitution`
8. `jimmys-story`
9. `wyoming-not-for-sale`
10. `town-hall-introduction`
11. `boulder-and-the-weeds`
12. `answer-the-questions`
13. `no-spin-just-answers`
14. `straight-answers`

### Archive (`/share/more-shares`), in display order

1. `fleecing-letters`
2. `postage-bandit`
3. `wyoming-voters-choose`
4. `representatives-work-for`
5. `wy-voter-access`
6. `freedom-or-control`
7. `wy-citizen-ballot`
8. `wy-four-pillars`
9. `wy-roadless-areas`
10. `wy-data-centers`
11. `untrammeled-suffrage`
12. `nothing-burger`
13. `changing-health-care`
14. `wy-commercial-property-tax`

## After adding a new share

1. Insert the new card object at index 0 of `cards` in
   `src/components/ShareListing.astro` (or index 1, if a card is already
   pinned above it for a specific editorial reason — note that reason here
   if so).
2. Add the slug to `FEATURED_SLUGS` if it should appear on `/share`.
3. If the previous #1 featured card should remain one of the "newest two,"
   leave it at index 1 — do not let it silently drift down as more cards
   accumulate above it. If it's ready to retire from the front page, either
   leave it further down in `cards` (stays featured, just not top-two) or
   remove its slug from `FEATURED_SLUGS` entirely (moves to archive).
4. Update the **Current order** lists above to match reality. This file is
   only useful if it's kept in sync — treat a stale list here as worse than
   no list, since it will be trusted over actually reading the array.
5. Verify with:
   ```bash
   grep -n "slug: '" src/components/ShareListing.astro
   grep -n "FEATURED_SLUGS = new Set" -A 20 src/components/ShareListing.astro
   ```
