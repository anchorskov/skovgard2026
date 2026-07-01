# My Wyoming Ballot Guide — Build Plan

*Created: 2026-07-01 · Primary: August 18, 2026 · Data lock: August 14, 2026*

---

## Cold-start instructions

If you are picking this up after a pause, read this section first.

**The product:** A voter-owned ballot guide at `grassrootsmvt.org/ballot`.
Voters take an issue quiz, the guide scores their alignment with candidates in their
districts, they record their choices, and see aggregate solidarity results.

**The concept doc:** `Candidates/docs/GuideConcept.md` — all product decisions,
fairness rules, and architecture rationale. Read it if you need the WHY.
This document is the HOW.

**Where the code lives:**
- Voter guide build target: `/home/anchor/projects/grassmvt_survey/`
- Candidate data source (read-only from guide): `Candidates/` → wy D1 database
- This plan file: `Candidates/docs/GuidePlan.md`

**Current state of the grassmvt_survey project:**
- Auth, sessions, email verification: ✅ built (migrations 0006, 0013)
- Voter registration verification: ✅ built (`user_verification`, `user.is_verified_voter`)
- Address → district mapping: ✅ built (`user_address_verification`)
- Ballot race registry: ✅ built (`ballot_surveys`, `race_candidates`)
- Voter ballot choices: ✅ built (`ballot_responses`)
- Issue questionnaire: ❌ not built
- Candidate answer submission: ❌ not built
- Voter quiz UI: ❌ not built
- Alignment scoring: ❌ not built
- My Ballot summary: ❌ not built
- Vote-splitting simulator: ❌ not built
- Magic link (passwordless) auth: ❌ not built

**The next thing to do:** Write and apply the five migrations in Phase 1 order.
Migration files go in `grassmvt_survey/db/migrations/`.

---

## Architecture in one page

```
TWO PIPELINES — ONE DATABASE (grassmvt_survey)

CANDIDATE PIPELINE (admin runs this before voters arrive)
  1. Seed guide_questions (8–12 questions, 4 issue categories)
  2. Seed ballot_surveys rows for statewide + 60 HD + 30 SD races
  3. Email candidates → they submit structured answers via token-gated form
  4. Admin reviews answers → sets reviewed = 1 → answers go live
  5. Candidate data from wy D1 (read-only) feeds comparison display

VOTER PIPELINE (the guide experience)
  Enter email → magic link → session created (is_verified_voter = 0)
      ↓ (optional: complete voter verification → is_verified_voter = 1)
  Personalized ballot (district-scoped races from ballot_surveys)
      ↓
  Voter quiz (/ballot/quiz) — answer same questions, set issue weights
      ↓
  Alignment view (/ballot/compare/[race_slug]) — computed per candidate
      ↓
  My Ballot (/ballot/summary) — choices, reasons, print/email
      ↓
  Vote-splitting simulator (/ballot/simulator/[race_slug]) — optional, Phase 3

RESULTS (public, anonymized)
  All participants aggregate    (is_verified_voter IN (0,1))
  Verified voters aggregate     (is_verified_voter = 1 only)
  Minimum 10 responses before either aggregate is shown for a race
```

**Domain split:**
- `candidates.skovgard2026.org` — race finder, candidate profiles, Jimmy's guide (unchanged)
- `grassrootsmvt.org/ballot` — voter-owned guide (this build)
- Join path: `race_candidates.wy_candidate_id` → `candidates.id` in wy D1

---

## Timeline

| Date | Milestone | What must be done |
|------|-----------|-------------------|
| Jul 10 | Functional prototype | Migrations applied, questions seeded, candidate form live, voter quiz renders |
| Jul 10 | Candidate notifications | Emails sent to all statewide + legislative candidates |
| Jul 15 | Candidate questionnaire open | Submissions accepted; admin review queue live |
| Jul 22 | Public beta | Alignment scoring live; My Ballot summary functional |
| Aug 1 | Stable guide | Vote-splitting simulator added; all known issues resolved |
| Aug 14 | Data lock | Candidate answer submissions close; auto-set `no_answer` for missing |
| Aug 18 | Primary day | Guide read-only; voter choices and summary still accessible |

---

## Phase 1 — Foundation (target: July 10)

### Migrations to write and apply

Apply in this exact order to `grassmvt_survey`. Files go in `db/migrations/`.

---

#### Migration 0037 — passwordless accounts

Make `password_hash` nullable so magic-link (email-only) users can be created
without a password. SQLite does not support `ALTER COLUMN`, so this requires
a table rebuild.

```sql
-- db/migrations/0037_passwordless_accounts.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE user_v2 (
  id                  TEXT NOT NULL PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT,                              -- NULL for magic-link accounts
  email_verified_at   TEXT,
  account_status      TEXT NOT NULL DEFAULT 'pending',
  is_verified_voter   INTEGER NOT NULL DEFAULT 0,
  verified_at         TEXT,
  verification_method TEXT,
  verified_scope      TEXT,
  verified_district   TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO user_v2
  SELECT id, email, password_hash, email_verified_at, account_status,
         is_verified_voter, verified_at, verification_method,
         verified_scope, verified_district, created_at
  FROM user;

DROP TABLE user;
ALTER TABLE user_v2 RENAME TO user;

-- Restore indexes
CREATE INDEX IF NOT EXISTS idx_user_account_status ON user (account_status);
CREATE INDEX IF NOT EXISTS idx_user_is_verified_voter ON user (is_verified_voter);

PRAGMA foreign_keys = ON;
```

---

#### Migration 0038 — magic link tokens

```sql
-- db/migrations/0038_magic_link_tokens.sql

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id              TEXT NOT NULL PRIMARY KEY,   -- UUID v4
  token_hash      TEXT NOT NULL UNIQUE,        -- SHA-256 of raw token sent in email
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at      TEXT NOT NULL,               -- ISO-8601; 1 hour from issue
  used_at         TEXT,                        -- NULL = not yet used
  request_ip_hash TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user_id
  ON magic_link_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at
  ON magic_link_tokens (expires_at);
```

---

#### Migration 0039 — guide questions

```sql
-- db/migrations/0039_guide_questions.sql

CREATE TABLE IF NOT EXISTS guide_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text   TEXT    NOT NULL,
  issue_category  TEXT    NOT NULL
    CHECK (issue_category IN (
      'economy','land_use','constitutional','health_care',
      'education','energy','local_control','other'
    )),
  applicable_to   TEXT    NOT NULL
    CHECK (applicable_to IN (
      'federal','statewide','state_house','state_senate',
      'county','city','all'
    )),
  display_order   INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guide_questions_scope
  ON guide_questions (applicable_to, active, display_order);
```

---

#### Migration 0040 — guide answers (candidate submissions)

```sql
-- db/migrations/0040_guide_answers.sql

CREATE TABLE IF NOT EXISTS guide_answers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wy_candidate_id  INTEGER NOT NULL,
  question_id      INTEGER NOT NULL REFERENCES guide_questions(id),
  position         TEXT    NOT NULL
    CHECK (position IN (
      'strongly_support','support','neutral',
      'oppose','strongly_oppose','no_answer'
    )),
  explanation      TEXT    CHECK (length(explanation) <= 500),
  source_url       TEXT,
  firmness         TEXT
    CHECK (firmness IS NULL OR firmness IN ('core','leaning','open')),
  is_top_priority  INTEGER NOT NULL DEFAULT 0 CHECK (is_top_priority IN (0,1)),
  source_kind      TEXT    NOT NULL DEFAULT 'candidate_submission'
    CHECK (source_kind IN ('candidate_submission','public_record','inferred')),
  reviewed         INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0,1)),
  submitted_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (wy_candidate_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_answers_candidate
  ON guide_answers (wy_candidate_id, reviewed);
CREATE INDEX IF NOT EXISTS idx_guide_answers_question
  ON guide_answers (question_id, reviewed);
```

---

#### Migration 0041 — voter quiz responses

```sql
-- db/migrations/0041_voter_quiz_responses.sql

CREATE TABLE IF NOT EXISTS voter_quiz_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES guide_questions(id),
  position     TEXT
    CHECK (position IS NULL OR position IN (
      'strongly_support','support','neutral','oppose','strongly_oppose'
    )),
  weight       TEXT    NOT NULL DEFAULT 'medium'
    CHECK (weight IN ('high','medium','low','skip')),
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_voter_quiz_user
  ON voter_quiz_responses (user_id);
CREATE INDEX IF NOT EXISTS idx_voter_quiz_question
  ON voter_quiz_responses (question_id);
```

---

### Seed data — Phase 1 questions

Apply after migration 0039. These are the starting question set for statewide
and legislative races. Questions are neutral, tied to public responsibilities,
and verifiable against public records or candidate statements.

```sql
-- db/seed/guide_questions_phase1.sql

INSERT INTO guide_questions (question_text, issue_category, applicable_to, display_order) VALUES

-- Economy (statewide + federal)
('Wyoming should reduce its dependence on mineral extraction revenue by diversifying the state tax base.',
 'economy', 'all', 10),

('The state legislature should be prohibited from spending more than it collects in a given fiscal year except during declared emergencies.',
 'economy', 'all', 20),

('Wyoming should prioritize reducing property taxes for owner-occupied primary residences.',
 'economy', 'statewide', 30),

-- Land & energy
('Federal management of Wyoming public lands should be reduced in favor of state or county control.',
 'land_use', 'all', 40),

('Wyoming should actively promote development of nuclear, wind, and solar energy alongside its coal and oil industries.',
 'energy', 'all', 50),

('Wyoming should oppose any federal carbon tax or cap-and-trade system that would increase costs for Wyoming energy producers.',
 'energy', 'federal', 60),

-- Constitutional & governance
('Wyoming officials should refuse to implement federal mandates that in their judgment conflict with the Wyoming Constitution.',
 'constitutional', 'all', 70),

('Changes to Wyoming constitutional rights should be placed directly before Wyoming voters rather than decided by the legislature alone.',
 'constitutional', 'statewide', 80),

-- Health care
('Wyoming should expand Medicaid eligibility to cover more low-income adults.',
 'health_care', 'statewide', 90),

('Decisions about abortion policy in Wyoming should be placed before Wyoming voters in a direct ballot measure.',
 'health_care', 'statewide', 100),

-- Education
('Wyoming should expand school choice options, including funding that follows students to approved non-public schools.',
 'education', 'statewide', 110),

('Local school boards should have final authority over curriculum decisions without legislative override.',
 'education', 'state_house', 120);
```

**Before finalizing these questions:** review each one against the fairness rule —
every candidate in the applicable office level receives the same question.
If a question only applies to contested statewide races, set `applicable_to = 'statewide'`.
If it applies to all offices, use `'all'`. House-specific questions use `'state_house'`.

---

### Seed data — ballot_surveys Phase 1 races

`ballot_surveys` needs one row per race the guide covers. The `wy_db_office_id`
value must match `offices.id` in the wy D1 (`candidates.skovgard2026.org`).

**To get the correct `wy_db_office_id` values, run against wy D1 first:**

```bash
npx --prefix Candidates wrangler d1 execute wy --remote \
  --command "SELECT id, title, level, district FROM offices ORDER BY level, sort_order LIMIT 100;"
```

Then build the INSERT statements. Pattern:

```sql
-- db/seed/ballot_surveys_phase1.sql (template — fill wy_db_office_id from wy D1 query)

-- Statewide
INSERT OR IGNORE INTO ballot_surveys
  (race_slug, title, scope_type, scope_value, wy_db_office_id, display_order)
VALUES
  ('us-senate-2026',       'U.S. Senate — Wyoming 2026',    'federal',    NULL, <id>, 10),
  ('us-house-2026',        'U.S. House — Wyoming 2026',     'federal',    NULL, <id>, 20),
  ('governor-2026',        'Governor — Wyoming 2026',       'statewide',  NULL, <id>, 30),
  ('secretary-state-2026', 'Secretary of State — WY 2026',  'statewide',  NULL, <id>, 40),
  -- ... other statewide offices

-- House districts HD01–HD60
  ('wy-house-hd01-2026', 'WY House District 1 — 2026', 'state_house', '01', <id>, 100),
  ('wy-house-hd02-2026', 'WY House District 2 — 2026', 'state_house', '02', <id>, 101),
  -- ... HD03–HD60

-- Senate districts SD01–SD30 (even-numbered only run in 2026 — verify from SOS)
  ('wy-senate-sd01-2026', 'WY Senate District 1 — 2026', 'state_senate', '01', <id>, 200),
  -- ... remaining SD districts on 2026 ballot
;
```

> **Important:** Not all 30 senate districts are on the 2026 primary ballot.
> Wyoming senators serve 4-year terms and districts are staggered.
> Confirm which SD numbers are up in 2026 against the SOS candidate list before seeding.
> The `wy` D1 `candidates` table already has the authoritative list — use that.

---

## Phase 1 — New routes and API endpoints

### Magic link auth flow

**New pages:**
- `src/pages/auth/magic-link/index.astro` — email input form
- `src/pages/auth/magic-link/sent.astro` — "check your email" confirmation
- `src/pages/auth/magic-link/verify/index.astro` — handles token in URL, creates session

**New API endpoints:**
- `POST /api/auth/magic-link` — accepts `{ email }`, creates user if new, issues token, sends email
- `GET /api/auth/magic-link/verify?token=<raw_token>` — verifies token, creates session, redirects to `/ballot`

**Flow:**
1. User submits email at `/auth/magic-link`
2. Worker: normalize email, look up or create `user` record (`is_verified_voter = 0`, `account_status = 'pending'`)
3. Generate UUID token, store `SHA-256(token)` in `magic_link_tokens`, set `expires_at = now + 1h`
4. Send email: "Click this link to access your Wyoming Ballot Guide: /api/auth/magic-link/verify?token=<raw_token>"
5. User clicks → worker verifies hash, marks `used_at`, creates `session`, sets cookie, redirects to `/ballot`
6. Redirect `/ballot` detects session → loads ballot page normally

**Reuse:** `src/server/email/resend.js` for sending. The existing `email_verification_tokens`
table is a direct pattern reference for the token schema.

---

### Voter quiz

**New page:** `src/pages/ballot/quiz/index.astro`

**New API endpoints:**
- `GET /api/ballot/guide-questions` — returns questions filtered to user's office levels
- `POST /api/ballot/submit-quiz` — upserts `voter_quiz_responses` rows

**`GET /api/ballot/guide-questions` response:**
```json
{
  "questions": [
    {
      "id": 1,
      "question_text": "Wyoming should reduce its dependence on mineral extraction revenue...",
      "issue_category": "economy",
      "applicable_to": "all"
    }
  ],
  "categories": ["economy", "land_use", "constitutional", "health_care", "education", "energy"]
}
```

Filtering logic: user's `user_address_verification` has `district` (HD) and a senate district.
Return questions where `applicable_to IN ('all', 'statewide', 'federal')` always,
plus `'state_house'` if user has HD data, `'state_senate'` if user has SD data.

**`POST /api/ballot/submit-quiz` body:**
```json
{
  "responses": [
    { "question_id": 1, "position": "support", "weight": "high" },
    { "question_id": 2, "position": "neutral", "weight": "medium" },
    { "question_id": 3, "position": null, "weight": "skip" }
  ]
}
```

Upserts into `voter_quiz_responses`. `position = null` with `weight = 'skip'`
means the voter is excluding this question from their alignment score.

**Quiz UI design (mobile-first):**
- Show questions grouped by `issue_category`
- One category visible at a time (tabbed or accordion)
- Per question: 5 position buttons (Strongly Support → Strongly Oppose) + weight selector (High / Medium / Low / Skip)
- "Save progress" syncs to DB; localStorage used as working scratch pad between saves
- Progress indicator: "3 of 6 categories answered"
- Skip entire category allowed (sets all in category to `weight = 'skip'`)

---

### Candidate submission

**New page:** `src/pages/guide/submit/index.astro` (token-gated)

**New API endpoints:**
- `POST /api/guide/submit-answer` — writes to `guide_answers`, `reviewed = 0`
- `GET /api/guide/admin/pending-answers` — admin: list unreviewed answers
- `POST /api/guide/admin/review-answer` — admin: set `reviewed = 1` or reject

**Candidate token flow:** Reuse `voter_verify_tokens` table (already exists in migration 0021).
The `target_email` field identifies the candidate; `issued_by_user_id` is the admin account.
Token expires 14 days from issue. One token per candidate.

**Candidate form shows:**
- Their name and race (read from token → `race_candidates.wy_candidate_id`)
- Only the questions applicable to their office level
- Per question: 5 position radio buttons + optional explanation textarea (≤ 500 chars) +
  optional source URL + optional firmness select + optional "top priority" checkbox
- Submit button (can be partial — submits whatever they've answered so far)
- Returns confirmation page with list of their submitted answers

---

## Phase 2 — Alignment + My Ballot (target: July 22)

### Alignment scoring engine

**New API endpoint:** `GET /api/ballot/alignment/[race_slug]`

Requires auth session. Returns per-candidate alignment for the requesting voter.

**Algorithm:**

Position numeric map:
```
strongly_support  = +2
support           = +1
neutral           =  0
oppose            = -1
strongly_oppose   = -2
no_answer         = null  (excluded)
```

Weight map: `high = 3`, `medium = 2`, `low = 1`, `skip = excluded`

Per question, per candidate:
```
distance     = |voter_value − candidate_value|      (range 0–4)
match_score  = 1 − (distance / 4)                  (range 0.0–1.0)
weighted     = match_score × voter_weight

excluded if:  voter weight = 'skip'
              OR candidate position = 'no_answer'
              OR voter position = null
```

Total alignment per candidate:
```
alignment_pct = (Σ weighted_score) / (Σ voter_weight for included questions) × 100
```

**Response shape:**
```json
{
  "race_slug": "us-senate-2026",
  "race_title": "U.S. Senate — Wyoming 2026",
  "candidates": [
    {
      "wy_candidate_id": 12,
      "candidate_name": "Jane Doe",
      "candidate_slug": "jane-doe",
      "alignment_pct": 78.3,
      "answered_count": 9,
      "no_answer_count": 3,
      "is_top_priority_flags": [1, 4],
      "breakdown": [
        {
          "question_id": 1,
          "issue_category": "economy",
          "question_text": "Wyoming should reduce its dependence...",
          "voter_position": "support",
          "voter_weight": "high",
          "candidate_position": "strongly_support",
          "match_score": 0.75,
          "weighted_score": 2.25,
          "is_top_priority": false,
          "firmness": "core",
          "explanation": "This is a core part of my economic platform.",
          "source_url": "https://janedoe.com/economy"
        }
      ]
    }
  ]
}
```

---

### Alignment comparison page

**New page:** `src/pages/ballot/compare/[race_slug]/index.astro`

Displays:
- Race title and office level
- Per candidate: name, party, alignment bar (colored by match %), answered/missing question counts
- Expandable per-question breakdown (shows voter and candidate position side by side)
- "★ Top priority" badge on questions where candidate checked is_top_priority
- "No response" tag on no_answer questions
- "Add to My Ballot" button → writes to `ballot_responses` with `chosen = 1`
- Link to vote-splitting simulator if race has 3+ candidates (Phase 3)

**Display rule:** Alignment bar is shown as a percentage with a visible fill.
Label it: "Based on your quiz answers." Never label it as a recommendation.

---

### My Ballot summary

**New page:** `src/pages/ballot/summary/index.astro`

**New API endpoint:** `GET /api/ballot/summary` — returns all `ballot_responses` for the
session user, joined to race and candidate data.

Displays per race:
- Selected candidate (or "Undecided")
- Alignment percentage with that candidate
- Top reason: the highest-weight question where the voter and candidate aligned most strongly
- Any "No Answer" gaps for the selected candidate (shown as: "3 questions were not answered by this candidate")

**Voter actions:**
- Print — clean print CSS, no navigation, no color fills (ink-safe)
- Email to self — uses existing Resend infrastructure; sends plain summary with race choices
- Return to quiz — link back to `/ballot/quiz` to adjust weights and recalculate

---

### Public solidarity results update

**Existing page:** `src/pages/ballot/results/index.astro` — update to show dual aggregate.

**New API endpoint:** `GET /api/ballot/results/[race_slug]`

Returns two aggregates, each suppressed until 10 or more responses exist:
```json
{
  "race_slug": "us-senate-2026",
  "all_participants": {
    "total_responses": 47,
    "show": true,
    "candidates": [
      { "candidate_slug": "jane-doe", "candidate_name": "Jane Doe", "chosen_count": 31, "pct": 65.9 }
    ]
  },
  "verified_voters": {
    "total_responses": 12,
    "show": true,
    "candidates": [
      { "candidate_slug": "jane-doe", "candidate_name": "Jane Doe", "chosen_count": 9, "pct": 75.0 }
    ]
  }
}
```

**Display label (required, verbatim):**
> "These results reflect My Wyoming Ballot Guide participants only — not a poll of all Wyoming voters."

---

## Phase 3 — Vote-splitting simulator (target: August 1)

**New page:** `src/pages/ballot/simulator/[race_slug]/index.astro`

Client-side only. No new tables or API endpoints.

**Data source:** Load candidate list from existing `/api/ballot/candidate-answers?race_slug=...`
(candidate names and slugs are already available from `race_candidates`).

**Mechanics:**
- Input: list of N candidates in a plurality race
- State: array of percentages summing to 100 (initialized equal: 100/N each)
- UI: horizontal bar per candidate with drag handle or +/− buttons
- Live output: current winner, winning %, note if winner has < 50%
- Threshold line at 50% (majority) — labeled "Majority threshold"
- Plain-language note beside the simulator (not in a dismissable modal):

> "In a plurality race, the candidate with the most votes wins — even if most voters
> preferred someone else. This simulator lets you explore how the vote might split."

**No default that implies an outcome.** Start equal. Let the voter experiment.

---

## Phase 3 — Data lock automation (August 14)

On August 14 the candidate submission window closes. The system should:

1. Stop accepting new submissions at `POST /api/guide/submit-answer` (return 410 Gone)
2. For every `(wy_candidate_id, question_id)` pair where no `guide_answers` row exists
   (or `reviewed = 0`), insert a `no_answer` row so the comparison view has a complete record

**Script to run manually on August 14:**
```sql
-- For each candidate in each active race, insert no_answer for missing questions
INSERT OR IGNORE INTO guide_answers
  (wy_candidate_id, question_id, position, source_kind, reviewed, submitted_at)
SELECT
  rc.wy_candidate_id,
  gq.id,
  'no_answer',
  'candidate_submission',
  1,                        -- auto-reviewed; no human review needed for no_answer
  datetime('now')
FROM race_candidates rc
CROSS JOIN guide_questions gq
WHERE rc.is_active = 1
  AND rc.wy_candidate_id IS NOT NULL
  AND gq.active = 1
  AND NOT EXISTS (
    SELECT 1 FROM guide_answers ga
    WHERE ga.wy_candidate_id = rc.wy_candidate_id
      AND ga.question_id = gq.id
      AND ga.reviewed = 1
  );
```

---

## File inventory — new files to create

### grassmvt_survey/db/migrations/
- `0037_passwordless_accounts.sql`
- `0038_magic_link_tokens.sql`
- `0039_guide_questions.sql`
- `0040_guide_answers.sql`
- `0041_voter_quiz_responses.sql`

### grassmvt_survey/db/seed/
- `guide_questions_phase1.sql`
- `ballot_surveys_phase1.sql` (fill `wy_db_office_id` from wy D1 query first)

### grassmvt_survey/src/pages/auth/magic-link/
- `index.astro` — email form
- `sent.astro` — confirmation
- `verify/index.astro` — token handler

### grassmvt_survey/src/pages/ballot/
- `quiz/index.astro`
- `compare/[race_slug]/index.astro`
- `summary/index.astro`
- `simulator/[race_slug]/index.astro` (Phase 3)

### grassmvt_survey/src/pages/guide/submit/
- `index.astro` — candidate answer form (token-gated)

### grassmvt_survey/src/pages/api/ (or worker.js routes)
- Check how existing API routes are structured in `src/worker.js` before deciding
- `auth/magic-link.js` — POST handler
- `auth/magic-link/verify.js` — GET handler
- `ballot/guide-questions.js`
- `ballot/submit-quiz.js`
- `ballot/alignment/[race_slug].js`
- `ballot/summary.js`
- `ballot/results/[race_slug].js`
- `guide/submit-answer.js`
- `guide/admin/pending-answers.js`
- `guide/admin/review-answer.js`

### grassmvt_survey/src/pages/admin/ (extend existing admin)
- `admin/guide-answers.astro` — pending answer review queue

---

## Candidate notification email (July 10)

Send via the existing `candidate-emails.js` admin tool in `Candidates/`.
One email per candidate in statewide + legislative races.

**Subject:** Your profile is live on the Wyoming 2026 Voter Guide — submit your answers

**Body (plain text):**
```
[Candidate name],

Your profile is live on the My Wyoming Ballot Guide at grassrootsmvt.org.

Wyoming voters are using this guide to compare candidates on the issues that
matter most to them. You have the opportunity to answer a short questionnaire
so voters can see your positions directly.

Every candidate in your race received the same questions. Structured answers
help voters understand where you stand — your explanations let you say it
in your own words.

Submit your answers here:
[unique token link — expires July 24]

If we do not receive a response, your profile will show "No response" for
each question after July 24. That result is not penalized in the guide's
alignment scoring, but voters will see the gap.

To correct any factual information in your profile (name, website, party),
reply to this email or write to: jimmy@grassrootsmvt.org

The submission window closes August 14, 2026.

Wyoming voters appreciate the effort.

— The My Wyoming Ballot Guide team
  grassrootsmvt.org
```

---

## Key constraints and rules (never violate these)

1. `no_answer` is set by the system after the deadline — candidates never self-select it
2. `no_answer` questions are excluded from the alignment score (not counted as zero)
3. Every candidate in the same race gets the same questions and the same answer choices
4. Alignment scores link to per-question breakdowns — no black-box numbers
5. The solidarity aggregate is suppressed until 10 or more responses exist per race segment
6. "Verified voters" aggregate only includes `is_verified_voter = 1` users
7. No individual voter choices are exposed publicly — only aggregates
8. The vote-splitting simulator starts at equal distribution — no implied outcome
9. Jimmy's endorsement, if surfaced, is labeled as his personal judgment and does not
   affect any alignment score
10. WORM: do not delete `ballot_responses` or `voter_quiz_responses` rows — update in place

---

## How to apply migrations

```bash
cd /home/anchor/projects/grassmvt_survey

# Local dev
npx wrangler d1 execute <db_name> --local --file db/migrations/0037_passwordless_accounts.sql

# Production (check wrangler.toml for db name first)
cat wrangler.toml | grep database_name
npx wrangler d1 execute <db_name> --remote --file db/migrations/0037_passwordless_accounts.sql
```

Apply in order: 0037 → 0038 → 0039 → 0040 → 0041.
Seed after 0039: `guide_questions_phase1.sql`.
Seed ballot_surveys after confirming `wy_db_office_id` values from wy D1.

---

## Checkpoint verification

After each phase, verify with these queries before moving to the next:

**Phase 1 complete when:**
```sql
SELECT COUNT(*) FROM guide_questions WHERE active = 1;       -- expect 12+
SELECT COUNT(*) FROM ballot_surveys WHERE active = 1;         -- expect 90+ (statewide + HD + SD)
SELECT COUNT(*) FROM magic_link_tokens LIMIT 1;               -- table exists
SELECT COUNT(*) FROM voter_quiz_responses LIMIT 1;            -- table exists
```

**Phase 2 complete when:**
- A test voter can complete the quiz at `/ballot/quiz` and see responses saved in DB
- `/api/ballot/alignment/us-senate-2026` returns a valid JSON response for a test user
- `/ballot/summary` renders without errors for a test user with at least one `ballot_responses` row

**Phase 3 complete when:**
- `/ballot/simulator/us-senate-2026` renders and the distribution bars sum to 100%
- August 14 data lock SQL runs without errors on a test copy

---

*This plan is self-contained. If you are resuming after a pause:*
*1. Read the Cold-start section at the top*
*2. Check which migrations have been applied (query `sqlite_master` or wrangler migration list)*
*3. Pick up at the first unchecked Phase 1 item in the build sequence*
*4. The concept doc is at `Candidates/docs/GuideConcept.md` if you need the WHY*
