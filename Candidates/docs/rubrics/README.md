# Candidate rubric workflow

The only manually edited rubric definition is:

- `Candidates/data/rubrics/wy-primary-2026-v1.md`

It is the human-readable authoring source for category keys, labels, weights, order,
standards, evidence guidance, scoring labels, and the missing-evidence policy. Do not
edit the generated JSON, PDF, or SQL directly.

## Generated artifacts

Run from `Candidates/`:

```bash
npm run rubric:build
npm run rubric:check
```

The generator creates:

- `data/rubrics/generated/wy-primary-2026-v1.json` — Candidates build fallback
- `../Guide/src/data/wy-primary-2026-v1.generated.json` — Guide build fallback
- `docs/rubrics/wy-primary-2026-v1.pdf` — human review copy
- `db/seed/guide_rubric_2026_v1.sql` — immutable D1 seed

The source SHA-256 is embedded in every generated definition. `rubric:check` fails
when a generated artifact does not exactly match the Markdown source.

## Runtime source

Migration `0022_guide_rubric_definitions.sql` creates the version and category tables.
After the migration and generated seed are applied, Candidates and Guide read the
active `2026-primary` rubric from `WY_DB`. Before those tables are available, both
applications use their generated JSON copy so builds and local review remain usable.

The admin save API accepts category keys and scores from the browser, but obtains
labels, weights, score bounds, and total calculations from the active definition. It
does not trust those values from the browser. It rejects out-of-range scores and any
score that does not include evidence notes.

## Current consumers

- `Candidates/src/pages/guide/index.astro` — public category list and scoring policy
- `Candidates/src/pages/candidate/[slug].astro` — public category order and labels
- `Guide/public/admin/rubric/index.html` — score form, totals, source weights, and AI prompts
- `Guide/src/pages/api/admin/rubric.js` — validation and authoritative weighted totals

## Editing a future version

1. Copy the Markdown to a new versioned filename and change `rubricKey`.
2. Update the generator's source and output filenames.
3. Run `npm run rubric:build` and review the PDF.
4. Run `npm run rubric:check` and both project builds.
5. Create/apply a new immutable seed. Retire the prior D1 version only through an
   explicit migration; never rewrite historical candidate score rows.

Unknown evidence is `null`, excluded from earned and maximum possible points. A score
of 3 requires evidence and must never be used as a missing-data placeholder.
