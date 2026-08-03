-- offices_ward_scope_kind_fix_2026-08-02.sql
-- Ward-specific council seats in Gillette and Rawlins were tagged
-- scope_kind='municipal' instead of 'municipal_ward'. Every other ward city
-- (Casper, Cheyenne, Evanston, Green River, Laramie, Rock Springs, Worland)
-- uses 'municipal_ward', which the ballot-lookup API gates by the voter's
-- resolved ward. The mistagged rows fell into the unfiltered catch-all
-- branch instead, so every voter in these cities saw all ward seats as
-- theirs regardless of address. At-large seats (e.g. Rawlins At-Large) are
-- intentionally left as scope_kind='municipal' — they are citywide by
-- design and should keep showing to every voter.

UPDATE offices SET scope_kind = 'municipal_ward'
WHERE id IN (1026, 1027, 1028, 1211, 1212, 1213);
-- 1026/1027/1028: Gillette City Council Ward 1/2/3
-- 1211/1212/1213: Rawlins Ward 1/2/3 Council Member
