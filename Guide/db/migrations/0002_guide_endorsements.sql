-- Candidates/db/migrations/0013_guide_endorsements.sql
-- One row per candidate: tracks research phase, endorsement status, and notification history.

CREATE TABLE IF NOT EXISTS guide_endorsements (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id            INTEGER NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,

  -- Phase status
  status                  TEXT    NOT NULL DEFAULT 'research'
                            CHECK (status IN ('research','under_review','endorsed','not_endorsed','no_recommendation')),

  -- Scoring summary (calculated from guide_rubric_scores, cached here)
  final_score             INTEGER,  -- sum of (score * weight) for scored categories
  max_possible            INTEGER,  -- sum of (5 * weight) for scored categories only
  evidence_confidence     TEXT      CHECK (evidence_confidence IN ('High','Medium','Low')),

  -- Endorsement fields
  endorsement_reasoning   TEXT,     -- Jimmy's public explanation
  endorsed_at             TEXT,     -- ISO-8601 when endorsement published
  not_endorsed_reasoning  TEXT,     -- used when status = 'not_endorsed'

  -- Candidate notification tracking
  notified_at             TEXT,     -- when draft was emailed to candidate
  questionnaire_deadline  TEXT,     -- ISO-8601 deadline for candidate response (priority window)
  candidate_response_status TEXT DEFAULT 'pending'
    CHECK (candidate_response_status IN ('pending','responded','declined','no_response')),
  candidate_responded_at  TEXT,

  -- Publication
  published_at            TEXT,     -- when profile went live

  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_endorsements_status
  ON guide_endorsements(status);
