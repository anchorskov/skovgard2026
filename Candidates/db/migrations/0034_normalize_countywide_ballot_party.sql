-- Normalize county-level offices that are NOT split into separate party rows.
-- These offices hold partisan candidates, so 'NP' (nonpartisan) is incorrect.
-- Blank ballot_party is the established convention for a single office row
-- representing candidates from more than one primary ballot party — all 86
-- federal/statewide/wy_senate/wy_house rows already use it.
--
-- 'NP' and blank are NOT interchangeable:
--   'NP'  = a genuinely nonpartisan race (correct on the city/municipal rows)
--   blank = this office row is not split by party
-- Only the second meaning applies to the rows below.
--
-- MATCHED BY PREDICATE, NEVER BY OFFICE ID. Office ids are not portable
-- between the local miniflare database and the production `wy` database.
-- Verified 2026-08-19: local ids 571-577 (Natrona countywide offices) are
-- Laramie *precinct committee* rows in production, where these same Natrona
-- offices are ids 630-636. An id-based UPDATE would have blanked ballot_party
-- on 7 Laramie Republican/Democratic precinct committeeman/committeewoman
-- rows — offices where party is intrinsic to the office identity, not a
-- primary label. Sweetwater (836-843) and Teton (861-868) happened to align
-- in both databases, so an id-based apply would have corrupted 7 rows while
-- correctly updating 16, which is the failure mode a spot check misses.
--
-- Idempotent: once ballot_party is '', re-running matches nothing.
-- Self-limiting: a row must be BOTH nonpartisan-marked AND in an affected
-- county AND of the named scope_kind. Municipal/city NP rows are genuinely
-- nonpartisan and are excluded by scope_kind.

UPDATE offices
   SET ballot_party = ''
 WHERE ballot_party = 'NP'
   AND scope_kind = 'countywide'
   AND county IN ('Natrona', 'Sweetwater', 'Teton');

-- Seventh Judicial District Attorney (Natrona): the same defect under a
-- different scope_kind, so the clause above does not reach it. District
-- Attorney is a partisan office in Wyoming and this row's candidate is REP.
-- Local id 578, production id 637 — again matched by predicate, not id.
UPDATE offices
   SET ballot_party = ''
 WHERE ballot_party = 'NP'
   AND scope_kind = 'judicial_district'
   AND county = 'Natrona';
