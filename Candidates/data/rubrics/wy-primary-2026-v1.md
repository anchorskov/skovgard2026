---
rubricKey: wy-primary-2026-v1
title: Wyoming 2026 Primary Candidate Rubric
electionCycle: 2026-primary
scoreMin: 0
scoreMax: 5
unknownPolicy: excluded
status: active
---

# Wyoming 2026 Primary Candidate Rubric

This document is the manually edited source of truth for the Skovgard 2026 candidate rubric. Generated JSON, PDF, SQL, database rows, application labels, weights, ordering, and AI prompt category lists must agree with this version.

## Scoring policy

- Scores use a 0-5 scale and require documented evidence.
- `0` means a serious documented concern.
- `1` means a weak documented record.
- `2` means a below-standard documented record.
- `3` means an acceptable or neutral documented record. It is not a substitute for missing evidence.
- `4` means a strong documented record.
- `5` means an exceptional documented record.
- Missing evidence is recorded as `Unknown` (`null`). It is excluded from both the earned score and maximum possible score.
- Published totals must show evidence coverage alongside the normalized percentage.
- Challengers are not penalized merely for lacking a voting record.
- A disclosed financial interest is documented as a fact and is not penalized without evidence of misconduct or an unmanaged conflict.

## Evidence weights

- `5`: official records, filings, statutes, court records, and recorded votes.
- `4`: the candidate's own published statements or campaign materials.
- `3`: candidate questionnaires, public forums, and direct interviews.
- `2`: credible local reporting with identifiable sourcing.
- `1`: social posts, mailers, and other low-context campaign communications.
- Rumor and unattributed claims are not scored.

## 1. Constitutional oath and rule of law

- Key: `constitutional_oath`
- Weight: 15
- Display order: 10

### Standard

Evaluate respect for constitutional limits, the oath of office, due process, and the lawful roles of the legislative, executive, and judicial branches. Distinguish disagreement with a ruling from documented attempts to evade controlling law or the constitutional amendment process.

### Evidence guidance

Prefer constitutional text, court records, enacted legislation, recorded votes, official statements, and direct candidate explanations. Do not infer intent from party membership or association alone.

## 2. Character, honesty, and courage

- Key: `character`
- Weight: 15
- Display order: 20

### Standard

Evaluate documented truthfulness, consistency between statements and conduct, willingness to correct errors, treatment of others, and willingness to take accountable public positions under pressure.

### Evidence guidance

Use attributable public conduct, corrections, official findings, direct statements, and corroborated reporting. Do not score rumor, anonymous accusation, or disagreement over policy as a character defect.

## 3. Competence and readiness

- Key: `competence`
- Weight: 10
- Display order: 30

### Standard

Evaluate demonstrated understanding of the office, relevant responsibilities, preparation, judgment, and the ability to explain how proposed actions could be lawfully and practically carried out.

### Evidence guidance

Consider relevant work, public service, legislative or administrative performance, debates, detailed proposals, and direct answers. Do not require prior elected office.

## 4. Accountability and transparency

- Key: `accountability`
- Weight: 10
- Display order: 40

### Standard

Evaluate disclosure, responsiveness, explanation of decisions, compliance with reporting duties, correction of material errors, and willingness to provide voters with verifiable information.

### Evidence guidance

Prefer required filings, public records, correction history, direct responses, meeting records, and documented patterns of disclosure or nondisclosure.

## 5. Fiscal responsibility

- Key: `fiscal`
- Weight: 10
- Display order: 50

### Standard

Evaluate whether the candidate's record and proposals identify costs, funding sources, tradeoffs, long-term obligations, and responsible stewardship of public money.

### Evidence guidance

Use budgets, fiscal notes, recorded votes, campaign finance filings, audits, detailed proposals, and direct explanations. Do not treat wealth, poverty, or a disclosed contribution as proof of fiscal character.

## 6. Local impact and Wyoming fit

- Key: `local_impact`
- Weight: 10
- Display order: 60

### Standard

Evaluate understanding of Wyoming communities, constitutional and jurisdictional boundaries, and the likely local effects of the candidate's record or proposals on land, water, energy, agriculture, families, and local government.

### Evidence guidance

Prefer Wyoming-specific proposals, local records, public meetings, constituent work, impact analysis, and direct explanations rather than national talking points alone.

## 7. Public service over self-interest

- Key: `public_service`
- Weight: 10
- Display order: 70

### Standard

Evaluate documented service, stewardship, conflicts management, use of public responsibility, and whether conduct demonstrates attention to constituents and public obligations rather than personal benefit alone.

### Evidence guidance

Use service records, ethics disclosures, conflict documentation, constituent work, official findings, and corroborated conduct. A disclosed interest is not misconduct by itself.

## 8. Issue alignment with Skovgard 2026

- Key: `issue_alignment`
- Weight: 10
- Display order: 80

### Standard

Compare the candidate's documented positions and record with Jimmy Skovgard's published platform priorities. This category is explicitly perspective-specific and must not be presented as a neutral measure of candidate quality.

### Evidence guidance

Use current published platforms, direct statements, recorded votes, and detailed proposals. Mark changed or unclear positions and do not infer alignment where no evidence exists.

## 9. Coalition-building and temperament

- Key: `coalition`
- Weight: 5
- Display order: 90

### Standard

Evaluate demonstrated ability to work through disagreement, communicate responsibly, build effective support, and maintain principled but functional relationships required by the office.

### Evidence guidance

Use legislative or organizational outcomes, public forums, direct working relationships, attributable conduct, and corroborated reporting. Style alone is not evidence of effectiveness or failure.

## 10. Evidence quality

- Key: `evidence_quality`
- Weight: 5
- Display order: 100

### Standard

Evaluate the authority, freshness, completeness, independence, and corroboration of the evidence available for the candidate. This category describes the research record, not the candidate's ideology.

### Evidence guidance

Higher scores require multiple fresh, direct, authoritative sources. Sparse, stale, indirect, or internally conflicting evidence lowers this score and must also be disclosed through evidence coverage.
