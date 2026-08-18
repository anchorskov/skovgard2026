-- Candidates/db/migrations/0033_election_source_discoveries_unique_index.sql
--
-- Additive migration. Adds a database-enforced unique index on
-- election_source_discoveries(source_id, discovered_url) so a discovered
-- link can never be recorded twice for the same source, no matter which
-- check it came from. Application-layer code in Results/src/repository.js
-- already avoids this in the common case by looking up known URLs before
-- inserting, but that alone cannot stop two overlapping scheduled runs
-- from racing past each other and both inserting the same link. This
-- index is the actual guarantee; the application now uses INSERT OR
-- IGNORE against it.
--
-- Verified before writing this file (2026-08-18): zero duplicate
-- (source_id, discovered_url) pairs exist in either database.
--   Local:      572 election_source_discoveries rows, 0 duplicate groups.
--   Production: 0 election_source_discoveries rows, 0 duplicate groups.
-- Safe to create directly, no prior cleanup or row rewrite required.
--
-- This does not replace the existing UNIQUE(check_id, discovered_url)
-- table-level constraint from 0032. Both hold at once without conflict;
-- this one is simply the stronger guarantee for this table's actual use.

CREATE UNIQUE INDEX IF NOT EXISTS uq_election_source_discoveries_source_url
  ON election_source_discoveries(source_id, discovered_url);
