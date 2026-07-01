-- Migration 0017: Guide reference evidence tables
-- Applies to WY_DB (wy). Shared between Candidates and Guide projects.
--
-- Stores reusable source records, legislation items, reference sets, candidate
-- network links, and per-candidate rubric evidence — all staged as draft until
-- officially verified before any voter-facing publication.
--
-- ballot_visible on guide_rubric_evidence_links controls voter exposure:
--   0 = admin scoring only (default)
--   1 = surfaced in the voter ballot survey as "Key votes & positions"

CREATE TABLE IF NOT EXISTS guide_reference_sources (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key           TEXT    NOT NULL UNIQUE,
  source_name          TEXT    NOT NULL,
  source_type          TEXT    NOT NULL
    CHECK (source_type IN ('official','advocacy','campaign','news','government','internal_reference','other')),
  source_url           TEXT,
  publisher            TEXT,
  publication_date     TEXT,
  accessed_at          TEXT,
  summary              TEXT,
  verification_status  TEXT    NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft','needs_official_verification','verified','do_not_publish')),
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guide_legislation_items (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_id                      TEXT    NOT NULL UNIQUE,   -- e.g. HB004, CORE-2026, DONOR-BWAR-2026
  session_year                INTEGER NOT NULL DEFAULT 2026,
  chamber_id                  TEXT    NOT NULL,
  item_type                   TEXT    NOT NULL DEFAULT 'bill'
    CHECK (item_type IN ('bill','amendment','resolution','other')),
  official_url                TEXT,
  topic                       TEXT,                      -- internal category: healthcare, education, etc.
  topic_display               TEXT,                      -- short voter-facing label, e.g. "Healthcare Access"
  source_framing              TEXT,                      -- Better Wyoming or advocacy framing
  source_reported_status      TEXT,                      -- status as reported by source
  official_status             TEXT,                      -- verified final legislative status
  official_status_verified_at TEXT,
  verification_status         TEXT    NOT NULL DEFAULT 'needs_official_verification'
    CHECK (verification_status IN ('draft','needs_official_verification','verified','do_not_publish')),
  notes                       TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guide_reference_sets (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  set_key              TEXT    NOT NULL UNIQUE,
  set_name             TEXT    NOT NULL,
  description          TEXT,
  source_key           TEXT    REFERENCES guide_reference_sources(source_key) ON DELETE SET NULL,
  verification_status  TEXT    NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft','needs_official_verification','verified','do_not_publish')),
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guide_reference_set_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  set_key     TEXT    NOT NULL REFERENCES guide_reference_sets(set_key) ON DELETE CASCADE,
  ref_id      TEXT    NOT NULL REFERENCES guide_legislation_items(ref_id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (set_key, ref_id)
);

-- Candidate network references: tracks caucus membership, donor-network notes, accountability
-- report links. Rows may exist before a candidate is matched to candidates.id.
CREATE TABLE IF NOT EXISTS guide_candidate_reference_links (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id         INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_slug       TEXT,
  candidate_name       TEXT    NOT NULL,
  office_level         TEXT,
  district             INTEGER,
  community            TEXT,
  reference_key        TEXT    NOT NULL,
  reference_kind       TEXT    NOT NULL
    CHECK (reference_kind IN ('source','reference_set','legislation','candidate_network','verification_flag')),
  claim_summary        TEXT,
  source_url           TEXT,
  verification_status  TEXT    NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft','needs_candidate_match','needs_official_verification','verified','do_not_publish')),
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_name, reference_key, reference_kind)
);

-- Per-candidate, per-rubric-category evidence links.
-- ballot_visible = 1 allows this evidence to appear in the voter ballot survey.
-- Keep ballot_visible = 0 (default) until the evidence is verified and approved for voters.
CREATE TABLE IF NOT EXISTS guide_rubric_evidence_links (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id         INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  category_key         TEXT    NOT NULL,
  reference_kind       TEXT    NOT NULL
    CHECK (reference_kind IN ('source','reference_set','legislation','candidate_network','guide_source')),
  reference_key        TEXT    NOT NULL,
  claim_summary        TEXT,
  evidence_weight      INTEGER NOT NULL DEFAULT 3 CHECK (evidence_weight BETWEEN 0 AND 5),
  ballot_visible       INTEGER NOT NULL DEFAULT 0 CHECK (ballot_visible IN (0,1)),
  display_publicly     INTEGER NOT NULL DEFAULT 1 CHECK (display_publicly IN (0,1)),
  verification_status  TEXT    NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft','needs_official_verification','verified','do_not_publish')),
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id, category_key, reference_kind, reference_key)
);

CREATE INDEX IF NOT EXISTS idx_guide_reference_sources_key
  ON guide_reference_sources(source_key);

CREATE INDEX IF NOT EXISTS idx_guide_legislation_topic
  ON guide_legislation_items(topic);

CREATE INDEX IF NOT EXISTS idx_guide_reference_set_items_set
  ON guide_reference_set_items(set_key, sort_order);

CREATE INDEX IF NOT EXISTS idx_guide_candidate_reference_links_candidate
  ON guide_candidate_reference_links(candidate_id);

CREATE INDEX IF NOT EXISTS idx_guide_candidate_reference_links_name
  ON guide_candidate_reference_links(candidate_name);

CREATE INDEX IF NOT EXISTS idx_guide_rubric_evidence_links_candidate
  ON guide_rubric_evidence_links(candidate_id, category_key);

CREATE INDEX IF NOT EXISTS idx_guide_rubric_evidence_links_reference
  ON guide_rubric_evidence_links(reference_kind, reference_key);

-- Voter-ballot-facing evidence: fast query for ballot page to fetch visible evidence
CREATE INDEX IF NOT EXISTS idx_guide_rubric_evidence_ballot_visible
  ON guide_rubric_evidence_links(candidate_id, ballot_visible)
  WHERE ballot_visible = 1;
