-- Candidates/db/migrations/0015_guide_questionnaire.sql
-- Token-based candidate questionnaire system.
-- Each candidate receives a unique URL. No account required — token is the credential.

CREATE TABLE IF NOT EXISTS guide_questionnaire_tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id  INTEGER NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  token         TEXT    NOT NULL UNIQUE,       -- 32-char random hex, used in URL path
  sent_at       TEXT,                          -- ISO-8601 when notification email was sent
  expires_at    TEXT    NOT NULL DEFAULT '2026-08-18T23:59:59Z',  -- primary day hard deadline
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_tokens_token
  ON guide_questionnaire_tokens(token);

-- One row per question per candidate submission.
-- Candidates can update responses by resubmitting — latest row per question_key wins.
CREATE TABLE IF NOT EXISTS guide_questionnaire_responses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id      INTEGER NOT NULL REFERENCES guide_questionnaire_tokens(id) ON DELETE CASCADE,
  candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_key  TEXT    NOT NULL,  -- e.g. 'constitutional_position', 'top_wyoming_issue'
  response_text TEXT    NOT NULL,
  submitted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_qresponses_candidate
  ON guide_questionnaire_responses(candidate_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_guide_qresponses_candidate_question
  ON guide_questionnaire_responses(candidate_id, question_key);
