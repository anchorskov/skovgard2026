-- Canonical party display metadata and global aliases for raw source values.
-- Raw party columns remain unchanged. Blank and NULL values intentionally do
-- not receive aliases because they mean that party is not applicable.

CREATE TABLE IF NOT EXISTS parties (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  short_label TEXT,
  badge_token TEXT,
  sort_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS party_aliases (
  raw_value TEXT PRIMARY KEY,
  party_code TEXT NOT NULL REFERENCES parties(code)
);

CREATE INDEX IF NOT EXISTS idx_party_aliases_party_code
  ON party_aliases(party_code);

INSERT OR IGNORE INTO parties
  (code, label, short_label, badge_token, sort_order, is_active)
VALUES
  ('REP', 'Republican', 'R', 'r', 10, 1),
  ('DEM', 'Democratic', 'D', 'd', 20, 1),
  ('NP', 'Nonpartisan', 'NP', 'other', 30, 1);

INSERT OR IGNORE INTO party_aliases (raw_value, party_code)
VALUES
  ('REP', 'REP'),
  ('Republican', 'REP'),
  ('DEM', 'DEM'),
  ('Democratic', 'DEM'),
  ('NP', 'NP');

-- NOTE: an earlier draft of this migration ended with
--   UPDATE offices SET ballot_party = '' WHERE id = 578;
-- intended for the Seventh Judicial District Attorney (Natrona). That clause
-- was REMOVED, not moved. Office ids are not portable between the local
-- miniflare database and the production `wy` database: id 578 is that DA row
-- locally, but in production it is "Precinct 4-2 Democratic Precinct
-- Committeeman" (Laramie) — the statement would have erased a real party
-- office's party. Verified against production 2026-08-19.
--
-- 0034 now normalizes that row by predicate (scope_kind='judicial_district'
-- AND county='Natrona' AND ballot_party='NP'), which resolves correctly in
-- both databases and has already been applied to each. Nothing is needed here.
