-- Candidates/db/migrations/0024_multi_seat_race_sources_selection_limit_fields.sql
--
-- Adds the §10 fields from multi_selection.md that multi_seat_race_sources
-- (0019) doesn't already have. This table already covers most of the §10
-- frozen CSV contract under existing names — no new table, per §11's caution
-- against restructuring:
--
--   §10 field              | existing column (0019)
--   county/election_phase/  | same name
--     party/jurisdiction_type/office_name/district_or_scope/term/
--     seats_open/max_selections/source_url/source_type/notes
--   ballot_instruction      | ui_instruction (already 353/367 populated —
--                             reused as-is, not renamed, to avoid a data
--                             migration for an established column)
--   verification_status     | source_status (reused as-is; source_status has
--                             a richer set of values than the spec's simple
--                             verified/not gate — the importer (Step E) will
--                             treat exactly 'verified' as the gate, same as
--                             §10 requires, without needing a schema change)
--   municipality            | city_or_town (reused as-is)
--
-- Actually missing, added here: ward, board_size, verified_date,
-- source_page_or_section.
--
-- offices.seats_available remains the only field the client reads (race/[id]
-- .astro's data-seats-available). This migration does not touch offices —
-- Step E's importer will keep writing the resolved limit into
-- offices.seats_available on a confirmed match, same target column
-- scripts/match_multi_seat_race_sources.py already writes today.

ALTER TABLE multi_seat_race_sources ADD COLUMN ward                    TEXT;
ALTER TABLE multi_seat_race_sources ADD COLUMN board_size              INTEGER;
ALTER TABLE multi_seat_race_sources ADD COLUMN verified_date           TEXT;
ALTER TABLE multi_seat_race_sources ADD COLUMN source_page_or_section  TEXT;
