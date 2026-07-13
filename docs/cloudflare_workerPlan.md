<!-- docs/cloudflare_workerPlan.md -->
# Cloudflare Workers Plan — `skovgard2026-api`

Last updated: 2026-07-10

Purpose: document the Cloudflare Workers plan tier for the account running
`skovgard2026-api` (the Worker behind the campaign site, Blast email system, and
the EmailListVerify cron), what changed when it was upgraded, and the concrete
incident that motivated the upgrade — so a future session doesn't have to
re-derive why this matters.

---

## Plan history

- **Free plan** through 2026-07-10 (confirmed directly by Jimmy after this
  session initially — incorrectly — inferred Paid from behavior; see "Free vs
  Paid" below for why that inference was wrong).
- **Upgraded to Workers Paid ($5/month) on 2026-07-10**, prompted by a real,
  recurring production incident (see "The incident this resolves" below).

---

## Workers Paid — confirmed plan limits (from the Cloudflare dashboard order summary, 2026-07-10)

| Product | Limit |
|---|---|
| Workers & Pages Functions — Requests | 10,000,000 / month |
| Workers & Pages Functions — CPU time | 30 seconds per request, 30,000,000 ms / month |
| Workers Builds — Build slots | 6 |
| Workers Builds — Build minutes | 6,000 / month |
| Durable Objects — Requests | 1,000,000 / month |
| Durable Objects — Duration | 400,000 GB-s / month |
| Durable Objects — Storage | 1 GB |

The order summary listed "+8 more" included products (this project doesn't use
Durable Objects today, but D1, Queues, KV, R2, and others are almost certainly
among the +8 — not enumerated here since the dashboard had them collapsed;
expand that section in the Cloudflare dashboard for the full current list
rather than assuming this table is exhaustive).

---

## Free vs Paid — why this specifically matters for this Worker

| Limit | Free | Paid |
|---|---|---|
| CPU time per invocation | 10 ms | 30 s default (configurable higher) |
| External subrequests per invocation | 50 | 1,000+ (10,000 typical default) |
| Simultaneous outgoing connections | 6 | 6 (same on both plans) |

**Why chunked Blast sends mostly worked fine even on Free**: CPU time only
counts synchronous JS execution, not time spent `await`-ing D1 queries or the
Resend `fetch()` call. A `send-chunk` call processing `chunk_size=20`
recipients (`worker/src/index.js`, `MAX_SEND_CHUNK_SIZE`) spends most of its ~13
seconds of wall-clock time waiting on I/O, not computing — so it stayed under
even Free's tiny 10ms CPU budget on a normal chunk. This is also why an earlier
in-session assumption that "this account must already be on Paid, since 60
subrequests/chunk exceeds Free's 50-subrequest ceiling" turned out to be
**wrong** — subrequest count and CPU time are separate limits, and the
subrequest ceiling apparently wasn't actually being hit here in practice (or
Free's real subrequest allowance differs from the commonly-cited figure) —
don't infer plan tier from behavior again; ask, or check the dashboard.

**Why it broke anyway**: two missing indexes (`resend_webhook_events.batch_id`
and `email_verification_queue(verdict, email_norm)`) caused specific
`send-chunk` calls to fall into genuine full-table scans once
`resend_webhook_events` grew to ~9,500 rows and `email_verification_queue`'s
83,957-row exclusion-scan cost grew with the running job's own progress. That
synchronous processing cost — not simple I/O wait — pushed those specific
calls over Free's 10ms ceiling, returning Cloudflare error 1102 ("Worker
exceeded resource limits") as an HTML page instead of the expected JSON.

---

## The incident this resolves

Cloudflare's own **Errors by invocation status** dashboard panel shows **172
"Exceeded CPU Time Limits" errors** clustered between **2026-07-09 14:30 and
2026-07-10 09:15 (Mountain time)**, with a small residual tail after — this
matches the exact window during which the missing-index bug was live and
actively crashing the `verified_unsent` Blast job (`33628668-8b0a-...`) with
503/1102 responses, independently confirmed via direct manual reproduction the
same day.

**Already fixed** via `worker/migrations/030_resend_webhook_events_batch_index.sql`
(applied to production, committed `dd1f9dd`) — the two missing indexes were
the actual root cause, not the Free-tier ceiling itself. The Paid upgrade adds
a large additional safety margin (30s vs 10ms) on top of that fix, so a
similarly expensive query in the future is far less likely to cross the CPU
ceiling before someone notices and fixes the underlying query.

---

## What upgrading does *not* change

- **Resend's own account quota and per-second rate limit** — separate from
  Cloudflare entirely. Free Resend transactional tier is roughly 100/day,
  3,000/month; paid Resend tiers remove the daily cap but still apply a
  monthly quota and their own rate limiting (429 + `retry-after` header).
- **Email deliverability / sender-reputation warm-up guidance** — sending
  faster is not automatically safer. Domain warm-up and gradual volume ramp-up
  are Resend/ISP-reputation concerns, unrelated to Cloudflare's plan tier.
- **D1 daily read/write allowances** — those are governed by D1's own limits
  (separate from Workers CPU/subrequest limits), not changed by this upgrade.

---

## Related docs

- `docs/blast_tracking.md` — full incident log for the Blast email system,
  including the missing-index fix and the OFFSET-pagination fix deployed the
  same day.
- `worker/migrations/030_resend_webhook_events_batch_index.sql` — the actual
  fix for the 172 logged CPU-limit errors.
