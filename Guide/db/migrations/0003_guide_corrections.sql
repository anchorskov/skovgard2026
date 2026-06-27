-- Candidates/db/migrations/0014_guide_corrections.sql
-- Public correction log: every submitted correction and its resolution.
-- Shown on the candidate profile page so voters can see the full revision history.

CREATE TABLE IF NOT EXISTS guide_public_corrections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id      INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- Who submitted
  submitted_by      TEXT    NOT NULL,  -- candidate full name or 'public'
  submitter_email   TEXT,              -- stored privately, not displayed
  submission_type   TEXT    NOT NULL CHECK (submission_type IN ('candidate','public')),
  submitted_at      TEXT    NOT NULL DEFAULT (datetime('now')),

  -- What they submitted
  category_key      TEXT,              -- rubric category key, or NULL for profile-level
  category_label    TEXT,
  original_value    TEXT,              -- the original score or text as it appeared
  submitted_value   TEXT    NOT NULL,  -- what the submitter claims it should be
  supporting_source TEXT,              -- URL or doc reference they provided

  -- Resolution
  status            TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','declined')),
  resolved_at       TEXT,
  resolved_by       TEXT    DEFAULT 'jimmy@grassrootsmvt.org',
  resolution_notes  TEXT,              -- public explanation of decision
  revised_value     TEXT,              -- final accepted value (may differ from submitted_value)

  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_corrections_candidate
  ON guide_public_corrections(candidate_id);

CREATE INDEX IF NOT EXISTS idx_guide_corrections_status
  ON guide_public_corrections(status);
