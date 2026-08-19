# Results Worker Instructions

This file applies inside `/home/anchor/projects/skovgard2026/Results/`.
Root repository instructions remain authoritative.

## Purpose

`Results/` owns the standalone `skovgard-results` election-source polling
Worker. Its scope is deliberately narrow:

- Check the 23 official county pages and the Wyoming Secretary of State archive.
- Record every retrieval attempt in `election_source_checks`.
- Record candidate result links in `election_source_discoveries`.
- Preserve last-known-good result behavior by never creating verified result
  snapshots directly from source discovery.
- Provide read-only health and collection-status endpoints.

It does not own candidate profiles, ballot lookup, public results rendering,
or candidate and contest matching.

## Database

The Worker binds `WY_DB` to the existing `wy` database. Election schema
migrations remain owned by `Candidates/db/migrations/`. Do not create a second
competing migration history under `Results/`.

Before changing election tables or views, read:

- `../Candidates/AGENTS.md`
- `../Candidates/candidate_data.md`
- `../Candidates/docs/election_results_schema.md`
- `../Candidates/docs/election_results_2026_path_forward.md`
- `../Candidates/docs/recheck_county_election_result_sources.md`

Never run the D1 migration tracker. Never replay migrations 0001 through 0010.

## Worker names and deploys

- Local Wrangler name: `skovgard-results-local`
- Production Worker name: `skovgard-results`
- Canonical deploy helper: `../scripts/deploy_results.sh`

The production name is explicit in `[env.production]`. Do not remove it and do
not deploy with a different `--name` value.

Production deployment is not implied by a build. `npm run build` is a dry-run
bundle only.

## Source safety

- Fetch only URLs already stored in `election_sources`.
- Allow redirects only to the original hostname or a hostname listed in
  `ADDITIONAL_ALLOWED_HOSTS`.
- Do not automatically promote a discovered URL into `election_sources`.
- Reject sample ballots, public tests, test decks, equipment tests, and logic
  and accuracy material.
- A successful source check is not permission to publish numbers.
- Parsing and verification must remain separate from discovery.

## Local development

`npm run dev` persists into `../Candidates/.wrangler/state` so both projects
use the same verified localhost `wy` data. Resolve the backing SQLite file by
its tables, not by assuming a hash filename.

The local scheduled handler is available through Wrangler at:

`/cdn-cgi/handler/scheduled?format=json`

Normal tests use mocks and must not contact live county sites.

## Documentation

- `docs/architecture.md`: runtime flow, source policy, scheduling, and
  production-readiness checklist.
