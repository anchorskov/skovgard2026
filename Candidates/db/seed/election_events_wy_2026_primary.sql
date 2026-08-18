-- Candidates/db/seed/election_events_wy_2026_primary.sql
--
-- Deliberately seeds only the wy-2026-primary election_events row. The
-- 2024 reference/test data used during development (tests/fixtures/elections/)
-- was never applied here and is intentionally not part of this file --
-- it was useful for validating the schema and ingestion pipeline against
-- real data before any 2026 results existed, but has no purpose in
-- production and would only be a distraction next to real 2026 races.
--
-- Without this row, race/[id].astro's and races/index.astro's results
-- queries correctly find nothing (graceful, no error), but the
-- results-status banners on index.astro and races/index.astro lose their
-- specific poll-close timestamp, degrading to a vaguer message. This row
-- is what those banners' `polls_close_at` value comes from.

INSERT OR IGNORE INTO election_events
  (election_key, election_name, election_phase, election_date, polls_close_at)
VALUES
  ('wy-2026-primary', 'Wyoming Primary Election', 'primary', '2026-08-18', '2026-08-18T19:00:00-06:00');
