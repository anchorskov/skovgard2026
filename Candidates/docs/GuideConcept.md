# My Wyoming Ballot Guide — Concept Document (Revised)

*Last updated: 2026-07-01 · Status: All decisions finalized — dual-path auth model confirmed — ready to plan*

---

## What this document is

The product concept, architectural decisions, data model, and build sequence for
**My Wyoming Ballot Guide** — a voter-owned tool that helps Wyoming voters compare
candidates, weigh their own priorities, and make one clear choice per race.

All six open decisions from the initial draft are now resolved. This document reflects
those decisions plus design suggestions where the submitted direction can be sharpened
before building begins.

---

## What is currently built and how it diverges

### candidates.skovgard2026.org (Candidates/)

| Built | Purpose |
|-------|---------|
| Address-based ballot lookup | Voter enters address → sees races on their ballot |
| `/races`, `/race/[id]` | Race browser and candidate list per race |
| `/candidate/[slug]` | Individual candidate profiles (bio, links, finance) |
| `/guide` | **Jimmy's** personal research and scoring — not the voter-owned guide |
| `/endorsements` | Jimmy's endorsements |

**This site stays as-is.** It is the candidate information and share-card layer.
The voter-owned guide does not live here.

### grassrootsmvt.org (grassmvt_survey/)

| Built | Purpose |
|-------|---------|
| Full auth system | Email/password, sessions, passkeys, email verification |
| Voter verification | `user_verification` — `voter_match_status`, `wy_voter_id`, address vs. GPS distance |
| Address → district mapping | `user_address_verification` — house district, senate district, county, lat/lng |
| Ballot race registry | `ballot_surveys` — `scope_type`/`scope_value` links races to voter districts |
| Candidate registry | `race_candidates` — with `wy_candidate_id` linking to `candidates.id` in wy D1 |
| Voter ballot choices | `ballot_responses` — one row per user × race × candidate, `chosen` flag, `notes` |
| Ballot page | `/ballot` — shows voter's races, lets them choose and add notes |

**What does not exist yet anywhere:**
- Issue/values questionnaire (tables, seed data, UI)
- Candidate questionnaire answer submission
- Voter quiz UI with issue weights
- Alignment scoring engine
- My Ballot structured summary with reason output
- Vote-splitting simulator

**Decision: Do not rebuild what exists. The voter guide extends `grassrootsmvt.org/ballot`.**

---

## Architecture — two pipelines, one voter experience

```
ADMIN / CANDIDATE PIPELINE (runs before voters arrive)
──────────────────────────────────────────────────────
  1. Seed guide_questions (issue questions by office level)
  2. Notify candidates → candidate submits structured answers → admin review → answers go live
  3. Candidate data from wy D1 (top_issues, finance, incumbency) feeds comparison layer

VOTER PIPELINE (the guide experience)
──────────────────────────────────────
  Enter address → Verify email + voter identity → Personalized ballot
        ↓
  Voter Quiz — answer same questions as candidates, set issue weights (High / Medium / Low / Skip)
        ↓
  Alignment Score — per race, per candidate: how closely does each candidate match this voter?
        ↓
  My Ballot — voter reviews alignment, makes one choice per race, gets a reason summary
        ↓
  Vote-Splitting Simulator (optional) — civic math showing plurality outcomes
```

The two pipelines share the same question set and scoring logic.
The voter experience is linear. Each step is optional past address entry,
but the guide yields the most value when all steps are completed.

---

## Decision A — Candidate questionnaire answer format

**Confirmed: Structured position + optional explanation.**

### Answer structure per question

| Field | Type | Required |
|-------|------|----------|
| Position | Enum (6 values) | Yes |
| Explanation | Free text (≤ 500 chars) | No |
| Source link | URL | No |
| Position firmness | Enum (3 values) | No |
| Top priority checkbox | Boolean | No |

### Position choices (same for voter and candidate)

```
Strongly Support
Support
Neutral / Mixed
Oppose
Strongly Oppose
No Answer
```

> **Design note:** "No Answer" should never be a choice a candidate manually selects.
> If a candidate does not respond to a question by the submission deadline, the system
> marks it "No Answer" automatically. Presenting it as a selectable option could be used
> strategically to avoid accountability on hard questions. The form should offer only the
> five substantive positions; "No Answer" is the system's fallback.

### Position firmness (optional field)

Rename from "Confidence level" — that phrasing is ambiguous (does it mean confidence in
winning, or confidence in the position?). Suggested labels:

```
Core position — will not change
Leaning — direction is clear, specifics may evolve
Open to discussion — willing to hear evidence and refine
```

This field is shown as context in the comparison view. It does not affect the alignment score.
A candidate who is "open to discussion" is not penalized; they are simply labeled as such.

### "Top priority" checkbox

Displayed as a badge in the comparison view: **★ Top campaign priority** — so voters
see which issues the candidate actually ran on versus which they just answered a question
about. Does not affect the numerical alignment score. Affects only display.

### Source link

Displayed as "Candidate's source →" with `rel="noopener"`. Validated as a well-formed URL
before storage. Admin review step confirms link resolves before the answer goes live.

---

## Decision B — Voter issue weighting

**Confirmed: High / Medium / Low / Skip**

### Weight values

| Voter choice | Numeric weight |
|---|---|
| High | 3 |
| Medium | 2 |
| Low | 1 |
| Skip | Excluded from score entirely |

Skip removes the question from both numerator and denominator for all candidates equally.
This preserves fairness — if a voter marks an issue as irrelevant, no candidate is
advantaged or disadvantaged by their position on it.

### Alignment scoring formula

Position choices map to a numeric scale:

| Position | Value |
|---|---|
| Strongly Support | +2 |
| Support | +1 |
| Neutral / Mixed | 0 |
| Oppose | −1 |
| Strongly Oppose | −2 |
| No Answer | null |

**Per question:**
- Distance = `|voter_value − candidate_value|` (range 0–4)
- Match score = `1 − (distance / 4)` → perfect match = 1.0, opposite = 0.0
- Weighted score = `match_score × voter_weight`
- "No Answer" questions: excluded from numerator and denominator. They reduce the information
  available but do not penalize the candidate. Displayed prominently as "No response."

**Per race (total alignment):**
```
alignment_pct = (sum of weighted_match_scores) / (sum of weights for answered questions) × 100
```

**Transparency rule:** Every alignment score links to the question-by-question breakdown.
The voter can see exactly which questions drove the score up or down.

> **Design suggestion:** Display alignment as a bar and a percentage, not a letter grade or
> star rating. A letter grade implies judgment. A percentage with a visible breakdown invites
> the voter to inspect and disagree. That is the right posture for a tool built on trust.

---

## Decision C — Where the guide lives

**Confirmed: `grassrootsmvt.org/ballot`**

The auth system, voter verification, address-to-district mapping, ballot race registry,
and voter choice storage are all in grassmvt_survey. Rebuild none of it.

### Domain responsibilities going forward

| Domain | Responsibility |
|--------|---------------|
| `candidates.skovgard2026.org` | Race finder, candidate profiles, Jimmy's guide, share cards |
| `grassrootsmvt.org/ballot` | Voter-owned guide — quiz, alignment, My Ballot, simulator |

The two projects are linked via `wy_candidate_id` (race_candidates → candidates.id in wy D1)
and `wy_db_office_id` (ballot_surveys → offices.id in wy D1). No data is duplicated.

---

## Decision D — Launch timeline

**Primary election: August 18, 2026**

| Milestone | Target date | Scope |
|-----------|-------------|-------|
| Functional prototype | July 10 | Migrations live, questions seeded, candidate form accessible, voter quiz renders |
| Candidate notifications sent | July 10 | Email to all candidates with questionnaire link |
| Candidate questionnaire live | July 15 | Submissions open publicly; answers under review |
| Public beta | July 22 | Voter quiz + alignment live; My Ballot summary functional |
| Stable voter guide | August 1 | Vote-splitting simulator added; all known issues resolved |
| Data lock | August 14 | No new candidate answers accepted; guide is read-only for voters |
| Primary day | August 18 | Guide remains accessible for voters at the polls |

> **Timeline note:** July 10 is 9 days from this writing. The prototype scope for July 10
> must be tightly scoped: migrations, seeded questions, a working candidate submission form,
> and a voter quiz that stores answers. Alignment scoring and My Ballot summary can follow
> in the July 15–22 window. Do not compress the timeline by reducing the question quality
> — that is the foundation everything else rests on.

---

## Data model additions (grassmvt_survey database only)

The wy D1 is read-only from the guide's perspective. All new writes go to grassmvt_survey.

### New table: `guide_questions`

```sql
CREATE TABLE IF NOT EXISTS guide_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text   TEXT    NOT NULL,
  issue_category  TEXT    NOT NULL,  -- 'economy' | 'land_use' | 'constitutional' | 'health_care'
                                     --   | 'education' | 'energy' | 'local_control' | 'other'
  applicable_to   TEXT    NOT NULL,  -- 'federal' | 'statewide' | 'state_house' | 'state_senate'
                                     --   | 'county' | 'city' | 'all'
  display_order   INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guide_questions_applicable
  ON guide_questions (applicable_to, active, display_order);
```

### New table: `guide_answers`

One row per candidate × question. Written by candidates via submission form; reviewed
before going live.

```sql
CREATE TABLE IF NOT EXISTS guide_answers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wy_candidate_id  INTEGER NOT NULL,   -- race_candidates.wy_candidate_id
  question_id      INTEGER NOT NULL REFERENCES guide_questions(id),
  position         TEXT    NOT NULL    -- 'strongly_support' | 'support' | 'neutral' |
    CHECK (position IN (               --   'oppose' | 'strongly_oppose' | 'no_answer'
      'strongly_support','support','neutral','oppose','strongly_oppose','no_answer'
    )),
  explanation      TEXT,               -- candidate's own words; ≤ 500 chars
  source_url       TEXT,
  firmness         TEXT                -- 'core' | 'leaning' | 'open'
    CHECK (firmness IS NULL OR firmness IN ('core','leaning','open')),
  is_top_priority  INTEGER NOT NULL DEFAULT 0 CHECK (is_top_priority IN (0,1)),
  source_kind      TEXT NOT NULL DEFAULT 'candidate_submission'
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

### New table: `voter_quiz_responses`

One row per user × question. Stores the voter's position and weight.
Replaces localStorage as the durable store (localStorage is the staging layer).

```sql
CREATE TABLE IF NOT EXISTS voter_quiz_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
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
```

> **Note on localStorage:** The quiz UI should write to localStorage on every change
> (fast, no latency) and sync to the DB on submit/exit. If the user leaves and returns,
> the DB is the source of truth; localStorage is the working scratch pad. This pattern
> is already used in the existing ballot.js flow.

### ballot_surveys seeding required

The `ballot_surveys` table needs rows for every race the guide covers.
Phase 1 (statewide + legislative) requires seeding:
- All statewide races (`scope_type = 'statewide'`)
- All 60 house districts (`scope_type = 'state_house'`, `scope_value = '01'` through `'60'`)
- All 30 senate districts (`scope_type = 'state_senate'`, `scope_value = '01'` through `'30'`)

Each row needs `wy_db_office_id` populated to link to the `offices` table in the wy D1.
The enrichment script that maps `race_candidates.wy_candidate_id` already establishes
this link path.

---

## Route additions (grassrootsmvt.org)

| Route | Status | Purpose |
|-------|--------|---------|
| `/ballot` | Exists | Voter choice page — extend, do not replace |
| `/ballot/quiz` | New | Voter values/issues questionnaire |
| `/ballot/compare/[race_slug]` | New | Alignment view for one race |
| `/ballot/summary` | New | My Ballot structured summary + export |
| `/ballot/simulator/[race_slug]` | New | Vote-splitting simulator (Phase 2) |
| `/api/ballot/guide-questions` | New | Return questions for user's office levels |
| `/api/ballot/candidate-answers` | New | Return reviewed answers by race |
| `/api/ballot/submit-quiz` | New | Save voter quiz responses |
| `/api/guide/submit-answer` | New | Candidate answer submission (token-gated) |
| `/api/guide/admin/review-answer` | New | Admin approve/reject submitted answer |

---

## Candidate submission flow

1. Admin seeds `guide_questions` and `ballot_surveys` rows for the target races
2. Candidate notification emails sent July 10 (via existing `candidate-emails.js` admin tool)
3. Each email contains a unique, time-limited token link to their submission form
4. The form pre-populates the candidate's name and race; shows only the questions applicable
   to their office level
5. Candidate submits → row written to `guide_answers` with `reviewed = 0`
6. Admin reviews (verify source link resolves, explanation is on-topic) → sets `reviewed = 1`
7. Answer appears live in the voter guide
8. If no submission by data lock (August 14), system sets `position = 'no_answer'` for all
   unanswered questions for that candidate

**Fairness enforcement:** The question set, answer choices, and explanation space are
identical for every candidate in the same race. No candidate receives a different form.
If a question is retired or edited after any candidate has submitted, the affected candidates
are re-notified and given 48 hours to revise.

---

## Voter identity — dual-path model

The guide supports two paths. Both paths save ballot choices to the same tables.
One boolean field — `is_verified_voter` on the `user` table — distinguishes them.

### Path 1 — Email only (open access)

The voter enters their email address. The system sends a magic link.
Clicking the link creates a session. No password. No voter file match required.

- `user.is_verified_voter = 0`
- Can take the quiz, save issue weights, record ballot choices, view My Ballot summary
- Sees the **All participants** aggregate in the solidarity results
- Does **not** appear in the **Verified voters** aggregate

This path has the lowest friction and the widest reach.
It is honest about what it is: a self-reported guide, not a verified poll.

### Path 2 — Verified registered voter

The voter completes the existing grassrootsmvt voter verification flow:
email + address + voter file match + optional GPS confirmation.

- `user.is_verified_voter = 1` (set by existing verification flow)
- All the same capabilities as Path 1, plus:
- Appears in the **Verified registered voters** aggregate

The existing `user_verification` table already captures:
- `voter_match_status` — result of matching against voter roll
- `wy_voter_id` — matched Wyoming voter ID
- `residence_confidence` — how closely the claimed address matches the voter file
- `distance_bucket` — GPS vs. address distance bucket

No new verification tables are needed. The dual path is the existing system
with `is_verified_voter` used as the segment key.

### Migration required — make `password_hash` nullable

The current `user` table (migration 0006) has `password_hash TEXT NOT NULL`.
Magic-link / email-only users do not have a password. One migration is needed:

```sql
-- Migration: allow passwordless (magic link) accounts
CREATE TABLE user_new (
  id            TEXT NOT NULL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                          -- NULL for magic-link accounts
  is_verified_voter INTEGER NOT NULL DEFAULT 0,-- already added in migration 0021
  verified_at   TEXT,
  verification_method TEXT,
  verified_scope TEXT,
  verified_district TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Copy existing rows, migrate, drop old table, rename new table.
-- See migration 0037_passwordless_accounts.sql.
```

### Magic link table

```sql
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id         TEXT NOT NULL PRIMARY KEY,   -- UUID
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 of the raw token sent in email
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,               -- ISO-8601; typically 1 hour
  used_at    TEXT,                        -- NULL = not yet used
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user_id
  ON magic_link_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at
  ON magic_link_tokens (expires_at);
```

### Solidarity results — two aggregates displayed side by side

| Aggregate | Who it counts | Label in UI |
|-----------|---------------|-------------|
| All participants | Every user with `is_verified_voter IN (0,1)` | "Guide participants" |
| Verified voters | `is_verified_voter = 1` only | "Verified registered voters" |

Both aggregates show per-race choice counts, anonymized, with no individual data exposed.
Both carry the disclaimer: *"These results reflect My Wyoming Ballot Guide participants
only — not a poll of all Wyoming voters."*

The verified voters aggregate is the one that carries weight for integrity purposes.
The all-participants aggregate shows breadth of engagement.
Neither is shown until a minimum of 10 responses exist in that segment for that race
(prevents identification of early individual responses).

---

## "My Ballot" summary output

After the voter has reviewed each race, the summary page shows:

**Per race:**
- Selected candidate (or "Undecided")
- Alignment percentage with selected candidate
- Primary reason: top-weight issue where selected candidate aligned best
- Any "No Answer" gaps for the selected candidate (transparency)

**Voter actions:**
- Print (clean print stylesheet, no header/footer chrome)
- Email to self (uses existing share email infrastructure)
- Text to self (phone number input → SMS with link to their saved ballot)

**No public sharing of ballot choices by default.** The voter's selections are private.
The aggregate results (how many guide users chose each candidate, anonymized) are
displayed separately on the public results page — this is the "solidarity" view that
shows voters how guide participants are trending as a group.

> **Design note on solidarity:** The aggregate results should carry a clear label:
> *"These results reflect My Wyoming Ballot Guide participants only — not a poll of all
> Wyoming voters."* This is the most important trust guardrail on the results display.
> Without it, the guide's aggregate could be misread as a prediction or endorsement.

---

## Vote-splitting simulator (Phase 2 — August 1 target)

**Purpose:** Civic education. Not persuasion. Not a recommendation.

**Mechanics (client-side only, no new tables):**
- Load candidate list for a race from existing ballot_surveys + race_candidates data
- Display a bar representing 100% of the vote
- Each candidate gets an adjustable slice (drag to resize)
- Default: equal distribution across all active candidates
- Real-time display of: current winner, winning percentage, threshold line
- Plain-language note: "In a plurality race, the candidate with the most votes wins —
  even with less than a majority."

**What it is not:** The simulator does not seed from any poll or suggest any distribution.
It starts equal. The voter experiments freely.

---

## Fairness rules (non-negotiable)

1. Every candidate in the same race receives the same question set, answer choices,
   explanation space, and source link field.
2. "No Answer" is a system-generated status, not a candidate selection.
3. Alignment scores are computed identically for every candidate using the voter's own weights.
4. Missing data (No Answer) is excluded from the score — not counted as zero.
5. Every score links to the question-by-question breakdown the voter can inspect and dispute.
6. If a question changes after candidates have submitted, affected candidates are re-notified.
7. Jimmy's endorsement, if shown in the comparison view, is clearly labeled as his
   personal judgment and does not affect any alignment score.

---

## Build sequence

### Phase 1 — Foundation (target: July 10)
- [ ] Migration 0037: `passwordless_accounts` — make `password_hash` nullable on `user`
- [ ] Migration 0038: `magic_link_tokens` table
- [ ] Migration 0039: `guide_questions` table
- [ ] Migration 0040: `guide_answers` table
- [ ] Migration 0041: `voter_quiz_responses` table
- [ ] Magic link auth flow — email entry → token email → click → session created, `is_verified_voter = 0`
- [ ] Seed Phase 1 questions (statewide + legislative, 8–12 questions, 4 categories)
- [ ] Seed `ballot_surveys` rows for all statewide + 60 HD + 30 SD races with `wy_db_office_id`
- [ ] Candidate submission form (token-gated, renders questions by office level)
- [ ] `/api/guide/submit-answer` endpoint (writes to `guide_answers`, `reviewed = 0`)
- [ ] Admin review UI (list unreviewed answers, approve/reject)
- [ ] Voter quiz UI (`/ballot/quiz` — renders questions, stores to `voter_quiz_responses`)

### Phase 2 — Comparison + My Ballot (target: July 22)
- [ ] `/api/ballot/guide-questions` and `/api/ballot/candidate-answers` endpoints
- [ ] `/ballot/compare/[race_slug]` — alignment view with bar display and breakdown
- [ ] `/ballot/summary` — My Ballot structured summary
- [ ] Print stylesheet for summary
- [ ] Email-to-self from summary
- [ ] Public aggregate results display (solidarity view, anonymized)

### Phase 3 — Simulator + polish (target: August 1)
- [ ] `/ballot/simulator/[race_slug]` — vote-splitting simulator
- [ ] Data lock automation (August 14 — auto-set `no_answer` for missing submissions)
- [ ] QA pass: verify fairness rules, alignment math, No Answer display

---

## What candidates.skovgard2026.org gains from this

The guide adds value back to the Candidates site without any code changes there:

- Candidate profiles (`/candidate/[slug]`) can link to the voter guide's comparison view
  for that race once it is live (a simple "Compare in My Ballot Guide →" link)
- Candidate questionnaire answers (once reviewed) can be surfaced on the candidate profile
  page as a structured "Guide responses" section — read from grassmvt_survey via API call
- The ballot lookup CTA ("Go to My Ballot →") links to `grassrootsmvt.org/ballot` —
  already wired, just needs updating to point to the correct route once the quiz is live

---

*Decisions finalized: 2026-07-01*
*Ready for: migration authoring and Phase 1 build*
