// Candidates/cron/src/index.js
// Cron-only Worker: purges ballot-recovery data past its retention window.
// Runs against the same `wy` D1 database as skovgard-candidates but ships no
// routes of its own — see wrangler.toml in this directory for why this is a
// separate Worker instead of a scheduled() export on the Astro site itself,
// and Candidates/docs/ballot_recovery.md for the full design.

const CRON_PURGE_BALLOT_RECOVERY = "0 10 * * *";

// One calendar day after the WY 2026 primary (2026-08-18) so a voter can
// still recover a saved ballot the day after the election instead of it
// vanishing the moment polls close. This mirrors the hardcoded
// election-cycle-deadline pattern guide_questionnaire_tokens already uses
// (Candidates/db/migrations/0015_guide_questionnaire.sql), but is its own
// constant with its own purpose — that one is a legal candidate deadline,
// this is a voter-convenience window, and they are not the same date.
const BALLOT_SAVES_RETENTION_CUTOFF = "2026-08-19T23:59:59Z";

async function purgeBallotRecoveryData(env) {
  const db = env.WY_DB;

  await db
    .prepare(`DELETE FROM ballot_saves WHERE updated_at < ?1`)
    .bind(BALLOT_SAVES_RETENTION_CUTOFF)
    .run();

  // ballot_recovery_tokens is also swept opportunistically by the request/
  // recover endpoints on every call, but this catches anything left over if
  // traffic dies down (e.g. well after the election).
  await db
    .prepare(`DELETE FROM ballot_recovery_tokens WHERE expires_at < datetime('now')`)
    .run();
}

export default {
  async fetch() {
    return new Response("skovgard-candidates-cron: no routes, scheduled-only Worker", { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    if (controller.cron === CRON_PURGE_BALLOT_RECOVERY) {
      ctx.waitUntil(purgeBallotRecoveryData(env));
      return;
    }
    console.error("scheduled(): no handler for cron pattern", controller.cron);
  },
};
